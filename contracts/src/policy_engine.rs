//! PolicyEngine — the trading policy as ON-CHAIN, governed parameters.
//!
//! The agent's rules used to live only in its prompt and env vars: the confidence
//! threshold below which it escalates, how large a rebalance may be, the reputation floor,
//! and which policy version governs it. That means the policy is whatever the operator's
//! config file says today. Here those parameters live on-chain, owner-gated, and versioned
//! to the signed-off `POLICY.md` hash — so the policy the agent actually runs under is
//! public, auditable, and changeable only through a key-separated governance action, not a
//! quiet edit. The agent reads these before every decision.
use crate::common::Error;
use odra::prelude::*;

#[odra::event]
pub struct PolicyUpdated {
    pub field: String,
    pub by: Address,
}

#[odra::module(events = [PolicyUpdated], errors = Error)]
pub struct PolicyEngine {
    /// The governance key allowed to change parameters (the custodian / management body).
    owner: Var<Address>,
    /// Confidence below this (in basis points, 7000 = 0.70) forces the agent to escalate.
    confidence_threshold_bps: Var<u32>,
    /// The most of a single asset the agent may move in one rebalance (bps, 800 = 8%).
    max_rebalance_bps: Var<u32>,
    /// Reputation floor: below it the agent is benched (mirrors the vault's breaker).
    min_reputation: Var<i64>,
    /// The signed-off policy version this parameter set belongs to (POLICY.md body hash).
    policy_version: Var<[u8; 32]>,
}

#[odra::module]
impl PolicyEngine {
    pub fn init(
        &mut self,
        owner: Address,
        confidence_threshold_bps: u32,
        max_rebalance_bps: u32,
        min_reputation: i64,
        policy_version: [u8; 32],
    ) {
        self.owner.set(owner);
        self.confidence_threshold_bps.set(confidence_threshold_bps);
        self.max_rebalance_bps.set(max_rebalance_bps);
        self.min_reputation.set(min_reputation);
        self.policy_version.set(policy_version);
    }

    fn assert_owner(&self) {
        if self.env().caller() != self.owner.get_or_revert_with(Error::AddressNotSet) {
            self.env().revert(Error::NotAuthorized);
        }
    }

    /// Hand governance to a new owner — e.g. a GovernanceTimelock, so parameter changes
    /// must go through a queued, time-delayed process instead of an instant custodian edit.
    pub fn set_owner(&mut self, new_owner: Address) {
        self.assert_owner();
        self.owner.set(new_owner);
        self.env().emit_event(PolicyUpdated { field: "owner".into(), by: self.env().caller() });
    }

    pub fn set_confidence_threshold_bps(&mut self, bps: u32) {
        self.assert_owner();
        self.confidence_threshold_bps.set(bps);
        self.env().emit_event(PolicyUpdated { field: "confidence_threshold_bps".into(), by: self.env().caller() });
    }

    pub fn set_max_rebalance_bps(&mut self, bps: u32) {
        self.assert_owner();
        self.max_rebalance_bps.set(bps);
        self.env().emit_event(PolicyUpdated { field: "max_rebalance_bps".into(), by: self.env().caller() });
    }

    pub fn set_min_reputation(&mut self, v: i64) {
        self.assert_owner();
        self.min_reputation.set(v);
        self.env().emit_event(PolicyUpdated { field: "min_reputation".into(), by: self.env().caller() });
    }

    /// Bind a NEW signed-off policy version (its POLICY.md body hash) to these parameters.
    pub fn set_policy_version(&mut self, hash: [u8; 32]) {
        self.assert_owner();
        self.policy_version.set(hash);
        self.env().emit_event(PolicyUpdated { field: "policy_version".into(), by: self.env().caller() });
    }

    pub fn confidence_threshold_bps(&self) -> u32 {
        self.confidence_threshold_bps.get_or_default()
    }
    pub fn max_rebalance_bps(&self) -> u32 {
        self.max_rebalance_bps.get_or_default()
    }
    pub fn min_reputation(&self) -> i64 {
        self.min_reputation.get_or_default()
    }
    pub fn policy_version(&self) -> [u8; 32] {
        self.policy_version.get_or_default()
    }
}
