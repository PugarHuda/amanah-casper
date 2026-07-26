// Records a NARRATED walkthrough: combines the /deck slides (the explanation) with the LIVE demo,
// paced so each scene lasts exactly its AI-voiceover clip's duration (perfect audio sync). Trims
// the white load-in. Output rec/*.webm → caller merges with narration + trims. Run after gen_narration.py.
import { chromium } from "@playwright/test";
import { readdirSync, rmSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const BASE = process.env.WT_BASE || "https://amanah-casper-rwa.vercel.app";
const REFUSAL = "ba368de335840645486c7692cf1fdee8b0ca3f7f61514091515a32052ac2d7b7";
const W = 1280, H = 720;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const { order, durations } = JSON.parse(readFileSync("narration/durations.json", "utf8"));

// cursor + subtle caption (only used on live-demo scenes; deck slides carry their own text)
const OVERLAY = () => {
  const cur = document.createElement("div");
  cur.style.cssText = "position:fixed;z-index:2147483647;width:24px;height:24px;margin:-12px 0 0 -12px;border-radius:50%;border:2.5px solid #15120e;background:rgba(200,144,47,.45);box-shadow:0 2px 8px rgba(0,0,0,.3);pointer-events:none;left:-60px;top:-60px;transition:transform .08s ease";
  const cap = document.createElement("div");
  cap.id = "__cap";
  cap.style.cssText = "position:fixed;z-index:2147483646;left:24px;bottom:22px;max-width:70%;padding:10px 18px;border-radius:12px;background:rgba(15,14,11,.9);color:#fff;pointer-events:none;font:600 17px ui-sans-serif,system-ui;opacity:0;transition:opacity .35s";
  const mount = () => { if (!document.body) return; document.body.appendChild(cur); document.body.appendChild(cap); };
  if (document.body) mount(); else addEventListener("DOMContentLoaded", mount);
  addEventListener("mousemove", (e) => { cur.style.left = e.clientX + "px"; cur.style.top = e.clientY + "px"; }, true);
  addEventListener("mousedown", () => { cur.style.transform = "scale(.55)"; }, true);
  addEventListener("mouseup", () => { cur.style.transform = "scale(1)"; }, true);
  window.__cap = (t) => { const c = document.getElementById("__cap"); if (c) { c.textContent = t || ""; c.style.opacity = t ? "1" : "0"; } };
};

async function main() {
  try { rmSync("rec", { recursive: true, force: true }); } catch {}
  mkdirSync("rec", { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, recordVideo: { dir: "rec", size: { width: W, height: H } } });
  const recStart = Date.now();
  await ctx.addInitScript(OVERLAY);
  const p = await ctx.newPage();
  p.setDefaultTimeout(45000);

  const cap = async (t) => { await p.evaluate((t) => window.__cap && window.__cap(t), t); };
  const goto = async (path) => { await p.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" }); };
  const moveTo = async (x, y) => { await p.mouse.move(x, y, { steps: 24 }); await sleep(250); };
  const click = async (loc) => { try { await loc.scrollIntoViewIfNeeded(); const b = await loc.boundingBox(); if (!b) return; await moveTo(b.x + b.width / 2, b.y + Math.min(b.height / 2, 20)); await p.mouse.down(); await sleep(120); await p.mouse.up(); await sleep(500); } catch {} };
  const scroll = async (dy) => { await p.evaluate((d) => window.scrollBy({ top: d, behavior: "smooth" }), dy); await sleep(900); };
  const next = async () => { await click(p.getByRole("button", { name: /Next/i })); };

  // Prime /deck so slide 1 is visible; T0 = the audio timeline start (everything before is trimmed).
  await goto("/deck");
  await p.getByText(/Amanah/).first().waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
  await sleep(400);
  const T0 = Date.now();
  const leadMs = T0 - recStart;

  // each scene's action (index matches order[i] = s01..s11); scene i must finish before its holdUntil.
  const actions = [
    async () => { await sleep(300); },                                   // s01 deck title
    async () => { await next(); },                                       // s02 deck problem
    async () => { await goto("/verify"); await p.getByText(/claims verified live/i).waitFor({ state: "visible", timeout: 40000 }).catch(() => {}); await moveTo(640, 250); await scroll(180); }, // s03 scorecard
    async () => { const t = p.getByRole("button", { name: /claim \$1,000 more than we hold/i }); await t.scrollIntoViewIfNeeded(); await cap("Zero-knowledge proof-of-solvency — verified in your browser"); await moveTo(640, 320); }, // s04 zk
    async () => { await cap("Break it: claim more than we hold → proof rejected"); await click(p.getByRole("button", { name: /claim \$1,000 more than we hold/i })); await p.getByText(/proof rejected/i).first().waitFor({ state: "visible", timeout: 8000 }).catch(() => {}); await click(p.getByRole("button", { name: /restore the real total/i })); }, // s05 tamper
    async () => { await cap("Verify any transaction — this one was refused (NotApproved)"); const inp = p.getByPlaceholder(/64-hex deploy hash/i); await inp.scrollIntoViewIfNeeded(); await click(inp); await inp.type(REFUSAL, { delay: 5 }); await click(p.getByRole("button", { name: /verify on-chain/i })); await p.getByText(/refused/i).first().waitFor({ state: "visible", timeout: 30000 }).catch(() => {}); }, // s06 refusal
    async () => { await cap("Real native staking yield — accruing on-chain"); await goto("/dashboard"); await p.getByText(/REAL NATIVE STAKING YIELD/i).first().waitFor({ state: "visible", timeout: 40000 }).catch(() => {}); await (await p.getByText(/REAL NATIVE STAKING YIELD/i).first()).scrollIntoViewIfNeeded(); await moveTo(640, 320); }, // s07 staking
    async () => { await cap("Consensus panel → attest on-chain → independent auditor"); await goto("/agent"); await p.getByText(/PROOF-OF-REASONING/i).first().waitFor({ state: "visible", timeout: 30000 }).catch(() => {}); await scroll(340); await sleep(700); await scroll(320); }, // s08 agent
    async () => { await cap("The regulator's artifact — generated from the chain"); await goto("/compliance"); await p.getByText(/OPERATING EFFECTIVENESS/i).first().waitFor({ state: "visible", timeout: 30000 }).catch(() => {}); await scroll(280); }, // s09 compliance
    async () => { await cap("Human-in-the-loop — approve on-chain with a real wallet"); await goto("/govern"); await sleep(1500); await p.evaluate(() => window.csprclick && window.csprclick.signIn && window.csprclick.signIn()); }, // s10 govern
    async () => { await cap(""); await goto("/deck"); await sleep(600); await p.keyboard.press("End"); }, // s11 deck close ("Verify us.")
  ];

  let cum = 0;
  for (let i = 0; i < order.length; i++) {
    try { await actions[i](); } catch (e) { console.log(`scene ${order[i]} note:`, e.message.slice(0, 80)); }
    cum += durations[order[i]] * 1000;
    while (Date.now() - T0 < cum) await sleep(80); // end this scene exactly on its narration boundary
  }
  await sleep(500); // small tail

  await ctx.close();
  await browser.close();
  const vids = readdirSync("rec").filter((f) => f.endsWith(".webm"));
  if (!vids.length) { console.log("NO VIDEO"); process.exit(1); }
  writeFileSync("rec/meta.json", JSON.stringify({ webm: `rec/${vids[0]}`, leadSec: (leadMs / 1000).toFixed(3) }));
  console.log(`OK video=rec/${vids[0]} leadSec=${(leadMs / 1000).toFixed(3)}`);
}
main();
