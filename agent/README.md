# amanah-agent

The autonomous loop. Each cycle:

`ingest → enrich (official CSPR.cloud + CSPR.trade MCP) → pay(x402) → reason → attest (+IPFS) → reputation → guardrail/confidence → execute`

Every real deploy hash (x402 settle, attest, reputation, reallocate) is printed so
you can verify it on cspr.live. The LLM reasons over live prices + the paid signal +
the two official MCP servers' data (it cites the DEX price impact in its decision).
Reasoning is hashed (blake2b-256), Ed25519-signed, and recorded on `AttestationLog`
before any funds move; `RwaVault.reallocate` is gated on-chain by **custodian-owned**
SpendGate + ComplianceRegistry + the **$800K principal-lock** invariant.

## Run

```bash
cp .env.example .env   # fill in keys + contract hashes + agent PEM
npm install
npm run dev              # tsx loop, interval = CYCLE_MS (default 60s)
MAX_CYCLES=1 npm run dev # one bounded cycle (demo)
npm run typecheck        # tsc --noEmit
npm test                 # unit + regression (node:test)
npm run test:integration # live-testnet reads (vault $1M/$800K, reputation, compliance)
```

## Modules (`src/`)

| File | Role |
| --- | --- |
| `ingest.ts` | Real RWA prices (Treasury, EIA WTI, gold, CSPR). Missing key ⇒ that field is `null`, never faked. |
| `x402.ts` | Pay the premium-signal endpoint (402 → sign → resubmit), capture settlement deploy hash. The signal is multi-asset (CSPR + gold + US T-bond + WTI) from real public sources; unavailable legs come back `null`, never estimated. |
| `reason.ts` + `prompts/decide.ts` | Venice LLM (OpenAI-compatible `/chat/completions`, default `deepseek-v4-flash`) → structured decision via schema-in-prompt + tolerant JSON parse. |
| `cspr-mcp.ts` / `trade-mcp.ts` | Consume the official CSPR.cloud MCP (balance + rate) and CSPR.trade DEX MCP (CSPR↔sCSPR quote); fed into reasoning. CLI demos too. |
| `attest.ts` | blake2b hash → Ed25519 sign → `AttestationLog.attest`; pins the blob to public IPFS (Pinata) + writes a CID sidecar. |
| `execute.ts` | `RwaVault.reallocate` + `escalateToHuman()` below confidence threshold. |
| `reputation.ts` | `ReputationRegistry.record_payment` (caller-gated) with the x402 deploy hash. |
| `stream.ts` | Watch on-chain events live via the CSPR.cloud Streaming API. |
| `migrate-custody.ts` | Deploy the custodian-separated gates + non-zero-principal vault. |
| `audit.ts` | Independent auditor: skeptical LLM grades the decision, custodian key attests APPROVE/VETO on-chain (fails closed to VETO). |
| `migrate-vault-v4.ts` | Deploy RwaVault v4 (circuit breakers) + demo the reputation floor: reallocate blocked below floor → resumed after reward. |
| `deploy-quorum.ts` | Deploy `AuditorQuorum` (K-of-N) + cast a live 2-of-3 signed-vote quorum. |
| `zk.ts` / `deploy-zk.ts` | Schnorr NIZK ZK-KYC prover + `ZkKycVerifier` deploy/prove. |
| `zk-reserves.ts` / `deploy-zk-reserves.ts` | Pedersen+Schnorr ZK proof-of-reserves prover + `ZkReserves` deploy/prove (hides the split). |
| `lib/codec.ts` | Pure on-chain state codec (unit-tested; see `src/tests/`). |
| `casper.ts` / `config.ts` | casper-js-sdk v5 client + call builder; typed env. |

## Calibration / verify before mainnet

Search `ponytail:` comments. Key seams:
- Contract arg encodings (odra `AssetId` enum → u8, `[u8;32]` → ByteArray, `Bytes`).
- Treasury endpoint is the key-free Average Interest Rates set; swap to Daily Par Yield.
- `EIA_API_KEY` / `METALS_API_KEY` required for real WTI/gold (else `null`).
- IPFS pin and `buildFor1_5()` vs `build()` (deploy vs Transaction V1).
