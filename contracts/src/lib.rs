#![doc = "Amanah on-chain layer: autonomous compliant RWA treasury agent for Casper."]
#![no_std]
#![allow(missing_docs)]
extern crate alloc;

pub mod attestation_log;
pub mod auditor_quorum;
pub mod compliance_registry;
pub mod common;
pub mod payment_token;
pub mod policy_engine;
pub mod governance_timelock;
pub mod reputation_registry;
pub mod rwa_vault;
pub mod spend_gate;
pub mod zk_kyc;
pub mod zk_reserves;
