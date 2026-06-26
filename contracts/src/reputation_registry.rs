//! ReputationRegistry - signed reputation score + anti-replay on payment proofs.
use crate::common::Error;
use odra::prelude::*;

#[odra::module(errors = Error)]
pub struct ReputationRegistry {
    // ponytail: verify against odra 2.8 — i128 must be a supported CL/odra
    // storage type. If the macro rejects i128, fall back to i64 (scores are
    // small) or a {sign:bool, mag:U256} odra_type. Spec asks for i128.
    score: Mapping<Address, i128>,
    consumed_payment_proofs: Mapping<[u8; 32], bool>,
}

#[odra::module]
impl ReputationRegistry {
    /// Credit `payer` for a settled payment. Each `deploy_hash` is single-use.
    pub fn record_payment(&mut self, payer: Address, deploy_hash: [u8; 32]) {
        if self.consumed_payment_proofs.get_or_default(&deploy_hash) {
            self.env().revert(Error::ReplayedProof);
        }
        self.consumed_payment_proofs.set(&deploy_hash, true);
        let s = self.score.get_or_default(&payer);
        self.score.set(&payer, s + 1);
    }

    /// Adjust a score by a signed delta. `outcome_ref` links to the off-chain
    /// outcome that justified the adjustment (kept in the deploy/audit trail).
    pub fn adjust(&mut self, addr: Address, delta: i128, _outcome_ref: [u8; 32]) {
        let s = self.score.get_or_default(&addr);
        self.score.set(&addr, s + delta);
    }

    pub fn score_of(&self, addr: Address) -> i128 {
        self.score.get_or_default(&addr)
    }
}
