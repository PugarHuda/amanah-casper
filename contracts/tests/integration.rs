//! Cross-contract integration tests on the OdraVM host environment.
use amanah_contracts::attestation_log::{AttestationLog, AttestationLogInitArgs};
use amanah_contracts::auditor_quorum::{AuditorQuorum, AuditorQuorumInitArgs};
use amanah_contracts::common::{AssetId, Error, Status};
use amanah_contracts::compliance_registry::ComplianceRegistry;
use amanah_contracts::payment_token::{PaymentToken, PaymentTokenInitArgs};
use amanah_contracts::reputation_registry::{ReputationRegistry, ReputationRegistryInitArgs};
use amanah_contracts::rwa_vault::{RwaVault, RwaVaultHostRef, RwaVaultInitArgs};
use amanah_contracts::spend_gate::{SpendGate, SpendGateInitArgs};
use amanah_contracts::zk_kyc::{ZkKycVerifier, ZkKycVerifierInitArgs};
use amanah_contracts::zk_reserves::ZkReserves;
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
    let reputation = ReputationRegistry::deploy(&env, ReputationRegistryInitArgs { authority: env.get_account(0) });

    let mut vault = RwaVault::deploy(
        &env,
        RwaVaultInitArgs {
            agent,
            spend_gate: spend_gate.contract_address(),
            compliance: compliance.contract_address(),
            principal: U512::zero(),
            reputation: reputation.contract_address(),
            min_reputation: 0, // floor 0: score 0 (default) passes; raise it to bench
            custodian: env.get_account(0),
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
fn reallocate_rejected_when_it_would_touch_principal() {
    // Lock principal (2000) above total backing (1000 deposited): any move leaves
    // total < principal -> TouchesPrincipal. Pins the principal invariant as a live
    // guard, not just a declared one. (A normal reallocation conserves total and
    // passes; this deliberately under-funds the vault to fire the check.)
    let env = odra_test::env();
    let agent = env.get_account(1);

    let mut spend_gate = SpendGate::deploy(
        &env,
        SpendGateInitArgs {
            max_per_tx: U512::from(1_000_000u64),
            daily_limit: U512::from(1_000_000u64),
            expiry: 0,
        },
    );
    spend_gate.add_allowlist(agent);
    let mut compliance = ComplianceRegistry::deploy(&env, NoArgs);
    compliance.set_status(agent, Status::Valid, [0u8; 32]);
    let reputation = ReputationRegistry::deploy(&env, ReputationRegistryInitArgs { authority: env.get_account(0) });

    let mut vault = RwaVault::deploy(
        &env,
        RwaVaultInitArgs {
            agent,
            spend_gate: spend_gate.contract_address(),
            compliance: compliance.contract_address(),
            principal: U512::from(2000u64),
            reputation: reputation.contract_address(),
            min_reputation: 0,
            custodian: env.get_account(0),
        },
    );
    vault.deposit(AssetId::Gold, U256::from(1000));

    env.set_caller(agent);
    let err = vault
        .try_reallocate(AssetId::Gold, AssetId::TBond, U256::from(100), [0u8; 32])
        .unwrap_err();
    assert_eq!(err, Error::TouchesPrincipal.into());
}

// --- v4 circuit breakers ----------------------------------------------------

/// A full vault wired with a reputation floor of `min_rep`; the agent (account 1) is
/// allowlisted + KYC-Valid and holds 1000 Gold. Returns (vault, reputation, env).
fn setup_v4(min_rep: i64) -> (RwaVaultHostRef, amanah_contracts::reputation_registry::ReputationRegistryHostRef, odra::host::HostEnv) {
    let env = odra_test::env();
    let agent = env.get_account(1);
    let custodian = env.get_account(0);

    let mut spend_gate = SpendGate::deploy(&env, SpendGateInitArgs {
        max_per_tx: U512::from(1_000_000u64), daily_limit: U512::from(1_000_000u64), expiry: 0,
    });
    spend_gate.add_allowlist(agent);
    let mut compliance = ComplianceRegistry::deploy(&env, NoArgs);
    compliance.set_status(agent, Status::Valid, [0u8; 32]);
    let reputation = ReputationRegistry::deploy(&env, ReputationRegistryInitArgs { authority: custodian });

    let mut vault = RwaVault::deploy(&env, RwaVaultInitArgs {
        agent, spend_gate: spend_gate.contract_address(), compliance: compliance.contract_address(),
        principal: U512::zero(), reputation: reputation.contract_address(), min_reputation: min_rep, custodian,
    });
    vault.deposit(AssetId::Gold, U256::from(1000));
    (vault, reputation, env)
}

#[test]
fn reallocate_blocked_when_reputation_below_floor() {
    // Floor = 1, but the agent's score is 0 (default) -> auto-benched.
    let (mut vault, mut reputation, env) = setup_v4(1);
    let agent = env.get_account(1);
    env.set_caller(agent);
    let err = vault.try_reallocate(AssetId::Gold, AssetId::TBond, U256::from(100), [0u8; 32]).unwrap_err();
    assert_eq!(err, Error::BelowReputationFloor.into());

    // Credit the agent to reach the floor -> trading resumes.
    reputation.record_payment(agent, [3u8; 32]); // score 0 -> 1
    vault.reallocate(AssetId::Gold, AssetId::TBond, U256::from(100), [0u8; 32]);
    assert_eq!(vault.get_allocation(AssetId::TBond), U256::from(100));
}

#[test]
fn dead_mans_switch_freezes_a_silent_agent_and_blocks_trading() {
    let (mut vault, _rep, env) = setup_v4(0);
    let agent = env.get_account(1);
    let outsider = env.get_account(2);

    // Not stale yet -> cannot freeze.
    env.set_caller(outsider);
    let err = vault.try_freeze_if_stale(1_000).unwrap_err();
    assert_eq!(err, Error::NotStale.into());

    // Agent goes silent past the window -> ANYONE can trip the switch.
    env.advance_block_time(2_000);
    vault.freeze_if_stale(1_000);
    assert!(vault.is_frozen());

    // Frozen vault blocks the agent's moves.
    env.set_caller(agent);
    let err = vault.try_reallocate(AssetId::Gold, AssetId::TBond, U256::from(100), [0u8; 32]).unwrap_err();
    assert_eq!(err, Error::Frozen.into());

    // Only the custodian can lift the freeze; then trading resumes.
    env.set_caller(agent);
    assert_eq!(vault.try_unfreeze().unwrap_err(), Error::NotAuthorized.into());
    env.set_caller(env.get_account(0));
    vault.unfreeze();
    assert!(!vault.is_frozen());
    env.set_caller(agent);
    vault.reallocate(AssetId::Gold, AssetId::TBond, U256::from(100), [0u8; 32]);
    assert_eq!(vault.get_allocation(AssetId::TBond), U256::from(100));
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
fn payment_token_mints_to_deployer_and_transfers() {
    // The x402 asset: CEP-18 balances + CEP-3009 transfer_with_authorization.
    // EIP-712 authorized transfers are covered by odra-modules' own CEP3009 tests;
    // here we verify our wrapper wires init/balances/transfer correctly.
    let env = odra_test::env();
    let deployer = env.get_account(0);
    let bob = env.get_account(1);

    let mut token = PaymentToken::deploy(
        &env,
        PaymentTokenInitArgs {
            chain_name: "casper:casper-test".to_string(),
            symbol: "AMANAH".to_string(),
            name: "Amanah Test USD".to_string(),
            decimals: 6,
            initial_supply: U256::from(1_000_000u64),
        },
    );

    assert_eq!(token.balance_of(&deployer), U256::from(1_000_000u64));
    assert_eq!(token.symbol(), "AMANAH".to_string());
    assert_eq!(token.name(), "Amanah Test USD".to_string());
    assert_eq!(token.decimals(), 6u8);

    token.transfer(&bob, &U256::from(250u64));
    assert_eq!(token.balance_of(&bob), U256::from(250u64));
    assert_eq!(token.balance_of(&deployer), U256::from(999_750u64));
}

#[test]
fn record_payment_rejects_replay() {
    let env = odra_test::env();
    let payer = env.get_account(1);
    let custodian = env.get_account(0);
    let mut rep = ReputationRegistry::deploy(&env, ReputationRegistryInitArgs { authority: custodian });

    let deploy_hash = [1u8; 32];
    env.set_caller(payer); // the payer submits its own proof
    rep.record_payment(payer, deploy_hash);
    assert_eq!(rep.score_of(payer), 1);

    let err = rep.try_record_payment(payer, deploy_hash).unwrap_err();
    assert_eq!(err, Error::ReplayedProof.into());
    // Score unchanged after the rejected replay.
    assert_eq!(rep.score_of(payer), 1);
}

#[test]
fn record_payment_rejects_crediting_someone_else() {
    let env = odra_test::env();
    let payer = env.get_account(1);
    let attacker = env.get_account(2);
    let custodian = env.get_account(0);
    let mut rep = ReputationRegistry::deploy(&env, ReputationRegistryInitArgs { authority: custodian });

    // The attacker tries to credit the payer (or themselves) for a payment they
    // didn't make — the caller-must-be-payer guard rejects it.
    env.set_caller(attacker);
    let err = rep.try_record_payment(payer, [7u8; 32]).unwrap_err();
    assert_eq!(err, Error::NotAuthorized.into());
    assert_eq!(rep.score_of(payer), 0);
}

#[test]
fn adjust_is_gated_to_the_authority() {
    let env = odra_test::env();
    let custodian = env.get_account(0);
    let agent = env.get_account(1);
    let griefer = env.get_account(2);
    let mut rep = ReputationRegistry::deploy(&env, ReputationRegistryInitArgs { authority: custodian });

    // A griefer cannot touch anyone's score.
    env.set_caller(griefer);
    let err = rep.try_adjust(agent, -5, [9u8; 32]).unwrap_err();
    assert_eq!(err, Error::NotAuthorized.into());
    assert_eq!(rep.score_of(agent), 0);

    // The custodian (auditor) can slash and reward.
    env.set_caller(custodian);
    rep.adjust(agent, 3, [1u8; 32]);
    assert_eq!(rep.score_of(agent), 3);
    rep.adjust(agent, -1, [2u8; 32]); // a VETO slash
    assert_eq!(rep.score_of(agent), 2);
}

fn hx32(s: &str) -> [u8; 32] {
    let mut o = [0u8; 32];
    for i in 0..32 {
        o[i] = u8::from_str_radix(&s[i * 2..i * 2 + 2], 16).unwrap();
    }
    o
}

#[test]
fn zk_kyc_proof_verifies_and_rejects_tamper() {
    // Golden vector produced by the TS prover (agent/src/zk.ts). This test passing
    // proves the TS(noble) prover and Rust(dalek) on-chain verifier agree byte-for-byte.
    let env = odra_test::env();
    let issuer = env.get_account(0);
    let agent = env.get_account(1);
    let mut zk = ZkKycVerifier::deploy(&env, ZkKycVerifierInitArgs { authority: issuer });

    let y = hx32("dcb4190c3ba4c1b345296bf28bfaab9b6bc27efeac366f83e7829a7cdc10f960");
    let t = hx32("8c1ed8e1d1641f0da24f41ca8b242abe9218ef5fea9fd05943f743a472668c55");
    let s = hx32("1732fc7096eee473bcd35feb944886a0b8626368d76251f32c684298ffff0107");
    let ctx = Bytes::from(
        hx32("9d1a3c5e7f0b2d4a6c8e0f1a3b5d7f9012345678abcdef00fedcba9876543210").to_vec(),
    );

    env.set_caller(issuer);
    zk.register_credential(agent, y);
    assert!(!zk.is_zk_verified(agent));

    // Valid proof -> verified. The secret x was NEVER transmitted (zero-knowledge).
    zk.prove_kyc(agent, t, s, ctx.clone());
    assert!(zk.is_zk_verified(agent));

    // Tampered response scalar -> the Schnorr equation fails -> reject.
    let mut s_bad = s;
    s_bad[0] ^= 1;
    zk.register_credential(agent, y); // reset the flag for a clean negative check
    let err = zk.try_prove_kyc(agent, t, s_bad, ctx).unwrap_err();
    assert_eq!(err, Error::InvalidAttestation.into());
    assert!(!zk.is_zk_verified(agent));
}

#[test]
fn zk_kyc_register_is_gated_to_issuer() {
    let env = odra_test::env();
    let issuer = env.get_account(0);
    let attacker = env.get_account(2);
    let agent = env.get_account(1);
    let mut zk = ZkKycVerifier::deploy(&env, ZkKycVerifierInitArgs { authority: issuer });

    env.set_caller(attacker);
    let err = zk
        .try_register_credential(agent, [7u8; 32])
        .unwrap_err();
    assert_eq!(err, Error::NotAuthorized.into());
}

#[test]
fn compliance_set_status_is_gated_to_owner() {
    let env = odra_test::env();
    let owner = env.get_account(0);
    let attacker = env.get_account(2);
    let agent = env.get_account(1);
    let mut c = ComplianceRegistry::deploy(&env, NoArgs); // owner = deployer (account 0)

    // A non-owner cannot mark anyone Valid (KYC bypass) or Revoked (grief).
    env.set_caller(attacker);
    let err = c.try_set_status(agent, Status::Valid, [0u8; 32]).unwrap_err();
    assert_eq!(err, Error::NotAuthorized.into());
    let err2 = c.try_revoke(agent, 0).unwrap_err();
    assert_eq!(err2, Error::NotAuthorized.into());

    // The owner (registrar/custodian) can.
    env.set_caller(owner);
    c.set_status(agent, Status::Valid, [0u8; 32]);
    assert!(matches!(c.status_of(agent), Status::Valid));
}

#[test]
fn auditor_quorum_requires_k_of_n_signed_votes() {
    let env = odra_test::env();
    let a0 = env.get_account(0);
    let a1 = env.get_account(1);
    let a2 = env.get_account(2);
    let outsider = env.get_account(3);
    let (pk0, pk1, pk2, pko) = (env.public_key(&a0), env.public_key(&a1), env.public_key(&a2), env.public_key(&outsider));

    let mut q = AuditorQuorum::deploy(
        &env,
        AuditorQuorumInitArgs { auditors: vec![pk0.clone(), pk1.clone(), pk2.clone()], threshold: 2 },
    );

    let hash = [5u8; 32];
    let msg = Bytes::from(hash.as_slice());
    let (s0, s1, s2, so) = (env.sign_message(&msg, &a0), env.sign_message(&msg, &a1), env.sign_message(&msg, &a2), env.sign_message(&msg, &outsider));

    // One approval — not a quorum yet.
    q.vote(hash, true, s0.clone(), pk0.clone());
    assert_eq!(q.approvals_for(hash), 1);
    assert!(!q.approved(hash));

    // A second DISTINCT auditor approves — quorum (2-of-3) passes.
    q.vote(hash, true, s1, pk1);
    assert!(q.approved(hash));

    // Same auditor can't vote twice.
    assert_eq!(q.try_vote(hash, true, s0, pk0).unwrap_err(), Error::ReplayedProof.into());

    // A non-authorized key can't vote.
    assert_eq!(q.try_vote(hash, true, so, pko).unwrap_err(), Error::UnknownSigner.into());

    // A signature over a DIFFERENT hash doesn't verify (s2 signs `hash`, not `other`).
    let other = [6u8; 32];
    assert_eq!(q.try_vote(other, true, s2, pk2).unwrap_err(), Error::InvalidAttestation.into());
}

#[test]
fn zk_reserves_hides_split_and_proves_the_sum() {
    // Golden vector from the TS prover (agent/src/zk-reserves.ts): 4 hidden allocations
    // (250k/400k/150k/200k) whose Pedersen commitments prove they sum to $1M — the
    // individual splits never appear. TS(noble) ≡ Rust(dalek) for Pedersen + Schnorr.
    let env = odra_test::env();
    let mut zk = ZkReserves::deploy(&env, NoArgs);

    let commitments = vec![
        hx32("f128d7c372acc38dd1843869bc44c78df0dad576e8c447e777ac019d6103bbc9"),
        hx32("cdf43d9d4659ad667d5faa5576a68981634064f8443b7e6b2836cd2673801a7e"),
        hx32("913b855648cf17f27cca8e246fcda1e3979ced6890e0783f0f90f547201c61fc"),
        hx32("ab44c99775ed99d5d9414aff75496967cc324fc8dca952d19dc0010afb902237"),
    ];
    let total: u64 = 1_000_000_000_000;
    let proof_t = hx32("9585b650eb4ec57858c21c188021b5d98b7a1cf066fa81cb4cb22bfbc37f70b2");
    let s = hx32("c18ef792d5f2c1a6e6c2bc30bf4ece1b8328413646a2a0f8640178b097ab6a08");

    // Valid proof, total >= floor -> solvency recorded (split stays hidden).
    zk.prove_reserves(commitments.clone(), total, proof_t, s, 800_000_000_000);
    assert!(zk.is_solvent());
    assert_eq!(zk.last_total(), total);

    // Claiming a different total breaks the Schnorr equation.
    let err = zk.try_prove_reserves(commitments.clone(), total + 1, proof_t, s, 800_000_000_000).unwrap_err();
    assert_eq!(err, Error::InvalidAttestation.into());

    // A valid proof but under the required backing -> insolvent.
    let err2 = zk.try_prove_reserves(commitments, total, proof_t, s, 2_000_000_000_000).unwrap_err();
    assert_eq!(err2, Error::NotCompliant.into());
}
