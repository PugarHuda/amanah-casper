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

/// Domain tag mixed into every signed vote so a signature can't be replayed as a
/// different message (and to separate these votes from any other signing the key does).
const DOMAIN: &[u8] = b"amanah-auditor-quorum-v1";

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
    /// Per-deployment domain separator, mixed into every signed vote. Without it a
    /// signature is valid on ANY deployment of this contract, so an attacker could get an
    /// auditor to sign a vote on a decoy quorum and replay it to the real one. Declared
    /// last so existing state field indices don't shift.
    instance_id: Var<[u8; 32]>,
    /// approvals[hash] and a per-(hash,auditor) guard against double-voting.
    approvals: Mapping<[u8; 32], u32>,
    voted: Mapping<([u8; 32], PublicKey), bool>,
}

#[odra::module]
impl AuditorQuorum {
    /// `auditors` are the authorized voter keys; `threshold` is the K in K-of-N.
    pub fn init(&mut self, auditors: Vec<PublicKey>, threshold: u32, instance_id: [u8; 32]) {
        // threshold 0 would make `approved()` true with zero votes.
        if threshold < 1 {
            self.env().revert(Error::NotAuthorized);
        }
        for a in auditors.iter() {
            self.auditors.set(a, true);
        }
        self.threshold.set(threshold);
        self.instance_id.set(instance_id);
    }

    /// Cast a signed vote. The signature must be over the 32-byte `reasoning_hash`,
    /// from an authorized auditor key. Reverts `InvalidAttestation` on a bad signature,
    /// `UnknownSigner` if not an authorized auditor, `ReplayedProof` on a double-vote.
    pub fn vote(&mut self, reasoning_hash: [u8; 32], approve: bool, signature: Bytes, pubkey: PublicKey) {
        // Sign over DOMAIN ‖ instance_id ‖ reasoning_hash ‖ approve_byte. Binding `approve`
        // stops a relayer flipping a signed REJECT into an APPROVE; binding `instance_id`
        // stops a signature farmed on a decoy deployment being replayed to this one.
        let mut msg = Vec::with_capacity(DOMAIN.len() + 65);
        msg.extend_from_slice(DOMAIN);
        // Bind THIS deployment: a signature farmed on another quorum instance is useless here.
        msg.extend_from_slice(&self.instance_id.get_or_default());
        msg.extend_from_slice(&reasoning_hash);
        msg.push(approve as u8);
        if !self.env().verify_signature(&Bytes::from(msg), &signature, &pubkey) {
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

    /// Published so verifiers/signers can reconstruct the exact signed message.
    pub fn instance_id(&self) -> [u8; 32] {
        self.instance_id.get_or_default()
    }

    pub fn threshold(&self) -> u32 {
        self.threshold.get_or_default()
    }
}
