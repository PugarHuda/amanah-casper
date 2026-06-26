# Amanah deploy scripts

One funded key -> all 5 contracts on `casper-test` in one command.

## End-to-end

```bash
# 1. Toolchain (one time): MSVC Build Tools + cargo-odra
cargo install cargo-odra

# 2. Build wasm -> contracts/wasm/
cd contracts && cargo odra build -b casper && cd ..

# 3. Generate a key (writes amanah/keys/)
scripts/keygen.sh                 # Windows: powershell -File scripts\keygen.ps1

# 4. Fund the printed public key from the testnet faucet
#    https://testnet.casper.network/  (or the cspr.live testnet faucet)

# 5. Deploy everything (writes amanah/.env.deployed)
scripts/deploy.sh                 # Windows: powershell -File scripts\deploy.ps1

# 6. Wire the addresses into each module
#    Copy the VAULT_HASH / SPEND_GATE_HASH / COMPLIANCE_HASH / ATTESTATION_HASH /
#    REPUTATION_HASH lines from amanah/.env.deployed into agent/.env, web/.env,
#    mcp/.env (or `source .env.deployed`).
```

`deploy.sh` is idempotent-ish: any `*_HASH` already present in `.env.deployed`
is skipped, so a failed run can be re-run without redeploying what succeeded.

## Config (env overrides)

| var | default |
|---|---|
| `CASPER_NODE` | `https://node.testnet.cspr.cloud/rpc` |
| `CASPER_CHAIN` | `casper-test` |
| `CASPER_SECRET_KEY` | `keys/secret_key.pem` |
| `WASM_DIR` | `contracts/wasm` |
| `ENV_FILE` | `.env.deployed` |
| `PAYMENT` | `300000000000` motes (300 CSPR) |

## Deploy order (encoded in deploy.sh)

`SpendGate` -> `ComplianceRegistry` -> `AttestationLog` -> `ReputationRegistry`
-> `RwaVault`. The vault's `init` takes the agent account hash plus the
spend-gate and compliance **package hashes**, so it goes last.

## Gotchas / calibration

- Needs `casper-client` **5.0.0** (`--pricing-mode fixed`) and `jq` (bash twin only;
  the `.ps1` twin uses native `ConvertFrom-Json`).
- Each Odra contract deploy also passes the `odra_cfg_*` runtime args
  (`package_hash_key_name`, `allow_key_override`, `is_upgradable`). The package
  hash is read back from the deployer account's named keys.
- Spots that depend on exact casper-client 5.0 behaviour (account-hash
  derivation, `query-global-state` defaults, JSON result paths, `key`-typed
  Address args) are marked `# ponytail: verify casper-client 5.0` in the scripts.
  Run the first deploy with a small `PAYMENT` and confirm the extracted hash
  before trusting an unattended full run.
