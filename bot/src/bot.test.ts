// The bot's /audit reply is the user-facing product — these lock its format and the
// "no decision yet" fallback, and prove the module imports WITHOUT a token or polling.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAuditMessage, deployLink, notifyDecision } from "./bot.js";

test("deployLink builds an explorer URL or (none)", () => {
  assert.equal(deployLink("abc", "https://x/deploy"), "https://x/deploy/abc");
  assert.equal(deployLink(undefined), "(none)");
});

test("buildAuditMessage: no decision -> fallback with dashboard", () => {
  const m = buildAuditMessage(null, "https://dash");
  assert.match(m, /No decision recorded/);
  assert.match(m, /https:\/\/dash/);
});

test("buildAuditMessage: renders the latest decision + real deploy links", () => {
  const m = buildAuditMessage(
    { summary: "Hold — no rebalance", reasoningHash: "deadbeef", attestDeploy: "a1", x402Deploy: "b2" },
    "https://dash",
    "https://testnet.cspr.live/deploy",
  );
  assert.match(m, /Hold — no rebalance/);
  assert.match(m, /0xdeadbeef/);
  assert.match(m, /deploy\/a1/);
  assert.match(m, /deploy\/b2/);
  assert.match(m, /Reallocate: \(none\)/); // omitted field -> (none), not a crash
});

test("notifyDecision is a safe side-effect-free import (no token, no polling)", () => {
  // If importing bot.ts had thrown or started polling, this file wouldn't run at all.
  assert.doesNotThrow(() => notifyDecision({ summary: "x", reasoningHash: "ff", attestDeploy: "z9" }));
});
