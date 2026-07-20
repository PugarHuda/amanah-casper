import Link from "next/link";

const Logo = () => (
  <svg width="26" height="22" viewBox="0 0 26 22" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="1" width="11" height="3.4" rx="1.7" fill="#16130f" />
    <rect x="14" y="1" width="7" height="3.4" rx="1.7" fill="#16130f" />
    <rect x="4" y="9.3" width="18" height="3.4" rx="1.7" fill="#16130f" />
    <rect x="0" y="17.6" width="8" height="3.4" rx="1.7" fill="#16130f" />
    <rect x="11" y="17.6" width="13" height="3.4" rx="1.7" fill="#16130f" />
  </svg>
);

type Active = "protocol" | "connect" | "dashboard" | "verify" | null;

export default function Nav({ active = null }: { active?: Active }) {
  const cls = (k: Active) => (active === k ? "active" : undefined);
  return (
    <nav className="nav">
      <Link href="/" style={{ display: "flex", alignItems: "center", gap: 11, textDecoration: "none" }}>
        <Logo />
        <span style={{ fontSize: 23, fontWeight: 600, letterSpacing: "-0.4px", color: "#16130f" }}>amanah</span>
      </Link>
      <div className="nav-links">
        <Link href="/agent" className={cls("protocol")}>
          Protocol
          <svg width="11" height="7" viewBox="0 0 11 7" fill="none">
            <path d="M1 1l4.5 4.5L10 1" stroke="#1c1814" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </Link>
        <a href="https://github.com/PugarHuda/amanah-casper#readme" target="_blank" rel="noopener noreferrer">Read the spec</a>
        <Link href="/verify" className={cls("verify")}>Verify</Link>
        <Link href="/connect" className={cls("connect")}>Connect wallet</Link>
        <Link href="/dashboard" className={cls("dashboard")}>Dashboard</Link>
      </div>
    </nav>
  );
}
