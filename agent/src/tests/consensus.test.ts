import { test } from "node:test";
import assert from "node:assert/strict";
import { computeConsensus } from "../consensus.js";
import type { Decision } from "../types.js";

const dec = (o: Partial<Decision>): Decision => ({
  riskScore: 0.3, action: "hold", fromAsset: "Gold", toAsset: "Gold", amount: 0,
  confidence: 0.8, reasoningSteps: ["x"], ...o,
});
const r = (model: string, d: Decision) => ({ model, decision: d });
const MODELS = ["m1", "m2", "m3"];

test("majority agreeing on a rebalance direction acts, with the MEDIAN amount", () => {
  const c = computeConsensus(MODELS, [
    r("m1", dec({ action: "rebalance", fromAsset: "Gold", toAsset: "CSPR", amount: 100, confidence: 0.9 })),
    r("m2", dec({ action: "rebalance", fromAsset: "Gold", toAsset: "CSPR", amount: 300, confidence: 0.7 })),
    r("m3", dec({ action: "hold" })),
  ]);
  assert.equal(c.agreed, true);
  assert.equal(c.action, "rebalance");
  assert.equal(c.agreeing, 2);
  assert.equal(c.decision.amount, 200); // median of {100,300}, not the higher outlier
  assert.equal(c.decision.confidence, 0.8); // mean of the agreeing members
});

test("same action but OPPOSITE directions do not agree -> escalate", () => {
  const c = computeConsensus(MODELS, [
    r("m1", dec({ action: "rebalance", fromAsset: "Gold", toAsset: "CSPR", amount: 100 })),
    r("m2", dec({ action: "rebalance", fromAsset: "CSPR", toAsset: "Gold", amount: 100 })),
    r("m3", dec({ action: "hold" })),
  ]);
  assert.equal(c.agreed, false);
  assert.equal(c.decision.action, "escalate");
  assert.equal(c.decision.amount, 0);
});

test("abstentions (errored models) can't manufacture a majority", () => {
  // Only 2 of 3 voted; a lone valid rebalance is a plurality, NOT a majority of the panel.
  const c = computeConsensus(MODELS, [
    r("m1", dec({ action: "rebalance", fromAsset: "Gold", toAsset: "CSPR", amount: 100 })),
    { model: "m2", decision: null, error: "API 500" },
    { model: "m3", decision: null, error: "timeout" },
  ]);
  assert.equal(c.agreed, false);
  assert.equal(c.decision.action, "escalate");
  assert.equal(c.votes.length, 3); // every member recorded, including the two abstentions
});

test("unanimous hold agrees and moves no funds", () => {
  const c = computeConsensus(MODELS, [r("m1", dec({})), r("m2", dec({})), r("m3", dec({}))]);
  assert.equal(c.agreed, true);
  assert.equal(c.action, "hold");
  assert.equal(c.decision.amount, 0);
});
