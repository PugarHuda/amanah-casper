# Amanah — testing

A layered test pyramid: fast offline unit + regression tests, on-demand
integration tests against live testnet, browser E2E, and on-chain contract tests.

Run the offline layers in one go: `./scripts/test-all.ps1`.

## 1. Unit + regression (offline, fast) — 39 tests

Pure logic, no network. `node:test` via `tsx` (no test framework dependency).

| Package | Cmd | Covers |
|---|---|---|
| `agent` | `npm test` | codec (dict-address derivation w/ golden vectors, U256/U512 blob decode, **i64 array decode**, enum/Key::Account bytes, hex round-trip); `normalize` (**riskScore 0..100→0..1 regression**, non-rebalance zeroes amount); `extractJson` (fenced / `<think>` / prose / garbage); `ASSET_INDEX`; `shouldEscalate` (autonomous-vs-human safety gate); auditor `parseVerdict` (fail-closed to VETO); **ZK KYC** Schnorr NIZK (completeness / soundness / replay-binding / TS↔Rust golden vector); cross-validation `divergencePct` |
| `web` | `npm run test:unit` | `fmtUsd`, `shortHash`, `relTime`, `dataSources` (real-provider extraction) |
| `mcp` | `npm test` | `get_attestation` blob hash round-trip (proof-not-a-diary), unknown-hash path, `get_reputation` address validation |
| `signal-service` | `npm test` | `buildSignal` shape + tilt clamp |
| `bot` | `npm test` | `/audit` reply builder + deploy-link formatting; import is side-effect-free (no token/polling) |

**Regression tests** lock in every fixed bug: the deepseek `riskScore=20`→`0.2`
coercion, the Casper-2.0 `i64` little-endian-array decode (`[1,0,…]`→`1`), and the
dict-address derivation (golden vectors — a silent change fails the test).

## 2. Integration (live casper-test) — 4 tests

`cd agent && npm run test:integration` — hits the live node + published blobs:
- vault v2 decodes to **$1,000,000 total / $800,000 principal** (custodian-separated);
- agent **reputation ≥ 1** (record_payment credited);
- agent **compliance = Valid** (set by the custodian);
- **every published reasoning blob hashes to its filename** (the attestation round-trip).

## 3. Browser E2E (Playwright, manual-click) — 12 tests

`cd web && npm run build && npm run start -- -p 3100`, then `npm run test:e2e`.
Clicks every page and asserts: live treasury $1M + **$800K principal**, live SpendGate
cap, reputation, the real-data provenance line, the IPFS verify link, the CSPR.click
modal opens, every cspr.live link is a real deep link, and **no stale fake numbers**.

## 4. Smart contracts (OdraVM) — 14 tests

`cd contracts && cargo odra test` (Linux/WSL: rustup nightly + `cargo install
cargo-odra`; dev-dep pin `indexmap = { version="=1.9.3", features=["std"] }`).
Covers: reallocate cap/compliance/success, attest verify + tamper, reputation
replay + caller-gate + **authority-gated `adjust`/slash**, **owner-gated compliance
`set_status`/`revoke`**, payment-token mint+transfer,
the **principal invariant** (`reallocate_rejected_when_it_would_touch_principal`), and
**real ZK KYC** — `zk_kyc_proof_verifies_and_rejects_tamper` (the on-chain Schnorr NIZK
verifier vs a TS-generated golden vector) + issuer-gated credential registration.

## Totals

43 unit/regression + 4 integration + 12 E2E + 14 contract = **73 automated tests**,
plus `tsc --noEmit` across all four TS packages.
