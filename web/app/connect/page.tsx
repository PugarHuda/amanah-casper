"use client";

import Nav from "@/components/Nav";
import { useCsprClick } from "@/lib/useCsprClick";
import { WALLET_KEYS } from "@make-software/csprclick-core-types";

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
  const { account, ready, error, appId, signIn, connect, signOut } = useCsprClick();

  const onRow = (action: string) => {
    if (action === "signIn") signIn();
    else connect(action);
  };

  return (
    <main className="page">
      <div className="card">
        <Nav active="connect" />

        {/* CSPR.click hosted SDK mounts its account widget here (kept minimal). */}
        <div id="csprclick-ui" />

        <div className="two-col" style={{ marginTop: 60, alignItems: "stretch" }}>
          {/* LEFT FORM */}
          <div style={{ maxWidth: 592 }}>
            <div className="serif" style={{ fontSize: 46, fontWeight: 400, color: "var(--ink)", letterSpacing: "-1px" }}>
              Connect to amanah
            </div>
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
                <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
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
