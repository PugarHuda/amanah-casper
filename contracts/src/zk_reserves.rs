//! ZkReserves — REAL zero-knowledge proof-of-reserves, verified on-chain.
//!
//! The agent publishes a Pedersen commitment per allocation `C_i = a_i·G + r_i·H`
//! (perfectly hiding each `a_i`) and proves the hidden allocations sum to a PUBLIC
//! total `T` — WITHOUT revealing any `a_i`. With the vault's on-chain principal
//! invariant (`T ≥ principal`), this proves SOLVENCY while hiding the trading STRATEGY
//! (the per-asset split). No range proof: the sum is a linear relation.
//!
//!   P = ΣC_i − T·G          (= R·H, R = Σr_i, iff Σa_i = T)
//!   c = blake2b256(DOMAIN ‖ ΣC ‖ T_le ‖ proof_T) mod L
//!   accept iff  s·H == proof_T + c·P     (Schnorr PoK of R for base H)
use crate::common::Error;
use odra::prelude::*;

use blake2::digest::consts::U32;
use blake2::{Blake2b, Digest};
use curve25519_dalek::constants::ED25519_BASEPOINT_POINT;
use curve25519_dalek::edwards::CompressedEdwardsY;
use curve25519_dalek::scalar::Scalar;
use curve25519_dalek::traits::Identity;
use curve25519_dalek::edwards::EdwardsPoint;

const DOMAIN: &[u8] = b"amanah-zk-reserves-v1";
// Nothing-up-my-sleeve second generator H (unknown discrete log wrt G). Derived by
// try-and-increment hashing + cofactor clearing; the exact bytes are pinned here and
// in agent/src/zk-reserves.ts so both sides use the identical generator.
const H_BYTES: [u8; 32] = [
    0xbc, 0x55, 0xd5, 0xc8, 0xb1, 0x4e, 0x52, 0xee, 0x5a, 0xb9, 0xa7, 0xe3, 0x16, 0xf0, 0xeb, 0x33,
    0x08, 0x88, 0xc3, 0xbd, 0x61, 0x05, 0x57, 0xc4, 0x03, 0xa0, 0xb5, 0x22, 0xf2, 0x70, 0x62, 0x9d,
];

#[odra::event]
pub struct ReservesProven {
    pub total: u64,
}

#[odra::module(events = [ReservesProven], errors = Error)]
pub struct ZkReserves {
    solvent: Var<bool>,
    last_total: Var<u64>,
}

#[odra::module]
impl ZkReserves {
    pub fn init(&mut self) {
        self.solvent.set(false);
    }

    /// Verify a ZK proof-of-reserves: the hidden allocations behind `commitments` sum
    /// to `total`, proven in zero-knowledge, AND `total >= principal_floor` (solvency).
    /// Reverts `NotCompliant` if under the floor, `InvalidAttestation` on a bad proof.
    pub fn prove_reserves(
        &mut self,
        commitments: Vec<[u8; 32]>,
        total: u64,
        proof_t: [u8; 32],
        s: [u8; 32],
        principal_floor: u64,
    ) {
        if total < principal_floor {
            self.env().revert(Error::NotCompliant); // reserves below the required backing
        }
        let h = CompressedEdwardsY(H_BYTES)
            .decompress()
            .unwrap_or_revert_with(&self.env(), Error::InvalidAttestation);
        let t_point = CompressedEdwardsY(proof_t)
            .decompress()
            .unwrap_or_revert_with(&self.env(), Error::InvalidAttestation);
        let s_scalar = Scalar::from_bytes_mod_order(s);

        // Aggregate the commitments: ΣC_i.
        let mut sum_c = EdwardsPoint::identity();
        for c in commitments.iter() {
            let p = CompressedEdwardsY(*c)
                .decompress()
                .unwrap_or_revert_with(&self.env(), Error::InvalidAttestation);
            sum_c += p;
        }
        // P = ΣC − T·G  (equals R·H iff the hidden values sum to T).
        let p_point = sum_c - ED25519_BASEPOINT_POINT * Scalar::from(total);

        // Fiat–Shamir challenge over the exact bytes the TS prover hashed.
        let mut hasher = Blake2b::<U32>::new();
        hasher.update(DOMAIN);
        hasher.update(sum_c.compress().as_bytes());
        hasher.update(total.to_le_bytes());
        hasher.update(proof_t);
        let digest = hasher.finalize();
        let mut cb = [0u8; 32];
        cb.copy_from_slice(&digest);
        let c = Scalar::from_bytes_mod_order(cb);

        // Schnorr check for base H: s·H == proof_T + c·P.
        if h * s_scalar != t_point + p_point * c {
            self.env().revert(Error::InvalidAttestation);
        }

        self.solvent.set(true);
        self.last_total.set(total);
        self.env().emit_event(ReservesProven { total });
    }

    pub fn is_solvent(&self) -> bool {
        self.solvent.get_or_default()
    }

    pub fn last_total(&self) -> u64 {
        self.last_total.get_or_default()
    }
}
