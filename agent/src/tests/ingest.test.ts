// The cross-validation divergence is a data-trust signal — it must be 0 for equal
// feeds, scale sensibly, and fail safe (null) when a source is missing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { divergencePct } from "../ingest.js";

test("identical feeds diverge 0%", () => {
  assert.equal(divergencePct(0.002, 0.002), 0);
});

test("a real gap is measured relative to the mean", () => {
  // 0.0020 vs 0.0021 -> |−0.0001|/0.00205 ≈ 4.878%
  const d = divergencePct(0.002, 0.0021)!;
  assert.ok(Math.abs(d - 4.878) < 0.01, `got ${d}`);
});

test("a missing or non-positive source fails safe to null", () => {
  assert.equal(divergencePct(null, 0.002), null);
  assert.equal(divergencePct(0.002, null), null);
  assert.equal(divergencePct(0, 0), null);
});
