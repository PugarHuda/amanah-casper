"use client";
// Paper-trading (simulation) equity curve. Reads the public simulation.json the agent
// writes in SIMULATE mode — the same real decisions, applied to a price-exposed paper
// portfolio, with nothing touching the chain. Renders nothing if there's no paper run yet.
import { useEffect, useState } from "react";

type Sim = {
  startNav: number;
  cycles: { cycle: number; nav: number; pnlPct: number; action: string; note: string }[];
};

export default function SimulationCard() {
  const [sim, setSim] = useState<Sim | null>(null);
  useEffect(() => {
    fetch("/simulation.json").then((r) => (r.ok ? r.json() : null)).then(setSim).catch(() => {});
  }, []);
  if (!sim || !sim.cycles?.length) return null;

  const last = sim.cycles[sim.cycles.length - 1];
  const navs = sim.cycles.map((c) => c.nav);
  const min = Math.min(...navs, sim.startNav), max = Math.max(...navs, sim.startNav);
  const span = max - min || 1;
  const W = 320, H = 44;
  const pts = sim.cycles.map((c, i) => {
    const x = sim.cycles.length === 1 ? W : (i / (sim.cycles.length - 1)) * W;
    const y = H - ((c.nav - min) / span) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const up = last.pnlPct >= 0;

  return (
    <div style={{ marginTop: 18, padding: "16px 18px", border: "1px solid var(--border2)", borderRadius: 14, background: "var(--surface-subtle)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span className="mono" style={{ fontSize: 11, letterSpacing: "1.4px", color: "var(--faint)" }}>PAPER MODE · SIMULATED, NOTHING ON-CHAIN</span>
        <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 999, background: up ? "#e8f6ed" : "#fbeaea", color: up ? "var(--green-deep)" : "#b3382c" }}>
          {up ? "+" : ""}{last.pnlPct}% over {sim.cycles.length} cycle{sim.cycles.length > 1 ? "s" : ""}
        </span>
      </div>
      <div style={{ marginTop: 6, fontSize: 13, color: "var(--body)", lineHeight: 1.5 }}>
        The same real decisions, run against a price-exposed paper portfolio — a safe backtest of the
        strategy. Paper NAV <strong>${last.nav.toLocaleString()}</strong> (started ${Math.round(sim.startNav).toLocaleString()}).
      </div>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ marginTop: 10, maxWidth: "100%" }} preserveAspectRatio="none">
        <polyline points={pts} fill="none" stroke={up ? "var(--green-deep, #2e7d4f)" : "#b3382c"} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div className="mono" style={{ fontSize: 10.5, color: "var(--faint)" }}>latest: {last.note}</div>
    </div>
  );
}
