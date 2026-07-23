//! GovernanceTimelock (B4) — governance changes are queued and time-delayed, not instant.
//!
//! Owner-gated parameter changes (the PolicyEngine) are powerful: whoever holds the key can
//! retune the agent's risk policy in one transaction. A timelock makes that a *process*: the
//! proposer QUEUES a change, it sits for a mandatory delay (during which anyone can see it
//! coming and react), and only then can it be EXECUTED — by anyone, so the change can't be
//! quietly buried either. This is the standard on-chain governance safety valve, applied to
//! the policy engine: the PolicyEngine's owner becomes this contract, so the only way to move
//! a parameter is through the queue.
use crate::common::Error;
use crate::policy_engine::PolicyEngineContractRef;
use odra::prelude::*;
use odra::ContractRef;

#[odra::event]
pub struct ChangeQueued {
    pub new_confidence_bps: u32,
    pub eta: u64,
}

#[odra::event]
pub struct ChangeExecuted {
    pub new_confidence_bps: u32,
}

#[odra::module(events = [ChangeQueued, ChangeExecuted], errors = Error)]
pub struct GovernanceTimelock {
    /// The proposer — may queue changes (the custodian / management body).
    owner: Var<Address>,
    /// The PolicyEngine this timelock governs (must have this contract as its owner).
    policy_engine: Var<Address>,
    /// Mandatory delay (ms) between queueing and executing.
    delay_ms: Var<u64>,
    /// The queued confidence threshold (bps) and its earliest execution time. eta 0 = nothing queued.
    pending_confidence_bps: Var<u32>,
    eta: Var<u64>,
}

#[odra::module]
impl GovernanceTimelock {
    pub fn init(&mut self, owner: Address, policy_engine: Address, delay_ms: u64) {
        self.owner.set(owner);
        self.policy_engine.set(policy_engine);
        self.delay_ms.set(delay_ms);
    }

    fn assert_owner(&self) {
        if self.env().caller() != self.owner.get_or_revert_with(Error::AddressNotSet) {
            self.env().revert(Error::NotAuthorized);
        }
    }

    /// Queue a confidence-threshold change. It cannot take effect until `delay_ms` passes.
    pub fn queue_confidence(&mut self, new_confidence_bps: u32) {
        self.assert_owner();
        let eta = self.env().get_block_time().saturating_add(self.delay_ms.get_or_default());
        self.pending_confidence_bps.set(new_confidence_bps);
        self.eta.set(eta);
        self.env().emit_event(ChangeQueued { new_confidence_bps, eta });
    }

    /// Execute the queued change once the delay has elapsed. Callable by ANYONE — the delay,
    /// not the caller, is the control. Reverts `TimelockNotReady` if nothing is queued or the
    /// delay hasn't passed.
    pub fn execute_confidence(&mut self) {
        let eta = self.eta.get_or_default();
        if eta == 0 || self.env().get_block_time() < eta {
            self.env().revert(Error::TimelockNotReady);
        }
        let bps = self.pending_confidence_bps.get_or_default();
        PolicyEngineContractRef::new(
            self.env(),
            self.policy_engine.get_or_revert_with(Error::AddressNotSet),
        )
        .set_confidence_threshold_bps(bps);
        self.eta.set(0);
        self.env().emit_event(ChangeExecuted { new_confidence_bps: bps });
    }

    pub fn eta(&self) -> u64 {
        self.eta.get_or_default()
    }
    pub fn pending_confidence_bps(&self) -> u32 {
        self.pending_confidence_bps.get_or_default()
    }
    pub fn delay_ms(&self) -> u64 {
        self.delay_ms.get_or_default()
    }
}
