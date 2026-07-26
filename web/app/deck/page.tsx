"use client";

// /deck — the pitch deck. A full-screen, keyboard-navigable slide deck that explains Amanah
// end to end: the problem, the solution, every feature + its OUTPUT, the flow, why we win, the
// stack, and the proofs — then hands off to the LIVE demo (the walkthrough video + the real
// verifiable site). Arrow keys / click / swipe to navigate.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

const SITE = "https://amanah-casper-rwa.vercel.app";

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="mono" style={{ fontSize: 11, letterSpacing: "2.4px", color: "var(--faint2)", fontWeight: 600 }}>{children}</span>;
}
function H({ children }: { children: React.ReactNode }) {
  return <h2 className="serif" style={{ margin: "14px 0 0", fontSize: "clamp(30px, 5vw, 60px)", fontWeight: 400, lineHeight: 1.05, letterSpacing: "-1px", color: "var(--ink)", textWrap: "balance" }}>{children}</h2>;
}
function Lead({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: "20px 0 0", maxWidth: 780, fontSize: "clamp(15px, 2vw, 20px)", lineHeight: 1.55, color: "var(--body)" }}>{children}</p>;
}
function Grid({ children }: { children: React.ReactNode }) {
  return <div style={{ marginTop: 30, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, width: "100%", maxWidth: 900 }}>{children}</div>;
}
function Cell({ k, t, d }: { k?: string; t: string; d: string }) {
  return (
    <div style={{ padding: "16px 18px", border: "1px solid var(--border2)", borderRadius: 14, background: "var(--surface-subtle)", textAlign: "left" }}>
      {k && <div className="mono" style={{ fontSize: 10.5, letterSpacing: "1.4px", color: "var(--faint)" }}>{k}</div>}
      <div style={{ marginTop: k ? 6 : 0, fontSize: 16, fontWeight: 700, color: "var(--ink)" }}>{t}</div>
      <div style={{ marginTop: 5, fontSize: 13.5, color: "var(--body)", lineHeight: 1.5 }}>{d}</div>
    </div>
  );
}

type Slide = { tag: string; render: () => React.ReactNode };

