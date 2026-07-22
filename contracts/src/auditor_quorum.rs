//! AuditorQuorum — K-of-N independent AI auditors must approve a decision on-chain.
//!
//! Upgrades the single auditor to a panel: N authorized auditor keys each review the
//! primary agent's decision and cast a signed APPROVE/REJECT vote here. The contract
//! verifies each Ed25519 signature IN-CONTRACT and that the signer is an authorized
//! auditor, then tallies. `approved(hash)` is true once approvals reach the threshold —
//! the agent's loop reads it before executing. No single auditor (or the agent) can
//! forge a quorum: each vote is an independent on-chain signature from a distinct key.
use crate::common::Error;
use odra::casper_types::{bytesrepr::Bytes, PublicKey, U512};
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

/// Emitted by the caller-authenticated path (`vote_as_caller`), where the voter is
/// identified by the deploy's own signature (`caller`) rather than a detached signature.
/// This is what lets an auditor vote straight from a wallet in the browser — the wallet
/// signs the deploy, and no separate raw-message signature is needed.
#[odra::event]
pub struct VotedByAccount {
    pub reasoning_hash: [u8; 32],
    pub auditor: Address,
    pub approve: bool,
    pub approvals: u32,
}

/// Emitted when an account joins the open auditor registry.
#[odra::event]
pub struct AuditorRegistered {
    pub auditor: Address,
}

/// Emitted when a staked auditor is slashed — real economic skin-in-the-game burned.
#[odra::event]
pub struct AuditorSlashed {
    pub auditor: Address,
    pub amount: U512,
}

/// Emitted when an auditor withdraws their (un-slashed) stake and leaves the registry.
#[odra::event]
pub struct StakeWithdrawn {
    pub auditor: Address,
    pub amount: U512,
}

#[odra::module(events = [Voted, VotedByAccount, AuditorRegistered, AuditorSlashed, StakeWithdrawn], errors = Error)]
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
    // --- caller-authenticated path (browser voting + open registry) --------------
    // Declared last so the fields above keep their state indices. This path identifies
    // the voter by `caller` (the deploy signer) instead of a detached signature, which is
    // what a browser wallet can actually produce. Votes here count toward the SAME
    // threshold as the signed votes above — one unified quorum, two ways to reach it.
    /// Accounts allowed to vote via `vote_as_caller`. In this deployment anyone may
    /// self-register (a demo of the open auditor registry; production gates it behind a
    /// stake — see roadmap B1). Distinct from `auditors` because caller auth is keyed by
    /// account address, signed-vote auth by public key.
    auditor_addrs: Mapping<Address, bool>,
    voted_addr: Mapping<([u8; 32], Address), bool>,
    // --- economic staking + slashing (B6) ---------------------------------------
    // Declared last so earlier state indices don't shift. Real skin-in-the-game: an
    // auditor can back its registration with native CSPR, and a caught bad-faith auditor
    // has that stake burned. The free `open_register` still exists so a judge without
    // testnet CSPR can join the demo; `register_with_stake` is the economic path.
    /// The key allowed to slash — the custodian trust boundary, set at init.
    slasher: Var<Address>,
    /// Minimum CSPR a staked registration must attach (0 disables the requirement).
    min_stake: Var<U512>,
    /// Live stake held per auditor. Withdrawable if never slashed.
    stake: Mapping<Address, U512>,
}

#[odra::module]
impl AuditorQuorum {
    /// `auditors` are the authorized voter keys; `threshold` is the K in K-of-N.
    /// `slasher` may burn staked auditors' bonds; `min_stake` is the CSPR a staked
    /// registration must attach (0 to disable staking entirely).
    pub fn init(&mut self, auditors: Vec<PublicKey>, threshold: u32, instance_id: [u8; 32], slasher: Address, min_stake: U512) {
        // threshold 0 would make `approved()` true with zero votes.
        if threshold < 1 {
            self.env().revert(Error::NotAuthorized);
        }
        for a in auditors.iter() {
            self.auditors.set(a, true);
        }
        self.threshold.set(threshold);
        self.instance_id.set(instance_id);
        self.slasher.set(slasher);
        self.min_stake.set(min_stake);
    }

