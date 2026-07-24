"use client";

// User alerting — a bell in the nav that polls /api/alerts (chain-derived material
// events: a control that fired, a freeze, an insolvency) and raises a BROWSER
// notification on anything new. Opt-in: the first click asks for notification
// permission. Seen events are remembered in localStorage so you're only alerted once.
// Every alert links to its on-chain deploy, so it's a verifiable event, not a toast.
import { useEffect, useRef, useState } from "react";

type Alert = { id: string; at: string | null; severity: "high" | "info"; title: string; detail: string; deploy: string | null };
const SEEN_KEY = "amanah.alerts.seen";

const when = (t: string | null) => {
  if (!t) return "now";
  const s = Math.round((Date.now() - Date.parse(t)) / 1000);
  return s < 90 ? `${s}s ago` : s < 5400 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`;
};

export default function AlertBell() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [open, setOpen] = useState(false);
  const [unseen, setUnseen] = useState(0);
  const seenRef = useRef<Set<string>>(new Set());
  const first = useRef(true);

  useEffect(() => {
    try { seenRef.current = new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || "[]")); } catch {}
    const load = async () => {
      try {
        const { alerts } = (await (await fetch("/api/alerts")).json()) as { alerts: Alert[] };
        setAlerts(alerts);
        const fresh = alerts.filter((a) => !seenRef.current.has(a.id));
        setUnseen(fresh.length);
        // Don't fire a burst of notifications for the backlog on first load — only new arrivals.
        if (!first.current && typeof Notification !== "undefined" && Notification.permission === "granted") {
          for (const a of fresh.filter((a) => a.severity === "high").slice(0, 3)) {
            new Notification(`Amanah — ${a.title}`, { body: a.detail, tag: a.id });
          }
        }
        first.current = false;
      } catch {}
    };
    load();
    const id = setInterval(load, 25_000);
    return () => clearInterval(id);
  }, []);

  const toggle = async () => {
    if (!open && typeof Notification !== "undefined" && Notification.permission === "default") {
      try { await Notification.requestPermission(); } catch {}
    }
    if (!open) {
      // Opening marks everything seen.
      alerts.forEach((a) => seenRef.current.add(a.id));
      try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seenRef.current].slice(-200))); } catch {}
      setUnseen(0);
    }
    setOpen((v) => !v);
  };

  return (
    <div style={{ position: "relative" }}>
      <button onClick={toggle} aria-label="alerts" title="Treasury alerts"
        style={{ position: "relative", background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex", alignItems: "center", color: "var(--ink2)" }}>
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
          <path d="M10 2a5 5 0 0 0-5 5v3l-1.5 2.5h13L15 10V7a5 5 0 0 0-5-5ZM8 16a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {unseen > 0 && (
          <span style={{ position: "absolute", top: -1, right: -1, minWidth: 15, height: 15, padding: "0 3px", borderRadius: 999, background: "#d24a3d", color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{unseen}</span>
        )}
      </button>
      {open && (
        <div style={{ position: "absolute", right: 0, top: 30, width: 340, maxHeight: 420, overflowY: "auto", zIndex: 50, background: "var(--surface, #fff)", border: "1px solid var(--border)", borderRadius: 14, boxShadow: "0 12px 32px rgba(0,0,0,0.18)", padding: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--faint)", padding: "6px 10px", letterSpacing: "0.3px" }}>TREASURY ALERTS</div>
          {alerts.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--faint)", padding: "10px 12px" }}>No control events — everything nominal.</div>
          ) : alerts.map((a) => (
            <a key={a.id} href={a.deploy ? `https://testnet.cspr.live/deploy/${a.deploy}` : undefined} target="_blank" rel="noopener noreferrer"
              style={{ display: "block", padding: "9px 11px", borderRadius: 9, textDecoration: "none", borderLeft: `3px solid ${a.severity === "high" ? "#d24a3d" : "#c9a227"}` }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{a.title}</div>
              <div style={{ fontSize: 12, color: "var(--body)", marginTop: 2, lineHeight: 1.4 }}>{a.detail}</div>
              <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 3 }}>{when(a.at)}{a.deploy ? " · verify on-chain ↗" : ""}</div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
