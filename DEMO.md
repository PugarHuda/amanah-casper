# Amanah — Demo & Submission Guide

**▶️ Watch the 3-min demo video:** https://youtu.be/lqG0nfVifA8

**Casper Agentic Buildathon 2026.** Autonomous, compliant RWA treasury agent on
Casper testnet. It ingests live RWA prices, **pays for a premium signal via x402**,
reasons with an LLM, **signs its reasoning (Ed25519) and verifies that signature
ON-CHAIN** before recording it, runs guardrail + compliance checks, then
**reallocates yield** — all as real testnet transactions.

> Differentiator: **proof, not a diary.** Every decision is cryptographically
> signed and verified *by the contract itself*, publicly checkable on cspr.live —
> not logged to a private database.

---

## 1. Verifiable proof (paste into testnet.cspr.live)

The on-chain steps of the loop, each a real transaction (attest → audit → guardrails → reallocate):

| Step | Hash | Link |
|---|---|---|
| Attestation — reasoning signed + verified on-chain | `a87e10c77a873ace20d580b13d4b0c2a31e6899ed0ac5fe92412f3145dd870e8` | [view](https://testnet.cspr.live/deploy/a87e10c77a873ace20d580b13d4b0c2a31e6899ed0ac5fe92412f3145dd870e8) |
| x402 settlement — `transfer_with_authorization` (CEP-3009) | `391274dcad1ebd7dd2641bd94aa17893084adf76f58b5603d7d69c0c4cce4398` | [view](https://testnet.cspr.live/deploy/391274dcad1ebd7dd2641bd94aa17893084adf76f58b5603d7d69c0c4cce4398) |
| **x402 PAY** — Amanah → custodian (agent-pays-another-agent) | `785ceb256649f9d61bd31e3ddd863d7861d2f991d600355377d2d64e3ccf0766` | [view](https://testnet.cspr.live/deploy/785ceb256649f9d61bd31e3ddd863d7861d2f991d600355377d2d64e3ccf0766) |
| **x402 EARN** — a buyer paid Amanah for verified reasoning | `cf48c91df6240231461e0b75a06c93852569d13257a2ad9aa1239773ba8a1b4c` | [view](https://testnet.cspr.live/deploy/cf48c91df6240231461e0b75a06c93852569d13257a2ad9aa1239773ba8a1b4c) |
| Reallocate — $50K yield Gold→T-bond (SpendGate + Compliance gated) | `eeecb9d136a622d07ab41b641272439919d37d14689e7392feee56bb195ac8a0` | [view](https://testnet.cspr.live/deploy/eeecb9d136a622d07ab41b641272439919d37d14689e7392feee56bb195ac8a0) |
| Reputation — `record_payment` credits the x402 proof (anti-replay) | `de899bef804a0cce3f0e77b9db08e8f4226e097245098ea7bbca0eb469b90711` | [view](https://testnet.cspr.live/deploy/de899bef804a0cce3f0e77b9db08e8f4226e097245098ea7bbca0eb469b90711) |
| Reallocate v2 — through **custodian-owned** gates, $800K principal locked | `e81b4abc0c96b73d2c3d65e4800b2c208e106c78fc0ab57e552fa82c1c6f7149` | [view](https://testnet.cspr.live/deploy/e81b4abc0c96b73d2c3d65e4800b2c208e106c78fc0ab57e552fa82c1c6f7149) |
| **Autonomous reallocate — LLM-decided** (Gold→CSPR, conf 0.85) + attest `0746b729…` | `9e266b0554d2930cd5716da9493e4ab7991d834d4a688fee20e02b6283b26d1a` | [view](https://testnet.cspr.live/deploy/9e266b0554d2930cd5716da9493e4ab7991d834d4a688fee20e02b6283b26d1a) |
| **Auditor VETO** — 2nd agent (custodian key) blocked a flawed move on-chain | `987a3700aeb127649d26680fe5c92012f5d4990a24a6dc0f13e4f177936afe11` | [view](https://testnet.cspr.live/deploy/987a3700aeb127649d26680fe5c92012f5d4990a24a6dc0f13e4f177936afe11) |
| **Auditor APPROVE** (grade 0.9) → reallocate executed `204b3c9c…` | `93585d75dd8133bde3e40803ecb8e6fdfcb8c9acefdbbd26405aa13e09528f1e` | [view](https://testnet.cspr.live/deploy/93585d75dd8133bde3e40803ecb8e6fdfcb8c9acefdbbd26405aa13e09528f1e) |
| **Auditor QUORUM** — 2-of-3 independent auditors signed APPROVE on-chain (vote 1) | `483f66cdbdc0803333f35c7f70ad8bde3bd32e275e66af7ba83aaf6c27f64ca2` | [view](https://testnet.cspr.live/deploy/483f66cdbdc0803333f35c7f70ad8bde3bd32e275e66af7ba83aaf6c27f64ca2) |
| **Circuit breaker BLOCKED** — reallocate refused, agent below reputation floor | `82dc878b617a352f999d15577ce58660a8e107496d19ce7870dba0cde85e2350` | [view](https://testnet.cspr.live/deploy/82dc878b617a352f999d15577ce58660a8e107496d19ce7870dba0cde85e2350) |
| **Circuit breaker RESUMED** — trading resumed after reputation recovered | `09073684a1c8c17dbfae143aafb2d8c443ea7bd51f4296ae5b9fa566d538c6fe` | [view](https://testnet.cspr.live/deploy/09073684a1c8c17dbfae143aafb2d8c443ea7bd51f4296ae5b9fa566d538c6fe) |
| **ZK proof-of-reserves** — solvency proven on-chain against the vault's real balances | `70318a98ecc37822aad441264931daa5712953deaec19c7fcd920e882d29b252` | [view](https://testnet.cspr.live/deploy/70318a98ecc37822aad441264931daa5712953deaec19c7fcd920e882d29b252) |
| **REFUSED — proof about numbers we don't hold** — a cryptographically valid proof for $1.05M, rejected `TotalMismatch` because the vault holds $1.00M | `3c114651e1a0008e81286016264c05dcc570959279d1964b86b54409e60ff1ee` | [view](https://testnet.cspr.live/deploy/3c114651e1a0008e81286016264c05dcc570959279d1964b86b54409e60ff1ee) |
| 🔒 **Quorum ENFORCED on-chain** — vault refused an unapproved decision (`NotApproved`) | `ba368de335840645486c7692cf1fdee8b0ca3f7f61514091515a32052ac2d7b7` | [view](https://testnet.cspr.live/deploy/ba368de335840645486c7692cf1fdee8b0ca3f7f61514091515a32052ac2d7b7) |
| **Quorum-approved decision executed** | `e68d42184b6f7fac2e226bea10c6a3e0942a276da6d6065618ac0f2d6c533c8e` | [view](https://testnet.cspr.live/deploy/e68d42184b6f7fac2e226bea10c6a3e0942a276da6d6065618ac0f2d6c533c8e) |
| 💀 **Dead-man's switch tripped by a third party** — silent agent's vault frozen | `13729bdebafd2d3d6e928df56febfa0043d447470a8747ddc723c933a1d5897d` | [view](https://testnet.cspr.live/deploy/13729bdebafd2d3d6e928df56febfa0043d447470a8747ddc723c933a1d5897d) |
| **Non-custodian unfreeze DENIED** | `1a4897f2576bf2ad246548ccc8503ba6fab709031072cf86b2d13b1f58c22773` | [view](https://testnet.cspr.live/deploy/1a4897f2576bf2ad246548ccc8503ba6fab709031072cf86b2d13b1f58c22773) |
| **Custodian lifted the freeze** | `302530d2d9b2db38aec1a502caafd0450487b828f48ae75d67e3469acec1fb9a` | [view](https://testnet.cspr.live/deploy/302530d2d9b2db38aec1a502caafd0450487b828f48ae75d67e3469acec1fb9a) |
| **Reputation slash** — a veto docked the agent's score (custodian-gated) | `a2ac131fb79dd1ae208a57719db86caa77806c0a22f3443f338e0112655977fc` | [view](https://testnet.cspr.live/deploy/a2ac131fb79dd1ae208a57719db86caa77806c0a22f3443f338e0112655977fc) |
| **Zero-knowledge KYC** — Schnorr NIZK verified ON-CHAIN (secret never sent) | `da738fc1b49bea83988956dae45543785a71279be5a6dcb5582ddab5c0882ed4` | [view](https://testnet.cspr.live/deploy/da738fc1b49bea83988956dae45543785a71279be5a6dcb5582ddab5c0882ed4) |

Separation of powers: the **custodian** (a separate key,
`0109cd12284a8fe4cde3be32b28bd1c6f71ca80f7455571fd127f55573b74bb197`) deployed +
owns SpendGate/Compliance, allowlisted the agent, and set its KYC — the agent can't
authorize itself (`agent/src/migrate-custody.ts`).

Agent account: `0147ebe715f3fb6d387ae2f102e55032ba54c8c4557293d7800cad11561496fdaa`.
Ten contract package hashes are in [`.env.deployed`](.env.deployed) / the README.

---

## 2. Live demo runbook (~3 min)

```bash
# A — the x402 premium-signal seller (the agent pays this)
cd signal-service && npm install && npm run dev          # :8402, GET /alpha is x402-gated

# B — read live treasury straight off the vault v2 (no entrypoint)
cd agent && npm install && npx tsx src/read-vault.ts
#   -> Gold 199000000000  TBond 450000000000  WTI 150000000000  CSPR 201000000000
#      principal 800000000000  total 1000000000000  ($1.00M, $800K principal locked)

# C — one full autonomous cycle (enrich via MCP + real x402 pay + attest on-chain)
cd agent && MAX_CYCLES=1 npm run dev
#   logs: ingest -> cspr-mcp.insights + trade-mcp.quote (official MCP servers) ->
#         x402.settle -> reason (deepseek-v4-flash, cites the DEX price impact) ->
#         attest (tx hash) + IPFS pin. The LLM may autonomously reallocate (see proof above).

# D — query the agent like a judge would, over MCP
cd mcp && npm install && npx tsx src/server.ts           # stdio MCP server
#   get_vault_state  -> live holdings + total decoded from the vault ($1.00M)
#   get_audit_trail  -> the real deploys above, labelled by contract
#   get_attestation <hash> -> reads the published reasoning blob, recomputes
#                             blake2b, confirms it matches what was attested
#   get_reputation <account-hash> -> live i64 score from ReputationRegistry (= 1)
```

All four MCP tools are LIVE (decoded straight from chain). Quick check:
`cd mcp && npx tsx src/smoke.ts` prints reputation=1, vault=$1M, attestation verified=true.

To reproduce the whole custodian-separated deployment from scratch (fund a custodian,
deploy the gates it owns, seed + reallocate): `cd agent && DRY_RUN=false npx tsx
src/migrate-custody.ts` (resumable). A 30s read-only demo: `./scripts/demo.ps1`.

---

## 3. Video script (~2.5 min, screen-recording)

Record at 1080p. Have two things open: the **live dashboard**
(https://amanah-casper-rwa.vercel.app) and a terminal in `agent/`. Keep
**testnet.cspr.live** in a third tab to paste hashes. Read the **bold** lines aloud.

**0:00–0:15 · Hook** — *(landing page)*
> "Most 'AI agents' managing money ask you to trust a log file. **Amanah proves every
> decision on-chain — and a second, independent agent has to approve it before a single
> token moves.**" Click **"See it live"** → the dashboard.

**0:15–0:55 · The live dashboard (breadth, fast)** — *(scroll the dashboard)*
> "A real tokenized treasury on Casper testnet — **$1,000,000, with $800,000 principal
> locked** by a vault invariant. The agent can only ever move the yield." Point at the
> compliance row: **"KYC proven in zero-knowledge. An independent auditor's verdict.
> Guardrail limits. All read live from chain — nothing hardcoded."** Point at the live
> event feed: **"contract events streaming in over CSPR.cloud."**

**0:55–1:30 · Proof, not a diary + the two-agent check** — *(agent console → cspr.live)*
> Open **/agent**: "The agent signs its reasoning and the **contract verifies that
> Ed25519 signature *inside the contract* before recording it** — forge the hash and it
> reverts." Point at the **AUDITOR** step: **"A second agent, with its own key, graded
> this decision on-chain. Here it VETOED a flawed move — and the reallocate was blocked,
> and the agent's reputation was slashed."** Paste the auditor VETO hash `987a3700…` on
> cspr.live → **SUCCESS**. "Two independent signatures, two keys, every cycle. Neither
> can forge the other."

**1:30–1:55 · Real zero-knowledge KYC** — *(dashboard ZK card → cspr.live)*
> Point at **"KYC (zero-knowledge) · Proven ✓"**: **"The agent proved it holds its KYC
> credential with a Schnorr zero-knowledge proof — verified *inside* a Casper contract,
> in the WASM VM. The secret is never sent. Not a flag — real 256-bit ZK."** Paste
> `da738fc1…` on cspr.live → SUCCESS.

**1:55–2:20 · It's live and autonomous** — *(terminal)*
> Run `MAX_CYCLES=1 npm run dev`. Narrate: **"Live prices in → it pays another agent
> for a signal via x402 → reasons → signs + attests on-chain → the auditor grades it →
> and only then, if approved, it reallocates."** Copy the attest hash → paste on
> cspr.live → SUCCESS.

**2:20–2:30 · Close** — *(README / proof table)*
> **"Autonomous, compliant, and provable — on Casper. x402, MCP, Odra, CSPR.cloud,
> CSPR.click, zero-knowledge, a verified on-chain identity. Every claim is a public tx
> hash."** Show the repo URL + the proof table.

Fallback if a live cycle is slow on camera: skip 1:55–2:20 and instead paste the
**autonomous reallocate** hash `9e266b05…` (the LLM-decided Gold→CSPR move) — the whole
thesis in one transaction.

---

## 4. Submission checklist (DoraHacks)

- [x] Working prototype on **Casper Testnet** with tx-producing on-chain component
      (attest + x402 + reallocate proofs above) — the hard eligibility gate.
- [x] Open-source GitHub repo with README — https://github.com/PugarHuda/amanah-casper
- [ ] **Public demo video** — record from the script in §3, upload (YouTube/Loom),
      add the link to the DoraHacks submission. *(You must do this — required.)*
- [ ] **Register on CSPR.fans** for the community-vote round (top-3 there
      auto-advance to the jury). *(Your action; not doable from code.)*
- [x] Original code; secrets gitignored.

---

## 5. Integration & roadmap (honest status)

**Live now (partner tools, all real):**
- **Casper L1** — Odra 2.8.1, 10 contracts, an on-chain tx every loop step.
- **x402 Facilitator** — CEP-3009 `transfer_with_authorization`, settled on-chain.
  **Genuinely two-sided (distinct payee per route)**: Amanah *pays a separate signal
  provider* — the custodian account — for alpha (`GET /alpha`, `X402_ALPHA_PAY_TO`;
  agent-pays-*another*-agent, proof `785ceb25`), AND the *earn* side `GET
  /verified-reasoning` sells Amanah's proof-of-reasoning and settles to **Amanah's own
  account** — a buyer (the custodian) paid it, crediting Amanah (proof `cf48c91d`).
  Both directions proven on-chain with distinct parties. `src/buy-verified-reasoning.ts`
  runs the earn demo.
- **CSPR.cloud REST** — audit trail + treasury decode + reputation + rates.
- **CSPR.cloud Streaming API** — real-time contract-event feed on `/dashboard`
  (WebSocket → SSE relay at `/api/stream`; key stays server-side). Verified
  end-to-end: an `Attested` event hit the feed within seconds of a cycle. CLI:
  `cd agent && npx tsx src/stream.ts`.
- **CSPR.click** — official hosted wallet SDK on `/connect` (Casper Wallet / Ledger
  / MetaMask Snap / Google+Apple social login). A **production app-id** (`7535146b…`,
  domain `amanah-casper-rwa.vercel.app`) is wired and verified live — the modal opens
  on the deployed URL, not just localhost.
- **Casper Account Info** (MAKE) — the agent registered its identity via `set_url` on
  the account-info contract, pointing at our domain's
  `/.well-known/casper/account-info.casper-test.json` (which lists the agent pubkey).
  Once MAKE's indexer crawls it, the account shows as **verified "Amanah"** on cspr.live.
- **Official CSPR.cloud MCP server** — the agent *consumes* the partner's hosted
  MCP (`mcp.testnet.cspr.cloud`, 82 tools) every cycle for balance + CSPR/USD rate
  (`cspr-mcp.insights` step). Demo: `cd agent && npx tsx src/cspr-mcp.ts`.
- **Official CSPR.trade DEX MCP** — the agent also *consumes* the DEX MCP
  (`mcp.cspr.trade`, 23 tools, public/non-custodial) each cycle for a live
  CSPR↔sCSPR quote (`trade-mcp.quote` step). Demo: `npx tsx src/trade-mcp.ts`.
- **Public IPFS pin** — every reasoning blob is pinned to IPFS via Pinata; the agent
  console links "verify blob on IPFS". Verified retrievable (e.g. `QmT5LeV4…`).
- **MCP** — our own read-only server, all 4 tools decode live chain state.
- **SpendGate + Compliance** — per-tx cap / daily limit / spent-today AND KYC status
  + allowlist read live from the contracts (dashboard + console + our MCP). No
  hardcoded guard or compliance values.
- **AI Agent Skill** — `skill/SKILL.md` (+ `references/llms.txt`) lets any AI coding
  agent (Claude Code, Cursor, …) inspect + verify the treasury via our MCP and
  cspr.live. Completes the prized AI Agent Skills + MCP + x402 trio.
- **Venice** — reasoning (`deepseek-v4-flash`).

**Next (all that's left):**
1. **CSPR.fans** registration — unlocks the community-vote auto-advance path (user action).
2. **CSPR.trade swap execution** — we consume the DEX MCP for read/quotes today;
   `build_swap` + local signing would let the agent execute a real swap (the vault
   holds synthetic RWA on testnet, so this is a mainnet-CSPR-leg extension).
