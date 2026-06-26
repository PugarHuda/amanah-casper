import Nav from "@/components/Nav";
import { getPosts } from "@/lib/data";

export default async function Writing() {
  const posts = await getPosts();

  return (
    <main className="page">
      <div className="card">
        <Nav active="writing" />

        {/* HERO */}
        <div style={{ marginTop: 60, maxWidth: 900 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "2.4px", color: "var(--faint2)" }}>WRITING</div>
          <h1 className="serif hero-h1" style={{ margin: "16px 0 0", fontSize: 54, fontWeight: 400, color: "var(--ink)", letterSpacing: "-1.2px", lineHeight: 1.06 }}>
            Notes on building
            <br />
            trust you can verify
          </h1>
          <div style={{ marginTop: 18, fontSize: 17, color: "var(--body)", lineHeight: 1.55, maxWidth: 680 }}>
            How an autonomous treasury can move real-world assets without asking you to take its word for anything.
          </div>
        </div>

        <div className="two-col" style={{ marginTop: 48, alignItems: "start" }}>
          {/* FEATURED */}
          <a href="#" style={{ position: "relative", display: "block", minHeight: 476, borderRadius: 22, overflow: "hidden", textDecoration: "none", background: "url('/blob-warm.png') center/cover" }}>
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "34px 36px", background: "linear-gradient(180deg, rgba(20,15,8,0) 0%, rgba(20,15,8,0.62) 100%)" }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "1.6px", color: "rgba(255,255,255,0.85)" }}>FEATURED · 9 MIN READ</div>
              <div className="serif" style={{ marginTop: 12, fontSize: 34, fontWeight: 500, color: "#fff", letterSpacing: "-0.5px", lineHeight: 1.12 }}>
                Proof-of-reasoning: binding an AI&apos;s decisions to the chain
              </div>
              <div style={{ marginTop: 10, fontSize: 15, color: "rgba(255,255,255,0.82)", lineHeight: 1.5 }}>
                Why a signed hash beats a database log — and how anyone can recompute it.
              </div>
            </div>
          </a>

          {/* ARTICLE LIST */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            {posts.map((p) => (
              <a key={p.title} href="#" className="post-row">
                <div className="serif" style={{ width: 96, flexShrink: 0, fontSize: 15, color: "var(--faint2)", paddingTop: 3 }}>{p.date}</div>
                <div style={{ flex: 1 }}>
                  <div className="serif" style={{ fontSize: 23, fontWeight: 500, color: "var(--ink)", letterSpacing: "-0.3px", lineHeight: 1.25 }}>{p.title}</div>
                  <div style={{ marginTop: 7, fontSize: 14.5, color: "var(--muted)", lineHeight: 1.5 }}>{p.excerpt}</div>
                  <div style={{ marginTop: 9, fontSize: 12, fontWeight: 600, letterSpacing: "0.4px", color: p.tagColor }}>{p.tag}</div>
                </div>
              </a>
            ))}
          </div>
        </div>

        {/* NEWSLETTER */}
        <div className="nl-block" style={{ position: "relative", marginTop: 48, borderRadius: 24, background: "var(--ink)", overflow: "hidden", padding: "54px 60px", color: "#fff" }}>
          <div style={{ maxWidth: 560, position: "relative", zIndex: 1 }}>
            <div className="serif" style={{ fontSize: 40, fontWeight: 400, letterSpacing: "-0.8px", lineHeight: 1.1 }}>Follow the build</div>
            <div style={{ marginTop: 14, fontSize: 16, color: "rgba(255,255,255,0.66)", lineHeight: 1.55 }}>
              Engineering notes, on-chain experiments, and every milestone toward a fully autonomous, compliant RWA treasury.
            </div>
            <div style={{ marginTop: 30, display: "flex", gap: 12, flexWrap: "wrap" }}>
              <input
                type="email"
                placeholder="you@fund.com"
                style={{ flex: "1 1 220px", height: 56, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 14, padding: "0 18px", fontSize: 15, color: "#fff", fontFamily: "var(--font-manrope), sans-serif", outline: "none" }}
              />
              <button style={{ height: 56, padding: "0 28px", background: "#fff", color: "var(--ink)", border: "none", borderRadius: 14, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-manrope), sans-serif", whiteSpace: "nowrap" }}>
                Subscribe
              </button>
            </div>
          </div>
          <div style={{ position: "absolute", right: -60, top: -40, width: 460, height: 460, background: "url('/blob-cool.png') center/cover", borderRadius: "50%", opacity: 0.92 }} />
        </div>
      </div>
    </main>
  );
}
