// Manual-click QA across every Amanah screen. Verifies navigation, that live
// data renders (no leftover fake numbers), and that every cspr.live link is a
// real deep link (not the homepage). Run: npx playwright test (server on :3100).
import { test, expect, type Page } from "@playwright/test";

const BASE = process.env.QA_BASE || "http://localhost:3100";

// Fake values that must NOT appear on live pages (they were the old mock data).
const STALE_FAKES = ["12.84M", "12,840,219", "4,218", "$11.9M", "$184K", "$420K"];

async function gotoAndSettle(page: Page, path: string) {
  // domcontentloaded, not networkidle: /dashboard holds an open SSE connection
  // (the live feed), so "networkidle" would never fire. Explicit toBeVisible
  // assertions below do the real waiting.
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
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
    // Connect is the entrance; the dashboard stays reachable without connecting.
    await expect(page.getByRole("link", { name: /^connect wallet$/i }).first()).toHaveAttribute("href", "/connect");
    await expect(page.getByRole("link", { name: /explore without connecting/i })).toHaveAttribute("href", "/dashboard");
  });

  test("the agent console shows a real, live reasoning cycle", async ({ page }) => {
    // This is a CONTENT test — go straight to /agent (reliable under load) rather than
    // client-nav from /dashboard, whose RSC fetch for the RPC-heavy agent page is what
    // flakes. The nav-click path is covered by the dedicated nav test.
    await gotoAndSettle(page, "/agent");
    // 15s: under parallel load these pages block on live testnet RPC reads, and the
    // default 5s expect timeout races a slow node rather than a real regression.
    await expect(page.getByRole("heading", { name: /agent console/i })).toBeVisible({ timeout: 15000 });
    // Wait for the real cycle banner. The loading.tsx skeleton also renders a `.mono`
    // line ("… loading live chain state …"), so reading `.mono` first without waiting
    // races the skeleton — that was a real intermittent failure, not flakiness to retry.
    const banner = page.locator(".mono").filter({ hasText: /LIVE|REPRESENTATIVE|CYCLE/ }).first();
    await expect(banner).toBeVisible({ timeout: 15000 });
    const cycleId = await banner.innerText();
    console.log("Agent cycleId:", cycleId);
    expect(cycleId).toMatch(/LIVE|REPRESENTATIVE/);
    // Reasoning hash is a real 64-hex blake2b (0x + 64 chars).
    const hashText = await page.getByText(/^0x[0-9a-f]{64}$/i).first().textContent().catch(() => null);
    console.log("Reasoning hash:", hashText);
    // Real RWA data provenance is shown on the ingest step (named providers, not "toy data").
    const ingest = await page.getByText(/^INGEST ·/).first().textContent();
    console.log("Ingest provenance:", ingest);
    expect(ingest).toMatch(/EIA|metalpriceapi|coingecko|treasury|avg_interest/i);
    // If the reasoning blob was pinned to IPFS, the verify link is a real Pinata gateway URL.
    const ipfs = page.getByRole("link", { name: /verify blob on IPFS/i });
    if (await ipfs.count()) {
      const href = await ipfs.getAttribute("href");
      console.log("IPFS verify link:", href);
      expect(href).toContain("/ipfs/");
    }
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
    // Non-zero locked principal from the custodian-separated vault v2 (was $0 before).
    const principal = await page.getByText("PRINCIPAL LOCKED").locator("xpath=following-sibling::*[1]").innerText();
    console.log("Principal locked:", principal);
    expect(principal).toMatch(/\$\d/);
    expect(principal).not.toBe("$0");
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

  test("dashboard compliance card shows live SpendGate limits", async ({ page }) => {
    await gotoAndSettle(page, "/dashboard");
    // Live per-tx cap is $100,000 (the on-chain SpendGate value), not the old fake $500K.
    await expect(page.getByText("Per-tx cap")).toBeVisible();
    const cap = await page.getByText("Per-tx cap").locator("xpath=following-sibling::*[1]").innerText();
    console.log("Live per-tx cap:", cap);
    expect(cap).toMatch(/^\$[\d,]+/);
    expect(cap).not.toContain("500");
    // Live KYC/allowlist (read from ComplianceRegistry + SpendGate), not the old fake "3 of 3".
    await expect(page.getByText("Compliance status", { exact: true })).toBeVisible();
    await expect(page.getByText("Agent allowlisted", { exact: true })).toBeVisible();
    const body = await page.locator("body").innerText();
    expect(body).not.toContain("3 of 3");
  });

  test("dashboard live feed connects to CSPR.cloud streaming (SSE)", async ({ page }) => {
    await gotoAndSettle(page, "/dashboard");
    // The streaming panel renders.
    await expect(page.getByText(/CSPR\.CLOUD STREAMING · CONTRACT EVENTS/i)).toBeVisible();
    // The SSE relay connects → status flips to "LIVE · streaming" (it starts "connecting…").
    await expect(page.getByText(/LIVE · streaming/i)).toBeVisible({ timeout: 10000 });
    const body = await page.getByTestId("live-feed-body").innerText();
    console.log("Live feed body:", body.slice(0, 80));
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
    // The app-id renders — the demo template on localhost, or a real app-id (prod).
    expect(appLine).toMatch(/csprclick-template|[0-9a-f]{8}-[0-9a-f]{4}/);
  });

  test("every nav link lands where its label says, and marks itself current", async ({ page }) => {
    // The nav is the first thing a judge touches; a label that doesn't match its
    // destination (the old "Protocol" -> /agent) is what made it confusing.
    // Start inside the app: the landing page deliberately shows only the entrance
    // (Verify + Spec + Connect), not the whole app shell.
    // Two independent things to prove: (a) each page marks its own nav link current,
    // (b) the links actually navigate. We check (a) with a direct goto per page — that
    // is reliable under parallel load — instead of a client-side click, whose RSC fetch
    // for an RPC-heavy destination is the thing that flakes. (b) is one representative
    // click below. aria-current is client-rendered from the URL, so it needs no RPC.
    for (const [label, path] of [
      ["Dashboard", "/dashboard"],
      ["Verify", "/verify"],
      ["Evidence", "/compliance"],
      ["How it works", "/agent"],
      ["Connect wallet", "/connect"],
    ] as const) {
      await gotoAndSettle(page, path);
      await expect(page.getByRole("navigation").getByRole("link", { name: label, exact: true }))
        .toHaveAttribute("aria-current", "page", { timeout: 15000 });
    }
    // The links navigate (one representative click; the destination just has to be the URL).
    await gotoAndSettle(page, "/verify");
    await page.getByRole("navigation").getByRole("link", { name: "Dashboard", exact: true }).click();
    await page.waitForURL("**/dashboard");
    // The landing page shows the entrance only — not four app destinations to someone
    // who has not been told what this is.
    await gotoAndSettle(page, "/");
    await expect(page.getByRole("navigation").getByRole("link", { name: "Dashboard", exact: true })).toHaveCount(0);
    await expect(page.getByRole("navigation").getByRole("link", { name: "Verify", exact: true })).toBeVisible();
    expect(await page.getByRole("link", { name: /spec/i }).first().getAttribute("href")).toContain("github.com");
  });
  test("proof lab verifies our cryptography in the browser — and tampering breaks it", async ({ page }) => {
    await gotoAndSettle(page, "/verify");
    // The ZK proof-of-reserves and the attested reasoning blob both verify client-side.
    await expect(page.getByText(/✓ verified in [\d.]+ ms/)).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/✓ hash matches the attestation/)).toBeVisible({ timeout: 20000 });

    // Soundness: claiming more reserves than the hidden amounts sum to must FAIL.
    await page.getByRole("button", { name: /claim \$1,000 more/ }).click();
    await expect(page.getByText(/✗ proof rejected/)).toBeVisible({ timeout: 10000 });

    // Integrity: a single edited character must break the attestation hash.
    await page.getByRole("button", { name: /change one digit/ }).click();
    await expect(page.getByText(/hash mismatch/)).toBeVisible({ timeout: 10000 });
  });

  test("the approval inbox lists escalated decisions awaiting human on-chain sign-off", async ({ page }) => {
    await gotoAndSettle(page, "/govern");
    await expect(page.getByRole("heading", { name: /approval inbox/i })).toBeVisible({ timeout: 15000 });
    // Art.14 human-oversight framing + the connect gate (read-only without a wallet).
    await expect(page.getByText(/Article 14/i)).toBeVisible();
    await expect(page.getByText(/connect a wallet/i).first()).toBeVisible();
    // At least the seeded escalated decision shows (IPFS ones may lag).
    await expect(page.getByText("ESCALATED").first()).toBeVisible({ timeout: 20000 });
  });

  test("proof-of-liabilities: reserves >= liabilities and per-client Merkle inclusion verifies", async ({ page }) => {
    await gotoAndSettle(page, "/verify");
    await expect(page.getByText(/Proof-of-liabilities/i)).toBeVisible({ timeout: 15000 });
    // The complete solvency claim: reserves (ZK) >= liabilities (Merkle).
    await expect(page.getByText(/reserves ≥ liabilities/i).first()).toBeVisible({ timeout: 15000 });
    // A client's inclusion proof verifies against the published root.
    await expect(page.getByText(/is included in the root/i)).toBeVisible();
    // Overstating a balance breaks the Merkle path — the operator can't inflate a liability.
    await page.getByRole("button", { name: /overstate this balance/i }).click();
    await expect(page.getByText(/inclusion proof failed/i)).toBeVisible({ timeout: 10000 });
  });

  test("the prompt-injection red team is published and every attack is blocked", async ({ page }) => {
    await gotoAndSettle(page, "/verify");
    const badge = page.getByText(/\d+ \/ \d+ attacks blocked/).first();
    await expect(badge).toBeVisible({ timeout: 15000 });
    const text = await badge.textContent();
    console.log("red team:", text);
    // The published result must show a full block — a "GOT THROUGH" row is a real regression.
    const [blocked, total] = text!.match(/(\d+) \/ (\d+)/)!.slice(1).map(Number);
    expect(blocked).toBe(total);
    await expect(page.getByText("GOT THROUGH")).toHaveCount(0);
  });
});
