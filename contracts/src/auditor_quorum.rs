//! AuditorQuorum — K-of-N independent AI auditors must approve a decision on-chain.
//!
//! Upgrades the single auditor to a panel: N authorized auditor keys each review the
//! primary agent's decision and cast a signed APPROVE/REJECT vote here. The contract
//! verifies each Ed25519 signature IN-CONTRACT and that the signer is an authorized
//! auditor, then tallies. `approved(hash)` is true once approvals reach the threshold —
//! the agent's loop reads it before executing. No single auditor (or the agent) can
//! forge a quorum: each vote is an independent on-chain signature from a distinct key.
use crate::common::Error;
use odra::casper_types::{bytesrepr::Bytes, PublicKey};
use odra::prelude::*;

#[odra::event]
pub struct Voted {
    pub reasoning_hash: [u8; 32],
    pub auditor: PublicKey,
    pub approve: bool,
    pub approvals: u32,
}

#[odra::module(events = [Voted], errors = Error)]
pub struct AuditorQuorum {
    /// Authorized auditor public keys (set at init). Only these may vote.
    auditors: Mapping<PublicKey, bool>,
    threshold: Var<u32>,
    /// approvals[hash] and a per-(hash,auditor) guard against double-voting.
    approvals: Mapping<[u8; 32], u32>,
    voted: Mapping<([u8; 32], PublicKey), bool>,
}

#[odra::module]
impl AuditorQuorum {
    /// `auditors` are the authorized voter keys; `threshold` is the K in K-of-N.
    pub fn init(&mut self, auditors: Vec<PublicKey>, threshold: u32) {
        for a in auditors.iter() {
            self.auditors.set(a, true);
        }
        self.threshold.set(threshold);
    }

    /// Cast a signed vote. The signature must be over the 32-byte `reasoning_hash`,
    /// from an authorized auditor key. Reverts `InvalidAttestation` on a bad signature,
    /// `UnknownSigner` if not an authorized auditor, `ReplayedProof` on a double-vote.
    pub fn vote(&mut self, reasoning_hash: [u8; 32], approve: bool, signature: Bytes, pubkey: PublicKey) {
        let message = Bytes::from(reasoning_hash.as_slice());
        if !self.env().verify_signature(&message, &signature, &pubkey) {
            self.env().revert(Error::InvalidAttestation);
        }
        if !self.auditors.get_or_default(&pubkey) {
            self.env().revert(Error::UnknownSigner);
        }
        let vkey = (reasoning_hash, pubkey.clone());
        if self.voted.get_or_default(&vkey) {
            self.env().revert(Error::ReplayedProof);
        }
        self.voted.set(&vkey, true);

        let mut approvals = self.approvals.get_or_default(&reasoning_hash);
        if approve {
            approvals += 1;
            self.approvals.set(&reasoning_hash, approvals);
        }
        self.env().emit_event(Voted { reasoning_hash, auditor: pubkey, approve, approvals });
    }

    /// True once approvals for `reasoning_hash` reach the threshold — the quorum passed.
    pub fn approved(&self, reasoning_hash: [u8; 32]) -> bool {
        self.approvals.get_or_default(&reasoning_hash) >= self.threshold.get_or_default()
    }

    pub fn approvals_for(&self, reasoning_hash: [u8; 32]) -> u32 {
        self.approvals.get_or_default(&reasoning_hash)
    }

    pub fn threshold(&self) -> u32 {
        self.threshold.get_or_default()
    }
}
