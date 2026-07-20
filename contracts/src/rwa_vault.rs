//! RwaVault - holds allocations across real-world assets and lets the agent
//! rebalance yield while a hard principal invariant is enforced on every move.
use crate::common::{u256_to_u512, AssetId, Error, ALL_ASSETS};
use crate::auditor_quorum::AuditorQuorumContractRef;
use crate::compliance_registry::ComplianceRegistryContractRef;
use crate::reputation_registry::ReputationRegistryContractRef;
use crate::spend_gate::SpendGateContractRef;
use odra::casper_types::{U256, U512};
use odra::prelude::*;
use odra::ContractRef;

/// Minimum silence window the dead-man's switch will accept (6h). Stops a griefer
/// passing a tiny `max_age_ms` to freeze an active agent.
const MIN_STALE_MS: u64 = 21_600_000;

#[odra::event]
pub struct Reallocated {
    pub from: AssetId,
    pub to: AssetId,
    pub amount: U256,
    pub attestation_hash: [u8; 32],
    pub block_time: u64,
}

#[odra::event]
pub struct VaultFrozen {
    pub by: Address,
    pub last_heartbeat: u64,
    pub block_time: u64,
}

#[odra::module(events = [Reallocated, VaultFrozen], errors = Error)]
pub struct RwaVault {
    allocations: Mapping<AssetId, U256>,
    principal_locked: Var<U512>,
    agent: Var<Address>,
    spend_gate: Var<Address>,
    compliance: Var<Address>,
    // v4: on-chain circuit breakers.
    reputation: Var<Address>,      // ReputationRegistry — trading requires a min score
    min_reputation: Var<i64>,      // floor; below it the agent is auto-benched
    custodian: Var<Address>,       // may unfreeze after a dead-man's-switch trip
    last_heartbeat: Var<u64>,      // last time the agent proved liveness (ms)
    frozen: Var<bool>,             // dead-man's switch state
    /// AuditorQuorum — a K-of-N quorum of independent auditors must have approved the
    /// decision on-chain before funds move. Declared last so existing state field
    /// indices (frozen=10, …) don't shift.
    quorum: Var<Address>,
}

#[odra::module]
impl RwaVault {
    pub fn init(
        &mut self,
        agent: Address,
        spend_gate: Address,
        compliance: Address,
        principal: U512,
        reputation: Address,
        min_reputation: i64,
        custodian: Address,
        quorum: Address,
    ) {
        self.quorum.set(quorum);
        self.agent.set(agent);
        self.spend_gate.set(spend_gate);
        self.compliance.set(compliance);
        self.principal_locked.set(principal);
        self.reputation.set(reputation);
        self.min_reputation.set(min_reputation);
        self.custodian.set(custodian);
        self.last_heartbeat.set(self.env().get_block_time());
        self.frozen.set(false);
    }

    /// The agent proves it's alive each cycle (cheap). If it stops, `freeze_if_stale`
    /// lets anyone trip the dead-man's switch. Agent-only.
    pub fn heartbeat(&mut self) {
        if self.env().caller() != self.agent.get_or_revert_with(Error::AddressNotSet) {
            self.env().revert(Error::NotAuthorized);
        }
        self.last_heartbeat.set(self.env().get_block_time());
    }

    /// Dead-man's switch: ANYONE may freeze the vault if the agent has been silent
    /// longer than `max_age_ms`. A rogue or dead agent can't keep trading in the dark.
    /// `max_age_ms` must be at least `MIN_STALE_MS` (a 6h floor) so a griefer can't
    /// pass 0 to freeze a perfectly active agent — an agent that heartbeats every
    /// cycle (~60s) is never stale by this window; only a genuinely silent one is.
    pub fn freeze_if_stale(&mut self, max_age_ms: u64) {
        if max_age_ms < MIN_STALE_MS {
            self.env().revert(Error::NotStale);
        }
        let now = self.env().get_block_time();
        let last = self.last_heartbeat.get_or_default();
        // saturating_add: a huge max_age_ms must not wrap u64 and skip the guard.
        if now < last.saturating_add(max_age_ms) {
            self.env().revert(Error::NotStale);
        }
        self.frozen.set(true);
        self.env().emit_event(VaultFrozen { by: self.env().caller(), last_heartbeat: last, block_time: now });
    }

    /// Custodian-only: lift a freeze after a human has reviewed the incident.
    pub fn unfreeze(&mut self) {
        if self.env().caller() != self.custodian.get_or_revert_with(Error::AddressNotSet) {
            self.env().revert(Error::NotAuthorized);
        }
        self.frozen.set(false);
        self.last_heartbeat.set(self.env().get_block_time());
    }

    pub fn is_frozen(&self) -> bool {
        self.frozen.get_or_default()
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
        let agent = self.agent.get_or_revert_with(Error::AddressNotSet);
        if self.env().caller() != agent {
            self.env().revert(Error::NotAuthorized);
        }

        // Circuit breaker 1: a frozen vault (dead-man's switch tripped) blocks all moves.
        if self.frozen.get_or_default() {
            self.env().revert(Error::Frozen);
        }
        // Circuit breaker 2: the agent's on-chain reputation must be at/above the floor.
        // Auditor VETOes slash it; enough bad decisions auto-bench the agent on-chain.
        let score = ReputationRegistryContractRef::new(
            self.env(),
            self.reputation.get_or_revert_with(Error::AddressNotSet),
        )
        .score_of(agent);
        if score < self.min_reputation.get_or_default() {
            self.env().revert(Error::BelowReputationFloor);
        }
        // SEPARATION OF DUTIES, enforced by the contract (not by the agent's own code):
        // a K-of-N quorum of INDEPENDENT auditors must have signed APPROVE for exactly
        // this decision on-chain. Without it the move reverts — so a compromised or
        // misbehaving agent still cannot move funds on its own say-so.
        if !AuditorQuorumContractRef::new(
            self.env(),
            self.quorum.get_or_revert_with(Error::AddressNotSet),
        )
        .approved(attestation_hash)
        {
            self.env().revert(Error::NotApproved);
        }
        // Reallocating is itself proof of liveness — refresh the heartbeat.
        self.last_heartbeat.set(self.env().get_block_time());

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

        // A move must be BETWEEN two different assets. With from == to the credit below
        // would overwrite the debit (both write the same key), leaving the balance at
        // `bal + amount` — i.e. minting value from nothing, which the principal
        // invariant cannot catch because it only ever checks that the total is not too
        // LOW. Reject it outright so reallocation always conserves the total.
        if from_asset == to_asset {
            self.env().revert(Error::SameAsset);
        }

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
