//! ReputationRegistry - signed reputation score + anti-replay on payment proofs.
use crate::common::Error;
use odra::prelude::*;

#[odra::module(errors = Error)]
pub struct ReputationRegistry {
    // ponytail: spec asked for i128, but Casper CLType only goes up to i64
    // (no i128 CLTyped/ToBytes impl). i64 holds reputation scores with room to
    // spare; widen to a {sign:bool, mag:U256} odra_type only if it can overflow.
    score: Mapping<Address, i64>,
    consumed_payment_proofs: Mapping<[u8; 32], bool>,
}

#[odra::module]
impl ReputationRegistry {
    /// Credit `payer` for a settled payment. Each `deploy_hash` is single-use.
    /// Only the payer itself may submit the proof — you cannot credit someone else.
    pub fn record_payment(&mut self, payer: Address, deploy_hash: [u8; 32]) {
        if self.env().caller() != payer {
            self.env().revert(Error::NotAuthorized);
        }
        if self.consumed_payment_proofs.get_or_default(&deploy_hash) {
            self.env().revert(Error::ReplayedProof);
        }
        self.consumed_payment_proofs.set(&deploy_hash, true);
        let s = self.score.get_or_default(&payer);
        self.score.set(&payer, s + 1);
    }

    /// Adjust a score by a signed delta. `outcome_ref` links to the off-chain
    /// outcome that justified the adjustment (kept in the deploy/audit trail).
    pub fn adjust(&mut self, addr: Address, delta: i64, _outcome_ref: [u8; 32]) {
        let s = self.score.get_or_default(&addr);
        self.score.set(&addr, s + delta);
    }

    pub fn score_of(&self, addr: Address) -> i64 {
        self.score.get_or_default(&addr)
    }
}
