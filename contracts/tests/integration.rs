//! Cross-contract integration tests on the OdraVM host environment.
use amanah_contracts::attestation_log::{AttestationLog, AttestationLogInitArgs};
use amanah_contracts::common::{AssetId, Error, Status};
use amanah_contracts::compliance_registry::ComplianceRegistry;
use amanah_contracts::reputation_registry::ReputationRegistry;
use amanah_contracts::rwa_vault::{RwaVault, RwaVaultHostRef, RwaVaultInitArgs};
use amanah_contracts::spend_gate::{SpendGate, SpendGateInitArgs};
use odra::casper_types::{bytesrepr::Bytes, U256, U512};
use odra::host::{Deployer, HostRef, NoArgs};

/// Wire up SpendGate + ComplianceRegistry + RwaVault. `cap` is max_per_tx;
/// `compliant` decides whether the agent (account 1) is marked Valid.
fn setup(cap: u64, compliant: bool) -> (RwaVaultHostRef, odra::host::HostEnv) {
    let env = odra_test::env();
    let agent = env.get_account(1);

    let mut spend_gate = SpendGate::deploy(
        &env,
        SpendGateInitArgs {
            max_per_tx: U512::from(cap),
            daily_limit: U512::from(1_000_000u64),
            expiry: 0,
        },
    );
    spend_gate.add_allowlist(agent);

    let mut compliance = ComplianceRegistry::deploy(&env, NoArgs);
    if compliant {
        compliance.set_status(agent, Status::Valid, [0u8; 32]);
    }

    let mut vault = RwaVault::deploy(
        &env,
        RwaVaultInitArgs {
            agent,
            spend_gate: spend_gate.contract_address(),
            compliance: compliance.contract_address(),
            principal: U512::zero(),
        },
    );
    vault.deposit(AssetId::Gold, U256::from(1000));

    (vault, env)
}

#[test]
fn reallocate_rejected_when_spend_cap_exceeded() {
    // cap = 100, but we move 500 -> OverTxCap.
    let (mut vault, env) = setup(100, true);
    env.set_caller(env.get_account(1));
    let err = vault
        .try_reallocate(AssetId::Gold, AssetId::TBond, U256::from(500), [0u8; 32])
        .unwrap_err();
    assert_eq!(err, Error::OverTxCap.into());
}

#[test]
fn reallocate_rejected_when_not_compliant() {
    // cap high so SpendGate passes; agent left Pending -> NotCompliant.
    let (mut vault, env) = setup(1_000_000, false);
    env.set_caller(env.get_account(1));
    let err = vault
        .try_reallocate(AssetId::Gold, AssetId::TBond, U256::from(500), [0u8; 32])
        .unwrap_err();
    assert_eq!(err, Error::NotCompliant.into());
}

#[test]
fn reallocate_succeeds_when_authorized_and_compliant() {
    let (mut vault, env) = setup(1_000_000, true);
    env.set_caller(env.get_account(1));
    vault.reallocate(AssetId::Gold, AssetId::TBond, U256::from(500), [9u8; 32]);
    assert_eq!(vault.get_allocation(AssetId::Gold), U256::from(500));
    assert_eq!(vault.get_allocation(AssetId::TBond), U256::from(500));
}

#[test]
fn attest_stores_on_valid_signature_and_reverts_on_tamper() {
    let env = odra_test::env();
    let account = env.get_account(0);
    let pubkey = env.public_key(&account);

    let reasoning_hash = [7u8; 32];
    let message = Bytes::from(reasoning_hash.as_slice());
    let signature = env.sign_message(&message, &account);

    let mut log = AttestationLog::deploy(
        &env,
        AttestationLogInitArgs {
            agent_pubkey: pubkey.clone(),
        },
    );

    // Valid signature over the real hash -> stored.
    log.attest(
        reasoning_hash,
        "BUY 10 TBOND".to_string(),
        signature.clone(),
        pubkey.clone(),
    );
    let stored = log.get(reasoning_hash).expect("attestation stored");
    assert_eq!(stored.decision, "BUY 10 TBOND".to_string());

    // Same signature, different hash -> signature does not verify.
    let tampered = [8u8; 32];
    let err = log
        .try_attest(tampered, "BUY 10 TBOND".to_string(), signature, pubkey)
        .unwrap_err();
    assert_eq!(err, Error::InvalidAttestation.into());
}

#[test]
fn record_payment_rejects_replay() {
    let env = odra_test::env();
    let payer = env.get_account(1);
    let mut rep = ReputationRegistry::deploy(&env, NoArgs);

    let deploy_hash = [1u8; 32];
    rep.record_payment(payer, deploy_hash);
    assert_eq!(rep.score_of(payer), 1);

    let err = rep.try_record_payment(payer, deploy_hash).unwrap_err();
    assert_eq!(err, Error::ReplayedProof.into());
    // Score unchanged after the rejected replay.
    assert_eq!(rep.score_of(payer), 1);
}
