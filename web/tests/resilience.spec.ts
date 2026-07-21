// Resilience + a11y regressions caught by the Playwright audit. These are the cases
// that silently rot: a degraded proof lab that spins forever, a missing h1, a CTA that
// stops pointing at the proof lab, and mobile layouts that overflow.
import { test, expect, devices } from "@playwright/test";

test.describe("resilience", () => {
  test("proof lab degrades to an error, never an endless spinner", async ({ page }) => {
    // Simulate the published proof being unreachable.
    await page.route("**/proofs/reserves.json", (r) => r.abort());
    await page.goto("/verify", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/Couldn't load the published proof/)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/loading proof…/)).toHaveCount(0);
  });

  test("proof lab survives the reasoning API failing", async ({ page }) => {
    await page.route("**/api/reasoning", (r) => r.fulfill({ status: 500, body: "{}" }));
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/verify", { waitUntil: "domcontentloaded" });
    // The ZK panel is independent and must still verify.
    await expect(page.getByText(/✓ verified in [\d.]+ ms/)).toBeVisible({ timeout: 20000 });
    expect(errors, `page errors: ${errors.join(" | ")}`).toHaveLength(0);
  });

  test("dashboard CTA points at the proof lab", async ({ page }) => {
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    const cta = page.getByRole("link", { name: /verify this yourself/i });
    await expect(cta).toBeVisible();
    await cta.click();
    await expect(page).toHaveURL(/\/verify/);
  });

  test("every page has exactly one h1 and a lang attribute", async ({ page }) => {
    for (const route of ["/", "/dashboard", "/agent", "/connect", "/verify"]) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(400);
      const { h1, lang } = await page.evaluate(() => ({
        h1: document.querySelectorAll("h1").length,
        lang: document.documentElement.lang || "",
      }));
      expect(h1, `${route} h1 count`).toBe(1);
      expect(lang, `${route} lang`).not.toBe("");
    }
  });

  test("no horizontal overflow on a phone viewport", async ({ browser }) => {
    const ctx = await browser.newContext({ ...devices["iPhone 13"] });
    const page = await ctx.newPage();
    for (const route of ["/", "/dashboard", "/agent", "/connect", "/verify"]) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(600);
      const { scrollW, clientW } = await page.evaluate(() => ({
        scrollW: document.documentElement.scrollWidth,
        clientW: document.documentElement.clientWidth,
      }));
      expect(scrollW, `${route} overflows`).toBeLessThanOrEqual(clientW + 2);
    }
    await ctx.close();
  });
});

test.describe("control evidence", () => {
  test("compliance page shows real refusals, named as the control that fired", async ({ page }) => {
    await page.goto("/compliance", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /did the algorithm perform as intended/i })).toBeVisible();
    // At least one policy refusal, described by control rather than raw error code.
    await expect(page.getByText(/Separation of duties|Value conservation|Circuit breaker/).first()).toBeVisible({ timeout: 20000 });
    // Raw Odra/VM codes must NOT be presented as control refusals.
    const exceptionSection = await page.locator("body").innerText();
    expect(exceptionSection).not.toMatch(/Unmapped contract error/);
  });

  test("evidence pack API separates policy refusals from platform faults", async ({ request }) => {
    const res = await request.get("/api/compliance-report?days=30");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("exceptions");
    expect(body).toHaveProperty("platformFaults");
    expect(body).toHaveProperty("limitations");
    // Every policy refusal must name a control and carry a verifiable deploy hash.
    for (const e of body.exceptions) {
      expect(e.deployHash, "refusal must cite a deploy").toMatch(/^[0-9a-f]{64}$/);
      expect(e.control.length, "refusal must name a control").toBeGreaterThan(10);
      expect(e.error).not.toMatch(/^Odra\/VM/);
    }
    // Platform faults must never be dressed up as controls.
    for (const f of body.platformFaults) expect(f.note).toMatch(/not a policy control/i);
  });
});
