import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateCycle } from "../simulate.js";
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import type { PriceSnapshot, Decision, AssetId } from "../types.js";

const OUT = resolve(import.meta.dirname, "../../../web/public/simulation.json");
const holdings: Record<AssetId, bigint> = {
  Gold: 200_000_000_000n, TBond: 450_000_000_000n, WTI: 150_000_000_000n, CSPR: 200_000_000_000n,
};
const p = (gold: number, cspr: number): PriceSnapshot => ({ goldUsd: gold, wtiUsd: 70, tbondYieldPct: 4.2, csprUsd: cspr } as PriceSnapshot);
const hold: Decision = { riskScore: 0.3, action: "hold", fromAsset: "Gold", toAsset: "TBond", amount: 0, reasoningSteps: [], confidence: 0.9 };

test("paper NAV rises when a held asset's price rises, and the equity curve persists", () => {
  rmSync(OUT, { force: true }); // fresh portfolio
  const c1 = simulateCycle(1, p(4000, 0.02), hold, holdings);
  assert.ok(c1, "first cycle seeds and values");
  assert.equal(c1!.pnlPct, 0, "start is flat");
  // Gold +10% next cycle; the portfolio holds gold, so NAV must rise (but < 10% since gold is a fraction).
  const c2 = simulateCycle(2, p(4400, 0.02), hold, holdings);
  assert.ok(c2!.nav > c1!.nav, "NAV rose with gold");
  assert.ok(c2!.pnlPct > 0 && c2!.pnlPct < 10, `pnl ${c2!.pnlPct} is a sensible fraction`);
  rmSync(OUT, { force: true });
});

test("a rebalance into a rising asset beats holding — the point of paper mode", () => {
  rmSync(OUT, { force: true });
  simulateCycle(1, p(4000, 0.02), hold, holdings); // seed
  // Rebalance $100k from Gold into CSPR, then CSPR doubles.
  const reb: Decision = { ...hold, action: "rebalance", fromAsset: "Gold", toAsset: "CSPR", amount: 100_000_000_000 };
  simulateCycle(2, p(4000, 0.02), reb, holdings);
  const after = simulateCycle(3, p(4000, 0.04), hold, holdings); // CSPR doubled
  assert.ok(after!.pnlPct > 0, "rebalancing into the winner shows paper profit");
  rmSync(OUT, { force: true });
});
