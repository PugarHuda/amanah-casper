"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { useCsprClick } from "@/lib/useCsprClick";
import { WALLET_KEYS } from "@make-software/csprclick-core-types";
import type { KeyIdentity } from "@/lib/cspr";

type VoteState = { approvals: number; threshold: number; registered: boolean; approved: boolean; pendingHash: string };

// The auditor-vote panel: this is where "connect wallet" stops being decorative. A
// connected wallet can join the open auditor registry and cast a REAL on-chain vote on a
// pending decision. The wallet signs the deploy; the contract authenticates by caller.
// One approval is already seeded, so a single connecting auditor is the deciding vote —
// press Approve and watch the on-chain tally reach quorum.
function AuditorVoteCard({ pk, send }: { pk: string; send: (tx: object, pk: string) => Promise<string> }) {
  const [st, setSt] = useState<VoteState | null | false>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = () =>
    fetch(`/api/vote-state?pk=${pk}`)
      .then((r) => (r.ok ? r.json() : false))
      .then(setSt)
      .catch(() => setSt(false));
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [pk]);

  async function act(action: "register" | "vote", approve?: boolean) {
    setBusy(action === "register" ? "Joining the registry…" : approve ? "Casting APPROVE…" : "Casting REJECT…");
    setMsg(null);
    try {
      const r = await fetch("/api/build-vote", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, pk, approve }),
      });
      const { transaction, error } = await r.json();
      if (!r.ok || !transaction) throw new Error(error || "couldn't build the transaction");
      const hash = await send(transaction, pk);
      setMsg({ kind: "ok", text: `Submitted on-chain: ${hash.slice(0, 16)}…` });
      // Give the node a few seconds to execute, then re-read the live tally.
      setTimeout(load, 6000);
      setTimeout(load, 14000);
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  if (st === null) return <div style={{ marginTop: 16, fontSize: 13, color: "var(--muted)" }}>Loading the pending decision…</div>;
  if (st === false)
    return <div style={{ marginTop: 16, fontSize: 13, color: "var(--muted)" }}>Interactive quorum unavailable right now.</div>;

  const pct = st.threshold ? Math.min(100, Math.round((st.approvals / st.threshold) * 100)) : 0;
  return (
    <div style={{ marginTop: 16, padding: "18px 20px", border: "1px solid var(--border2)", borderRadius: 16, background: "var(--surface, #fff)" }}>
      <div className="mono" style={{ fontSize: 11, letterSpacing: "1.6px", color: "var(--faint)" }}>
        CAST A REAL AUDITOR VOTE — ON-CHAIN
      </div>
      <div style={{ marginTop: 8, fontSize: 14, color: "var(--body)", lineHeight: 1.55 }}>
        A pending decision is awaiting the K-of-N quorum the vault enforces. Your wallet signs the
        deploy; the contract counts your vote by the account that signed it. This is a live testnet
        transaction, not a mock.
      </div>
      <div className="mono" style={{ fontSize: 11, color: "var(--faint)", margin: "10px 0 6px", wordBreak: "break-all" }}>
        decision {st.pendingHash.slice(0, 24)}…
      </div>
      {/* live tally */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "6px 0 12px" }}>
        <div style={{ flex: 1, height: 8, borderRadius: 999, background: "var(--border2)", overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: st.approved ? "var(--green-deep)" : "var(--gold, #e7a83c)", transition: "width .5s ease" }} />
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: st.approved ? "var(--green-deep)" : "var(--ink)" }}>
          {st.approvals} / {st.threshold} approvals
        </span>
      </div>

      {st.approved ? (
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--green-deep)" }}>✓ Quorum reached — this decision is approved on-chain.</div>
      ) : !st.registered ? (
        <button onClick={() => act("register")} disabled={!!busy} className="btn-primary"
          style={{ width: "100%", height: 46, fontSize: 14, cursor: busy ? "wait" : "pointer", opacity: busy ? 0.6 : 1 }}>
          {busy || "Join the auditor registry (1 tx)"}
        </button>
      ) : (
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => act("vote", true)} disabled={!!busy} className="btn-primary"
            style={{ flex: 1, height: 46, fontSize: 14, cursor: busy ? "wait" : "pointer", opacity: busy ? 0.6 : 1 }}>
            {busy ? busy : "Approve"}
          </button>
          <button onClick={() => act("vote", false)} disabled={!!busy}
            style={{ flex: 1, height: 46, borderRadius: 12, border: "1px solid var(--border)", background: "transparent", cursor: busy ? "wait" : "pointer", fontSize: 14, fontWeight: 600, color: "var(--ink2)", opacity: busy ? 0.6 : 1 }}>
            Reject
          </button>
        </div>
      )}
      {st.registered && !st.approved && (
        <div style={{ marginTop: 8, fontSize: 12, color: "var(--faint)" }}>You&apos;re in the registry. One approval is already cast — yours is the deciding vote.</div>
      )}
      {msg && (
        <div style={{ marginTop: 10, fontSize: 13, color: msg.kind === "ok" ? "var(--green-deep)" : "#b3382c", wordBreak: "break-all" }}>{msg.text}</div>
      )}
    </div>
  );
}

