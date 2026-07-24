"use client";

// C3 — live proof the hosted loop is running. Polls /api/heartbeat (chain-derived: the
// agent attests every cycle, so the last AttestationLog deploy is its last heartbeat).
// Green + "42s ago" when alive; red "stale" if the hosted process has stopped attesting.
import { useEffect, useState } from "react";

type HB = {
  configured: boolean; alive: boolean; lastCycleAt: string | null;
  agoSeconds: number | null; expectedIntervalSec: number;
  recent: { at: string; deploy: string; ok: boolean }[];
};

const ago = (s: number) => (s < 90 ? `${s}s` : s < 5400 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`);

export default function Heartbeat() {
  const [hb, setHb] = useState<HB | null>(null);
  useEffect(() => {
    const load = () => fetch("/api/heartbeat").then((r) => r.json()).then(setHb).catch(() => {});
    load();
    const id = setInterval(load, 20_000);
    return () => clearInterval(id);
  }, []);

  if (!hb || !hb.configured) return null;
  const color = hb.alive ? "var(--green-deep)" : "#b3382c";
  const bg = hb.alive ? "var(--ok-bg)" : "var(--bad-bg)";

  return (
    <div style={{ marginTop: 18, padding: "12px 16px", borderRadius: 12, background: bg, border: `1px solid ${hb.alive ? "#c9e7d5" : "#f0cdc9"}`, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
      <span style={{ width: 9, height: 9, borderRadius: 999, background: color, boxShadow: hb.alive ? `0 0 0 4px ${bg}` : "none", flexShrink: 0 }} className={hb.alive ? "pulse-dot" : ""} />
      <span style={{ fontSize: 13.5, fontWeight: 700, color }}>
        {hb.alive ? "Hosted loop live" : "Loop idle"}
      </span>
      <span style={{ fontSize: 13, color: "var(--body)" }}>
        {hb.lastCycleAt
          ? `last cycle ${ago(hb.agoSeconds ?? 0)} ago · attests on-chain every ~${hb.expectedIntervalSec}s`
          : "no cycles attested yet"}
      </span>
      {hb.recent[0]?.deploy && (
        <a href={`https://testnet.cspr.live/deploy/${hb.recent[0].deploy}`} target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 12.5, fontWeight: 600, color: "var(--blue)", marginLeft: "auto" }}>
          verify last cycle on-chain ↗
        </a>
      )}
    </div>
  );
}
