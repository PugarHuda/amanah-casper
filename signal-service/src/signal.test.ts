// The premium signal is what the agent PAYS for over x402, and its output is fed
// straight into the LLM prompt and the independent auditor's review — so it must never
// invent a number. These pin the shape, the honest-null contract, and the tilt bounds.
// It makes real network calls. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSignal } from "./signal.js";

const signal = await buildSignal();

test("buildSignal returns a valid, clamped PremiumSignal", () => {
  assert.ok(typeof signal.asof === "string");
  assert.ok("momentum24hPct" in signal.cspr && "volatilityPct" in signal.cspr);
  assert.ok(typeof signal.tilt === "number");
  assert.ok(signal.tilt >= -1 && signal.tilt <= 1, `tilt clamped to [-1,1], got ${signal.tilt}`);
  assert.ok(typeof signal.note === "string" && signal.note.length > 0);
});

test("covers every treasury asset and names a source for each", () => {
  for (const k of ["cspr", "gold", "tbond", "wti"] as const) {
    assert.ok(k in signal, `missing leg: ${k}`);
  }
  assert.ok(Array.isArray(signal.sources) && signal.sources.length >= 4, "each leg must report a source");
  const joined = signal.sources.join(" ");
  for (const k of ["casper-network", "pax-gold", "tbond", "wti"]) {
    assert.ok(joined.includes(k), `no provenance line for ${k}`);
  }
});

test("at least one leg is genuinely live (real network data)", () => {
  const live =
    signal.cspr.samples > 0 || signal.gold.samples > 0 ||
    signal.tbond.yieldPct != null || signal.wti.usd != null;
  assert.equal(live, true, "no leg returned real data — the signal would be empty");
});

test("unavailable legs are null, never estimated", () => {
  for (const leg of [signal.cspr, signal.gold]) {
    if (leg.samples === 0) {
      assert.equal(leg.momentum24hPct, null);
      assert.equal(leg.volatilityPct, null);
      assert.equal(leg.level, null);
    } else {
      assert.equal(typeof leg.momentum24hPct, "number");
      assert.ok(Number.isFinite(leg.momentum24hPct as number));
      assert.ok((leg.volatilityPct as number) >= 0, "volatility cannot be negative");
    }
  }
  if (signal.wti.usd === null) assert.equal(signal.wti.asOf, null);
});

test("strongest leg is consistent with the momentum it reports", () => {
  if (signal.strongest === null) {
    assert.equal(signal.cspr.momentum24hPct, null);
    assert.equal(signal.gold.momentum24hPct, null);
  } else {
    const winner = signal.strongest === "cspr" ? signal.cspr : signal.gold;
    const loser = signal.strongest === "cspr" ? signal.gold : signal.cspr;
    if (winner.momentum24hPct != null && loser.momentum24hPct != null) {
      assert.ok(winner.momentum24hPct >= loser.momentum24hPct, "strongest must have the higher momentum");
    }
  }
});