// Renders what the chain says about the connected key. Every line is a live read —
// nothing here is inferred from the session or stored client-side.
function KeyIdentityCard({ who }: { who: KeyIdentity | null | false }) {
  if (who === null) {
    return <div style={{ marginTop: 14, fontSize: 13, color: "var(--muted)" }}>Resolving this key against the contracts…</div>;
  }
  if (who === false) {
    return <div style={{ marginTop: 14, fontSize: 13, color: "var(--muted)" }}>Could not read chain state for this key right now — role unknown, not &ldquo;none&rdquo;.</div>;
  }
  const ROLE_TEXT: Record<string, string> = {
    custodian: `Custodian — you may unfreeze the vault after a dead-man's-switch trip, set spend limits, and attest KYC and settled payments.`,
    auditor: `Registered auditor — your signature counts toward the ${who.quorumThreshold ?? "K"}-of-N quorum the vault requires before any reallocation.`,
    agent: `The treasury agent — this is the autonomous signer. Every move it proposes is still gated by the quorum, spend limits and reputation floor.`,
  };
  const rows: [string, string][] = [
    ["KYC status", who.kycStatus ?? "unknown"],
    ["Spend allowlist", who.allowlisted == null ? "unknown" : who.allowlisted ? "allowlisted" : "not allowlisted"],
    ["ZK-KYC proof", who.zkVerified == null ? "none on record" : who.zkVerified ? "verified on-chain" : "not verified"],
    ["Reputation", who.reputation == null ? "unknown" : String(who.reputation)],
  ];
  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #dcefe2" }}>
      <div className="mono" style={{ fontSize: 11, letterSpacing: "1.6px", color: "var(--faint)" }}>
        WHAT THIS KEY CAN DO — READ FROM THE CONTRACTS
      </div>
      {who.roles.length === 0 ? (
        <div style={{ marginTop: 8, fontSize: 14, color: "var(--body)", lineHeight: 1.55 }}>
          <strong>Observer.</strong> This key holds no role in this deployment — it cannot move funds, vote in the
          auditor quorum, or lift a freeze. That is not a limitation of the demo: everything worth checking is
          public anyway, which is the point.
        </div>
      ) : (
        <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 14, color: "var(--body)", lineHeight: 1.55 }}>
          {who.roles.map((r) => (
            <li key={r} style={{ marginTop: 4 }}>{ROLE_TEXT[r]}</li>
          ))}
        </ul>
      )}
      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px", fontSize: 13 }}>
        {rows.map(([k, v]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <span style={{ color: "var(--muted)" }}>{k}</span>
            <span style={{ color: "var(--ink)", fontWeight: 600 }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const Chevron = () => (
  <svg width="8" height="13" viewBox="0 0 8 13" fill="none">
    <path d="M1 1l5.5 5.5L1 12" stroke="#b7b1a6" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);

// Each row maps to a CSPR.click action. "CSPR.click" opens the full modal
// (every provider + Google/Apple social login); the named wallets connect directly.
const wallets: { name: string; action: "signIn" | string; icon: React.ReactNode }[] = [
  { name: "CSPR.click", action: "signIn", icon: (<><circle cx="11" cy="11" r="9" stroke="#16130f" strokeWidth="2" fill="none" /><circle cx="11" cy="11" r="3" fill="#16130f" /></>) },
  { name: "Casper Wallet", action: WALLET_KEYS.CASPER_WALLET, icon: <rect x="3" y="3" width="16" height="16" rx="5" fill="#16130f" /> },
  { name: "Ledger", action: WALLET_KEYS.LEDGER, icon: <rect x="6" y="2" width="11" height="11" transform="rotate(45 6 2)" fill="#16130f" /> },
];

export default function Connect() {
  const { account, ready, error, appId, signIn, connect, signOut, send } = useCsprClick();
  const router = useRouter();
  const redirected = useRef(false);
  // What the CONTRACTS say this key is. Connecting used to be decorative — it
  // authenticated you and redirected. A key only has meaning here if on-chain state
  // gives it one, so we resolve it: vault agent/custodian, quorum auditor, KYC,
  // allowlist, reputation. `null` = still resolving, `false` = unreadable.
  const [who, setWho] = useState<KeyIdentity | null | false>(null);

  useEffect(() => {
    router.prefetch("/dashboard");
    if (!account) { setWho(null); return; }
    let live = true;
    fetch(`/api/whoami?pk=${account.public_key}`)
      .then((r) => (r.ok ? r.json() : false))
      .then((d) => live && setWho(d))
      .catch(() => live && setWho(false));
    return () => { live = false; };
  }, [account, router]);

  // An observer key has nothing to be told, so send it where it wanted to go. A key
  // that the chain gives a ROLE stops here instead — being told you are the custodian
  // is the point of connecting, and flinging you to the dashboard would hide it.
  useEffect(() => {
    if (!account || who === null || redirected.current) return;
    if (who !== false && who.roles.length > 0) return;
    redirected.current = true;
    const t = setTimeout(() => router.push("/dashboard"), 900);
    return () => clearTimeout(t);
  }, [account, who, router]);

  const onRow = (action: string) => {
    if (action === "signIn") signIn();
    else connect(action);
  };

  return (
    <main className="page">
      <div className="card">
        <Nav />

        {/* CSPR.click hosted SDK mounts its account widget here (kept minimal). */}
        <div id="csprclick-ui" />

        <div className="two-col" style={{ marginTop: 60, alignItems: "stretch" }}>
          {/* LEFT FORM */}
          <div style={{ maxWidth: 592 }}>
            <h1 className="serif" style={{ margin: 0, fontSize: 46, fontWeight: 400, color: "var(--ink)", letterSpacing: "-1px" }}>
              Connect to amanah
            </h1>
            <div style={{ marginTop: 14, fontSize: 16, color: "var(--body)", lineHeight: 1.5 }}>
              Access your treasury dashboard, live agent reasoning, and on-chain attestations.
            </div>

            {account ? (
              /* CONNECTED STATE */
              <div style={{ marginTop: 32, padding: "22px 24px", border: "1px solid #dcefe2", borderRadius: 16, background: "#f4fbf6" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--green-deep)" }} />
                  <span style={{ fontSize: 14, fontWeight: 700, color: "var(--green-deep)" }}>
                    Connected via {account.provider}
                  </span>
                </div>
                <div className="mono" style={{ marginTop: 10, fontSize: 13, color: "var(--ink)", wordBreak: "break-all" }}>
                  {account.public_key}
                </div>
                <KeyIdentityCard who={who} />
                <AuditorVoteCard pk={account.public_key} send={send} />
                <button
                  onClick={() => router.push("/dashboard")}
                  className="btn-primary"
                  style={{ marginTop: 16, width: "100%", height: 50, fontSize: 15, cursor: "pointer" }}
                >
                  Enter dashboard →
                </button>
                <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
                  <a
                    href={`https://testnet.cspr.live/account/${account.public_key}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ flex: 1, textAlign: "center", padding: "12px 0", borderRadius: 12, border: "1px solid var(--border)", textDecoration: "none", fontSize: 14, fontWeight: 600, color: "var(--ink2)" }}
                  >
                    View on cspr.live ↗
                  </a>
                  <button onClick={() => signOut()} style={{ flex: 1, padding: "12px 0", borderRadius: 12, border: "1px solid var(--border)", background: "transparent", cursor: "pointer", fontSize: 14, fontWeight: 600, color: "var(--ink2)" }}>
                    Disconnect
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div style={{ marginTop: 32, display: "flex", flexDirection: "column", gap: 12 }}>
                  {wallets.map((w) => (
                    <div key={w.name} className="wallet-row" onClick={() => ready && onRow(w.action)} style={{ opacity: ready ? 1 : 0.55, cursor: ready ? "pointer" : error ? "not-allowed" : "wait" }}>
                      <svg width="22" height="22" viewBox="0 0 22 22">{w.icon}</svg>
                      <span style={{ flex: 1, fontSize: 16, fontWeight: 600, color: "var(--ink2)" }}>{w.name}</span>
                      <Chevron />
                    </div>
                  ))}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "26px 0" }}>
                  <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                  <span style={{ fontSize: 13, color: "var(--faint2)" }}>or</span>
                  <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                </div>

                {/* Email / social login routes through the same CSPR.click modal (Google/Apple). */}
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)", letterSpacing: "0.2px", marginBottom: 9 }}>
                  Sign in with email or social (Google / Apple)
                </div>
                <button onClick={() => ready && signIn()} className="btn-primary" style={{ width: "100%", height: 54, fontSize: 15, opacity: ready ? 1 : 0.55, cursor: ready ? "pointer" : error ? "not-allowed" : "wait" }}>
                  {ready ? "Continue with CSPR.click" : error ? "CSPR.click unavailable on this domain" : "Loading CSPR.click…"}
                </button>
              </>
            )}

            {error && (
              <div style={{ marginTop: 14, fontSize: 13, color: "var(--red, #c0392b)" }}>
                {error}
              </div>
            )}

            <div style={{ marginTop: 24, fontSize: 12, color: "#8a8479" }}>
              CSPR.click app: <span className="mono">{appId}</span>
              {appId === "csprclick-template" && " (template — set NEXT_PUBLIC_CSPR_CLICK_APP_ID for production)"}
            </div>
          </div>

          {/* RIGHT GRADIENT PANEL */}
          <div style={{ position: "relative", minHeight: 520, borderRadius: 22, background: "url('/blob-cool.png') center/cover", overflow: "hidden" }}>
            <div style={{ position: "absolute", left: 34, right: 34, bottom: 34, padding: "28px 30px", background: "rgba(255,255,255,0.46)", backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)", border: "1px solid rgba(255,255,255,0.6)", borderRadius: 20 }}>
              <div className="serif" style={{ fontSize: 30, fontWeight: 400, color: "#1a1610", letterSpacing: "-0.5px" }}>
                Proof, not promises.
              </div>
              <div style={{ marginTop: 10, fontSize: 15, lineHeight: 1.5, color: "#3b362c" }}>
                Every allocation is reasoned by an LLM (via Venice), signed, and attested on Casper before a single token moves.
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
