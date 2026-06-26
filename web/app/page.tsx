import Link from "next/link";
import Nav from "@/components/Nav";
import HeroWave from "@/components/HeroWave";

const stack = [
  { label: "Casper", icon: (<><circle cx="10" cy="10" r="8" stroke="#1d1a15" strokeWidth="2" fill="none" /><circle cx="10" cy="10" r="2.6" fill="#1d1a15" /></>) },
  { label: "CSPR.cloud", icon: <rect x="2" y="2" width="16" height="16" rx="5" fill="#1d1a15" /> },
  { label: "Claude", icon: <rect x="10" y="2.5" width="10.6" height="10.6" transform="rotate(45 10 2.5)" fill="#1d1a15" /> },
  { label: "x402", icon: <rect x="3" y="3" width="14" height="14" rx="2" stroke="#1d1a15" strokeWidth="2.2" fill="none" /> },
  { label: "IPFS", icon: <path d="M10 2l8 14H2z" fill="#1d1a15" /> },
];

export default function Landing() {
  return (
    <main className="page">
      <div className="card">
        <Nav />

        <section style={{ textAlign: "center", paddingTop: 70 }}>
          <h1
            className="serif hero-h1"
            style={{ margin: 0, fontWeight: 400, fontSize: 92, lineHeight: 1.03, letterSpacing: "-1.6px", color: "var(--ink)", textWrap: "balance" }}
          >
            A verifiable guardian
            <br />
            for every asset
          </h1>
          <p style={{ margin: "26px auto 0", maxWidth: 760, fontSize: 19, fontWeight: 500, color: "var(--body)", letterSpacing: "0.1px" }}>
            Autonomous, compliant RWA treasury — every decision proven on-chain, 24/7
          </p>

          <div style={{ marginTop: 34, display: "flex", gap: 14, alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
            <Link
              href="/agent"
              style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 11, background: "#15120e", color: "#fff", fontSize: 16, fontWeight: 600, padding: "15px 26px 15px 22px", borderRadius: 999, boxShadow: "var(--cta-shadow)" }}
            >
              <svg width="17" height="17" viewBox="0 0 17 17" fill="none">
                <circle cx="3" cy="3" r="1.7" fill="currentColor" />
                <circle cx="8.5" cy="3" r="1.7" fill="currentColor" opacity="0.5" />
                <circle cx="3" cy="8.5" r="1.7" fill="currentColor" opacity="0.5" />
                <circle cx="8.5" cy="8.5" r="1.7" fill="currentColor" />
                <circle cx="14" cy="8.5" r="1.7" fill="currentColor" opacity="0.5" />
                <circle cx="8.5" cy="14" r="1.7" fill="currentColor" opacity="0.5" />
              </svg>
              See it reason
            </Link>
            <Link
              href="/dashboard"
              style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 9, color: "#15120e", fontSize: 16, fontWeight: 600, padding: "15px 24px", borderRadius: 999, border: "1px solid #d8d2c4" }}
            >
              Open dashboard
              <svg width="8" height="13" viewBox="0 0 8 13" fill="none">
                <path d="M1 1l5.5 5.5L1 12" stroke="#15120e" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            </Link>
          </div>
        </section>

        <div style={{ marginTop: 24 }}>
          <HeroWave />
        </div>

        <div style={{ textAlign: "center", marginTop: 8, fontSize: 11, fontWeight: 600, letterSpacing: "2.4px", color: "var(--faint2)" }}>
          BUILT ON THE CASPER TRUST LAYER
        </div>
        <div style={{ marginTop: 28, display: "flex", alignItems: "center", justifyContent: "center", gap: 62, flexWrap: "wrap", color: "#1d1a15" }}>
          {stack.map((s) => (
            <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <svg width="20" height="20" viewBox="0 0 20 20">{s.icon}</svg>
              <span style={{ fontSize: 21, fontWeight: 700, letterSpacing: "-0.3px" }}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
