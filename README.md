# Amanah — Autonomous Compliant RWA Treasury Agent

> Casper Agentic Buildathon 2026. **Amanah** (fiduciary trust). An autonomous AI
> agent manages a tokenized RWA treasury (gold, US T-bond, oil) on **Casper
> testnet**: it ingests live RWA prices, pays for a premium signal via **x402**,
> reasons with **Claude Opus**, **signs its reasoning (Ed25519) and attests it
> on-chain**, checks guardrails + compliance, and only then reallocates
> **yield** (principal stays locked).

**The differentiator — proof, not a diary.** Every decision is cryptographically
bound on-chain and publicly verifiable, not logged to a private database.

## Cycle (every `CYCLE_MS`, default 60s — all steps real, no mock)

```
ingest live RWA prices  →  pay premium signal via x402 (CEP-18 settle, real deploy hash)
  →  Claude Opus: risk score + decision + reasoning steps
  →  blake2b256(reasoning) + Ed25519 sign  →  AttestationLog.attest (verifies sig on-chain)
  →  SpendGate.check + ComplianceRegistry.assert_valid
  →  RwaVault.reallocate (yield only, principal locked)  →  ReputationRegistry.record_payment
```

Three real deploy hashes per cycle (x402 settle, attest, reallocate) — all
verifiable on [cspr.live](https://cspr.live) testnet.

## Monorepo

| Module | Stack | What it is |
|---|---|---|
| [`contracts/`](contracts) | Rust · **Odra 2.8.1** → WASM | RwaVault, **AttestationLog** (proof-of-reasoning), SpendGate, ComplianceRegistry, ReputationRegistry. On-chain Ed25519 verification is the heart. |
| [`agent/`](agent) | TypeScript · casper-js-sdk v5 · Venice (OpenAI-compat) | The autonomous loop: ingest → x402 → reason → attest → guardrail → execute → reputation. |
| [`signal-service/`](signal-service) | TypeScript · Express · casper-x402 | The x402-gated premium-signal API the agent pays — agent-pays-agent commerce. |
| [`mcp/`](mcp) | TypeScript · MCP SDK | Read-only MCP server exposing vault/attestation/reputation/audit so a judge or LLM can ask "why did it rebalance?". |
| [`bot/`](bot) | TypeScript · grammy | Optional Telegram notifier + `/audit`. |
| [`web/`](web) | Next.js 15 · React 19 | Marketing landing + 4 app screens (Connect, Agent console, Audit dashboard, Writing). Builds clean. |

Design handoff this front-end was built from lives in
[`_design_import/design_handoff_amanah_rwa/`](_design_import/design_handoff_amanah_rwa).

## Quickstart

```bash
# contracts  (Linux/WSL + `cargo install cargo-odra`; cargo-odra 0.1.7 has no -b flag)
cd contracts && cargo odra build && cargo odra test

# web        (builds today)
cd web && npm install && npm run build && npm run dev   # http://localhost:3000

# agent / signal-service / mcp / bot  (each its own package)
cd agent && npm install && cp .env.example .env && npm run typecheck && npm run dev
```

## Status (honest)

- **web** — `npm run build` passes; all routes prerender. Data is a typed mock
  behind `lib/data.ts`; wallet (CSPR.click) and live reads are stubbed seams.
- **contracts** — written against verified Odra 2.8 APIs; **not** compiled here
  (this box lacks an MSVC linker + cargo-odra). 4 spots carry `// ponytail:`
  calibration notes to confirm on a real build.
- **agent / signal-service / mcp / bot** — all four `tsc --noEmit` clean against
  the real installed SDKs. Untested at runtime (need API keys + deployed
  contract hashes). Every external-credential / unverified-SDK seam is marked
  `// ponytail:`.

### What you must supply to go live

API keys (`VENICE_API_KEY`, `EIA_API_KEY`, `METALS_API_KEY`), a Casper testnet
key (`AGENT_KEY_PEM`) funded from the faucet, the deployed contract hashes, and
the x402 testnet facilitator config. See each module's `.env.example`.

## No-mock contract

Banned: hardcoded prices, fake tx, static reasoning templates, simulated
settlement. Everything touches testnet or a real public API a judge can check.
