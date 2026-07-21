import Nav from "@/components/Nav";

// Instant shell shown by loading.tsx during navigation while the server component
// streams. Nav renders immediately so a page switch never feels like a dead click.
export default function PageSkeleton({ title, heading }: { title: string; heading: string }) {
  return (
    <main className="page">
      <div className="card">
        <Nav />
        <div style={{ marginTop: 44, display: "flex", alignItems: "center", gap: 14 }}>
          <span className="pulse-dot" />
          <span className="mono" style={{ fontSize: 12, letterSpacing: "2px", color: "var(--faint)" }}>
            {title} · loading live chain state…
          </span>
        </div>
        {/* The real heading, in the real style: the page has an h1 from the first
            frame (it had none while loading) and nothing jumps when data lands. */}
        <h1 className="serif" style={{ margin: "10px 0 0", fontSize: 42, fontWeight: 400, color: "var(--ink)", letterSpacing: "-0.8px" }}>
          {heading}
        </h1>
        <div style={{ marginTop: 26, display: "flex", flexDirection: "column", gap: 14 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton-row" style={{ height: 64, borderRadius: 16, animationDelay: `${i * 90}ms` }} />
          ))}
        </div>
      </div>
    </main>
  );
}
