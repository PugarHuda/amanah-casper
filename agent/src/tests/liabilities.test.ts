import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLiabilities, verifyInclusion, type Client } from "../liabilities.js";

const clients: Client[] = [
  { id: "a", balance: 100n, nonce: "11".repeat(32) },
  { id: "b", balance: 200n, nonce: "22".repeat(32) },
  { id: "c", balance: 300n, nonce: "33".repeat(32) },
  { id: "d", balance: 400n, nonce: "44".repeat(32) },
  { id: "e", balance: 50n, nonce: "55".repeat(32) }, // odd count -> lone-tail duplication path
];

test("every client's inclusion proof re-derives the published root", () => {
  const t = buildLiabilities(clients);
  assert.equal(t.total, 1050n);
  for (const p of t.proofs) {
    assert.ok(verifyInclusion(p.leaf, p.path, t.root), `client ${p.id} must verify`);
  }
});

test("a tampered leaf (wrong balance) does NOT verify against the root", () => {
  const t = buildLiabilities(clients);
  const p = t.proofs[1];
  // forge a leaf for a different balance -> path no longer reaches the root
  const forged = "00".repeat(32);
  assert.ok(!verifyInclusion(forged, p.path, t.root), "a forged leaf must fail");
});

test("omitting a client changes the root — an operator can't drop a liability silently", () => {
  const full = buildLiabilities(clients).root;
  const dropped = buildLiabilities(clients.slice(0, 4)).root;
  assert.notEqual(full, dropped);
});
