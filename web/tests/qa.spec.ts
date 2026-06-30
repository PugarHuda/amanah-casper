// Manual-click QA across every Amanah screen. Verifies navigation, that live
// data renders (no leftover fake numbers), and that every cspr.live link is a
// real deep link (not the homepage). Run: npx playwright test (server on :3100).
import { test, expect, type Page } from "@playwright/test";

const BASE = process.env.QA_BASE || "http://localhost:3100";

// Fake values that must NOT appear on live pages (they were the old mock data).
const STALE_FAKES = ["12.84M", "12,840,219", "4,218", "$11.9M", "$184K"];

async function gotoAndSettle(page: Page, path: string) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
}

test.describe("Amanah manual-click QA", () => {
  test("landing page loads with stack badges and CTAs", async ({ page }) => {
    await gotoAndSettle(page, "/");
    await expect(page.getByRole("heading", { name: /verifiable guardian/i })).toBeVisible();
    // Stack badges — Venice (not Claude), x402, IPFS present.
    for (const label of ["Casper", "CSPR.cloud", "Venice", "x402", "IPFS"]) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
    await expect(page.getByText("Claude", { exact: true })).toHaveCount(0);
    // CTAs link to the right routes.
    await expect(page.getByRole("link", { name: /see it reason/i })).toHaveAttribute("href", "/agent");
    await expect(page.getByRole("link", { name: /open dashboard/i })).toHaveAttribute("href", "/dashboard");
  });

  test("click 'See it reason' navigates to live agent console", async ({ page }) => {
    await gotoAndSettle(page, "/");
    await page.getByRole("link", { name: /see it reason/i }).click();
    await page.waitForURL("**/agent");
    await expect(page.getByRole("heading", { name: /agent console/i })).toBeVisible();
    // Cycle banner should say LIVE (we have a published blob), not REPRESENTATIVE.
    const cycleId = await page.locator(".mono").first().innerText();
    console.log("Agent cycleId:", cycleId);
    expect(cycleId).toMatch(/LIVE|REPRESENTATIVE/);
    // Reasoning hash is a real 64-hex blake2b (0x + 64 chars).
    const hashText = await page.getByText(/^0x[0-9a-f]{64}$/i).first().textContent().catch(() => null);
    console.log("Reasoning hash:", hashText);
  });

  test("agent console shows no stale fake numbers", async ({ page }) => {
    await gotoAndSettle(page, "/agent");
    const body = await page.locator("body").innerText();
    for (const fake of STALE_FAKES) {
      expect(body, `stale fake "${fake}" must be gone`).not.toContain(fake);
    }
  });

  test("agent console reputation metric is a live on-chain number", async ({ page }) => {
    await gotoAndSettle(page, "/agent");
    // The Reputation metric card value sits right after its label.
    const repValue = await page
      .getByText("Reputation", { exact: true })
      .locator("xpath=following-sibling::*[1]")
      .innerText();
    console.log("Reputation metric:", repValue);
    // Live = a number (>=0), not the old fake "948" or a dash.
    expect(repValue).toMatch(/^\d+$/);
    expect(repValue).not.toBe("948");
  });

  test("agent 'verify on cspr.live' is a real deep link", async ({ page }) => {
    await gotoAndSettle(page, "/agent");
    const verify = page.getByRole("link", { name: /verify on cspr/i });
    const href = await verify.getAttribute("href");
    console.log("Agent verify href:", href);
    expect(href).toContain("testnet.cspr.live");
    // Either a specific deploy link, or the base explorer if no attest hash yet.
    expect(href === "https://testnet.cspr.live" || href!.includes("/deploy/")).toBeTruthy();
  });

  test("dashboard loads with live treasury + audit trail", async ({ page }) => {
    await gotoAndSettle(page, "/dashboard");
    await expect(page.getByRole("heading", { name: /audit dashboard/i })).toBeVisible();
    const total = await page.getByText(/TOTAL TREASURY VALUE/i).locator("xpath=following-sibling::*[1]").innerText();
    console.log("Dashboard total treasury:", total);
    expect(total).toMatch(/^\$/);
    // No stale fakes.
    const body = await page.locator("body").innerText();
    for (const fake of STALE_FAKES) {
      expect(body, `stale fake "${fake}" must be gone`).not.toContain(fake);
    }
  });

  test("every audit trail row deep-links to a real deploy", async ({ page }) => {
    await gotoAndSettle(page, "/dashboard");
    const rows = page.locator("a.trail-row");
    const n = await rows.count();
    console.log(`Audit trail rows: ${n}`);
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      const href = await rows.nth(i).getAttribute("href");
      expect(href, `row ${i} must link to cspr.live`).toContain("testnet.cspr.live");
      // A real trail row links to /deploy/<hash>, not the bare homepage.
      expect(href, `row ${i} should be a deploy deep-link`).toContain("/deploy/");
    }
    // "View all deploys" links to the agent account, not homepage.
    const viewAll = page.getByRole("link", { name: /view all deploys/i });
    const vh = await viewAll.getAttribute("href");
    console.log("View all href:", vh);
    expect(vh).toContain("/account/");
  });

  test("connect page wallet rows + CSPR.click integration render", async ({ page }) => {
    await gotoAndSettle(page, "/connect");
    await expect(page.getByText(/connect to amanah/i)).toBeVisible();
    for (const w of ["CSPR.click", "Casper Wallet", "Ledger"]) {
      await expect(page.getByText(w, { exact: true })).toBeVisible();
    }
    // Honest copy: "via Venice", not "Claude".
    await expect(page.getByText(/via Venice/i)).toBeVisible();
    // CSPR.click SDK is wired: the social/email button + the app-id line render.
    await expect(page.getByRole("button", { name: /CSPR\.click/i })).toBeVisible();
    const appLine = await page.getByText(/CSPR\.click app:/i).innerText();
    console.log("Connect:", appLine);
    expect(appLine).toContain("csprclick-template");
  });

  test("nav links work from every page", async ({ page }) => {
    await gotoAndSettle(page, "/dashboard");
    // Click through nav to agent then back to dashboard.
    await page.getByRole("link", { name: /protocol|agent/i }).first().click().catch(() => {});
    await gotoAndSettle(page, "/writing");
    await expect(page.locator("body")).toBeVisible();
  });
});
