// The ZK KYC prover is a crypto/security path — a broken proof that still "verifies"
// would be a compliance bypass. These pin soundness + the TS↔Rust golden vector.
import { test } from "node:test";
import assert from "node:assert/strict";
import { credential, prove, verify, hexToBytes } from "../zk.js";

const x = "a1".padEnd(64, "0");
const ctx = hexToBytes("9d1a3c5e7f0b2d4a6c8e0f1a3b5d7f9012345678abcdef00fedcba9876543210");

test("a valid proof verifies (completeness)", () => {
  const Y = credential(x);
  assert.equal(verify(Y, prove(x, ctx), ctx), true);
});

test("GOLDEN VECTOR matches the on-chain Rust verifier (contracts test)", () => {
  // Same fixed x, r, ctx as agent/src/zk.ts self-check and the OdraVM test
  // zk_kyc_proof_verifies_and_rejects_tamper — locks TS(noble) ≡ Rust(dalek).
  const Y = credential(x);
  const proof = prove(x, ctx, "b2".padEnd(64, "0"));
  assert.equal(Y, "dcb4190c3ba4c1b345296bf28bfaab9b6bc27efeac366f83e7829a7cdc10f960");
  assert.equal(proof.T, "8c1ed8e1d1641f0da24f41ca8b242abe9218ef5fea9fd05943f743a472668c55");
  assert.equal(proof.s, "1732fc7096eee473bcd35feb944886a0b8626368d76251f32c684298ffff0107");
});

test("a tampered response scalar fails (soundness)", () => {
  const Y = credential(x);
  const p = prove(x, ctx);
  assert.equal(verify(Y, { T: p.T, s: p.s.replace(/^../, "00") }, ctx), false);
});

test("a proof for a DIFFERENT context does not verify (replay binding)", () => {
  const Y = credential(x);
  const p = prove(x, ctx);
  const otherCtx = hexToBytes("00".repeat(32));
  assert.equal(verify(Y, p, otherCtx), false);
});

test("a proof against the WRONG credential fails", () => {
  const p = prove(x, ctx);
  const wrongY = credential("b7".padEnd(64, "0"));
  assert.equal(verify(wrongY, p, ctx), false);
});
