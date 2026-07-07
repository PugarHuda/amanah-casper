// Record a LIVE, interactive walkthrough of Amanah, paced to the narration (timing.json).
// Real interactions: nav clicks (with the loading skeletons), feature-card highlights, an
// on-chain view on cspr.live, and the wallet-connect page. build burns voiceover + subs.
// Run from web/ so "playwright" resolves: node ./tmp-record.mjs <out_dir>
import { chromium } from "playwright";
import fs from "node:fs";

const OUT = process.argv[2];
const BASE = process.env.DEMO_BASE || "https://amanah-casper-rwa.vercel.app";
const VAULT_PKG = "540051ac4dacd251a9afe8bb14e4b47199ea7cdfb55f861e1531d17b4b47a1d1";
const timing = JSON.parse(fs.readFileSync(`${OUT}/timing.json`, "utf8"));
const dur = timing.segments.map((s) => Math.round(s.dur * 1000));
const vidDir = `${OUT}/vid`;
fs.mkdirSync(vidDir, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: vidDir, size: { width: 1280, height: 720 } },
});
const page = await ctx.newPage();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const goto = (u) => page.goto(u.startsWith("http") ? u : BASE + u, { waitUntil: "domcontentloaded", timeout: 35000 }).catch(() => {});
const scrollTo = (y) => page.evaluate((yy) => window.scrollTo({ top: yy, behavior: "smooth" }), y).catch(() => {});
// Click an internal nav link (shows the loading.tsx skeleton); fall back to goto.
async function navClick(href) {
  const ok = await page.click(`a[href="${href}"]`, { timeout: 3000 }).then(() => true).catch(() => false);
  if (!ok) await goto(href);
  await sleep(1400);
}
// Visibly highlight the feature card whose text starts with `t` (draws the eye as narrated).
async function highlight(t) {
  await page.evaluate((txt) => {
    const els = [...document.querySelectorAll("a,div")];
    const el = els.find((e) => e.textContent && e.textContent.trim().startsWith(txt) && e.offsetHeight > 40 && e.offsetHeight < 230);
    if (el) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.style.transition = "box-shadow .4s ease";
      el.style.boxShadow = "0 0 0 3px #3fae6a, 0 0 26px rgba(63,174,106,.55)";
      el.style.borderRadius = "16px";
    }
  }, t).catch(() => {});
  await sleep(600);
}

const t0 = Date.now();
let target = 0;
async function scene(i, setup) {
  target += dur[i];
  try { await setup(); } catch (e) { console.log(`scene ${i} warn:`, e.message); }
  const rem = target - (Date.now() - t0);
  if (rem > 0) await sleep(rem);
}

await scene(0, async () => { await goto("/"); await sleep(400); });
await scene(1, async () => { await navClick("/dashboard"); await page.evaluate(() => window.scrollTo(0, 0)); });
await scene(2, async () => { await scrollTo(430); await highlight("Gold"); });
await scene(3, async () => { await highlight("Circuit breaker"); });
await scene(4, async () => { await highlight("ZK proof-of-reserves"); });
await scene(5, async () => { await highlight("KYC (zero-knowledge"); });
await scene(6, async () => { await highlight("Auditor quorum"); });
await scene(7, async () => { await scrollTo(1150); await highlight("Agent allowlisted"); });
await scene(8, async () => { await scrollTo(1850); await highlight("Reallocate"); });
await scene(9, async () => { await goto(`https://testnet.cspr.live/contract-package/${VAULT_PKG}`); await sleep(1500); });
await scene(10, async () => { await goto("/agent"); await sleep(1000); });
await scene(11, async () => { await scrollTo(520); });
await scene(12, async () => { await navClick("/connect"); });
await scene(13, async () => { await goto("/"); await sleep(300); });

await ctx.close();
await browser.close();
const webm = fs.readdirSync(vidDir).find((f) => f.endsWith(".webm"));
fs.renameSync(`${vidDir}/${webm}`, `${OUT}/screen.webm`);
console.log("recorded", `${OUT}/screen.webm`);
