//! AttestationLog - on-chain proof-of-reasoning.
//!
//! The agent hashes its reasoning off-chain, signs the hash with its Ed25519
//! key, and submits (hash, decision, signature, pubkey). The contract verifies
//! the signature on-chain before recording it, so the log can never contain an
//! attestation the agent did not actually sign.
use crate::common::Error;
use odra::casper_types::{bytesrepr::Bytes, PublicKey};
use odra::prelude::*;

/// A recorded, signature-verified decision.
#[odra::odra_type]
pub struct Attestation {
    pub decision: String,
    pub signer: PublicKey,
    pub block_time: u64,
}

#[odra::event]
pub struct Attested {
    pub reasoning_hash: [u8; 32],
    pub signer: PublicKey,
    pub block_time: u64,
}

#[odra::module(events = [Attested], errors = Error)]
pub struct AttestationLog {
    attestations: Mapping<[u8; 32], Attestation>,
    agent_pubkey: Var<PublicKey>,
}

#[odra::module]
impl AttestationLog {
    pub fn init(&mut self, agent_pubkey: PublicKey) {
        self.agent_pubkey.set(agent_pubkey);
    }

    /// Verify the Ed25519 signature over `reasoning_hash` and record it.
    /// Reverts `InvalidAttestation` on a bad signature, `UnknownSigner` if the
    /// (valid) signature is not from the registered agent key.
    pub fn attest(
        &mut self,
        reasoning_hash: [u8; 32],
        decision: String,
        signature: Bytes,
        pubkey: PublicKey,
    ) {
        // The signed message is the raw 32-byte reasoning hash.
        let message = Bytes::from(reasoning_hash.as_slice());

        // ponytail: confirmed against odra 2.8 example
        // features::signature_verifier — self.env().verify_signature(message,
        // signature, public_key) -> bool. Signature/pubkey carry the algo tag
        // byte (0x01 ED25519).
        if !self.env().verify_signature(&message, &signature, &pubkey) {
            self.env().revert(Error::InvalidAttestation);
        }
        if pubkey != self.agent_pubkey.get_or_revert_with(Error::AddressNotSet) {
            self.env().revert(Error::UnknownSigner);
        }

        let block_time = self.env().get_block_time();
        self.attestations.set(
            &reasoning_hash,
            Attestation {
                decision,
                signer: pubkey.clone(),
                block_time,
            },
        );
        self.env().emit_event(Attested {
            reasoning_hash,
            signer: pubkey,
            block_time,
        });
    }

    pub fn get(&self, reasoning_hash: [u8; 32]) -> Option<Attestation> {
        self.attestations.get(&reasoning_hash)
    }
}
