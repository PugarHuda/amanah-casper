"use client";
// Light/dark toggle. The theme is applied before paint by an inline script in layout.tsx
// (reads localStorage or prefers-color-scheme), so there's no flash; this just flips it and
// persists the choice.
import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => { setDark(document.documentElement.dataset.theme === "dark"); }, []);
  const toggle = () => {
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch { /* private mode */ }
    setDark(!dark);
  };
  return (
    <button onClick={toggle} aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: 999, border: "1px solid var(--border)", background: "transparent", cursor: "pointer", color: "var(--ink2)", padding: 0 }}>
      {dark ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="4.2" fill="currentColor"/><g stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"/></g></svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.3 6.3 0 0 0 10.5 10.5z" fill="currentColor"/></svg>
      )}
    </button>
  );
}