const SLIDES: Slide[] = [
  { tag: "AMANAH · CASPER AGENTIC BUILDATHON 2026", render: () => (
    <>
      <div style={{ fontSize: "clamp(52px,9vw,120px)", fontWeight: 600, letterSpacing: "-3px", color: "var(--ink)", lineHeight: 1 }} className="serif">Amanah</div>
      <H>A verifiable guardian for every asset</H>
      <Lead>The autonomous, compliant RWA-treasury agent on Casper that <strong>proves every decision on-chain — and lets you verify the whole system yourself, in one click.</strong></Lead>
      <div style={{ marginTop: 26, fontSize: 13.5, color: "var(--faint)" }}>Proof, not a diary. → use ← / → to navigate</div>
    </>
  )},
  { tag: "01 · THE PROBLEM", render: () => (
    <>
      <H>&ldquo;Trust me&rdquo; doesn&apos;t scale to machines</H>
      <Lead>Trillions in real-world assets are moving on-chain, and autonomous agents are starting to manage them. But today an AI money-agent asks you to <strong>trust a log file</strong>: it says what it did, and you hope it&apos;s true. No proof it followed its mandate. No proof it&apos;s solvent. No independent check before it moves your funds.</Lead>
      <Grid>
        <Cell t="Unverifiable reasoning" d="&ldquo;The AI decided X&rdquo; — signed by nobody, checkable by no one." />
        <Cell t="Self-reported solvency" d="An operator can claim $1M in reserves while owing $10M." />
        <Cell t="No separation of duties" d="The same agent that decides also executes. Nothing stops a bad call." />
      </Grid>
    </>
  )},
  { tag: "02 · THE SOLUTION", render: () => (
    <>
      <H>Make trust <em>structural</em> — and public</H>
      <Lead>Amanah is an autonomous treasury agent whose every claim is a checkable on-chain fact. An LLM reads live RWA prices, decides, <strong>signs its reasoning, and a contract verifies that signature before recording it.</strong> Only then can the vault reallocate — yield only, principal locked, through gates an independent custodian controls, with a K-of-N auditor quorum that must approve on-chain.</Lead>
      <Grid>
        <Cell k="INSTEAD OF" t="A diary you trust" d="Logs, dashboards, screenshots — all forgeable." />
        <Cell k="AMANAH SHIPS" t="Proofs you verify" d="Ed25519 + zero-knowledge + on-chain enforcement, re-runnable in your browser." />
      </Grid>
    </>
  )},
  { tag: "03 · HOW IT WORKS · THE CYCLE", render: () => (
    <>
      <H>One autonomous cycle, seven proofs</H>
      <Lead>Every ~60 seconds the agent runs the full loop — each step producing verifiable output:</Lead>
      <div style={{ marginTop: 26, display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", maxWidth: 900 }}>
        {["Ingest live RWA prices", "Pay for a signal via x402", "Consensus panel (3 models) decides", "Sign + attest reasoning on-chain", "Independent auditor grades it", "K-of-N quorum must approve", "Vault reallocates — yield only", "CSPR reserve earns staking yield"].map((s, i) => (
          <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 14px", borderRadius: 999, border: "1px solid var(--border2)", background: "var(--surface-subtle)", fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>
            <span style={{ color: "var(--gold-deep)", fontWeight: 800 }}>{i + 1}</span>{s}
          </span>
        ))}
      </div>
      <Lead>Output each cycle: real on-chain transactions — an attestation, an auditor verdict, a settlement — all on <span className="mono" style={{ fontSize: 13 }}>testnet.cspr.live</span>.</Lead>
    </>
  )},
  { tag: "04 · FEATURE · PROOF-OF-REASONING", render: () => (
    <>
      <H>The AI signs its reasoning. The contract checks it.</H>
      <Lead>The decision blob is blake2b-hashed, Ed25519-signed, and the signature is <strong>verified inside the AttestationLog contract</strong> before it&apos;s recorded. Forge one byte and it reverts.</Lead>
      <Grid>
        <Cell k="INPUT" t="LLM decision + full context" d="Prices, paid signal, MCP market data, model id — all in the signed blob." />
        <Cell k="OUTPUT" t="An on-chain attestation" d="A tx hash + a blake2b reasoning hash, published to IPFS. Recompute it yourself." />
        <Cell k="GUARANTEE" t="Authentic + untampered" d="Not &ldquo;we logged it&rdquo; — the chain verified who signed it and that it hasn't changed." />
      </Grid>
    </>
  )},
  { tag: "05 · FEATURE · ZERO-KNOWLEDGE", render: () => (
    <>
      <H>Prove solvency &amp; KYC — reveal nothing</H>
      <Lead>A real Schnorr + Pedersen zero-knowledge stack, verified <strong>in the Casper WASM VM</strong> — not a stored flag.</Lead>
      <Grid>
        <Cell k="ZK PROOF-OF-RESERVES" t="Reserves ≥ principal" d="Hidden per-asset allocations sum to the total & cover the floor — no amount revealed." />
        <Cell k="RANGE PROOFS" t="Each allocation ≥ 0" d="48-bit range proofs stop wrapped/negative values faking the sum." />
        <Cell k="PROOF-OF-LIABILITIES" t="Reserves ≥ what's owed" d="A Merkle tree of client balances — each client verifies inclusion, sees no one else's." />
        <Cell k="ZK KYC" t="Credential held, secret never sent" d="A Schnorr NIZK proves the agent is KYC'd, verified on-chain." />
      </Grid>
    </>
  )},
  { tag: "06 · FEATURE · SEPARATION OF DUTIES", render: () => (
    <>
      <H>No lone agent — and no lone model — moves funds</H>
      <Lead>The biggest risk in an autonomous agent is one bad call. Amanah needs consensus <em>and</em> independent approval before a single token moves.</Lead>
      <Grid>
        <Cell k="MULTI-MODEL CONSENSUS" t="3 model families vote" d="Funds move only on a majority agreeing on the same action + direction. A split escalates." />
        <Cell k="INDEPENDENT AUDITOR" t="A 2nd agent, different key" d="Grades every decision APPROVE/VETO on-chain. A veto blocks the move & slashes reputation." />
        <Cell k="K-of-N QUORUM" t="Enforced by the vault" d="The contract reverts NotApproved without a threshold of independent signed votes." />
        <Cell k="HUMAN-IN-THE-LOOP" t="On-chain sign-off" d="Low-confidence cycles escalate to a human, who votes with a real wallet (EU AI Act Art. 14)." />
      </Grid>
    </>
  )},
  { tag: "07 · FEATURE · REAL YIELD", render: () => (
    <>
      <H>Real value, actually working</H>
      <Lead>The treasury&apos;s CSPR reserve isn&apos;t idle — it&apos;s <strong>delegated to a Casper validator through the auction contract</strong>, earning real native staking rewards every era. And the agent decides this <em>autonomously</em>, respecting a liquid reserve buffer.</Lead>
      <Grid>
        <Cell k="OUTPUT" t="Accruing native rewards" d="Live on the dashboard: staked total, rewards earned, principal (fully recoverable)." />
        <Cell k="AUTONOMY" t="The agent chooses to stake" d="It reads idle CSPR each cycle, respects a buffer, and attests the yield decision on-chain." />
        <Cell k="WHY IT MATTERS" t="&ldquo;Real yield&rdquo; — proven" d="Not a mainnet-only claim: quantified, on-chain, and checkable today." />
      </Grid>
    </>
  )},
  { tag: "08 · FEATURE · COMPLIANCE", render: () => (
    <>
      <H>The artifact a regulator asks for</H>
      <Lead>Generated from the chain, not a database we control — the evidence an examiner expects under <span className="mono" style={{ fontSize: 13 }}>Advisers Act 206(4)-7</span> / DORA.</Lead>
      <Grid>
        <Cell k="EXCEPTION REPORT" t="Every control that fired" d="Each refused transaction, named by the control behind it — a refusal is the control working." />
        <Cell k="OPERATING EFFECTIVENESS" t="Over a period (SOC-2 Type II)" d="Solvency proven every cycle — the control ran continuously, not once." />
        <Cell k="POLICY SIGN-OFF" t="Governed on-chain" d="The trading policy is a signed-off parameter the quorum approves; changes are time-locked." />
        <Cell k="PER-CLIENT EVIDENCE" t="Portable & offline-verifiable" d="A pack each client hands their own auditor — their proof, nobody else's balance." />
      </Grid>
    </>
  )},
  { tag: "09 · THE OUTPUTS", render: () => (
    <>
      <H>What you actually get</H>
      <Lead>Every feature produces a concrete, checkable output — not a claim.</Lead>
      <Grid>
        <Cell k="ON-CHAIN" t="Real transactions" d="Attestations, auditor verdicts, quorum votes, ZK proofs, staking — all on cspr.live." />
        <Cell k="IN YOUR BROWSER" t="Re-runnable proofs" d="Re-verify the ZK solvency, tamper it, watch it break — no trust required." />
        <Cell k="ONE CLICK" t="Live self-audit scorecard" d="10 headline claims checked against the chain, right now — 10/10 green." />
        <Cell k="MACHINE-READABLE" t="Agent trust manifest" d="Another agent can verify Amanah programmatically via /api/manifest." />
      </Grid>
    </>
  )},
  { tag: "10 · LIVE DEMO", render: () => (
    <>
      <H>Don&apos;t trust us. Verify us.</H>
      <Lead>The whole system, checked live against the chain — then watch a full walkthrough, or open the site and break a proof yourself.</Lead>
      <div style={{ marginTop: 24, width: "100%", maxWidth: 760, borderRadius: 16, overflow: "hidden", border: "1px solid var(--border2)", background: "#000" }}>
        <video src="/walkthrough.webm" controls playsInline preload="metadata" poster="" style={{ width: "100%", display: "block" }} />
      </div>
      <div style={{ marginTop: 18, display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
        <a href={`${SITE}/verify`} target="_blank" rel="noopener noreferrer" className="btn-primary" style={{ padding: "12px 22px", borderRadius: 999, fontSize: 15, fontWeight: 700, textDecoration: "none", background: "#15120e", color: "#fff" }}>Open the live proof lab ↗</a>
        <a href={`${SITE}/dashboard`} target="_blank" rel="noopener noreferrer" style={{ padding: "12px 22px", borderRadius: 999, fontSize: 15, fontWeight: 600, textDecoration: "none", border: "1px solid var(--border)", color: "var(--ink2)" }}>See the treasury ↗</a>
      </div>
    </>
  )},
  { tag: "11 · WHY WE WIN", render: () => (
    <>
      <H>One agent, the whole trust stack</H>
      <Lead>In a field of 85+ projects, most nail <strong>one</strong> pillar. Amanah is the only one that combines them all — and the only one you can fully re-verify yourself.</Lead>
      <Grid>
        <Cell t="Proof-of-reasoning" d="✓ signed + verified in-contract" />
        <Cell t="Zero-knowledge solvency + KYC" d="✓ re-runnable in your browser" />
        <Cell t="Enforced auditor quorum" d="✓ the vault refuses unapproved moves" />
        <Cell t="Multi-model consensus" d="✓ no lone model moves funds" />
        <Cell t="Real native staking yield" d="✓ quantified, on-chain, live" />
        <Cell t="Compliance over a period" d="✓ the regulator's artifact" />
      </Grid>
    </>
  )},
  { tag: "12 · BUILT ON THE CASPER AI TOOLKIT", render: () => (
    <>
      <H>The prized stack, wired together</H>
      <Lead>Amanah uses the full Casper agentic toolkit — not one piece, all of it.</Lead>
      <Grid>
        <Cell k="x402" t="Two-sided, on-chain" d="Pays for signals AND earns for its verified reasoning — CEP-3009, distinct payees." />
        <Cell k="MCP" t="Consumed + served" d="Consumes the official CSPR.cloud (82 tools) + CSPR.trade (23 tools); serves its own." />
        <Cell k="AI AGENT SKILL" t="Installable" d="Any coding agent can inspect + verify the treasury via our SKILL.md." />
        <Cell k="ODRA" t="14 WASM contracts" d="RwaVault, AttestationLog, AuditorQuorum, ZkReserves, ZkKyc, PolicyEngine, Timelock…" />
        <Cell k="CSPR.click / cloud" t="Wallet + data" d="Real wallet connect + on-chain voting; live REST + Streaming reads." />
        <Cell k="VERIFIABLE AI" t="TEE-attested inference" d="Route the decision through a TEE provider; anchor the signed receipt on-chain." />
      </Grid>
    </>
  )},
  { tag: "13 · TRACTION · ROADMAP · VISION", render: () => (
    <>
      <H>A real project, not a throwaway</H>
      <Grid>
        <Cell k="PROVEN" t="133 tests, all green" d="81 agent + 25 contract + 27 E2E. Live 10/10 self-audit scorecard on-chain." />
        <Cell k="ON-CHAIN" t="Dozens of real proofs" d="Autonomous reallocate, auditor veto, ZK reserves, quorum enforcement, staking — each a tx hash." />
        <Cell k="NEXT" t="Audit → mainnet → first RWA" d="Security audit, mainnet core, a real tokenized RWA + KYC issuer, an open staked auditor network." />
        <Cell k="REVENUE" t="Controls-as-a-service" d="Management-fee bps on AUM, pay-per-proof (x402 earn live), controls SDK for other RWA protocols." />
      </Grid>
      <Lead>Vision: Amanah&apos;s controls become <strong>shared Casper primitives</strong> — the trust layer the agent economy runs on.</Lead>
    </>
  )},
  { tag: "14 · THANK YOU", render: () => (
    <>
      <div style={{ fontSize: "clamp(40px,7vw,88px)", fontWeight: 600, letterSpacing: "-2px", color: "var(--ink)", lineHeight: 1 }} className="serif">Verify us.</div>
      <Lead>Autonomous, compliant, and provable — on Casper. Every claim is a public transaction you can check yourself.</Lead>
      <div style={{ marginTop: 26, display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
        <a href={SITE} target="_blank" rel="noopener noreferrer" className="btn-primary" style={{ padding: "12px 22px", borderRadius: 999, fontSize: 15, fontWeight: 700, textDecoration: "none", background: "#15120e", color: "#fff" }}>amanah-casper-rwa.vercel.app ↗</a>
        <a href="https://github.com/PugarHuda/amanah-casper" target="_blank" rel="noopener noreferrer" style={{ padding: "12px 22px", borderRadius: 999, fontSize: 15, fontWeight: 600, textDecoration: "none", border: "1px solid var(--border)", color: "var(--ink2)" }}>GitHub ↗</a>
        <Link href="/verify" style={{ padding: "12px 22px", borderRadius: 999, fontSize: 15, fontWeight: 600, textDecoration: "none", border: "1px solid var(--border)", color: "var(--ink2)" }}>Live self-audit →</Link>
      </div>
    </>
  )},
];

export default function Deck() {
  const [i, setI] = useState(0);
  const n = SLIDES.length;
  const touchX = useRef<number | null>(null);
  const go = useCallback((d: number) => setI((v) => Math.max(0, Math.min(n - 1, v + d))), [n]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") { e.preventDefault(); go(1); }
      else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); go(-1); }
      else if (e.key === "Home") setI(0);
      else if (e.key === "End") setI(n - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, n]);

  const s = SLIDES[i];
  return (
    <main
      style={{ position: "fixed", inset: 0, background: "var(--bg, #fbfaf6)", display: "flex", flexDirection: "column", overflow: "hidden" }}
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => { if (touchX.current == null) return; const dx = e.changedTouches[0].clientX - touchX.current; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); touchX.current = null; }}
    >
      {/* progress bar */}
      <div style={{ height: 3, background: "var(--border2)", flexShrink: 0 }}>
        <div style={{ height: "100%", width: `${((i + 1) / n) * 100}%`, background: "var(--gold-deep)", transition: "width .3s ease" }} />
      </div>

      {/* slide */}
      <section key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "clamp(24px, 5vw, 72px)", animation: "deckIn .35s ease" }}>
        <Tag>{s.tag}</Tag>
        {s.render()}
      </section>

      {/* nav bar */}
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px clamp(20px, 4vw, 48px)", borderTop: "1px solid var(--border2)" }}>
        <button onClick={() => go(-1)} disabled={i === 0} aria-label="previous" style={{ background: "none", border: "1px solid var(--border2)", borderRadius: 999, padding: "8px 16px", fontSize: 14, fontWeight: 600, color: "var(--ink2)", cursor: i === 0 ? "default" : "pointer", opacity: i === 0 ? 0.4 : 1 }}>← Prev</button>
        <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
          {SLIDES.map((_, k) => (
            <button key={k} onClick={() => setI(k)} aria-label={`slide ${k + 1}`} style={{ width: k === i ? 22 : 8, height: 8, borderRadius: 999, border: "none", background: k === i ? "var(--gold-deep)" : "var(--border2)", cursor: "pointer", transition: "width .2s" }} />
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span className="mono" style={{ fontSize: 12, color: "var(--faint)" }}>{String(i + 1).padStart(2, "0")} / {n}</span>
          <button onClick={() => go(1)} disabled={i === n - 1} aria-label="next" className="btn-primary" style={{ border: "none", borderRadius: 999, padding: "8px 18px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#15120e", cursor: i === n - 1 ? "default" : "pointer", opacity: i === n - 1 ? 0.5 : 1 }}>Next →</button>
        </div>
      </div>

      <style>{`@keyframes deckIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }`}</style>
    </main>
  );
}
