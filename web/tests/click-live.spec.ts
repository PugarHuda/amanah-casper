// Deeper check: the CSPR.click SDK actually initializes (injects its iframe and
// reaches its host) and clicking the connect button drives the SDK, not a stub.
// Separate file so it can be run on demand and not gate the core QA.
import { test, expect } from "@playwright/test";

const BASE = process.env.QA_BASE || "http://localhost:3100";

test("CSPR.click SDK initializes and connect button drives it", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
  // Did the page request the CSPR.click host? (the SDK loads its core frame from it)
  let hitClickHost = false;
  page.on("request", (r) => {
    if (/csprclick|cspr\.click/i.test(r.url())) hitClickHost = true;
  });

  await page.goto(`${BASE}/connect`, { waitUntil: "networkidle" });

  // Button leaves the "Loading…" state once the SDK is ready.
  await expect(page.getByRole("button", { name: /Continue with CSPR\.click/i })).toBeVisible({ timeout: 10000 });

  // Click it — the SDK should open its modal (an iframe from the CSPR.click host).
  await page.getByRole("button", { name: /Continue with CSPR\.click/i }).click();
  await page.waitForTimeout(2500);

  const iframes = await page.locator("iframe").count();
  console.log("iframes after signIn():", iframes, "| hit click host:", hitClickHost);
  console.log("console errors:", consoleErrors.slice(0, 5));

  // The SDK injects at least one iframe (its core/modal frame) and reaches its host.
  expect(iframes, "SDK should inject a CSPR.click iframe").toBeGreaterThan(0);
  expect(hitClickHost, "page should request the CSPR.click host").toBeTruthy();
});
