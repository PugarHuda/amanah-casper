//! Cross-contract integration tests on the OdraVM host environment.
use amanah_contracts::attestation_log::{AttestationLog, AttestationLogInitArgs};
use amanah_contracts::auditor_quorum::{AuditorQuorum, AuditorQuorumHostRef, AuditorQuorumInitArgs};
use amanah_contracts::common::{AssetId, Error, Status};
use amanah_contracts::compliance_registry::ComplianceRegistry;
use amanah_contracts::payment_token::{PaymentToken, PaymentTokenInitArgs};
use amanah_contracts::reputation_registry::{ReputationRegistry, ReputationRegistryInitArgs};
use amanah_contracts::rwa_vault::{RwaVault, RwaVaultHostRef, RwaVaultInitArgs};
use amanah_contracts::spend_gate::{SpendGate, SpendGateInitArgs};
use amanah_contracts::zk_kyc::{ZkKycVerifier, ZkKycVerifierInitArgs};
use amanah_contracts::zk_reserves::{ZkReserves, ZkReservesInitArgs};
use odra::casper_types::{bytesrepr::Bytes, U256, U512};
use odra::host::{Deployer, HostRef, NoArgs};

/// Deploy an AuditorQuorum (1-of-1, account 0) that has already APPROVED each hash.
/// The vault now REQUIRES quorum approval for every reallocate, so tests that expect a
/// move to reach the gates must pre-approve the attestation hash they use.
fn quorum_approving(env: &odra::host::HostEnv, hashes: &[[u8; 32]]) -> AuditorQuorumHostRef {
    let a0 = env.get_account(0);
    let pk0 = env.public_key(&a0);
    let mut q = AuditorQuorum::deploy(
        env,
        AuditorQuorumInitArgs { auditors: vec![pk0.clone()], threshold: 1, instance_id: [7u8; 32], slasher: a0, min_stake: U512::zero() },
    );
    for h in hashes {
        let mut m = Vec::new();
        m.extend_from_slice(b"amanah-auditor-quorum-v1");
        m.extend_from_slice(&[7u8; 32]); // instance_id
        m.extend_from_slice(h);
        m.push(1u8); // approve = true
        let sig = env.sign_message(&Bytes::from(m), &a0);
        q.vote(*h, true, sig, pk0.clone());
    }
    q
}

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
            quorum: quorum_approving(&env, &[[0u8; 32], [9u8; 32]]).contract_address(),
        },
    );
    vault.deposit(AssetId::Gold, U256::from(1000));
    spend_gate.set_spender(vault.contract_address()); // only the vault may call check()

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
            quorum: quorum_approving(&env, &[[0u8; 32]]).contract_address(),
        },
    );
    vault.deposit(AssetId::Gold, U256::from(1000));
    spend_gate.set_spender(vault.contract_address()); // only the vault may call check()

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
        quorum: quorum_approving(&env, &[[0u8; 32]]).contract_address(),
    });
    vault.deposit(AssetId::Gold, U256::from(1000));
    spend_gate.set_spender(vault.contract_address()); // only the vault may call check()
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

    // The agent CANNOT mint its own reputation to escape the breaker (authority-only).
    assert_eq!(
        reputation.try_record_payment(agent, [3u8; 32]).unwrap_err(),
        Error::NotAuthorized.into()
    );

    // The custodian (registry authority) credits a verified payment -> trading resumes.
    env.set_caller(env.get_account(0));
    reputation.record_payment(agent, [3u8; 32]); // score 0 -> 1
    env.set_caller(agent);
    vault.reallocate(AssetId::Gold, AssetId::TBond, U256::from(100), [0u8; 32]);
    assert_eq!(vault.get_allocation(AssetId::TBond), U256::from(100));
}

