//! ZkKycVerifier — REAL zero-knowledge KYC, verified on-chain.
//!
//! The issuer registers an agent's public credential `Y = x·B` (x = the agent's
//! secret KYC scalar, B = ed25519 basepoint). The agent later proves it KNOWS `x`
//! with a Schnorr NIZK (Fiat–Shamir) — WITHOUT revealing `x`. The contract verifies
//! the proof on-chain and marks the agent zk-verified. Nothing about `x` is learned:
//! this is a genuine zero-knowledge proof (256-bit EC), not a stored flag.
//!
//!   c = blake2b256(DOMAIN ‖ Y ‖ T ‖ ctx) mod L        (challenge, Fiat–Shamir)
//!   accept iff  s·B == T + c·Y                          (Schnorr verification eqn)
use crate::common::Error;
use odra::casper_types::bytesrepr::Bytes;
use odra::prelude::*;

use blake2::digest::consts::U32;
use blake2::{Blake2b, Digest};
use curve25519_dalek::constants::ED25519_BASEPOINT_POINT;
use curve25519_dalek::edwards::CompressedEdwardsY;
use curve25519_dalek::scalar::Scalar;

const DOMAIN: &[u8] = b"amanah-zk-kyc-v1";

#[odra::event]
pub struct KycProven {
    pub agent: Address,
}

#[odra::module(events = [KycProven], errors = Error)]
pub struct ZkKycVerifier {
    authority: Var<Address>,                    // the KYC issuer (custodian)
    credentials: Mapping<Address, [u8; 32]>,    // agent -> Y (compressed ed25519 point)
    zk_verified: Mapping<Address, bool>,
}

#[odra::module]
impl ZkKycVerifier {
    /// `authority` is the KYC issuer permitted to register credentials (the custodian).
    pub fn init(&mut self, authority: Address) {
        self.authority.set(authority);
    }

    /// Issuer registers an agent's KYC credential `Y = x·B` (32-byte compressed point).
    /// Registering resets any prior proof (fresh credential must be re-proven).
    pub fn register_credential(&mut self, agent: Address, credential: [u8; 32]) {
        if self.env().caller() != self.authority.get_or_revert_with(Error::AddressNotSet) {
            self.env().revert(Error::NotAuthorized);
        }
        self.credentials.set(&agent, credential);
        self.zk_verified.set(&agent, false);
    }

    /// Verify a Schnorr NIZK that the prover knows `x` with `Y = x·B`, bound to `ctx`.
    /// On success marks `agent` zk-verified. Reverts `InvalidAttestation` on a bad
    /// proof or malformed point; `AddressNotSet` if no credential is registered.
    pub fn prove_kyc(&mut self, agent: Address, t: [u8; 32], s: [u8; 32], ctx: Bytes) {
        let y_bytes = self
            .credentials
            .get(&agent)
            .unwrap_or_revert_with(&self.env(), Error::AddressNotSet);

        let y_point = CompressedEdwardsY(y_bytes)
            .decompress()
            .unwrap_or_revert_with(&self.env(), Error::InvalidAttestation);
        let t_point = CompressedEdwardsY(t)
            .decompress()
            .unwrap_or_revert_with(&self.env(), Error::InvalidAttestation);
        // s is a canonical scalar (< L); from_bytes_mod_order also tolerates equality.
        let s_scalar = Scalar::from_bytes_mod_order(s);

        // Fiat–Shamir challenge over the exact same bytes the TS prover hashed.
        let mut hasher = Blake2b::<U32>::new();
        hasher.update(DOMAIN);
        hasher.update(y_bytes);
        hasher.update(t);
        hasher.update(ctx.as_slice());
        let digest = hasher.finalize();
        let mut cb = [0u8; 32];
        cb.copy_from_slice(&digest);
        let c = Scalar::from_bytes_mod_order(cb);

        // Schnorr check: s·B == T + c·Y
        let lhs = ED25519_BASEPOINT_POINT * s_scalar;
        let rhs = t_point + y_point * c;
        if lhs != rhs {
            self.env().revert(Error::InvalidAttestation);
        }

        self.zk_verified.set(&agent, true);
        self.env().emit_event(KycProven { agent });
    }

    pub fn is_zk_verified(&self, agent: Address) -> bool {
        self.zk_verified.get(&agent).unwrap_or_default()
    }

    pub fn credential_of(&self, agent: Address) -> Option<[u8; 32]> {
        self.credentials.get(&agent)
    }
}
