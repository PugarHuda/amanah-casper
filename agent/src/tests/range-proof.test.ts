import { test } from "node:test";
import assert from "node:assert/strict";
import { proveRange, verifyRange, RANGE_BITS } from "../range-proof.js";
import { ed25519 } from "@noble/curves/ed25519";
import { deriveH } from "../zk-reserves.js";

const G = ed25519.Point.BASE, L = ed25519.CURVE.n, H = deriveH();
const mod = (a: bigint, m: bigint) => ((a % m) + m) % m;
const hx = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const commitHex = (a: bigint, r: bigint) => hx(G.multiply(mod(a, L)).add(H.multiply(mod(r, L))).toRawBytes());

test("a valid in-range value verifies (completeness)", () => {
  const a = 250_000_000_000n, r = 12345n;
  const proof = proveRange(a, r);
  assert.ok(verifyRange(commitHex(a, r), proof), "honest proof must verify");
});

test("the proof binds to ITS commitment — a different total fails", () => {
  const a = 100n, r = 7n;
  const proof = proveRange(a, r);
  assert.ok(!verifyRange(commitHex(a + 1n, r), proof), "wrong commitment must fail the Σ2^jC_j==C check");
});

test("a tampered bit-proof scalar does not verify (soundness)", () => {
  const a = 4242n, r = 99n;
  const proof = proveRange(a, r);
  proof.bits[3].z0 = hx(new Uint8Array(32).fill(1)); // corrupt one response
  assert.ok(!verifyRange(commitHex(a, r), proof), "a forged bit proof must fail");
});

test("a value outside [0, 2^N) is rejected by the prover (can't even build it)", () => {
  assert.throws(() => proveRange(-1n, 5n));
  assert.throws(() => proveRange(1n << BigInt(RANGE_BITS), 5n));
});