#[test]
fn reallocate_reverts_when_the_auditor_quorum_has_not_approved() {
    // THE separation-of-duties guarantee, enforced by the contract itself: the vault
    // only accepts a decision the K-of-N auditor quorum signed off on-chain. Even the
    // agent's own key can't move funds on an unapproved decision.
    let (mut vault, _rep, env) = setup_v4(0);
    let agent = env.get_account(1);
    env.set_caller(agent);

    // [0u8;32] was pre-approved by setup_v4 -> this move is allowed.
    vault.reallocate(AssetId::Gold, AssetId::TBond, U256::from(100), [0u8; 32]);
    assert_eq!(vault.get_allocation(AssetId::TBond), U256::from(100));

    // A DIFFERENT decision hash the quorum never voted on -> refused on-chain.
    let err = vault
        .try_reallocate(AssetId::Gold, AssetId::TBond, U256::from(100), [42u8; 32])
        .unwrap_err();
    assert_eq!(err, Error::NotApproved.into());
    // Allocation unchanged — nothing moved.
    assert_eq!(vault.get_allocation(AssetId::TBond), U256::from(100));
}

#[test]
fn dead_mans_switch_freezes_a_silent_agent_and_blocks_trading() {
    let (mut vault, _rep, env) = setup_v4(0);
    let agent = env.get_account(1);
    let outsider = env.get_account(2);

    const SIX_H: u64 = 21_600_000; // MIN_STALE_MS

    // A griefer can't pass a tiny window to freeze an active agent (floor enforced).
    env.set_caller(outsider);
    assert_eq!(vault.try_freeze_if_stale(1_000).unwrap_err(), Error::NotStale.into());
    // Not stale yet at the 6h window either -> cannot freeze.
    assert_eq!(vault.try_freeze_if_stale(SIX_H).unwrap_err(), Error::NotStale.into());

    // Agent goes silent past the window -> ANYONE can trip the switch.
    env.advance_block_time(SIX_H + 1);
    vault.freeze_if_stale(SIX_H);
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
    // The payer can no longer credit itself — crediting is authority-only, so an agent
    // can't farm reputation to escape the vault's circuit breaker.
    env.set_caller(payer);
    assert_eq!(
        rep.try_record_payment(payer, deploy_hash).unwrap_err(),
        Error::NotAuthorized.into()
    );

    env.set_caller(custodian); // the authority credits a verified settlement
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
        AuditorQuorumInitArgs { auditors: vec![pk0.clone(), pk1.clone(), pk2.clone()], threshold: 2, instance_id: [9u8; 32], slasher: env.get_account(0), min_stake: U512::zero() },
    );

    let hash = [5u8; 32];
    // Auditors sign DOMAIN ‖ hash ‖ approve_byte (approve = 1 here).
    let approve_msg = |h: &[u8; 32]| -> Bytes {
        let mut m = Vec::new();
        m.extend_from_slice(b"amanah-auditor-quorum-v1");
        m.extend_from_slice(&[9u8; 32]); // instance_id — binds the signature to THIS deployment
        m.extend_from_slice(h);
        m.push(1u8);
        Bytes::from(m)
    };
    let msg = approve_msg(&hash);
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

    // FORGE FIX: a signature over approve=1 can't be replayed as a REJECT — flipping
    // `approve` rebuilds a different signed message, so it fails to verify.
    assert_eq!(q.try_vote(hash, false, s2.clone(), pk2.clone()).unwrap_err(), Error::InvalidAttestation.into());

    // A signature over a DIFFERENT hash doesn't verify (s2 signs `hash`, not `other`).
    let other = [6u8; 32];
    assert_eq!(q.try_vote(other, true, s2, pk2).unwrap_err(), Error::InvalidAttestation.into());
}

