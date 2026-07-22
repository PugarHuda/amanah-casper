"use client";

// Human approval inbox — the EU AI Act Article 14 human-oversight path, made real.
// When the agent isn't confident enough to act (or the guard tainted a cycle), it does NOT
// execute: it escalates. Those decisions land here, and a human auditor approves or rejects
// each one with a REAL on-chain vote through the interactive quorum. Not a notification —
// a signed, verifiable act of oversight.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import { useCsprClick } from "@/lib/useCsprClick";

const EXPLORER = "https://testnet.cspr.live";
type Item = { hash: string; cycle: number | null; confidence: number | null; summary: string; at: string | null; reason: string };
type Vote = { approvals: number; threshold: number; registered: boolean; approved: boolean };

export default function Govern() {
  const { account, ready, error, signIn, send } = useCsprClick();
  const [items, setItems] = useState<Item[] | null>(null);
  const [votes, setVotes] = useState<Record<string, Vote | null>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ hash: string; kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/pending").then((r) => r.json()).then((d) => setItems(d.items ?? [])).catch(() => setItems([]));
  }, []);

  const loadVote = useCallback(
    async (hash: string) => {
      if (!account) return;
      const r = await fetch(`/api/vote-state?pk=${account.public_key}&hash=${hash}`).then((x) => (x.ok ? x.json() : null)).catch(() => null);
      setVotes((v) => ({ ...v, [hash]: r }));
    },
    [account],
  );
  useEffect(() => {
    if (account && items) items.forEach((it) => loadVote(it.hash));
  }, [account, items, loadVote]);

  async function act(hash: string, action: "register" | "vote", approve?: boolean) {
    if (!account) return;
    setBusy(`${hash}:${action}:${approve}`);
    setMsg(null);
    try {
      const r = await fetch("/api/build-vote", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, pk: account.public_key, approve, hash }),
      });
      const { transaction, error: e } = await r.json();
      if (!r.ok || !transaction) throw new Error(e || "couldn't build the transaction");
      const tx = await send(transaction, account.public_key);
      setMsg({ hash, kind: "ok", text: `Submitted on-chain: ${tx.slice(0, 18)}…` });
      setTimeout(() => loadVote(hash), 6000);
      setTimeout(() => loadVote(hash), 14000);
    } catch (e) {
      setMsg({ hash, kind: "err", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="page">
      <div className="card">
        <Nav />
        <div style={{ marginTop: 44 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span className="pulse-dot" />
            <span className="mono" style={{ fontSize: 12, letterSpacing: "2px", color: "var(--faint)" }}>HUMAN OVERSIGHT · ON-CHAIN SIGN-OFF</span>
          </div>
          <h1 className="serif" style={{ margin: "10px 0 0", fontSize: 42, fontWeight: 400, color: "var(--ink)", letterSpacing: "-0.8px" }}>
            Approval inbox
          </h1>
          <p style={{ margin: "12px 0 0", fontSize: 15, color: "var(--muted, #6b6b6b)", maxWidth: 760, lineHeight: 1.6 }}>
            When the agent isn&apos;t sure — low confidence, or a guard tainted the cycle — it does
            not act. It <strong>escalates</strong> to a human. Each decision below is awaiting an
            auditor&apos;s sign-off, cast as a <strong>real on-chain vote</strong>, not a click in a
            dashboard. This is the human-in-the-loop the EU AI Act Article 14 asks for — made
            verifiable. <Link href="/compliance" style={{ color: "var(--blue)" }}>See the oversight evidence →</Link>
          </p>
        </div>

        {/* connect gate — anyone can READ the queue; voting needs a wallet */}
        {!account && (
          <div style={{ marginTop: 22, padding: "14px 18px", border: "1px solid var(--border2)", borderRadius: 14, background: "var(--surface-subtle)", fontSize: 14, color: "var(--body)" }}>
            You can read every pending decision without connecting. To cast a vote,{" "}
            <button onClick={() => ready && signIn()} style={{ background: "none", border: "none", padding: 0, cursor: ready ? "pointer" : "wait", color: "var(--blue)", fontWeight: 700, fontSize: 14 }}>
              connect a wallet
            </button>{" "}
            and join the open auditor registry. {error && <span style={{ color: "var(--faint)" }}>({error})</span>}
          </div>
        )}

        <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 14 }}>
          {items === null ? (
            <span style={{ fontSize: 13, color: "var(--faint)" }}>Loading the queue…</span>
          ) : items.length === 0 ? (
            <span style={{ fontSize: 13, color: "var(--faint)" }}>No decisions are awaiting sign-off right now.</span>
          ) : (
            items.map((it) => {
              const v = votes[it.hash];
              const pct = v && v.threshold ? Math.min(100, Math.round((v.approvals / v.threshold) * 100)) : 0;
              return (
                <div key={it.hash} style={{ padding: "18px 20px", border: "1px solid var(--border2)", borderRadius: 16, background: "var(--surface, #fff)" }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 999, background: "#fbeaea", color: "#b3382c" }}>ESCALATED</span>
                    <span style={{ fontSize: 12, color: "var(--faint)" }}>{it.reason}</span>
                    {it.confidence != null && <span style={{ fontSize: 12, color: "var(--faint)" }}>· confidence {it.confidence.toFixed(2)}</span>}
                    {it.cycle != null && <span style={{ fontSize: 12, color: "var(--faint)" }}>· cycle #{it.cycle}</span>}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 14.5, color: "var(--ink)", lineHeight: 1.5 }}>{it.summary}</div>
                  <a href={`${EXPLORER}/deploy/${it.hash}`} target="_blank" rel="noopener noreferrer" className="mono" style={{ display: "inline-block", marginTop: 8, fontSize: 11, color: "var(--blue)", wordBreak: "break-all" }}>
                    decision {it.hash.slice(0, 32)}… ↗
                  </a>

                  {/* live quorum tally + actions (only when a wallet is connected) */}
                  {account && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border2)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                        <div style={{ flex: 1, height: 8, borderRadius: 999, background: "var(--border2)", overflow: "hidden" }}>
                          <div style={{ width: `${pct}%`, height: "100%", background: v?.approved ? "var(--green-deep)" : "var(--gold, #e7a83c)", transition: "width .5s ease" }} />
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 700, color: v?.approved ? "var(--green-deep)" : "var(--ink)" }}>
                          {v ? `${v.approvals} / ${v.threshold}` : "…"}
                        </span>
                      </div>
                      {v?.approved ? (
                        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--green-deep)" }}>✓ Approved on-chain — quorum reached.</div>
                      ) : !v?.registered ? (
                        <button onClick={() => act(it.hash, "register")} disabled={!!busy} className="btn-primary" style={{ width: "100%", height: 44, fontSize: 14, cursor: busy ? "wait" : "pointer", opacity: busy ? 0.6 : 1 }}>
                          {busy === `${it.hash}:register:undefined` ? "Joining the registry…" : "Join the auditor registry to vote (1 tx)"}
                        </button>
                      ) : (
                        <div style={{ display: "flex", gap: 10 }}>
                          <button onClick={() => act(it.hash, "vote", true)} disabled={!!busy} className="btn-primary" style={{ flex: 1, height: 44, fontSize: 14, cursor: busy ? "wait" : "pointer", opacity: busy ? 0.6 : 1 }}>
                            Approve
                          </button>
                          <button onClick={() => act(it.hash, "vote", false)} disabled={!!busy} style={{ flex: 1, height: 44, borderRadius: 12, border: "1px solid var(--border)", background: "transparent", cursor: busy ? "wait" : "pointer", fontSize: 14, fontWeight: 600, color: "var(--ink2)", opacity: busy ? 0.6 : 1 }}>
                            Reject
                          </button>
                        </div>
                      )}
                      {msg && msg.hash === it.hash && (
                        <div style={{ marginTop: 10, fontSize: 13, color: msg.kind === "ok" ? "var(--green-deep)" : "#b3382c", wordBreak: "break-all" }}>{msg.text}</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </main>
  );
}
