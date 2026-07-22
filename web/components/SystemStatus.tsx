"use client";
// Live system-status pill — reads /api/health (which exercises the on-chain reads the
// product depends on). Makes uptime monitoring visible: green only when the chain-backed
// features actually work, not just when the web server is up.
import { useEffect, useState } from "react";

export default function SystemStatus() {
  const [s, setS] = useState<{ status: string } | null | false>(null);
  useEffect(() => {
    fetch("/api/health").then((r) => r.json()).then(setS).catch(() => setS(false));
  }, []);
  const ok = typeof s === "object" && s !== null && s.status === "ok";
  const label = s === null ? "checking…" : s === false ? "status unknown" : ok ? "all systems operational" : "degraded";
  const color = s === null ? "var(--faint)" : ok ? "var(--green-deep)" : "#b3382c";
  return (
    <a href="/api/health" target="_blank" rel="noopener noreferrer"
      style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, color, textDecoration: "none", fontWeight: 600 }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, display: "inline-block" }} />
      {label}
    </a>
  );
}
