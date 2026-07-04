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
    // The only account allowed to `adjust` (slash/reward) a score — the custodian.
    // Without this, anyone could inflate their own reputation or grief another's.
    authority: Var<Address>,
}

#[odra::module]
impl ReputationRegistry {
    /// `authority` is the account permitted to slash/reward scores (the custodian).
    pub fn init(&mut self, authority: Address) {
        self.authority.set(authority);
    }

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

    /// Slash or reward a score by a signed delta. Gated to the authority (custodian)
    /// so the agent can't inflate itself and a griefer can't nuke it. The auditor
    /// (custodian) calls this with a negative delta when it VETOes a decision.
    /// `outcome_ref` links to the on-chain veto/outcome that justified it.
    pub fn adjust(&mut self, addr: Address, delta: i64, _outcome_ref: [u8; 32]) {
        if self.env().caller() != self.authority.get_or_revert_with(Error::AddressNotSet) {
            self.env().revert(Error::NotAuthorized);
        }
        let s = self.score.get_or_default(&addr);
        self.score.set(&addr, s + delta);
    }

    pub fn score_of(&self, addr: Address) -> i64 {
        self.score.get_or_default(&addr)
    }
}
