//! Shared types and the project-wide error enum.
//!
//! Odra requires error discriminants to be unique across the whole project, so
//! every contract registers this single shared enum. One enum is also less code
//! than five.
use odra::casper_types::{U256, U512};
use odra::prelude::*;

/// The four real-world assets the treasury can hold.
/// `AssetId` doubles as a `Mapping` key in `RwaVault`.
// ponytail: verify against odra 2.8 — odra_type derives ToBytes so it should be
// usable as a Mapping key; swap to a plain `u8` if the key bound complains.
#[odra::odra_type]
#[derive(Default)]
pub enum AssetId {
    /// Physical gold.
    #[default]
    Gold,
    /// Tokenized treasury bond.
    TBond,
    /// WTI crude oil.
    WTI,
    /// Native CSPR.
    CSPR,
}

/// All assets, used to iterate allocations for the principal invariant.
pub const ALL_ASSETS: [AssetId; 4] = [AssetId::Gold, AssetId::TBond, AssetId::WTI, AssetId::CSPR];

/// KYC/AML status of an address. Defaults to `Pending`.
#[odra::odra_type]
#[derive(Default)]
pub enum Status {
    /// Known but not yet cleared. Default for any unseen address.
    #[default]
    Pending,
    /// Cleared to transact.
    Valid,
    /// Permanently blocked.
    Revoked,
}

/// Project-wide error set. Discriminants are unique across all contracts.
#[odra::odra_error]
pub enum Error {
    /// Caller is not the privileged agent/owner for this entry point.
    NotAuthorized = 1,
    /// A single transfer exceeds `max_per_tx`.
    OverTxCap = 2,
    /// Target address is not on the spend allowlist.
    NotAllowlisted = 3,
    /// This transfer would push spending over the rolling daily limit.
    OverDailyLimit = 4,
    /// The spend authorization window has closed (or was revoked).
    Expired = 5,
    /// Address is not `Valid` in the compliance registry.
    NotCompliant = 6,
    /// The Ed25519 signature did not verify against the reasoning hash.
    InvalidAttestation = 7,
    /// Signature verified but the signer is not the registered agent key.
    UnknownSigner = 8,
    /// This payment proof (deploy hash) was already consumed.
    ReplayedProof = 9,
    /// The move would drop total allocations below locked principal.
    TouchesPrincipal = 10,
    /// `from` asset does not hold enough to satisfy the move.
    InsufficientAllocation = 11,
    /// A required dependency address was never configured.
    AddressNotSet = 12,
}

/// Widen a `U256` into a `U512` losslessly via big-endian bytes.
pub fn u256_to_u512(v: U256) -> U512 {
    let mut buf = [0u8; 32];
    v.to_big_endian(&mut buf);
    U512::from_big_endian(&buf)
}
