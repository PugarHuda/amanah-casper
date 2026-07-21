// Record a LIVE, interactive walkthrough of Amanah, paced to the narration (timing.json).
// Real interactions: nav clicks (with the loading skeletons), feature-card highlights, an
// on-chain view on cspr.live, and the wallet-connect page. build burns voiceover + subs.
// Run from web/ so "playwright" resolves: node ./tmp-record.mjs <out_dir>
import { chromium } from "playwright";
import fs from "node:fs";

const OUT = process.argv[2];
const BASE = process.env.DEMO_BASE || "https://amanah-casper-rwa.vercel.app";
const REFUSED = {
  quorum: "4a9ff08b6df9c2775bfabae17a47a17b49951915dd3a6c93fe1f8537dbcfa032",   // NotApproved
  sameAsset: "fb45bfead42371eb6e7705c11cc686f0290a1273a966b54b3ca9763f3967b5c6", // SameAsset (mint blocked)
  frozen: "13729bdebafd2d3d6e928df56febfa0043d447470a8747ddc723c933a1d5897d",   // dead-man's switch tripped
};
const VAULT_PKG = "8558283443dfceba9956eadc241401a78fbbeaf2410f6094581d135ecf5923dd";
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
// The live executed-vs-refused counter is the heart of the story now.
await scene(3, async () => { await page.evaluate(() => window.scrollTo(0, 0)); await sleep(400); await highlight("VAULT TX"); });
// The three refusals, each a real transaction on the explorer.
await scene(4, async () => { await goto(`https://testnet.cspr.live/deploy/${REFUSED.quorum}`); await sleep(1800); });
await scene(5, async () => { await goto(`https://testnet.cspr.live/deploy/${REFUSED.sameAsset}`); await sleep(1800); });
await scene(6, async () => { await goto(`https://testnet.cspr.live/deploy/${REFUSED.frozen}`); await sleep(1800); });
// Proof lab: solvency, then break it on camera.
await scene(7, async () => { await goto("/verify"); await sleep(3500); await highlight("Zero-knowledge proof-of-solvency"); });
await scene(8, async () => { await scrollTo(360); });
await scene(9, async () => {
  await page.getByRole("button", { name: /claim \$1,000 more/ }).click().catch(() => {});
  await sleep(1200);
  await page.getByRole("button", { name: /change one digit/ }).click().catch(() => {});
  await sleep(800);
});
// The compliance artifact.
await scene(10, async () => { await goto("/compliance"); await sleep(1500); await scrollTo(420); });
// The cycle itself.
await scene(11, async () => { await goto("/agent"); await sleep(1200); await scrollTo(420); });
await scene(12, async () => { await navClick("/dashboard"); await scrollTo(1500); });
await scene(13, async () => { await goto("/"); await sleep(300); });

await ctx.close();
await browser.close();
const webm = fs.readdirSync(vidDir).find((f) => f.endsWith(".webm"));
fs.renameSync(`${vidDir}/${webm}`, `${OUT}/screen.webm`);
console.log("recorded", `${OUT}/screen.webm`);
