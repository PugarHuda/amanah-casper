// Adversarial tests for the browser-side proof-of-reserves verifier. This code backs the
// public "verify it yourself" claim — anything it accepts that it shouldn't is a hole in
// the central promise of the project, so tamper with every part of the proof.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { verifyReserves } from "./zk-verify.js";

const proof = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../public/proofs/reserves.json"), "utf8"),
) as {
  commitments: string[]; total: string; proofT: string; s: string; principalFloor: string;
};

const flipFirstByte = (hex: string) => {
  const b = Buffer.from(hex, "hex");
  b[0] ^= 1;
  return b.toString("hex");
};

test("the published proof verifies (same bytes the contract accepted)", () => {
  assert.equal(verifyReserves(proof).ok, true);
});

test("claiming a different total is rejected", () => {
  assert.equal(verifyReserves({ ...proof, total: (BigInt(proof.total) + 1n).toString() }).ok, false);
  assert.equal(verifyReserves({ ...proof, total: (BigInt(proof.total) - 1n).toString() }).ok, false);
});

test("tampering with any proof component is rejected", () => {
  assert.equal(verifyReserves({ ...proof, proofT: flipFirstByte(proof.proofT) }).ok, false, "proofT");
  assert.equal(verifyReserves({ ...proof, s: flipFirstByte(proof.s) }).ok, false, "s");
  assert.equal(
    verifyReserves({ ...proof, commitments: proof.commitments.map((c, i) => (i === 0 ? flipFirstByte(c) : c)) }).ok,
    false, "commitment",
  );
});

test("dropping a commitment is rejected (the sum no longer matches)", () => {
  assert.equal(verifyReserves({ ...proof, commitments: proof.commitments.slice(1) }).ok, false);
});

test("reordering commitments still verifies — it is a proof about the SUM", () => {
  assert.equal(verifyReserves({ ...proof, commitments: [...proof.commitments].reverse() }).ok, true);
});

test("garbage input is rejected without throwing", () => {
  const r = verifyReserves({ commitments: ["zz".repeat(32)], total: "1", proofT: "00".repeat(32), s: "00".repeat(32) });
  assert.equal(r.ok, false);
});

test("an empty commitment set cannot pass as a proof", () => {
  // Σ of nothing is zero, so a verifier that only checked the equation could be fooled
  // into 'proving' an empty treasury. It must not verify.
  assert.equal(verifyReserves({ commitments: [], total: "0", proofT: proof.proofT, s: proof.s }).ok, false);
});

test("solvency needs the proven total to cover the principal floor", () => {
  // The proof verifying is necessary but NOT sufficient — the page must also compare the
  // proven total against the locked principal, exactly as the contract does.
  assert.equal(verifyReserves(proof).ok, true);
  assert.ok(BigInt(proof.total) >= BigInt(proof.principalFloor), "published reserves must cover principal");
});
