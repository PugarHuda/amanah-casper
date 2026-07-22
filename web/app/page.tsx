import Link from "next/link";
import Nav from "@/components/Nav";
import HeroWave from "@/components/HeroWave";

const stack = [
  { label: "Casper", icon: (<><circle cx="10" cy="10" r="8" stroke="#1d1a15" strokeWidth="2" fill="none" /><circle cx="10" cy="10" r="2.6" fill="#1d1a15" /></>) },
  { label: "CSPR.cloud", icon: <rect x="2" y="2" width="16" height="16" rx="5" fill="#1d1a15" /> },
  { label: "Venice", icon: <rect x="10" y="2.5" width="10.6" height="10.6" transform="rotate(45 10 2.5)" fill="#1d1a15" /> },
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
            {/* Connect first — that is the entrance. But the dashboard stays open to
                anyone: the whole claim is "don't trust us, verify", and an auditor who
                has to sign in before they can check is not auditing. */}
            <Link
              href="/connect"
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
              Connect wallet
            </Link>
            <Link
              href="/dashboard"
              style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 9, color: "#15120e", fontSize: 16, fontWeight: 600, padding: "15px 24px", borderRadius: 999, border: "1px solid #d8d2c4" }}
            >
              Explore without connecting
              <svg width="8" height="13" viewBox="0 0 8 13" fill="none">
                <path d="M1 1l5.5 5.5L1 12" stroke="#15120e" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            </Link>
          </div>
        </section>

        <div style={{ marginTop: 24 }}>
          <HeroWave />
        </div>

        {/* Don't trust us — check us. The three interactive proofs a reviewer can run in
            minutes, made discoverable instead of buried in the nav. Each is a live action,
            not a screenshot. */}
        <div style={{ marginTop: 4, textAlign: "center", fontSize: 11, fontWeight: 600, letterSpacing: "2.4px", color: "var(--faint2)" }}>
          DON&apos;T TRUST US — CHECK US, IN MINUTES
        </div>
        <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
          {[
            { href: "/verify", tag: "RE-RUN THE PROOF", title: "Verify our cryptography in your browser", body: "Re-run the ZK proof-of-solvency on your machine, then tamper with it and watch it break. The agent's red team is here too — 7/7 prompt-injection attacks blocked." },
            { href: "/connect", tag: "CAST A REAL VOTE", title: "Approve a decision on-chain yourself", body: "Connect a wallet, join the open auditor registry, and cast a real testnet vote. One approval is already in — yours reaches the quorum, live." },
            { href: "/compliance", tag: "THE REGULATOR ARTIFACT", title: "The exception report a compliance officer asks for", body: "Every transaction a control refused, generated from the chain, with the policy-vs-platform split and scope limits stated plainly." },
          ].map((c) => (
            <Link key={c.href} href={c.href} style={{ textDecoration: "none", display: "block", padding: "18px 20px", border: "1px solid var(--border2)", borderRadius: 16, background: "var(--surface-subtle)", transition: "border-color .15s ease" }}>
              <div className="mono" style={{ fontSize: 10.5, letterSpacing: "1.6px", color: "var(--faint)" }}>{c.tag}</div>
              <div style={{ marginTop: 8, fontSize: 16, fontWeight: 700, color: "var(--ink)", lineHeight: 1.3 }}>{c.title}</div>
              <div style={{ marginTop: 6, fontSize: 13, color: "var(--body)", lineHeight: 1.5 }}>{c.body}</div>
              <div style={{ marginTop: 10, fontSize: 13, fontWeight: 600, color: "var(--blue, #2f6fdb)" }}>Try it →</div>
            </Link>
          ))}
        </div>

        <div style={{ textAlign: "center", marginTop: 44, fontSize: 11, fontWeight: 600, letterSpacing: "2.4px", color: "var(--faint2)" }}>
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
