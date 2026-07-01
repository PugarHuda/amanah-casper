// Unit + regression tests for the reasoning normalizer and tolerant JSON parser.
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize, extractJson } from "../reason.js";
import { ASSET_INDEX } from "../types.js";
import type { Decision } from "../types.js";

const base = (over: Partial<Decision> = {}): Decision => ({
  riskScore: 0.3, action: "hold", fromAsset: "Gold", toAsset: "TBond",
  amount: 0, reasoningSteps: [], confidence: 0.8, ...over,
});

test("normalize: REGRESSION riskScore/confidence 0..100 -> 0..1", () => {
  // The deepseek bug: model returned riskScore 20 (meant 0.20).
  assert.equal(normalize(base({ riskScore: 20 })).riskScore, 0.2);
  assert.equal(normalize(base({ confidence: 85 })).confidence, 0.85);
  // Already in range: untouched.
  assert.equal(normalize(base({ riskScore: 0.5 })).riskScore, 0.5);
  assert.equal(normalize(base({ confidence: 0.9 })).confidence, 0.9);
});

test("normalize: a non-rebalance action never moves funds", () => {
  assert.equal(normalize(base({ action: "hold", amount: 999 })).amount, 0);
  assert.equal(normalize(base({ action: "escalate", amount: 999 })).amount, 0);
  // rebalance keeps its amount
  assert.equal(normalize(base({ action: "rebalance", amount: 50_000_000_000 })).amount, 50_000_000_000);
});

test("extractJson: plain JSON", () => {
  assert.deepEqual(extractJson('{"action":"hold","amount":0}'), { action: "hold", amount: 0 });
});

test("extractJson: fenced ```json block", () => {
  assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
});

test("extractJson: <think> preamble before the object", () => {
  assert.deepEqual(extractJson('<think>let me reason...</think>\n{"a":2,"b":[1,2]}'), { a: 2, b: [1, 2] });
});

test("extractJson: prose wrapping", () => {
  assert.deepEqual(extractJson('Here is my decision: {"action":"rebalance"} done.'), { action: "rebalance" });
});

test("extractJson: unparseable => null", () => {
  assert.equal(extractJson("no json here at all"), null);
  assert.equal(extractJson("{not valid json"), null);
});

test("ASSET_INDEX matches the on-chain AssetId enum order", () => {
  assert.deepEqual(ASSET_INDEX, { Gold: 0, TBond: 1, WTI: 2, CSPR: 3 });
});
