# Amanah Contracts

On-chain layer for **Amanah**, an autonomous compliant RWA treasury agent on
Casper. Built with [Odra](https://odra.dev) 2.8 (`casper-test` target).

## Contracts

| Module | Purpose |
|---|---|
| `RwaVault` | Holds per-asset allocations; agent-only `reallocate` runs SpendGate + Compliance checks and enforces a hard principal invariant. |
| `AttestationLog` | Proof-of-reasoning: stores agent decisions only after on-chain Ed25519 signature verification of the reasoning hash. |
| `SpendGate` | Per-tx cap, rolling daily limit, allowlist, expiry, and an instant `revoke()` kill switch. |
| `ComplianceRegistry` | KYC/AML status per address (`Pending`/`Valid`/`Revoked`). Upgradable. |
| `ReputationRegistry` | Signed reputation score with anti-replay on payment proof (deploy hash). |

## Prerequisites

- Rust toolchain pinned in `rust-toolchain.toml` (`nightly-2026-01-01`, target
  `wasm32-unknown-unknown`).
- `cargo-odra` (`cargo install cargo-odra`) — not required for `cargo test`, only
  for wasm builds and the Casper backend test VM.

## Build

```bash
# Native (host) build + the OdraVM unit/integration tests:
cargo test

# Compile all five contracts to wasm (writes wasm/ via cargo-odra):
cargo odra build -b casper

# Run the test suite against the real Casper execution engine:
cargo odra test            # OdraVM
cargo odra test -b casper  # Casper backend VM
```

## Deploy to testnet (`casper-test`)

One-command deploy automation lives in `../scripts/` — see
[`scripts/README.md`](../scripts/README.md): `keygen.{sh,ps1}` then
`deploy.{sh,ps1}` build the keypair, deploy all 5 contracts in dependency order,
and write the package hashes to `amanah/.env.deployed`. The manual form is below.

Use `casper-client` **5.0.0** (CLI surface changed vs 2.x). Wasm files land in
`wasm/` after `cargo odra build -b casper`.

```bash
casper-client put-deploy \
  --node-address https://rpc.testnet.casperlabs.io \
  --chain-name casper-test \
  --secret-key ./keys/secret_key.pem \
  --payment-amount 300000000000 \
  --session-path ./wasm/SpendGate.wasm \
  --session-arg "max_per_tx:u512='1000000000000'" \
  --session-arg "daily_limit:u512='10000000000000'" \
  --session-arg "expiry:u64='0'"
```

### Known Casper 2.0 / deploy gotchas

- **Pricing mode**: Casper 2.0 nodes expect a pricing mode. With
  `casper-client` 5.0.0 add `--pricing-mode fixed` (and `--gas-price-tolerance`
  if the node requires it). Classic deploys without a pricing mode are rejected.
- **casper-client 5.0.0**: argument syntax and the `put-deploy` / `put-txn`
  surface differ from 2.x; pin `=5.0.0` to match Odra 2.8.
- Deploy order matters: deploy `SpendGate`, `ComplianceRegistry`,
  `AttestationLog`, `ReputationRegistry` first, then `RwaVault` with the three
  dependency addresses passed to `init`.
- Init args use the typed `--session-arg "name:type='value'"` form; `U512`
  values are quoted decimal strings.

## ponytail / calibration notes

Open items are marked inline with `// ponytail:` comments. Highlights:

- `ReputationRegistry` stores `i128` per spec — confirm the Odra 2.8 macro
  accepts `i128` as a stored type; fall back to `i64` if not.
- `AssetId`/`Status` are `odra_type` enums used as `Mapping` keys/values; verify
  the key bound compiles (swap `AssetId` to `u8` if needed).
- `reallocate` runs SpendGate/Compliance against the agent address because the
  spec signature carries no counterparty; add an explicit `target` param for
  real settlement.
- `ComplianceRegistry.set_status/revoke` are unauthenticated per the "minimal"
  spec — add an owner gate before mainnet.
