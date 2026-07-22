// Simulation / paper-trading mode (C4).
//
// The live vault stores allocations in USD, so a reallocation just conserves the total —
// there is no P&L to learn from. Paper mode instead models PRICE EXPOSURE: it holds each
// asset as a UNIT count (oz of gold, barrels of WTI, CSPR tokens) and revalues at live
// prices every cycle, so the agent's rebalancing decisions actually make or lose paper
// money. This lets you test a strategy for real, cycle after cycle, WITHOUT risking a
// single on-chain token. Runs the full real pipeline (ingest -> reason -> audit -> guard);
// only the on-chain execution is replaced by a paper fill.
//
// State + a public summary are written to web/public/simulation.json so the dashboard can
// show the paper equity curve. Enable with SIMULATE=true.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { PriceSnapshot, Decision, AssetId } from "./types.js";

const OUT = resolve(import.meta.dirname, "../../web/public/simulation.json");

// TBond is a yield instrument, not a price we track tick-by-tick — model it at par (100)
// so it behaves as the stable "safe" leg. The other three carry real price exposure.
function priceOf(asset: AssetId, p: PriceSnapshot): number | null {
  switch (asset) {
    case "Gold": return p.goldUsd;
    case "WTI": return p.wtiUsd;
    case "CSPR": return p.csprUsd;
    case "TBond": return 100;
  }
}

type PaperState = {
  startAt: string;
  startNav: number;
  units: Record<AssetId, number>; // asset UNITS held (not USD)
  cycles: { cycle: number; at: string; nav: number; pnlPct: number; action: string; note: string }[];
};

function load(): PaperState | null {
  try {
    return JSON.parse(readFileSync(OUT, "utf8")) as PaperState;
  } catch {
    return null;
  }
}

function nav(units: Record<AssetId, number>, p: PriceSnapshot): number | null {
  let total = 0;
  for (const a of Object.keys(units) as AssetId[]) {
    const px = priceOf(a, p);
    if (px == null) return null; // a missing price this cycle -> can't value; skip
    total += units[a] * px;
  }
  return total;
}

/**
 * Advance the paper portfolio one cycle. On the first call it seeds the portfolio from the
 * vault's current USD split (converted to units at current prices). Returns a short
 * human summary, or null if prices were too incomplete to value this cycle.
 */
export function simulateCycle(
  cycle: number,
  prices: PriceSnapshot,
  decision: Decision,
  vaultHoldingsUsd6dp: Record<AssetId, bigint>,
): { nav: number; pnlPct: number } | null {
  let st = load();

  if (!st) {
    // Seed units from the live vault split: units = usd / price.
    const units = {} as Record<AssetId, number>;
    for (const a of Object.keys(vaultHoldingsUsd6dp) as AssetId[]) {
      const px = priceOf(a, prices);
      const usd = Number(vaultHoldingsUsd6dp[a]) / 1e6;
      if (px == null || px === 0) return null;
      units[a] = usd / px;
    }
    const n0 = nav(units, prices);
    if (n0 == null) return null;
    st = { startAt: new Date().toISOString(), startNav: n0, units, cycles: [] };
  }

  // Apply the decision as a paper fill: sell `amount` USD of `from`, buy it in `to`.
  let note = "hold";
  if (decision.action === "rebalance" && decision.amount > 0 && decision.fromAsset !== decision.toAsset) {
    const usd = decision.amount / 1e6;
    const pf = priceOf(decision.fromAsset, prices);
    const pt = priceOf(decision.toAsset, prices);
    if (pf && pt) {
      const sellUnits = usd / pf;
      if (st.units[decision.fromAsset] >= sellUnits) {
        st.units[decision.fromAsset] -= sellUnits;
        st.units[decision.toAsset] += usd / pt;
        note = `paper fill: $${usd.toFixed(0)} ${decision.fromAsset}->${decision.toAsset}`;
      } else {
        note = "rebalance skipped (insufficient paper units)";
      }
    }
  } else if (decision.action === "escalate") {
    note = "escalated — no paper fill";
  }

  const n = nav(st.units, prices);
  if (n == null) return null;
  const pnlPct = ((n - st.startNav) / st.startNav) * 100;
  st.cycles.push({ cycle, at: new Date().toISOString(), nav: Math.round(n), pnlPct: Math.round(pnlPct * 100) / 100, action: decision.action, note });
  // Keep the file bounded.
  if (st.cycles.length > 500) st.cycles = st.cycles.slice(-500);

  try {
    mkdirSync(resolve(OUT, ".."), { recursive: true });
    writeFileSync(OUT, JSON.stringify(st, null, 2));
  } catch { /* non-fatal */ }
  return { nav: Math.round(n), pnlPct: Math.round(pnlPct * 100) / 100 };
}
