"use client";

// Real native staking yield, live. The treasury's CSPR reserve is delegated to a Casper
// validator; this polls /api/staking (chain auction state) and shows the delegated principal,
// the current staked total, and the accrued native rewards — the difference is real yield the
// treasury has earned, not a projection. Client-side so the dashboard render stays instant.
import { useEffect, useState } from "react";

type Staked = {
  delegated: boolean; pending: boolean; stakedCspr: number; originalCspr: number; rewardsCspr: number;
  deployExplorer: string; validatorExplorer: string;
};

const fmt = (n: number, dp = 0) => n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });

export default function StakingCard({ initial }: { initial: Staked | null }) {
  const [s, setS] = useState<Staked | null>(initial);
  useEffect(() => {
    fetch("/api/staking").then((r) => r.json()).then((d) => { if (d?.delegated) setS(d); }).catch(() => {});
  }, []);

  if (!s?.delegated) return null;
  const earning = !s.pending && s.rewardsCspr > 0;

  return (
    <div style={{ marginTop: 16, padding: "16px 20px", border: "1px solid #bfe6cd", borderRadius: 16, background: "var(--ok-bg)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span className="mono" style={{ fontSize: 11, letterSpacing: "1.4px", color: "var(--green-deep)" }}>REAL NATIVE STAKING YIELD · ON-CHAIN</span>
        {earning && (
          <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 999, background: "#fff", color: "var(--green-deep)", border: "1px solid #bfe6cd" }}>
            +{fmt(s.rewardsCspr, 4)} CSPR earned
          </span>
        )}
      </div>

      {!s.pending && (
        <div style={{ marginTop: 12, display: "flex", gap: 24, flexWrap: "wrap" }}>
          <div>
            <div className="serif" style={{ fontSize: 26, color: "var(--ink)" }}>{fmt(s.stakedCspr, 3)} <span style={{ fontSize: 14 }}>CSPR</span></div>
            <div style={{ fontSize: 12, color: "var(--faint)" }}>currently staked</div>
          </div>
          <div>
            <div className="serif" style={{ fontSize: 26, color: "var(--green-deep)" }}>+{fmt(s.rewardsCspr, 4)}</div>
            <div style={{ fontSize: 12, color: "var(--faint)" }}>native rewards earned</div>
          </div>
          <div>
            <div className="serif" style={{ fontSize: 26, color: "var(--ink)" }}>{fmt(s.originalCspr)}</div>
            <div style={{ fontSize: 12, color: "var(--faint)" }}>principal delegated (recoverable)</div>
          </div>
        </div>
      )}

      <div style={{ marginTop: 10, fontSize: 13.5, color: "var(--body)", lineHeight: 1.55 }}>
        The treasury&apos;s <strong>CSPR reserve is delegated to a Casper validator</strong>, earning real native
        staking rewards every era. {s.pending
          ? "The position is activating at the next era boundary; rewards begin accruing then."
          : <>Every reward above the delegated principal is <strong>real yield the treasury has earned</strong> — and the principal is fully recoverable (undelegate).</>}
      </div>
      <div style={{ marginTop: 8, display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13 }}>
        <a href={s.deployExplorer} target="_blank" rel="noopener noreferrer" style={{ color: "var(--blue)", fontWeight: 600 }}>Delegation deploy ↗</a>
        <a href={s.validatorExplorer} target="_blank" rel="noopener noreferrer" style={{ color: "var(--blue)", fontWeight: 600 }}>Validator ↗</a>
        <span style={{ color: "var(--faint)" }}>same &ldquo;real native yield&rdquo; a top rival claims — here it&apos;s on-chain, quantified, and checkable</span>
      </div>
    </div>
  );
}
