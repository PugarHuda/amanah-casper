"use client";

// One-click self-audit, front and centre. Runs every headline claim against the live chain
// (via /api/scorecard) and shows a single "N/N verified live" verdict a judge reads in
// seconds — then each row with its on-chain proof. No rival lets you confirm their whole
// system this fast; that's the point.
import { useEffect, useState } from "react";

type Check = { claim: string; pass: boolean; detail: string; proof?: string | null };
type Score = {
  configured: boolean;
  score?: { passed: number; total: number; allGreen: boolean };
  hostedLoop?: { alive: boolean; lastCycleAgoSeconds: number | null } | null;
  checks?: Check[];
};

export default function ScoreCard() {
  const [s, setS] = useState<Score | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(true);
  useEffect(() => {
    fetch("/api/scorecard").then((r) => r.json()).then(setS).catch(() => setFailed(true));
  }, []);

  // Show a live "running" state while the checks read the chain, so the flagship feature never
  // renders as a blank gap. Disappears once data arrives (or on a hard failure).
  if (!s && !failed) {
    return (
      <section style={{ border: "1px solid var(--border2)", borderRadius: 18, padding: "18px 22px", background: "var(--surface-subtle)", marginBottom: 18, display: "flex", alignItems: "center", gap: 12 }}>
        <span className="pulse-dot" style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 14.5, color: "var(--body)" }}>Running the live self-audit — checking every claim against the chain…</span>
      </section>
    );
  }
  if (failed || !s || !s.configured || !s.score) return null;
  const { passed, total, allGreen } = s.score;
  const pct = Math.round((passed / total) * 100);
  const green = "var(--green-deep)";
  const amber = "#b4881f";
  const headColor = allGreen ? green : amber;

  return (
    <section style={{ border: `1px solid ${allGreen ? "#bfe6cd" : "#ecdcb0"}`, borderRadius: 18, padding: "20px 22px", background: "var(--surface-subtle)", marginBottom: 18 }}>
      <button onClick={() => setOpen((v) => !v)} style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 14, width: "100%", flexWrap: "wrap" }}>
        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 46, height: 46, borderRadius: 12, background: allGreen ? "var(--ok-bg)" : "#faf1da", color: headColor, fontWeight: 800, fontSize: 15, flexShrink: 0 }}>
          {passed}/{total}
        </span>
        <span style={{ flex: 1, minWidth: 200 }}>
          <span className="serif" style={{ display: "block", fontSize: 21, fontWeight: 400, color: "var(--ink)" }}>
            {passed} of {total} claims verified live, on-chain, right now
          </span>
          <span style={{ fontSize: 13, color: "var(--muted, #6b6b6b)" }}>
            Read from casper-test at page load — not a screenshot. {open ? "Hide" : "Show"} the checks ↓
          </span>
        </span>
        <span aria-hidden style={{ width: 120, height: 6, borderRadius: 999, background: "var(--border2)", overflow: "hidden", flexShrink: 0 }}>
          <span style={{ display: "block", height: "100%", width: `${pct}%`, background: headColor }} />
        </span>
      </button>

      {open && s.checks && (
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 7 }}>
          {s.checks.map((c) => (
            <div key={c.claim} style={{ display: "flex", gap: 11, alignItems: "flex-start", padding: "8px 10px", borderRadius: 10, background: c.pass ? "var(--ok-bg)" : "#faf1da" }}>
              <span style={{ color: c.pass ? green : amber, fontWeight: 800, fontSize: 14, lineHeight: "20px", flexShrink: 0 }}>{c.pass ? "✓" : "○"}</span>
              <span style={{ flex: 1 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>{c.claim}</span>
                <span style={{ display: "block", fontSize: 12.5, color: "var(--body)", marginTop: 1 }}>{c.detail}</span>
              </span>
              {c.proof && (
                <a href={c.proof} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, fontWeight: 600, color: "var(--blue)", whiteSpace: "nowrap", lineHeight: "20px" }}>proof ↗</a>
              )}
            </div>
          ))}
          {s.hostedLoop && (
            <div style={{ fontSize: 12, color: "var(--faint)", marginTop: 4 }}>
              Hosted loop: {s.hostedLoop.alive ? "live" : "idle"}{s.hostedLoop.lastCycleAgoSeconds != null ? ` (last cycle ${Math.round(s.hostedLoop.lastCycleAgoSeconds / 60)}m ago)` : ""} — not counted toward the score; see HOSTING.md.
            </div>
          )}
        </div>
      )}
    </section>
  );
}
