#!/usr/bin/env bash
# Generate an Ed25519 keypair for casper-test and show how to fund it.
# Usage: scripts/keygen.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KEYS="${KEYS_DIR:-$ROOT/keys}"

if [ -f "$KEYS/secret_key.pem" ]; then
  echo "Key already exists at $KEYS/secret_key.pem — refusing to overwrite."
  echo "Delete it first if you really want a new key."
else
  # casper-client keygen defaults to ED25519 and writes:
  #   secret_key.pem, public_key.pem, public_key_hex
  casper-client keygen "$KEYS"
fi

PUBHEX="$(cat "$KEYS/public_key_hex")"
# ponytail: verify casper-client 5.0 — subcommand to derive the account hash.
# In 5.x it is `account-address --public-key <pem>`; older clients used `account-address -p`.
ACCT="$(casper-client account-address --public-key "$KEYS/public_key.pem" 2>/dev/null || echo 'account-hash-<run: casper-client account-address --public-key keys/public_key.pem>')"

cat <<EOF

Keypair ready in $KEYS
  Public key (hex): $PUBHEX
  Account hash:     $ACCT

Fund this account on testnet before deploying:
  - https://testnet.casper.network/   (connect wallet / use faucet)
  - or the cspr.live testnet faucet
Paste the public key hex above into the faucet, then run scripts/deploy.sh.
EOF