#[test]
fn caller_authenticated_voting_from_the_open_registry() {
    // The browser path: an auditor votes by SIGNING THE DEPLOY (caller auth), not a
    // detached message signature — which is all a wallet can actually produce. Votes here
    // count toward the SAME threshold as the signed votes.
    let env = odra_test::env();
    let pk0 = env.public_key(&env.get_account(0));
    let mut q = AuditorQuorum::deploy(
        &env,
        AuditorQuorumInitArgs { auditors: vec![pk0], threshold: 2, instance_id: [3u8; 32], slasher: env.get_account(0), min_stake: U512::zero() },
    );
    let hash = [4u8; 32];
    let a1 = env.get_account(1);
    let a2 = env.get_account(2);

    // An unregistered account can't vote this way.
    env.set_caller(a1);
    assert_eq!(q.try_vote_as_caller(hash, true).unwrap_err(), Error::UnknownSigner.into());

    // Anyone may join the open registry, then vote. One approval — not yet quorum (2).
    env.set_caller(a1);
    assert!(!q.is_registered(a1));
    q.open_register();
    assert!(q.is_registered(a1));
    q.vote_as_caller(hash, true);
    assert_eq!(q.approvals_for(hash), 1);
    assert!(!q.approved(hash));

    // Same account can't double-vote the same decision.
    assert_eq!(q.try_vote_as_caller(hash, true).unwrap_err(), Error::ReplayedProof.into());

    // A second independent auditor pushes it over the threshold.
    env.set_caller(a2);
    q.open_register();
    q.vote_as_caller(hash, true);
    assert_eq!(q.approvals_for(hash), 2);
    assert!(q.approved(hash), "two independent caller-auth votes reach the 2-of-N quorum");

    // A REJECT doesn't add to the tally (and isn't a double-vote for a fresh hash).
    let hash2 = [5u8; 32];
    env.set_caller(a1);
    q.vote_as_caller(hash2, false);
    assert_eq!(q.approvals_for(hash2), 0);
}

#[test]
fn staking_registers_and_slashing_burns_the_bond() {
    // Real economic skin-in-the-game: an auditor stakes native CSPR to register, and a
    // caught bad-faith auditor loses it. The slasher is the custodian (account 0).
    let env = odra_test::env();
    let custodian = env.get_account(0);
    let pk0 = env.public_key(&custodian);
    let mut q = AuditorQuorum::deploy(
        &env,
        AuditorQuorumInitArgs {
            auditors: vec![pk0],
            threshold: 1,
            instance_id: [2u8; 32],
            slasher: custodian,
            min_stake: U512::from(100u64),
        },
    );
    let staker = env.get_account(1);

    // Attaching less than min_stake is rejected.
    env.set_caller(staker);
    assert_eq!(
        q.with_tokens(U512::from(50u64)).try_register_with_stake().unwrap_err(),
        Error::InsufficientStake.into()
    );

    // Stake enough -> registered, stake recorded, and the contract holds the bond.
    q.with_tokens(U512::from(500u64)).register_with_stake();
    assert!(q.is_registered(staker));
    assert_eq!(q.stake_of(staker), U512::from(500u64));

    // A staked auditor can vote via the caller-auth path.
    let hash = [7u8; 32];
    q.vote_as_caller(hash, true);
    assert!(q.approved(hash));

    // Only the slasher may slash.
    env.set_caller(staker);
    assert_eq!(q.try_slash(staker).unwrap_err(), Error::NotAuthorized.into());

    // Custodian slashes: bond burned to zero, auditor removed from the registry.
    env.set_caller(custodian);
    q.slash(staker);
    assert_eq!(q.stake_of(staker), U512::zero());
    assert!(!q.is_registered(staker));

    // A slashed auditor can no longer vote, and has nothing left to withdraw.
    env.set_caller(staker);
    assert_eq!(q.try_vote_as_caller([8u8; 32], true).unwrap_err(), Error::UnknownSigner.into());
    assert_eq!(q.try_withdraw_stake().unwrap_err(), Error::InsufficientStake.into());
}

#[test]
fn a_staker_can_withdraw_an_unslashed_bond() {
    let env = odra_test::env();
    let custodian = env.get_account(0);
    let pk0 = env.public_key(&custodian);
    let mut q = AuditorQuorum::deploy(
        &env,
        AuditorQuorumInitArgs {
            auditors: vec![pk0], threshold: 1, instance_id: [4u8; 32],
            slasher: custodian, min_stake: U512::from(100u64),
        },
    );
    let staker = env.get_account(2);
    env.set_caller(staker);
    q.with_tokens(U512::from(300u64)).register_with_stake();
    assert!(q.is_registered(staker));
    q.withdraw_stake();
    assert_eq!(q.stake_of(staker), U512::zero());
    assert!(!q.is_registered(staker), "withdrawing leaves the registry");
}

