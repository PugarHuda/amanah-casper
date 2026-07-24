// Warm every route once before the suite so the first real test doesn't pay the cold SSR
// render (each page does several live testnet RPC reads; on a freshly-started server the
// first hit of a route can take 15-20s and blow a per-test timeout). In production Vercel
// ISR serves these pre-warmed; locally we prime them here so QA is deterministic, not slow.
import type { FullConfig } from "@playwright/test";

export default async function globalSetup(config: FullConfig) {
  const base = process.env.QA_BASE || config.projects[0]?.use?.baseURL || "http://localhost:3100";
  const routes = ["/", "/dashboard", "/agent", "/verify", "/compliance", "/connect", "/govern", "/api/scorecard"];
  await Promise.all(
    routes.map((r) =>
      fetch(`${base}${r}`).catch(() => {}), // best-effort: prime the render cache
    ),
  );
}
