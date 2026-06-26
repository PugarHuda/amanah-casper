//! RwaVault - holds allocations across real-world assets and lets the agent
//! rebalance yield while a hard principal invariant is enforced on every move.
use crate::common::{u256_to_u512, AssetId, Error, ALL_ASSETS};
use crate::compliance_registry::ComplianceRegistryContractRef;
use crate::spend_gate::SpendGateContractRef;
use odra::casper_types::{U256, U512};
use odra::prelude::*;

#[odra::event]
pub struct Reallocated {
    pub from: AssetId,
    pub to: AssetId,
    pub amount: U256,
    pub attestation_hash: [u8; 32],
    pub block_time: u64,
}

#[odra::module(events = [Reallocated], errors = Error)]
pub struct RwaVault {
    allocations: Mapping<AssetId, U256>,
    principal_locked: Var<U512>,
    agent: Var<Address>,
    spend_gate: Var<Address>,
    compliance: Var<Address>,
}

#[odra::module]
impl RwaVault {
    pub fn init(
        &mut self,
        agent: Address,
        spend_gate: Address,
        compliance: Address,
        principal: U512,
    ) {
        self.agent.set(agent);
        self.spend_gate.set(spend_gate);
        self.compliance.set(compliance);
        self.principal_locked.set(principal);
    }

    /// Add `amount` of `asset` to the vault.
    // ponytail: open to any caller for the hackathon. In production this is the
    // human funding path and should be gated to a custodian/owner address.
    pub fn deposit(&mut self, asset: AssetId, amount: U256) {
        let cur = self.allocations.get_or_default(&asset);
        self.allocations.set(&asset, cur + amount);
    }

    /// Agent-only rebalance of `amount` from one asset to another. Runs the
    /// SpendGate and ComplianceRegistry checks, then enforces the principal
    /// invariant before committing.
    pub fn reallocate(
        &mut self,
        from_asset: AssetId,
        to_asset: AssetId,
        amount: U256,
        attestation_hash: [u8; 32],
    ) {
        // Only the autonomous agent may move funds.
        if self.env().caller() != self.agent.get_or_revert_with(Error::AddressNotSet) {
            self.env().revert(Error::NotAuthorized);
        }

        // The party the policy checks run against. With the spec's signature
        // there is no counterparty argument, so we gate on the agent itself: it
        // must stay allowlisted/under cap and KYC-valid for any move.
        // ponytail: pass an explicit `target`/venue Address param when the agent
        // settles to an external counterparty.
        let target = self.agent.get_or_revert_with(Error::AddressNotSet);
        let amount_512 = u256_to_u512(amount);

        SpendGateContractRef::new(
            self.env(),
            self.spend_gate.get_or_revert_with(Error::AddressNotSet),
        )
        .check(target, amount_512);

        ComplianceRegistryContractRef::new(
            self.env(),
            self.compliance.get_or_revert_with(Error::AddressNotSet),
        )
        .assert_valid(target);

        // Apply the move.
        let from_bal = self.allocations.get_or_default(&from_asset);
        if amount > from_bal {
            self.env().revert(Error::InsufficientAllocation);
        }
        let to_bal = self.allocations.get_or_default(&to_asset);
        self.allocations.set(&from_asset, from_bal - amount);
        self.allocations.set(&to_asset, to_bal + amount);

        // Principal invariant: total backing must never drop below locked
        // principal. (A pure reallocation conserves the total, so this also
        // guards against any future code path that does not.)
        if self.total_allocations() < self.principal_locked.get_or_default() {
            self.env().revert(Error::TouchesPrincipal);
        }

        self.env().emit_event(Reallocated {
            from: from_asset,
            to: to_asset,
            amount,
            attestation_hash,
            block_time: self.env().get_block_time(),
        });
    }

    pub fn get_allocation(&self, asset: AssetId) -> U256 {
        self.allocations.get_or_default(&asset)
    }

    fn total_allocations(&self) -> U512 {
        let mut total = U512::zero();
        for asset in ALL_ASSETS {
            total += u256_to_u512(self.allocations.get_or_default(&asset));
        }
        total
    }
}