#[test]
fn zk_reserves_hides_split_and_proves_the_sum() {
    // Golden vector from the TS prover (agent/src/zk-reserves.ts): 4 hidden allocations
    // (250k/400k/150k/200k) whose Pedersen commitments prove they sum to $1M — the
    // individual splits never appear. TS(noble) ≡ Rust(dalek) for Pedersen + Schnorr.
    let (mut vault, _rep, env) = setup_v4(0);
    // The golden vector's hidden allocations ARE the vault's real ones — the proof is
    // anchored to on-chain state, not to numbers the prover made up.
    vault.deposit(AssetId::Gold, U256::from(250_000_000_000u64 - 1000)); // setup_v4 seeded 1000
    vault.deposit(AssetId::TBond, U256::from(400_000_000_000u64));
    vault.deposit(AssetId::WTI, U256::from(150_000_000_000u64));
    vault.deposit(AssetId::CSPR, U256::from(200_000_000_000u64));
    let mut zk = ZkReserves::deploy(&env, ZkReservesInitArgs { vault: vault.contract_address() });

    let commitments = vec![
        hx32("f128d7c372acc38dd1843869bc44c78df0dad576e8c447e777ac019d6103bbc9"),
        hx32("cdf43d9d4659ad667d5faa5576a68981634064f8443b7e6b2836cd2673801a7e"),
        hx32("913b855648cf17f27cca8e246fcda1e3979ced6890e0783f0f90f547201c61fc"),
        hx32("ab44c99775ed99d5d9414aff75496967cc324fc8dca952d19dc0010afb902237"),
    ];
    let total: u64 = 1_000_000_000_000;
    let proof_t = hx32("9585b650eb4ec57858c21c188021b5d98b7a1cf066fa81cb4cb22bfbc37f70b2");
    let s = hx32("c18ef792d5f2c1a6e6c2bc30bf4ece1b8328413646a2a0f8640178b097ab6a08");

    // Valid proof, total >= floor, total == the vault's real allocations -> recorded.
    zk.prove_reserves(commitments.clone(), total, proof_t, s, 800_000_000_000);
    assert!(zk.is_solvent());
    assert_eq!(zk.last_total(), total);

    // Claiming a different total is now caught by the state binding BEFORE the crypto
    // even runs — it no longer matches what the vault actually holds.
    let err = zk.try_prove_reserves(commitments.clone(), total + 1, proof_t, s, 800_000_000_000).unwrap_err();
    assert_eq!(err, Error::TotalMismatch.into());

    // Soundness of the proof itself, tested where the binding can't mask it: right
    // total, tampered signature scalar -> the Schnorr equation fails.
    let mut bad_s = s;
    bad_s[0] ^= 1;
    let err_sig = zk.try_prove_reserves(commitments.clone(), total, proof_t, bad_s, 800_000_000_000).unwrap_err();
    assert_eq!(err_sig, Error::InvalidAttestation.into());

    // A valid proof but under the required backing -> insolvent.
    let err2 = zk.try_prove_reserves(commitments.clone(), total, proof_t, s, 2_000_000_000_000).unwrap_err();
    assert_eq!(err2, Error::NotCompliant.into());

    // BINDING: move real money out of the vault, and the same cryptographically valid
    // proof stops being accepted — it now describes numbers that are not this treasury's.
    env.set_caller(env.get_account(1));
    vault.reallocate(AssetId::Gold, AssetId::TBond, U256::from(1), [0u8; 32]); // total unchanged
    assert!(zk.try_prove_reserves(commitments.clone(), total, proof_t, s, 800_000_000_000).is_ok(),
        "a pure transfer keeps the total, so the proof still binds");
    env.set_caller(env.get_account(0));
    vault.deposit(AssetId::Gold, U256::from(1)); // total now != claimed total
    let err3 = zk.try_prove_reserves(commitments, total, proof_t, s, 800_000_000_000).unwrap_err();
    assert_eq!(err3, Error::TotalMismatch.into());
}

#[test]
fn reallocating_an_asset_to_itself_is_rejected_and_cannot_mint() {
    // Regression: with from == to, the credit writes the same key as the debit and
    // overwrites it, leaving `bal + amount` — value created from nothing. The principal
    // invariant can't catch it because that check only fails when the total is too LOW.
    let (mut vault, _rep, env) = setup_v4(0);
    let agent = env.get_account(1);
    env.set_caller(agent);

    let before = vault.get_allocation(AssetId::Gold);
    let err = vault
        .try_reallocate(AssetId::Gold, AssetId::Gold, U256::from(100), [0u8; 32])
        .unwrap_err();
    assert_eq!(err, Error::SameAsset.into());
    assert_eq!(vault.get_allocation(AssetId::Gold), before, "balance must be untouched");
}

