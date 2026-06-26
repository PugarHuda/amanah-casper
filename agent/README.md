# amanah-agent

The autonomous loop. Each cycle:

`ingest → pay(x402) → reason → attest → guardrail/confidence → execute → reputation`

Every real deploy hash (x402 settle, attest, reallocate, reputation) is printed so
you can verify it on cspr.live. Reasoning is hashed (blake2b-256), Ed25519-signed,
and recorded on `AttestationLog` before any funds move; `RwaVault.reallocate` is
gated on-chain by SpendGate + ComplianceRegistry + a principal-lock invariant.

## Run

```bash
cp .env.example .env   # fill in keys + contract hashes + agent PEM
npm install
npm run dev            # tsx loop, interval = CYCLE_MS (default 60s)
npm run typecheck      # tsc --noEmit
```

## Modules (`src/`)

| File | Role |
| --- | --- |
| `ingest.ts` | Real RWA prices (Treasury, EIA WTI, gold, CSPR). Missing key ⇒ that field is `null`, never faked. |
| `x402.ts` | Pay the premium-signal endpoint (402 → sign → resubmit), capture settlement deploy hash. |
| `reason.ts` + `prompts/decide.ts` | Venice LLM (OpenAI-compatible `/chat/completions`, default `qwen-3-7-max`) → structured decision via schema-in-prompt + tolerant JSON parse. |
| `attest.ts` | blake2b hash → Ed25519 sign → `AttestationLog.attest`; optional IPFS pin. |
| `execute.ts` | `RwaVault.reallocate` + `escalateToHuman()` below confidence threshold. |
| `reputation.ts` | `ReputationRegistry.record_payment` with the x402 deploy hash. |
| `casper.ts` | casper-js-sdk v5 RpcClient + contract-call builder + wait-for-execution. |
| `config.ts` | Typed env. |

## Calibration / verify before mainnet

Search `ponytail:` comments. Key seams:
- Contract arg encodings (odra `AssetId` enum → u8, `[u8;32]` → ByteArray, `Bytes`).
- Treasury endpoint is the key-free Average Interest Rates set; swap to Daily Par Yield.
- `EIA_API_KEY` / `METALS_API_KEY` required for real WTI/gold (else `null`).
- IPFS pin and `buildFor1_5()` vs `build()` (deploy vs Transaction V1).
