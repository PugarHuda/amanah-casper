"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const Logo = () => (
  <svg width="26" height="22" viewBox="0 0 26 22" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="1" width="11" height="3.4" rx="1.7" fill="#16130f" />
    <rect x="14" y="1" width="7" height="3.4" rx="1.7" fill="#16130f" />
    <rect x="4" y="9.3" width="18" height="3.4" rx="1.7" fill="#16130f" />
    <rect x="0" y="17.6" width="8" height="3.4" rx="1.7" fill="#16130f" />
    <rect x="11" y="17.6" width="13" height="3.4" rx="1.7" fill="#16130f" />
  </svg>
);

// Ordered the way the story reads: see the treasury → check the proof yourself →
// the artifact a regulator asks for → how the loop works. Each label names its
// destination; the old "Protocol" pointed at the agent console and carried a
// chevron that opened nothing.
const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/verify", label: "Verify" },
  { href: "/compliance", label: "Evidence" },
  { href: "/agent", label: "How it works" },
];

export default function Nav() {
  // Derived from the URL so a page can't forget to mark itself current —
  // /verify and /compliance passed active={null} and never highlighted.
  const path = usePathname();
  const cur = (href: string) => (path === href ? "page" : undefined);
  return (
    <nav className="nav">
      <Link href="/" aria-label="amanah home" style={{ display: "flex", alignItems: "center", gap: 11, textDecoration: "none" }}>
        <Logo />
        <span style={{ fontSize: 23, fontWeight: 600, letterSpacing: "-0.4px", color: "#16130f" }}>amanah</span>
      </Link>
      <div className="nav-links">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className={path === l.href ? "active" : undefined} aria-current={cur(l.href)}>
            {l.label}
          </Link>
        ))}
        <a href="https://github.com/PugarHuda/amanah-casper#readme" target="_blank" rel="noopener noreferrer" className="nav-ext">
          Spec
          <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden="true">
            <path d="M2.5 7.5L7.5 2.5M7.5 2.5H3.5M7.5 2.5V6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
        <Link href="/connect" className="nav-cta" aria-current={cur("/connect")}>
          Connect wallet
        </Link>
      </div>
    </nav>
  );
}
