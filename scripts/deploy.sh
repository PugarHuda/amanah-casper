#!/usr/bin/env bash
# Deploy the 5 Amanah contracts to casper-test in dependency order and write
# their package hashes to amanah/.env.deployed.
# Idempotent-ish: a contract whose *_HASH is already in .env.deployed is skipped.
# Requires: casper-client 5.0.0, jq, a funded key (scripts/keygen.sh), and built
# wasm (cargo odra build -b casper -> contracts/wasm/).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE="${CASPER_NODE:-https://node.testnet.cspr.cloud/rpc}"
CHAIN="${CASPER_CHAIN:-casper-test}"
KEYS="${KEYS_DIR:-$ROOT/keys}"
SECRET="${CASPER_SECRET_KEY:-$KEYS/secret_key.pem}"
WASM_DIR="${WASM_DIR:-$ROOT/contracts/wasm}"
ENV_FILE="${ENV_FILE:-$ROOT/.env.deployed}"
# ponytail: contract installs are heavy; 300 CSPR is a safe default. Lower it if the
# faucet grant is small, raise it if a deploy is rejected for insufficient payment.
PAYMENT="${PAYMENT:-300000000000}"

command -v casper-client >/dev/null || { echo "casper-client not found"; exit 1; }
command -v jq >/dev/null || { echo "jq not found"; exit 1; }
[ -f "$SECRET" ] || { echo "no secret key at $SECRET — run scripts/keygen.sh"; exit 1; }
[ -d "$WASM_DIR" ] || { echo "no wasm at $WASM_DIR — run: cargo odra build -b casper"; exit 1; }

PUBHEX="$(cat "$KEYS/public_key_hex")"
# ponytail: verify casper-client 5.0 — account-address derivation (the agent Address
# for RwaVault.init is this account's account-hash).
AGENT_HASH="$(casper-client account-address --public-key "$KEYS/public_key.pem")"

touch "$ENV_FILE"
# shellcheck disable=SC1090
source "$ENV_FILE" 2>/dev/null || true

have() { local v="${!1:-}"; [ -n "$v" ]; }

# Poll get-deploy until the deploy executes; fail loudly on execution error.
wait_deploy() {
  local dh="$1" i
  echo "  deploy hash: $dh — waiting for execution..."
  for i in $(seq 1 60); do
    local res
    # ponytail: verify casper-client 5.0 — get-deploy result path. In 5.x the
    # execution outcome is under .result.execution_results[0].result (Success/Failure).
    res="$(casper-client get-deploy --node-address "$NODE" "$dh" 2>/dev/null \
            | jq -r '.result.execution_results[0].result | keys[0] // "Pending"')" || res="Pending"
    case "$res" in
      Success) echo "  executed: Success"; return 0 ;;
      Failure) echo "  executed: FAILURE"; casper-client get-deploy --node-address "$NODE" "$dh" | jq '.result.execution_results[0].result.Failure.error_message'; return 1 ;;
      *) sleep 5 ;;
    esac
  done
  echo "  timed out waiting for $dh"; return 1
}

# Read the installed package hash from the deployer account's named keys.
# Odra saves the package under the key name we pass as odra_cfg_package_hash_key_name.
pkg_hash() {
  local key_name="$1"
  # ponytail: verify casper-client 5.0 — query-global-state may need --state-root-hash
  # or --block-identifier; 5.x defaults to the latest block. named_keys shape may also
  # be an array of {name,key} (shown) or an object map.
  casper-client query-global-state --node-address "$NODE" --key "$AGENT_HASH" 2>/dev/null \
    | jq -r --arg kn "$key_name" '.result.stored_value.Account.named_keys[] | select(.name==$kn) | .key'
}

# deploy_one VAR_NAME WasmFile odra_key_name [extra --session-arg ...]
deploy_one() {
  local var="$1" wasm="$2" key_name="$3"; shift 3
  if have "$var"; then echo "[skip] $var already set (${!var})"; return 0; fi
  echo "[deploy] $wasm -> $var"
  local out dh
  out="$(casper-client put-deploy \
    --node-address "$NODE" --chain-name "$CHAIN" \
    --secret-key "$SECRET" \
    --pricing-mode fixed --gas-price-tolerance 1 \
    --payment-amount "$PAYMENT" \
    --session-path "$WASM_DIR/$wasm" \
    --session-arg "odra_cfg_package_hash_key_name:string='$key_name'" \
    --session-arg "odra_cfg_allow_key_override:bool='false'" \
    --session-arg "odra_cfg_is_upgradable:bool='false'" \
    "$@")"
  # ponytail: verify casper-client 5.0 — put-deploy returns the hash at .result.deploy_hash.
  dh="$(echo "$out" | jq -r '.result.deploy_hash')"
  wait_deploy "$dh"
  local hash; hash="$(pkg_hash "$key_name")"
  [ -n "$hash" ] && [ "$hash" != "null" ] || { echo "  could not read package hash for $key_name"; return 1; }
  echo "$var=$hash" >> "$ENV_FILE"
  export "$var=$hash"
  echo "  $var=$hash"
}

# 1-4: dependencies (no cross-refs between them).
deploy_one SPEND_GATE_HASH  SpendGate.wasm           amanah_spend_gate_package_hash \
  --session-arg "max_per_tx:u512='100000000000'" \
  --session-arg "daily_limit:u512='1000000000000'" \
  --session-arg "expiry:u64='0'"

deploy_one COMPLIANCE_HASH  ComplianceRegistry.wasm  amanah_compliance_package_hash

deploy_one ATTESTATION_HASH AttestationLog.wasm      amanah_attestation_package_hash \
  --session-arg "agent_pubkey:public_key='$PUBHEX'"

deploy_one REPUTATION_HASH  ReputationRegistry.wasm  amanah_reputation_package_hash

# 5: RwaVault depends on the spend-gate + compliance package hashes.
# ponytail: verify casper-client 5.0 — Odra Address args serialize as CLType Key.
# Account address -> account-hash-...; contract package -> hash-.../package-... .
# Pass each as type `key`; adjust the prefix if the client rejects it.
deploy_one VAULT_HASH RwaVault.wasm amanah_vault_package_hash \
  --session-arg "agent:key='$AGENT_HASH'" \
  --session-arg "spend_gate:key='${SPEND_GATE_HASH}'" \
  --session-arg "compliance:key='${COMPLIANCE_HASH}'" \
  --session-arg "principal:u512='0'"

echo
echo "Done. Addresses written to $ENV_FILE:"
cat "$ENV_FILE"
