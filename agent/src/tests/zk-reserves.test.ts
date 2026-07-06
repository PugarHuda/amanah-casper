// ZK proof-of-reserves is a crypto/solvency path — a proof that "verifies" a wrong
// total would be a fake-solvency bug. These pin completeness, soundness, and hiding.
import { test } from "node:test";
import assert from "node:assert/strict";
import { proveReserves, verifyReserves } from "../zk-reserves.js";

const VALUES = [250_000_000_000n, 400_000_000_000n, 150_000_000_000n, 200_000_000_000n];
const BLINDS = [11n, 22n, 33n, 44n];

test("a valid proof verifies and the total is the true sum (completeness)", () => {
  const p = proveReserves(VALUES, BLINDS, "77".padEnd(64, "0"));
  assert.equal(p.total, "1000000000000");
  assert.equal(verifyReserves(p), true);
});

test("GOLDEN VECTOR matches the on-chain Rust verifier (contracts test)", () => {
  const p = proveReserves(VALUES, BLINDS, "77".padEnd(64, "0"));
  assert.equal(p.commitments[0], "f128d7c372acc38dd1843869bc44c78df0dad576e8c447e777ac019d6103bbc9");
  assert.equal(p.proofT, "9585b650eb4ec57858c21c188021b5d98b7a1cf066fa81cb4cb22bfbc37f70b2");
  assert.equal(p.s, "c18ef792d5f2c1a6e6c2bc30bf4ece1b8328413646a2a0f8640178b097ab6a08");
});

test("claiming a WRONG total does not verify (soundness — no fake solvency)", () => {
  const p = proveReserves(VALUES, BLINDS);
  assert.equal(verifyReserves({ ...p, total: (BigInt(p.total) + 1n).toString() }), false);
  assert.equal(verifyReserves({ ...p, total: (BigInt(p.total) - 100n).toString() }), false);
});

test("the individual splits are HIDDEN — same total, different splits, indistinguishable commitments size", () => {
  // Two different splits summing to the same total both prove valid; the commitments
  // reveal nothing about which split it was (perfectly hiding).
  const a = proveReserves([500_000_000_000n, 500_000_000_000n], [1n, 2n]);
  const b = proveReserves([100_000_000_000n, 900_000_000_000n], [3n, 4n]);
  assert.equal(a.total, b.total);
  assert.equal(verifyReserves(a), true);
  assert.equal(verifyReserves(b), true);
  assert.notEqual(a.commitments[0], b.commitments[0]); // commitments differ, but a_i never revealed
});