#[test]
fn a_reallocation_conserves_the_total() {
    // The whole "principal locked, yield only" story rests on reallocation being a pure
    // transfer. Pin it: the sum across every asset is identical before and after.
    let (mut vault, _rep, env) = setup_v4(0);
    let agent = env.get_account(1);
    env.set_caller(agent);

    let total = |v: &RwaVaultHostRef| {
        v.get_allocation(AssetId::Gold)
            + v.get_allocation(AssetId::TBond)
            + v.get_allocation(AssetId::WTI)
            + v.get_allocation(AssetId::CSPR)
    };
    let before = total(&vault);
    vault.reallocate(AssetId::Gold, AssetId::TBond, U256::from(250), [0u8; 32]);
    assert_eq!(total(&vault), before, "reallocation must conserve the total");

    // And a zero-amount move is a harmless no-op that still conserves it.
    vault.reallocate(AssetId::Gold, AssetId::WTI, U256::zero(), [0u8; 32]);
    assert_eq!(total(&vault), before, "zero-amount move must not change the total");
}

#[test]
fn a_vote_signed_for_another_quorum_deployment_is_rejected() {
    // Cross-deployment replay: without an instance binding, a signature farmed on a decoy
    // quorum (same auditors, same domain tag) would be valid on the real one. Bind it.
    let env = odra_test::env();
    let a0 = env.get_account(0);
    let pk0 = env.public_key(&a0);
    let hash = [3u8; 32];

    let sign_for = |instance: [u8; 32]| {
        let mut m = Vec::new();
        m.extend_from_slice(b"amanah-auditor-quorum-v1");
        m.extend_from_slice(&instance);
        m.extend_from_slice(&hash);
        m.push(1u8);
        env.sign_message(&Bytes::from(m), &a0)
    };

    let real = [1u8; 32];
    let decoy = [2u8; 32];
    let mut q = AuditorQuorum::deploy(
        &env,
        AuditorQuorumInitArgs { auditors: vec![pk0.clone()], threshold: 1, instance_id: real, slasher: env.get_account(0), min_stake: U512::zero() },
    );

    // A signature produced for the DECOY deployment must not work here.
    assert_eq!(
        q.try_vote(hash, true, sign_for(decoy), pk0.clone()).unwrap_err(),
        Error::InvalidAttestation.into(),
        "a vote signed for another deployment must be refused",
    );
    assert!(!q.approved(hash), "the decoy signature must not have counted");

    // The correctly-bound signature still works.
    q.vote(hash, true, sign_for(real), pk0.clone());
    assert!(q.approved(hash));
    assert_eq!(q.instance_id(), real, "instance id must be published for signers");
}

#[test]
fn policy_engine_is_owner_gated_and_readable() {
    use amanah_contracts::policy_engine::{PolicyEngine, PolicyEngineInitArgs};
    let env = odra_test::env();
    let owner = env.get_account(0);
    let mut pe = PolicyEngine::deploy(&env, PolicyEngineInitArgs {
        owner, confidence_threshold_bps: 7000, max_rebalance_bps: 800, min_reputation: 1, policy_version: [9u8; 32],
    });
    // Getters return the seeded policy.
    assert_eq!(pe.confidence_threshold_bps(), 7000);
    assert_eq!(pe.max_rebalance_bps(), 800);
    assert_eq!(pe.min_reputation(), 1);
    assert_eq!(pe.policy_version(), [9u8; 32]);

    // A non-owner cannot change the policy.
    env.set_caller(env.get_account(1));
    assert_eq!(pe.try_set_confidence_threshold_bps(5000).unwrap_err(), Error::NotAuthorized.into());

    // The owner (governance) can — and the change is visible.
    env.set_caller(owner);
    pe.set_confidence_threshold_bps(7500);
    pe.set_policy_version([1u8; 32]);
    assert_eq!(pe.confidence_threshold_bps(), 7500);
    assert_eq!(pe.policy_version(), [1u8; 32]);
}
