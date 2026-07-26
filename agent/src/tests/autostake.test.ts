import { test } from "node:test";
import assert from "node:assert/strict";
import { guardStaking, evaluateStakingRule } from "../autostake.js";

// Defaults (no env set): reserve buffer 250, min delegation 500, per-decision cap 5000.
const stake = (amountCspr: number) => ({ action: "stake" as const, amountCspr, confidence: 0.8, reasoningSteps: [] });

test("a valid stake within all limits passes", () => {
  // idle 1000, stake 500 → 500 liquid left >= 250 buffer.
  assert.deepEqual(guardStaking(stake(500), 1000), { ok: true });
});

test("staking that would breach the liquid reserve buffer is rejected", () => {
  // idle 600, stake 500 → 100 left < 250 buffer.
  const r = guardStaking(stake(500), 600);
  assert.equal(r.ok, false);
  assert.match(r.reason!, /reserve buffer/);
});

test("a delegation below the network minimum is rejected", () => {
  const r = guardStaking(stake(400), 5000);
  assert.equal(r.ok, false);
  assert.match(r.reason!, /minimum delegation/);
});

test("a delegation over the per-decision cap is rejected", () => {
  const r = guardStaking(stake(6000), 100_000);
  assert.equal(r.ok, false);
  assert.match(r.reason!, /per-decision cap/);
});

test("hold always passes the guard", () => {
  assert.deepEqual(guardStaking({ action: "hold", amountCspr: 0, confidence: 0.9, reasoningSteps: [] }, 100), { ok: true });
});

test("evaluateStakingRule holds when idle minus buffer is below the minimum", () => {
  // idle 734, buffer 250 → 484 stakeable < 500 min → hold (the real live case).
  const d = evaluateStakingRule(734);
  assert.equal(d.action, "hold");
  assert.equal(d.amountCspr, 0);
});

test("evaluateStakingRule stakes the buffer-respecting amount, capped", () => {
  // idle 2000, buffer 250 → 1750 stakeable, under the 5000 cap.
  const d = evaluateStakingRule(2000);
  assert.equal(d.action, "stake");
  assert.equal(d.amountCspr, 1750);
  // And the amount it picks must itself pass the guard.
  assert.equal(guardStaking(d, 2000).ok, true);
});

test("evaluateStakingRule respects the per-decision cap", () => {
  // idle 100000, buffer 250 → 99750 stakeable, capped at 5000.
  const d = evaluateStakingRule(100_000);
  assert.equal(d.action, "stake");
  assert.equal(d.amountCspr, 5000);
});
