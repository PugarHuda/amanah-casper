"use client";

import Nav from "@/components/Nav";

const Chevron = () => (
  <svg width="8" height="13" viewBox="0 0 8 13" fill="none">
    <path d="M1 1l5.5 5.5L1 12" stroke="#b7b1a6" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);

const wallets = [
  { name: "CSPR.click", icon: (<><circle cx="11" cy="11" r="9" stroke="#16130f" strokeWidth="2" fill="none" /><circle cx="11" cy="11" r="3" fill="#16130f" /></>) },
  { name: "Casper Wallet", icon: <rect x="3" y="3" width="16" height="16" rx="5" fill="#16130f" /> },
  { name: "Ledger", icon: <rect x="6" y="2" width="11" height="11" transform="rotate(45 6 2)" fill="#16130f" /> },
];

export default function Connect() {
  // ponytail: stubbed. Wire CSPR.click SDK here (init provider, request connect,
  // store {provider, address, status}); email path -> magic-link request endpoint.
  const connectWallet = (name: string) => alert(`Connect ${name} — wire CSPR.click SDK here.`);

  return (
    <main className="page">
      <div className="card">
        <Nav active="connect" />

        <div className="two-col" style={{ marginTop: 60, alignItems: "stretch" }}>
          {/* LEFT FORM */}
          <div style={{ maxWidth: 592 }}>
            <div className="serif" style={{ fontSize: 46, fontWeight: 400, color: "var(--ink)", letterSpacing: "-1px" }}>
              Connect to amanah
            </div>
            <div style={{ marginTop: 14, fontSize: 16, color: "var(--body)", lineHeight: 1.5 }}>
              Access your treasury dashboard, live agent reasoning, and on-chain attestations.
            </div>

            <div style={{ marginTop: 32, display: "flex", flexDirection: "column", gap: 12 }}>
              {wallets.map((w) => (
                <div key={w.name} className="wallet-row" onClick={() => connectWallet(w.name)}>
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

            <form onSubmit={(e) => { e.preventDefault(); alert("Magic-link request — wire email endpoint here."); }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)", letterSpacing: "0.2px", marginBottom: 9 }}>
                Email for a magic link
              </div>
              <input
                type="email"
                placeholder="you@fund.com"
                style={{ width: "100%", height: 54, border: "1px solid var(--border)", borderRadius: 12, padding: "0 16px", fontSize: 15, fontFamily: "var(--font-manrope), sans-serif", color: "var(--ink)", outline: "none" }}
              />
              <button type="submit" className="btn-primary" style={{ marginTop: 12, width: "100%", height: 54, fontSize: 15 }}>
                Continue with email
              </button>
            </form>

            <div style={{ marginTop: 24, fontSize: 14, color: "#8a8479" }}>
              New to Amanah?{" "}
              <span style={{ color: "#15120e", fontWeight: 600, cursor: "pointer" }}>Request testnet access</span>
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
