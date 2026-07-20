import Nav from "@/components/Nav";

type Active = "protocol" | "connect" | "dashboard" | "verify" | null;

// Instant shell shown by loading.tsx during navigation while the server component
// streams. Nav renders immediately so a page switch never feels like a dead click.
export default function PageSkeleton({ active = null, title }: { active?: Active; title: string }) {
  return (
    <main className="page">
      <div className="card">
        <Nav active={active} />
        <div style={{ marginTop: 44, display: "flex", alignItems: "center", gap: 14 }}>
          <span className="pulse-dot" />
          <span className="mono" style={{ fontSize: 12, letterSpacing: "2px", color: "var(--faint)" }}>
            {title} · loading live chain state…
          </span>
        </div>
        <div style={{ marginTop: 26, display: "flex", flexDirection: "column", gap: 14 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton-row" style={{ height: 64, borderRadius: 16, animationDelay: `${i * 90}ms` }} />
          ))}
        </div>
      </div>
    </main>
  );
}
