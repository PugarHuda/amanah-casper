import { defineConfig, devices } from "@playwright/test";

// QA config. Assumes a server already running on :3100 (npm run start -- -p 3100).
// ponytail: no webServer block — we run the prod server out-of-band so the same
// build is tested; set QA_BASE to point elsewhere.
export default defineConfig({
  testDir: "./tests",
  // Prime every route's SSR render before the suite so cold-render latency (live RPC reads)
  // doesn't flake the first test that visits each page.
  globalSetup: "./tests/global-setup.ts",
  // 60s per test — pages traverse several routes each doing live testnet reads (node ~1.4s/call).
  timeout: 60_000,
  // Every page reads live testnet state over the public RPC node; running many pages in
  // parallel saturates that node and makes reads time out. Cap concurrency so the tests
  // exercise the real product without DoS-ing the shared node into flakiness.
  fullyParallel: false,
  workers: 2,
  // The pages read live testnet state over the public RPC node; under parallel
  // load a single read can transiently time out (the product degrades to "—", the
  // test then fails). Retry twice so transient RPC flakes don't fail the suite.
  retries: 2,
  reporter: [["list"]],
  use: {
    baseURL: process.env.QA_BASE || "http://localhost:3100",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
