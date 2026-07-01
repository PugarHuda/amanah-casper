"use client";
// Live on-chain event feed, powered by the CSPR.cloud Streaming API via our SSE
// relay at /api/stream. Shows contract-level (CES) events the agent's contracts
// emit — attestations, reallocations, payment credits — the moment they land,
// no polling. Each event deep-links to its deploy on cspr.live.
import { useEffect, useRef, useState } from "react";

type FeedEvent = {
  id: number;
  label: string;
  name: string;
  deploy_hash: string | null;
  timestamp: string | null;
};

export default function LiveFeed() {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [status, setStatus] = useState<"connecting" | "live" | "off">("connecting");
  const idRef = useRef(0);

  useEffect(() => {
    const es = new EventSource("/api/stream");
    es.onopen = () => setStatus("live");
    es.onerror = () => setStatus((s) => (s === "live" ? "live" : "off"));
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "ready") setStatus("live");
        // An upstream contract socket dropped — reflect it instead of a false "live".
        if (msg.type === "warn") setStatus("off");
        if (msg.type === "event") {
          setEvents((prev) =>
            [{ id: idRef.current++, label: msg.label, name: msg.name, deploy_hash: msg.deploy_hash, timestamp: msg.timestamp }, ...prev].slice(0, 8),
          );
        }
      } catch {
        /* ignore */
      }
    };
    return () => es.close();
  }, []);

  const dot = status === "live" ? "#3fae6a" : status === "off" ? "#c0392b" : "#cdbfa6";
  const label = status === "live" ? "LIVE · streaming" : status === "off" ? "stream offline" : "connecting…";

  return (
    <div style={{ marginTop: 24, border: "1px solid var(--border2)", borderRadius: 18, background: "var(--surface-subtle)", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid var(--border2)" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink2)", letterSpacing: "0.3px" }}>CSPR.CLOUD STREAMING · CONTRACT EVENTS</div>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: dot }} />
          <span className="mono" style={{ fontSize: 11, color: "var(--faint)" }}>{label}</span>
        </div>
      </div>
      <div data-testid="live-feed-body" style={{ padding: "6px 0", minHeight: 56 }}>
        {events.length === 0 ? (
          <div style={{ padding: "16px 18px", fontSize: 13, color: "var(--faint)" }}>
            Listening for on-chain events… run an agent cycle (<span className="mono">MAX_CYCLES=1 npm run dev</span>) to see attestations stream in live.
          </div>
        ) : (
          events.map((ev) => (
            <a
              key={ev.id}
              href={ev.deploy_hash ? `https://testnet.cspr.live/deploy/${ev.deploy_hash}` : "https://testnet.cspr.live"}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 18px", textDecoration: "none", borderBottom: "1px solid var(--border3)" }}
            >
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#3fae6a", flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>
                {ev.name} <span style={{ color: "var(--faint)", fontWeight: 400 }}>· {ev.label}</span>
              </span>
              {ev.deploy_hash && (
                <span className="mono" style={{ fontSize: 11, color: "var(--blue)" }}>
                  {ev.deploy_hash.slice(0, 6)}…{ev.deploy_hash.slice(-4)}
                </span>
              )}
            </a>
          ))
        )}
      </div>
    </div>
  );
}
