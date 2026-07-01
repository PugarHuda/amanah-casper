# Amanah — Demo & Submission Guide

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

The three on-chain steps of the loop, each a real transaction:

| Step | Hash | Link |
|---|---|---|
| Attestation — reasoning signed + verified on-chain | `a87e10c77a873ace20d580b13d4b0c2a31e6899ed0ac5fe92412f3145dd870e8` | [view](https://testnet.cspr.live/deploy/a87e10c77a873ace20d580b13d4b0c2a31e6899ed0ac5fe92412f3145dd870e8) |
| x402 settlement — `transfer_with_authorization` (CEP-3009) | `391274dcad1ebd7dd2641bd94aa17893084adf76f58b5603d7d69c0c4cce4398` | [view](https://testnet.cspr.live/deploy/391274dcad1ebd7dd2641bd94aa17893084adf76f58b5603d7d69c0c4cce4398) |
| Reallocate — $50K yield Gold→T-bond (SpendGate + Compliance gated) | `eeecb9d136a622d07ab41b641272439919d37d14689e7392feee56bb195ac8a0` | [view](https://testnet.cspr.live/deploy/eeecb9d136a622d07ab41b641272439919d37d14689e7392feee56bb195ac8a0) |
| Reputation — `record_payment` credits the x402 proof (anti-replay) | `c4c65c94f9482b22af691067657d0125c3cdd6658764eb56b09e8836015edc8c` | [view](https://testnet.cspr.live/deploy/c4c65c94f9482b22af691067657d0125c3cdd6658764eb56b09e8836015edc8c) |
| Reallocate v2 — through **custodian-owned** gates, $800K principal locked | `e81b4abc0c96b73d2c3d65e4800b2c208e106c78fc0ab57e552fa82c1c6f7149` | [view](https://testnet.cspr.live/deploy/e81b4abc0c96b73d2c3d65e4800b2c208e106c78fc0ab57e552fa82c1c6f7149) |

Supporting setup txs (made the reallocate possible): `add_allowlist`
`b28aec831ae0161137c17e965a023f176f8be88239fb2e172e0e924f5c7214a4`, `set_status(Valid)`
`2c96996c41cb15d953f8b2a715d1d1a3d18afbb0e492ddc5ac70b15bab0d0bf6`.

Agent account: `0147ebe715f3fb6d387ae2f102e55032ba54c8c4557293d7800cad11561496fdaa`.
Six contract package hashes are in [`.env.deployed`](.env.deployed) / the README.

---

## 2. Live demo runbook (~3 min)

```bash
# A — the x402 premium-signal seller (the agent pays this)
cd signal-service && npm install && npm run dev          # :8402, GET /alpha is x402-gated

# B — read live treasury straight off the vault (no entrypoint)
cd agent && npm install && npx tsx src/read-vault.ts
#   -> Gold 200000000000  TBond 450000000000  WTI 150000000000  CSPR 200000000000
#      (the on-chain result of the reallocate proof above; total $1.00M, conserved)

# C — one full autonomous cycle (real x402 pay + attest on-chain)
cd agent && MAX_CYCLES=1 npm run dev
#   logs: ingest (real prices) -> x402.settle (tx hash) -> reason (deepseek-v4-flash)
#         -> attest (tx hash). Each reasoning blob is written to amanah/audit/<hash>.json.

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

To re-prove the reallocate from scratch on the live contracts:
`cd agent && DRY_RUN=false npx tsx src/go-live.ts` (idempotent).

---

## 3. Video script (~2.5 min, screen-recording)

1. **Hook (15s)** — "Most 'AI agents' ask you to trust a log file. Amanah proves
   every decision on-chain." Show the landing page.
2. **The loop (45s)** — run `MAX_CYCLES=1 npm run dev`. Narrate each line as it
   prints: real prices in, x402 payment settled (copy the tx hash), LLM decision,
   signed + attested. Switch to cspr.live, paste the attest hash → show SUCCESS.
3. **The differentiator (30s)** — open the AttestationLog contract; explain the
   Ed25519 signature is verified *inside* the contract (`attestation_log.rs`), so a
   forged reasoning hash reverts. This is the "proof, not a diary" claim, on-chain.
4. **Guardrails + reallocate (30s)** — paste the reallocate hash on cspr.live; run
   `read-vault.ts` to show Gold/T-bond actually moved. Note SpendGate cap +
   Compliance gate + the principal invariant (unit-tested).
5. **Ask-the-agent (20s)** — over MCP, `get_attestation <hash>` returns the actual
   reasoning and confirms the hash matches. `get_vault_state` shows live holdings.
6. **Close (10s)** — RWA + DeFi + autonomous agent, fully on Casper testnet, x402 +
   MCP + Odra. Repo + proof hashes on screen.

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
- **Casper L1** — Odra 2.8.1, 6 contracts, an on-chain tx every loop step.
- **x402 Facilitator** — CEP-3009 `transfer_with_authorization`, settled on-chain.
- **CSPR.cloud REST** — audit trail + treasury decode + reputation + rates.
- **CSPR.cloud Streaming API** — real-time contract-event feed on `/dashboard`
  (WebSocket → SSE relay at `/api/stream`; key stays server-side). Verified
  end-to-end: an `Attested` event hit the feed within seconds of a cycle. CLI:
  `cd agent && npx tsx src/stream.ts`.
- **CSPR.click** — official hosted wallet SDK on `/connect` (Casper Wallet / Ledger
  / MetaMask Snap / Google+Apple social login). `csprclick-template` on localhost;
  set `NEXT_PUBLIC_CSPR_CLICK_APP_ID` for a deployed domain.
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
3. **Deterministic autonomous reallocate** — the current reallocate proofs are
   agent-signed but decision-scripted; let a live LLM cycle decide + execute a
   rebalance for a fully autonomous on-chain proof.
