import { defineConfig, devices } from "@playwright/test";

// QA config. Assumes a server already running on :3100 (npm run start -- -p 3100).
// ponytail: no webServer block — we run the prod server out-of-band so the same
// build is tested; set QA_BASE to point elsewhere.
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: process.env.QA_BASE || "http://localhost:3100",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
