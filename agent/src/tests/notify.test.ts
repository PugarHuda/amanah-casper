// The operator notification is the on-call human's view of a cycle, so it must always
// carry the verdict and verifiable links — and never silently drop a hash.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCycleMessage, type CycleReport } from "../notify.js";

const base: CycleReport = {
  cycle: 7,
  action: "rebalance 50000000000 Gold->TBond",
  summary: "T-bond yield rose 3bp; rotate a slice of gold into duration.",
  confidence: 0.82,
  reasoningHash: "a".repeat(64),
  attestDeploy: "b".repeat(64),
  x402Deploy: "c".repeat(64),
  auditDeploy: "d".repeat(64),
  outcome: "executed",
};

test("every provided deploy hash becomes a cspr.live link", () => {
  const msg = buildCycleMessage({ ...base, reallocateDeploy: "e".repeat(64), quorumVotes: ["f".repeat(64)] });
  for (const h of ["b", "c", "d", "e", "f"]) {
    assert.ok(msg.includes(`https://testnet.cspr.live/deploy/${h.repeat(64)}`), `missing link for ${h}`);
  }
  assert.ok(msg.includes("Dashboard: https://amanah-casper-rwa.vercel.app/dashboard"));
});

test("missing hashes render as an em dash, never as a broken link", () => {
  const msg = buildCycleMessage({ ...base, x402Deploy: undefined, auditDeploy: undefined });
  assert.ok(msg.includes("x402:       —"));
  assert.ok(!msg.includes("deploy/undefined"), "must not build a link from undefined");
});

test("the outcome is stated explicitly and a veto is called out", () => {
  assert.ok(buildCycleMessage({ ...base, outcome: "executed" }).includes("EXECUTED"));
  assert.ok(buildCycleMessage({ ...base, outcome: "held" }).includes("HELD"));
  const vetoed = buildCycleMessage({ ...base, outcome: "vetoed", auditorApproved: false });
  assert.ok(vetoed.includes("VETOED") && vetoed.includes("(VETO)"), "a veto must be unmissable");
});

test("quorum line reports how many independent votes were cast", () => {
  const msg = buildCycleMessage({ ...base, quorumVotes: ["1".repeat(64), "2".repeat(64)] });
  assert.ok(msg.includes("2 signed vote(s)"));
  // With no votes the line is omitted rather than showing a misleading zero.
  assert.ok(!buildCycleMessage({ ...base, quorumVotes: [] }).includes("Quorum:"));
});
