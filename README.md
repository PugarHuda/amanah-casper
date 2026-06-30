# Amanah — Autonomous Compliant RWA Treasury Agent

> Casper Agentic Buildathon 2026. **Amanah** (fiduciary trust). An autonomous AI
> agent manages a tokenized RWA treasury (gold, US T-bond, oil, CSPR) on **Casper
> testnet**: it ingests live RWA prices, pays for a premium signal via **x402**,
> reasons with an LLM, **signs its reasoning (Ed25519) and attests it on-chain**,
> checks guardrails + compliance, and only then reallocates **yield** (principal
> stays locked).

**The differentiator — proof, not a diary.** Every decision is cryptographically
signed and **verified on-chain by the contract itself** before it's recorded —
publicly checkable on [cspr.live](https://testnet.cspr.live), not logged to a
private database.

**Status: live on casper-test.** All six contracts are deployed and the off-chain
loop runs end-to-end against the live node. Four on-chain steps are verified with
public proof hashes: **attestation**, **x402 settlement**, **reallocate** (allowlist
+ compliance gated), and **reputation** (`record_payment`). Partner integrations are
live too: **CSPR.cloud** REST (audit trail + treasury) **and Streaming API** (live
contract-event feed over WebSocket→SSE); the agent **consumes the official hosted
CSPR.cloud MCP server** (82 tools) each cycle for an independent second source of
on-chain truth; the **CSPR.click** wallet on `/connect` (official hosted SDK — Casper
Wallet / Ledger / social login); our own **MCP** server (all four tools read live
chain state); and **Venice** reasoning. The dashboard's treasury, audit trail,
reputation, live event feed, and **guardrail limits read live from chain**; the agent
console renders the latest published reasoning blob + its on-chain attestation.
See [Live deployment](#live-on-casper-test) for addresses + proof hashes.

## Cycle (every `CYCLE_MS`, default 60s — all steps real, no mock)

```
ingest live RWA prices  →  pay premium signal via x402 (CEP-3009 settle, real tx)
  →  LLM: risk score + decision + reasoning steps
  →  blake2b256(reasoning) + Ed25519 sign  →  AttestationLog.attest (verifies sig ON-CHAIN)
  →  SpendGate.check + ComplianceRegistry.assert_valid
  →  RwaVault.reallocate (yield only, principal locked)  →  ReputationRegistry.record_payment
```

Real on-chain transactions per cycle (x402 settle, attest, and reallocate when a
rebalance fires) — all verifiable on [testnet.cspr.live](https://testnet.cspr.live).

## Live on casper-test

Contract **package hashes** (also in [`.env.deployed`](.env.deployed)):

| Contract | Package hash |
|---|---|
| RwaVault | `438118a13b5cdcaed1f3cd72bbdcbb3347cd38d2a0d98d2beaa2993a16233347` |
| AttestationLog | `365913a7a26d3e50798c2c0ce31d0850b8b24b2e1a641f990e41f7ad219a6532` |
| SpendGate | `ae3f3d876c905f3d691133e244dcaa842aff56b540696d843db43030e0e9d92e` |
| ComplianceRegistry | `f4a43bd6671e92a085b5598cad396e71279cf18a7271fac0f6d7ef5cb7b8e572` |
| ReputationRegistry | `c2650647e7ddba168e52d0a57f6670b2953b821b8d3c36827cf675f3e548ca0b` |
| PaymentToken (CEP-18 + CEP-3009) | `d784f72c17d143cd96e8bcd2b19fc893f003c1ce9ea29f059eb033bcbd347d79` |

Agent account: `0147ebe715f3fb6d387ae2f102e55032ba54c8c4557293d7800cad11561496fdaa`

**Verifiable proof transactions** (paste into [testnet.cspr.live](https://testnet.cspr.live)):

| What | Hash |
|---|---|
| Attestation — reasoning signed + verified on-chain | `a87e10c77a873ace20d580b13d4b0c2a31e6899ed0ac5fe92412f3145dd870e8` |
| x402 settlement — `transfer_with_authorization` | `391274dcad1ebd7dd2641bd94aa17893084adf76f58b5603d7d69c0c4cce4398` |
| Reallocate — $50K yield Gold→T-bond (SpendGate + Compliance gated) | `eeecb9d136a622d07ab41b641272439919d37d14689e7392feee56bb195ac8a0` |
| Reputation — `record_payment` credits the x402 proof (anti-replay) | `c4c65c94f9482b22af691067657d0125c3cdd6658764eb56b09e8836015edc8c` |

The reallocate moved Gold $250K→$200K and T-bond $400K→$450K on-chain (verify via
`agent/src/read-vault.ts`); the agent was allowlisted in SpendGate and marked Valid
in ComplianceRegistry first (`agent/src/go-live.ts`, also on-chain).

## Monorepo

| Module | Stack | What it is |
|---|---|---|
| [`contracts/`](contracts) | Rust · **Odra 2.8.1** → WASM | RwaVault, **AttestationLog** (proof-of-reasoning), SpendGate, ComplianceRegistry, ReputationRegistry, PaymentToken. On-chain Ed25519 verification is the heart. 6/6 OdraVM tests pass. |
| [`agent/`](agent) | TypeScript · casper-js-sdk v5 · Venice · MCP client | The autonomous loop: ingest → **enrich via the official CSPR.cloud MCP** → x402 → reason → attest → guardrail → execute → reputation. `npm run deploy` installs all contracts; `npm run dev` runs the loop. `npx tsx src/cspr-mcp.ts` demos the official-MCP consumption; `npx tsx src/stream.ts` watches events live. |
| [`signal-service/`](signal-service) | TypeScript · Express · casper-x402 | The x402-gated premium-signal API the agent pays — agent-pays-agent commerce, settled on-chain via CEP-3009. |
| [`mcp/`](mcp) | TypeScript · MCP SDK | Read-only MCP server so a judge or LLM can ask "why did it rebalance?". **All 4 tools live**: `get_vault_state` + `get_reputation` decode on-chain state, `get_attestation` verifies the published reasoning blob against its on-chain hash, `get_audit_trail` lists real deploys via CSPR.cloud. `npx tsx src/smoke.ts` checks all four. |
| [`bot/`](bot) | TypeScript · grammy | Optional Telegram notifier + `/audit`. |
| [`web/`](web) | Next.js 15 · React 19 | Landing + dashboard + agent console + connect. **Live**: treasury/holdings + reputation decoded from chain, audit trail + **real-time contract-event feed** (CSPR.cloud Streaming API via an SSE relay at `/api/stream`), **CSPR.click** wallet on `/connect`, agent console from the latest published reasoning blob. Playwright manual-click E2E: `npm run test:e2e` (11/11). |

## Quickstart

```bash
# 1. contracts → wasm  (Linux/WSL: rustup nightly + wasm32 + `cargo install cargo-odra`)
cd contracts && cargo odra build && cargo odra test    # 6/6 tests green
#    cargo-odra's wasm-opt step needs binaryen >=121; if it errors, the per-contract
#    wasm is already written — lower bulk-memory ops yourself before deploy:
#    npx -p binaryen@130 wasm-opt --enable-bulk-memory --enable-sign-ext \
#      --llvm-memory-copy-fill-lowering --signext-lowering IN.wasm -o OUT.wasm

# 2. deploy all contracts to casper-test  (funded AGENT_KEY_PEM, writes .env.deployed)
cd agent && npm install && cp .env.example .env   # fill keys + hashes (see below)
npm run deploy

# 3. run the agent loop
npm run dev                  # or:  MAX_CYCLES=1 npm run dev   (one bounded cycle)

# 4. web dashboard
cd ../web && npm install && npm run build && npm run dev   # http://localhost:3000
```

## Demo (full live cycle, ~1 min)

```bash
# terminal A — the x402 premium-signal seller (needs signal-service/.env)
cd signal-service && npm install && npm run dev      # :8402, GET /alpha is x402-gated

# terminal B — one agent cycle that pays for the signal and attests on-chain
cd agent && MAX_CYCLES=1 npm run dev

# terminal C — watch the on-chain events stream in LIVE (CSPR.cloud Streaming API)
cd agent && npx tsx src/stream.ts     # prints "Attested" the instant terminal B lands it
```

Watch the agent log emit, in order: `ingest` (real prices) → `x402.settle` (a real
settlement tx hash) → `reason` (decision using the paid signal) → `attest` (a real
AttestationLog tx hash). Paste either hash into [testnet.cspr.live](https://testnet.cspr.live)
to confirm it executed. The dashboard's treasury figures read the same vault state
on-chain (`agent/src/read-vault.ts` is the standalone reader).

### Configuration

Per-module `.env.example` files list everything. To go live you need: an LLM key
(`VENICE_API_KEY`), RWA data keys (`EIA_API_KEY`, `METALS_API_KEY`), a funded
Casper testnet key (`AGENT_KEY_PEM`), a CSPR.cloud access token (x402 facilitator),
and the deployed hashes (written by `npm run deploy` to `.env.deployed`). Secrets,
`*.pem`, and `web/.env.local` are gitignored.

## No-mock contract

Banned in the core loop: hardcoded prices, fake tx, static reasoning templates,
simulated settlement. Every loop step (ingest → x402 → reason → attest →
guardrail → reallocate) touches testnet or a real public API a judge can check,
and the dashboard's treasury + audit trail read live chain state.

Guardrail limits on the dashboard/console (per-tx cap, daily limit, spent today)
are now read live from the SpendGate contract — no longer hardcoded.

Honest caveats (small, disclosed): the principal-lock invariant is enforced
in-contract and unit-tested (`reallocate_rejected_when_it_would_touch_principal`)
but the live vault is seeded with principal = 0, so the live guard is a forward
guard (a non-zero lock needs a `lock_principal` entrypoint + redeploy); reasoning
blobs are published to `audit/<hash>.json` and integrity-checked by the MCP, and
pinned to public IPFS only when `PINATA_JWT` is set (code wired in `attest.ts`);
the `/connect` wallet uses the `csprclick-template` app id until you set your own
(`NEXT_PUBLIC_CSPR_CLICK_APP_ID`). All such seams are marked `// ponytail:` in the
source. Run the manual-click QA with `cd web && npm run test:e2e`.
