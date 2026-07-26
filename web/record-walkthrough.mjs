// Records a longer, SELF-EXPLANATORY walkthrough of the LIVE Amanah site: an injected animated
// cursor (looks like a real user clicking) + an on-screen caption bar that names each feature and
// its OUTPUT, so the silent video explains itself. Output: public/walkthrough.webm, then converted
// to public/walkthrough.mp4 by the caller (ffmpeg). Run: node record-walkthrough.mjs
import { chromium } from "@playwright/test";
import { readdirSync, copyFileSync, mkdirSync, rmSync } from "node:fs";

const BASE = process.env.WT_BASE || "https://amanah-casper-rwa.vercel.app";
const REFUSAL = "ba368de335840645486c7692cf1fdee8b0ca3f7f61514091515a32052ac2d7b7";
const W = 1280, H = 720;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Injected on every page: a fake cursor + a caption bar + an "Amanah" watermark.
const OVERLAY = () => {
  const cur = document.createElement("div");
  cur.style.cssText = "position:fixed;z-index:2147483647;width:24px;height:24px;margin:-12px 0 0 -12px;border-radius:50%;border:2.5px solid #15120e;background:rgba(200,144,47,.45);box-shadow:0 2px 8px rgba(0,0,0,.3);pointer-events:none;left:-60px;top:-60px;transition:transform .08s ease";
  const cap = document.createElement("div");
  cap.id = "__cap";
  cap.style.cssText = "position:fixed;z-index:2147483646;left:0;right:0;bottom:0;padding:16px 28px 20px;background:linear-gradient(0deg,rgba(15,14,11,.94),rgba(15,14,11,.82) 70%,rgba(15,14,11,0));color:#fff;pointer-events:none;font-family:ui-sans-serif,system-ui,sans-serif;opacity:0;transition:opacity .4s ease";
  cap.innerHTML = '<div id="__capt" style="font-size:22px;font-weight:700;letter-spacing:-.2px"></div><div id="__caps" style="font-size:15px;color:#d8d2c4;margin-top:3px"></div>';
  const wm = document.createElement("div");
  wm.style.cssText = "position:fixed;z-index:2147483646;top:16px;right:22px;color:rgba(21,18,14,.5);font-weight:700;font-size:15px;letter-spacing:-.3px;pointer-events:none;font-family:ui-sans-serif,system-ui";
  wm.textContent = "amanah";
  const mount = () => { if (!document.body) return; document.body.appendChild(cur); document.body.appendChild(cap); document.body.appendChild(wm); };
  if (document.body) mount(); else addEventListener("DOMContentLoaded", mount);
  addEventListener("mousemove", (e) => { cur.style.left = e.clientX + "px"; cur.style.top = e.clientY + "px"; }, true);
  addEventListener("mousedown", () => { cur.style.transform = "scale(.55)"; }, true);
  addEventListener("mouseup", () => { cur.style.transform = "scale(1)"; }, true);
  window.__setCap = (t, s) => { const T = document.getElementById("__capt"), S = document.getElementById("__caps"), C = document.getElementById("__cap"); if (T) T.textContent = t; if (S) S.textContent = s; if (C) C.style.opacity = t ? "1" : "0"; };
};

