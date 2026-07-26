// Records a real-user walkthrough of the LIVE Amanah site to a .webm, with a visible animated
// cursor (injected) so it reads as someone actually clicking. Run: node record-walkthrough.mjs
// Output: rec/*.webm  → copied to public/walkthrough.webm
import { chromium } from "@playwright/test";
import { readdirSync, copyFileSync, mkdirSync, rmSync } from "node:fs";

const BASE = process.env.WT_BASE || "https://amanah-casper-rwa.vercel.app";
const REFUSAL = "ba368de335840645486c7692cf1fdee8b0ca3f7f61514091515a32052ac2d7b7";
const W = 1280, H = 720;

// Injected on every page: a fake cursor that follows the real mouse + pulses on click.
const CURSOR = () => {
  const c = document.createElement("div");
  c.id = "__wtcursor";
  c.style.cssText = "position:fixed;z-index:2147483647;width:24px;height:24px;margin:-12px 0 0 -12px;border-radius:50%;border:2.5px solid #15120e;background:rgba(200,144,47,.4);box-shadow:0 2px 8px rgba(0,0,0,.25);pointer-events:none;left:-50px;top:-50px;transition:transform .08s ease";
  const mount = () => document.body && document.body.appendChild(c);
  if (document.body) mount(); else addEventListener("DOMContentLoaded", mount);
  addEventListener("mousemove", (e) => { c.style.left = e.clientX + "px"; c.style.top = e.clientY + "px"; }, true);
  addEventListener("mousedown", () => { c.style.transform = "scale(.55)"; }, true);
  addEventListener("mouseup", () => { c.style.transform = "scale(1)"; }, true);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  try { rmSync("rec", { recursive: true, force: true }); } catch {}
  mkdirSync("rec", { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, recordVideo: { dir: "rec", size: { width: W, height: H } } });
  await ctx.addInitScript(CURSOR);
  const p = await ctx.newPage();
  p.setDefaultTimeout(45000);

  const goto = async (path) => { await p.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" }); await sleep(1200); };
  const moveTo = async (x, y) => { await p.mouse.move(x, y, { steps: 25 }); await sleep(350); };
  const clickEl = async (loc) => {
    try {
      await loc.scrollIntoViewIfNeeded(); await sleep(400);
      const box = await loc.boundingBox(); if (!box) return false;
      const x = box.x + box.width / 2, y = box.y + Math.min(box.height / 2, 20);
      await moveTo(x, y); await p.mouse.down(); await sleep(120); await p.mouse.up(); await sleep(700);
      return true;
    } catch { return false; }
  };
  const smoothScroll = async (dy) => { await p.evaluate((d) => window.scrollBy({ top: d, behavior: "smooth" }), dy); await sleep(1100); };

  try {
    // SCENE 1 — the live self-audit scorecard
    await goto("/verify");
    await p.getByText(/claims verified live, on-chain, right now/i).waitFor({ state: "visible", timeout: 40000 }).catch(() => {});
    await moveTo(640, 260); await sleep(1600);
    await smoothScroll(180); await sleep(1400); // reveal the 10 green checks

    // SCENE 2 — break the ZK proof
    const tamper = p.getByRole("button", { name: /claim \$1,000 more than we hold/i });
    await tamper.scrollIntoViewIfNeeded(); await sleep(700);
    await clickEl(tamper);
    await p.getByText(/proof rejected/i).first().waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
    await sleep(1600);
    await clickEl(p.getByRole("button", { name: /restore the real total/i })); await sleep(900);

    // SCENE 3 — verify any transaction: a refusal
    const input = p.getByPlaceholder(/64-hex deploy hash/i);
    await input.scrollIntoViewIfNeeded(); await sleep(500);
    await clickEl(input);
    await input.type(REFUSAL, { delay: 8 }); await sleep(500);
    await clickEl(p.getByRole("button", { name: /verify on-chain/i }));
    await p.getByText(/refused/i).first().waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
    await sleep(2000);

    // SCENE 4 — real staking yield on the dashboard
    await goto("/dashboard");
    await p.getByText(/REAL NATIVE STAKING YIELD/i).first().waitFor({ state: "visible", timeout: 40000 }).catch(() => {});
    const stake = p.getByText(/REAL NATIVE STAKING YIELD/i).first();
    await stake.scrollIntoViewIfNeeded(); await sleep(500);
    await moveTo(640, 300); await sleep(2200);

    // SCENE 5 — compliance evidence over a period
    await goto("/compliance");
    await p.getByText(/OPERATING EFFECTIVENESS/i).first().waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
    await smoothScroll(260); await sleep(1800);

    // SCENE 6 — the agent console: consensus panel + auditor verdict
    await goto("/agent");
    await p.getByText(/PROOF-OF-REASONING/i).first().waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
    await smoothScroll(360); await sleep(2200);

    // SCENE 7 — human-in-the-loop: connect wallet, the real modal opens
    await goto("/govern");
    await sleep(1500);
    await p.evaluate(() => window.csprclick && window.csprclick.signIn && window.csprclick.signIn());
    await sleep(3500); // the CSPR.click modal iframe opens

    // SCENE 8 — close on the trust-stack landing
    await goto("/");
    await smoothScroll(1500); await sleep(2200); // "one agent, the whole trust stack"
  } catch (e) {
    console.log("walkthrough note:", e.message.slice(0, 120));
  }

  await ctx.close(); // finalizes the video
  await browser.close();

  const vids = readdirSync("rec").filter((f) => f.endsWith(".webm"));
  if (!vids.length) { console.log("NO VIDEO PRODUCED"); process.exit(1); }
  copyFileSync(`rec/${vids[0]}`, "public/walkthrough.webm");
  console.log("OK → public/walkthrough.webm (from rec/" + vids[0] + ")");
}

main();