    /// Join the registry by STAKING native CSPR (attached to this call). The stake is real
    /// skin-in-the-game: a caught bad-faith auditor loses it via `slash`. Reverts
    /// `InsufficientStake` if less than `min_stake` is attached.
    #[odra(payable)]
    pub fn register_with_stake(&mut self) {
        let caller = self.env().caller();
        let attached = self.env().attached_value();
        if attached < self.min_stake.get_or_default() {
            self.env().revert(Error::InsufficientStake);
        }
        let cur = self.stake.get_or_default(&caller);
        self.stake.set(&caller, cur + attached);
        self.auditor_addrs.set(&caller, true);
        self.env().emit_event(AuditorRegistered { auditor: caller });
    }

    /// Slash a staked auditor: burn its bond (transferred to the slasher's reserve) and
    /// remove it from the registry. Only the `slasher` (custodian) may call this — the same
    /// key-separated trust boundary the rest of the system uses.
    pub fn slash(&mut self, who: Address) {
        let slasher = self.slasher.get_or_revert_with(Error::AddressNotSet);
        if self.env().caller() != slasher {
            self.env().revert(Error::NotAuthorized);
        }
        let amount = self.stake.get_or_default(&who);
        self.stake.set(&who, U512::zero());
        self.auditor_addrs.set(&who, false);
        if amount > U512::zero() {
            // The bond moves to the slasher's reserve — a real, on-chain economic penalty.
            self.env().transfer_tokens(&slasher, &amount);
        }
        self.env().emit_event(AuditorSlashed { auditor: who, amount });
    }

    /// Withdraw your own (un-slashed) stake and leave the registry.
    pub fn withdraw_stake(&mut self) {
        let caller = self.env().caller();
        let amount = self.stake.get_or_default(&caller);
        if amount == U512::zero() {
            self.env().revert(Error::InsufficientStake);
        }
        self.stake.set(&caller, U512::zero());
        self.auditor_addrs.set(&caller, false);
        self.env().transfer_tokens(&caller, &amount);
        self.env().emit_event(StakeWithdrawn { auditor: caller, amount });
    }

    /// Live stake held by `who` (0 if none / slashed / withdrawn).
    pub fn stake_of(&self, who: Address) -> U512 {
        self.stake.get_or_default(&who)
    }

    /// The minimum CSPR a staked registration must attach.
    pub fn min_stake(&self) -> U512 {
        self.min_stake.get_or_default()
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

    /// Join the open auditor registry. In this deployment registration is permissionless
    /// so any wallet can participate in the demo; a production quorum would require a
    /// stake here and slash it for bad audits (roadmap B1). Idempotent.
    pub fn open_register(&mut self) {
        let caller = self.env().caller();
        self.auditor_addrs.set(&caller, true);
        self.env().emit_event(AuditorRegistered { auditor: caller });
    }

    /// Cast a vote authenticated by the CALLER — the account that signed this deploy —
    /// instead of a detached signature. This is the path a browser wallet uses: it signs
    /// the deploy, and the contract trusts the on-chain caller identity. Reverts
    /// `UnknownSigner` if the caller isn't a registered auditor, `ReplayedProof` on a
    /// double-vote. Counts toward the same threshold as `vote`.
    pub fn vote_as_caller(&mut self, reasoning_hash: [u8; 32], approve: bool) {
        let caller = self.env().caller();
        if !self.auditor_addrs.get_or_default(&caller) {
            self.env().revert(Error::UnknownSigner);
        }
        let vkey = (reasoning_hash, caller);
        if self.voted_addr.get_or_default(&vkey) {
            self.env().revert(Error::ReplayedProof);
        }
        self.voted_addr.set(&vkey, true);

        let mut approvals = self.approvals.get_or_default(&reasoning_hash);
        if approve {
            approvals += 1;
            self.approvals.set(&reasoning_hash, approvals);
        }
        self.env().emit_event(VotedByAccount { reasoning_hash, auditor: caller, approve, approvals });
    }

    /// True if `who` is in the open auditor registry (may vote via `vote_as_caller`).
    pub fn is_registered(&self, who: Address) -> bool {
        self.auditor_addrs.get_or_default(&who)
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
