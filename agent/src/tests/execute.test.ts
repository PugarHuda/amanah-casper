// Unit tests for the human-escalation safety gate — the boundary between the agent
// acting autonomously and handing off to a human. A regression here is a safety bug.
import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldEscalate } from "../execute.js";
import { config } from "../config.js";
import type { Decision } from "../types.js";

const d = (over: Partial<Decision>): Decision => ({
  riskScore: 0.3, action: "hold", fromAsset: "Gold", toAsset: "TBond",
  amount: 0, reasoningSteps: [], confidence: 0.9, ...over,
});
const T = config.confidenceThreshold; // default 0.7

test("escalate when the model explicitly asks to escalate", () => {
  assert.equal(shouldEscalate(d({ action: "escalate", confidence: 0.99 })), true);
});

test("escalate when confidence is below the threshold", () => {
  assert.equal(shouldEscalate(d({ action: "rebalance", confidence: T - 0.1 })), true);
  assert.equal(shouldEscalate(d({ action: "hold", confidence: 0.3 })), true);
});

test("do NOT escalate a confident, non-escalate decision", () => {
  assert.equal(shouldEscalate(d({ action: "rebalance", confidence: T + 0.1 })), false);
  assert.equal(shouldEscalate(d({ action: "rebalance", confidence: T })), false, "== threshold is allowed");
});
