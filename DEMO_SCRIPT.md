# Amanah — demo video, word-for-word script (~2:45)

The **submission-ready** voiceover. Read the lines in quotes exactly; `[SCREEN: …]` is what
to show. Record 1080p. Have three tabs ready: **the site** (amanah-casper-rwa.vercel.app), a
**terminal** in `agent/`, and **testnet.cspr.live**. Total ≈ 2 min 45 s. Judges reward tight —
don't linger.

> Why this order: it opens with the one thing **no rival offers** (verify the whole system in one
> click), proves it live, then closes on **real native staking yield** — the exact edge the closest
> competitor (Agent Casper) claims. Every scene ends on a real transaction hash.

---

### 0:00 – 0:12 · Hook
[SCREEN: landing page, then scroll to the "don't trust us — check us" cards]

> "Most AI agents that manage money ask you to trust a log file. Amanah asks you to trust
> **nothing** — every decision is proven on-chain, and you can re-verify the entire system
> yourself. Let me show you."

---

### 0:12 – 0:38 · The one-click self-audit  ← *the opener no competitor has*
[SCREEN: go to **/verify**. The scorecard sits at the top: "10 of 10 claims verified live,
on-chain, right now." Let it finish loading, then slowly scroll the ten green checks.]

> "This is the whole system, checked against the Casper chain **right now**, live — not a
> screenshot. Treasury solvency, an enforced auditor quorum, a signed-off policy, a kill
> switch, real staking yield — **ten claims, ten green, each with its own on-chain proof.**
> Every other project shows you one feature. Amanah lets you audit all of it in one click."

[SCREEN: click any "proof ↗" link → it opens that exact deploy on cspr.live.]

> "Click any of them and you land on the transaction. So — let's actually break something."

---

### 0:38 – 1:10 · Re-run the cryptography in your browser
[SCREEN: on /verify, scroll to the ZK proof-of-reserves card. Show it verifying.]

> "This is our zero-knowledge proof of solvency — it proves the treasury's hidden allocations
> sum to its total and cover the locked principal, **without revealing a single amount**. And
> your browser is re-running the exact proof the contract accepted."

[SCREEN: click the "overstate by \$1" / tamper button. The proof flips to red / FAIL.]

> "Watch — I inflate the reserves by one dollar… and the proof **fails, instantly.** You don't
> have to take our word for the math. You can falsify it yourself."

---

### 1:10 – 1:40 · Autonomous, and it decides by consensus
[SCREEN: terminal — run `MAX_CYCLES=1 npm run dev`. Let the log scroll.]

> "Now the agent itself. Live market prices come in… it pays another agent for a signal over
> x402… and here's the part that matters —"

[SCREEN: point at the `🧠 panel AGREED` line.]

> "— the decision isn't one model. **A panel of three different model families each votes**, and
> funds only move when a majority independently agree — on the same action *and* the same size.
> A split escalates to a human. Then it signs its reasoning and **attests it on-chain.**"

[SCREEN: copy the `⛓ attest deploy:` hash → paste on cspr.live → SUCCESS.]

> "There's the reasoning, verified inside the contract. Proof, not a diary."

---

### 1:40 – 2:05 · Separation of duties — a control that *refuses*
[SCREEN: /verify card 0 — paste the refusal hash
`ba368de335840645486c7692cf1fdee8b0ca3f7f61514091515a32052ac2d7b7`.]

> "An independent auditor agent — a second key — has to approve every move, and the vault
> **enforces** it. Here's a decision that wasn't approved by the quorum…"

[SCREEN: the result shows **refused · NotApproved**, then click through to cspr.live.]

> "…and the contract **refused it.** On-chain. A refusal isn't a bug — it's the control doing
> its job, and it's the evidence a regulator actually asks for."

---

### 2:05 – 2:28 · Real native staking yield  ← *neutralizes the closest rival*
[SCREEN: /dashboard — the green "REAL NATIVE STAKING YIELD" card.]

> "And this isn't paper. The treasury's CSPR reserve is **delegated to a Casper validator** —
> earning **real native staking rewards**, every era, principal fully recoverable."

[SCREEN: click "Delegation deploy ↗" → the real delegate tx on cspr.live.]

> "Real yield, real on-chain delegation, verifiable like everything else."

---

### 2:28 – 2:45 · Close
[SCREEN: back to the /verify scorecard, 10/10 green; then the GitHub repo + proof table.]

> "Autonomous, compliant, and provable — on Casper. Zero-knowledge solvency, a multi-model
> consensus panel, an enforced auditor quorum, real staking yield, TEE-attested inference —
> and **every single claim is a public transaction hash you can check yourself.** That's
> Amanah. Don't trust us. Verify us."

---

## Recording tips
- **If a live cycle is slow on camera**, skip the terminal run (1:10–1:40) and instead paste the
  autonomous reallocate hash `9e266b0554d2930cd5716da9493e4ab7991d834d4a688fee20e02b6283b26d1a`
  (the LLM-decided Gold→CSPR move) — the whole thesis in one transaction.
- **If the scorecard is still loading** when you arrive, start narrating the hook line over the
  "Running the live self-audit…" state; it fills in within a few seconds.
- Keep the cursor moving and deliberate; pause half a beat after each "SUCCESS" / green flip so
  the proof lands.
- Export ≤ 3 min. Upload to YouTube/Loom unlisted, put the link in the DoraHacks submission and
  at the top of `SUBMISSION.md`.

## The single most important 20 seconds
If you only nail one section, nail **0:12–0:38 (the scorecard)** and **2:05–2:28 (real staking)**.
The first proves we're the only fully-verifiable system in the field; the second closes the only
gap a top competitor had. Together they are the win.
