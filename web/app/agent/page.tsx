import Nav from "@/components/Nav";
import { getAgentConsole } from "@/lib/data";

// Read the newest reasoning blob + on-chain hashes at request time (not baked at build).
export const revalidate = 15;

const Check = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M3 7.5l2.6 2.6L11 4" stroke="#3fae6a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default async function Agent() {
  const { metrics, assets, guards, steps, reasoningHash, decision, cycleId } = await getAgentConsole();

  return (
    <main className="page">
      <div className="card">
        <Nav active="protocol" />

        <div style={{ marginTop: 44, display: "flex", alignItems: "center", gap: 14 }}>
          <span className="pulse-dot" />
          <span className="mono" style={{ fontSize: 12, letterSpacing: "2px", color: "var(--faint)" }}>{cycleId}</span>
        </div>
        <h1 className="serif" style={{ margin: "10px 0 0", fontSize: 42, fontWeight: 400, color: "var(--ink)", letterSpacing: "-0.8px" }}>
          Agent console
        </h1>

        {/* METRIC CARDS */}
        <div className="metric-row" style={{ marginTop: 28 }}>
          {metrics.map((m) => (
            <div key={m.label} className="metric-card">
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--faint)", letterSpacing: "0.2px" }}>{m.label}</div>
              <div className="serif" style={{ marginTop: 10, fontSize: 38, fontWeight: 400, color: "var(--ink)", letterSpacing: "-0.5px" }}>{m.value}</div>
              <div style={{ marginTop: 4, fontSize: 13, fontWeight: 600, color: m.deltaColor }}>{m.delta}</div>
            </div>
          ))}
        </div>

        <div className="two-col" style={{ marginTop: 40, alignItems: "start" }}>
          {/* LEFT: ALLOCATION + GUARDRAILS */}
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink2)", letterSpacing: "0.3px", marginBottom: 18 }}>PORTFOLIO ALLOCATION</div>
            <div style={{ display: "flex", height: 18, borderRadius: 9, overflow: "hidden", marginBottom: 24 }}>
              <div style={{ width: "42%", background: "#e7a83c" }} />
              <div style={{ width: "33%", background: "#3f86e6" }} />
              <div style={{ width: "18%", background: "#2c2620" }} />
              <div style={{ width: "7%", background: "#cdbfa6" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {assets.map((a) => (
                <div key={a.name} style={{ display: "flex", alignItems: "center", gap: 14, padding: "15px 4px", borderBottom: "1px solid var(--border3)" }}>
                  <span style={{ width: 11, height: 11, borderRadius: 3, background: a.color }} />
                  <span style={{ flex: 1, fontSize: 16, fontWeight: 600, color: "var(--ink2)" }}>{a.name}</span>
                  <span className="mono" style={{ fontSize: 14, color: "var(--muted)", width: 120, textAlign: "right" }}>{a.price}</span>
                  <span style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)", width: 64, textAlign: "right" }}>{a.weight}</span>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 30, marginBottom: 14, fontSize: 14, fontWeight: 700, color: "var(--ink2)", letterSpacing: "0.3px" }}>GUARDRAILS</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {guards.map((g) => (
                <div key={g} style={{ display: "flex", alignItems: "center", gap: 9, padding: "11px 16px", background: "#f6f4ee", borderRadius: 12 }}>
                  <Check />
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#2c2620" }}>{g}</span>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT: REASONING STREAM */}
          <div style={{ border: "1px solid var(--border2)", borderRadius: 20, background: "var(--surface-subtle)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px", borderBottom: "1px solid var(--border2)" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink2)", letterSpacing: "0.3px" }}>PROOF-OF-REASONING</div>
              <a href="https://cspr.live" className="mono" style={{ fontSize: 12, color: "var(--blue)", textDecoration: "none" }}>verify on cspr.live ↗</a>
            </div>
            <div style={{ flex: 1, padding: "8px 0" }}>
              {steps.map((s) => (
                <div key={s.n} style={{ display: "flex", gap: 16, padding: "15px 22px" }}>
                  <div className="mono" style={{ fontSize: 12, color: "#b7b1a6", width: 42, flexShrink: 0, paddingTop: 2 }}>{s.n}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink2)", lineHeight: 1.45 }}>{s.text}</div>
                    <div className="mono" style={{ marginTop: 5, fontSize: 11.5, color: s.tagColor }}>{s.tag}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ padding: "16px 22px", borderTop: "1px solid var(--border2)", background: "#f7f5ef" }}>
              <div className="mono" style={{ fontSize: 11, color: "var(--faint)", marginBottom: 4 }}>REASONING HASH (blake2b)</div>
              <div className="mono" style={{ fontSize: 12.5, color: "var(--ink)", wordBreak: "break-all" }}>{reasoningHash}</div>
            </div>
          </div>
        </div>

        {/* DECISION BAR */}
        <div style={{ marginTop: 36, maxWidth: 720, padding: "22px 26px", borderRadius: 18, background: "var(--gradient-pill)", border: "1px solid #efe7d6" }}>
          <div className="mono" style={{ fontSize: 12, letterSpacing: "1.5px", color: "var(--gold-banner)" }}>{decision.caption}</div>
          <div className="serif" style={{ marginTop: 8, fontSize: 26, fontWeight: 400, color: "var(--ink)", letterSpacing: "-0.4px" }}>{decision.title}</div>
          <div style={{ marginTop: 6, fontSize: 14, color: "var(--body)" }}>{decision.sub}</div>
        </div>
      </div>
    </main>
  );
}