async function main() {
  try { rmSync("rec", { recursive: true, force: true }); } catch {}
  mkdirSync("rec", { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, recordVideo: { dir: "rec", size: { width: W, height: H } } });
  await ctx.addInitScript(OVERLAY);
  const p = await ctx.newPage();
  p.setDefaultTimeout(45000);

  const cap = async (t, s) => { await p.evaluate(([t, s]) => window.__setCap && window.__setCap(t, s), [t, s]); };
  const goto = async (path) => { await p.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" }); await sleep(1200); };
  const moveTo = async (x, y) => { await p.mouse.move(x, y, { steps: 26 }); await sleep(350); };
  const clickEl = async (loc) => {
    try { await loc.scrollIntoViewIfNeeded(); await sleep(450); const box = await loc.boundingBox(); if (!box) return false;
      const x = box.x + box.width / 2, y = box.y + Math.min(box.height / 2, 20);
      await moveTo(x, y); await p.mouse.down(); await sleep(130); await p.mouse.up(); await sleep(750); return true;
    } catch { return false; }
  };
  const scroll = async (dy) => { await p.evaluate((d) => window.scrollBy({ top: d, behavior: "smooth" }), dy); await sleep(1200); };

  try {
    // 1 — INTRO
    await goto("/");
    await cap("Amanah — an autonomous, compliant RWA treasury agent on Casper", "Most AI money-agents ask you to trust them. Amanah proves every decision on-chain.");
    await sleep(4500); await scroll(120); await sleep(2500);

    // 2 — SCORECARD
    await goto("/verify");
    await cap("Live self-audit — the whole system, checked against the chain right now", "10 headline claims, each read live from Casper — not a screenshot.");
    await p.getByText(/claims verified live, on-chain, right now/i).waitFor({ state: "visible", timeout: 40000 }).catch(() => {});
    await moveTo(640, 250); await sleep(3500); await scroll(190); await sleep(3500);

    // 3 — ZK PROOF-OF-SOLVENCY
    const tamper = p.getByRole("button", { name: /claim \$1,000 more than we hold/i });
    await tamper.scrollIntoViewIfNeeded(); await sleep(600);
    await cap("Zero-knowledge proof-of-solvency", "Reserves cover liabilities — verified in your browser, no amount revealed. Output: a valid proof.");
    await sleep(3800);
    // 4 — TAMPER / BREAK IT
    await cap("Now break it — claim more than we actually hold", "One tampered input and the proof fails instantly. You don't trust the math — you falsify it.");
    await clickEl(tamper);
    await p.getByText(/proof rejected/i).first().waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
    await sleep(3800);
    await clickEl(p.getByRole("button", { name: /restore the real total/i })); await sleep(1000);

    // 5 — PROOF-OF-LIABILITIES
    await cap("Proof-of-liabilities — reserves are meaningless without them", "A Merkle tree of client balances. Pick any client, verify inclusion — nobody else's balance shown.");
    await scroll(2600); await sleep(3800);

    // 6 — VERIFY ANY TX (a refusal)
    await scroll(-2600); await sleep(800);
    const input = p.getByPlaceholder(/64-hex deploy hash/i);
    await input.scrollIntoViewIfNeeded(); await sleep(600);
    await cap("Verify ANY transaction yourself", "Paste any deploy hash — this one was REFUSED by the auditor quorum. A refusal is the control working.");
    await clickEl(input); await input.type(REFUSAL, { delay: 7 }); await sleep(500);
    await clickEl(p.getByRole("button", { name: /verify on-chain/i }));
    await p.getByText(/refused/i).first().waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
    await sleep(3800);

    // 7 — RED TEAM
    await cap("The agent under attack — prompt-injection red team", "Hostile payloads try to hijack the live reasoning path. Output: 7 of 7 attacks blocked.");
    await scroll(1700); await sleep(3600);

    // 8 — REAL STAKING YIELD
    await goto("/dashboard");
    await cap("Real native staking yield — on-chain", "The CSPR reserve is delegated to a validator, earning real Casper rewards. Output: rewards accruing, live.");
    await p.getByText(/REAL NATIVE STAKING YIELD/i).first().waitFor({ state: "visible", timeout: 40000 }).catch(() => {});
    await (await p.getByText(/REAL NATIVE STAKING YIELD/i).first()).scrollIntoViewIfNeeded(); await sleep(600);
    await moveTo(640, 320); await sleep(4000);

    // 9 — TREASURY: holdings, principal, multi-treasury, compliance
    await cap("A live tokenized treasury — principal locked, controls on-chain", "$1M across gold, T-bonds, WTI, CSPR · 2 independent vaults · KYC, allowlist & circuit breaker all live.");
    await scroll(900); await sleep(4000); await scroll(700); await sleep(3500);

    // 10 — COMPLIANCE / EVIDENCE
    await goto("/compliance");
    await cap("The artifact a regulator asks for — generated from the chain", "Exception report of every control that fired + operating effectiveness over a period (SOC-2 Type II).");
    await p.getByText(/OPERATING EFFECTIVENESS/i).first().waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
    await scroll(280); await sleep(4000); await scroll(300); await sleep(3500);

    // 11 — AGENT CONSOLE
    await goto("/agent");
    await cap("Proof-of-reasoning — every decision, signed & verified in-contract", "Consensus panel of 3 models → attest on-chain → an independent auditor grades it → quorum must approve.");
    await p.getByText(/PROOF-OF-REASONING/i).first().waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
    await scroll(360); await sleep(4200); await scroll(320); await sleep(3500);

    // 12 — HUMAN IN THE LOOP: wallet
    await goto("/govern");
    await cap("Human-in-the-loop — approve a decision yourself, on-chain", "Low-confidence cycles escalate to a human. Connect a real wallet and cast an on-chain vote (EU AI Act Art. 14).");
    await sleep(2200);
    await p.evaluate(() => window.csprclick && window.csprclick.signIn && window.csprclick.signIn());
    await sleep(4000);

    // 13 — CLOSE
    await goto("/");
    await cap("One agent, the whole trust stack — don't trust us, verify us", "Proof-of-reasoning · ZK solvency & KYC · auditor quorum · consensus · real yield — every claim a public tx.");
    await scroll(1500); await sleep(4500);
    await cap("", "");
    await sleep(800);
  } catch (e) {
    console.log("walkthrough note:", e.message.slice(0, 140));
  }

  await ctx.close();
  await browser.close();
  const vids = readdirSync("rec").filter((f) => f.endsWith(".webm"));
  if (!vids.length) { console.log("NO VIDEO PRODUCED"); process.exit(1); }
  copyFileSync(`rec/${vids[0]}`, "public/walkthrough.webm");
  console.log("OK → public/walkthrough.webm (from rec/" + vids[0] + ")");
}

main();
