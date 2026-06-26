# Generate an Ed25519 keypair for casper-test and show how to fund it.
# Usage: powershell -ExecutionPolicy Bypass -File scripts\keygen.ps1
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Keys = if ($env:KEYS_DIR) { $env:KEYS_DIR } else { Join-Path $Root "keys" }

if (Test-Path (Join-Path $Keys "secret_key.pem")) {
    Write-Host "Key already exists at $Keys\secret_key.pem - refusing to overwrite."
    Write-Host "Delete it first if you really want a new key."
} else {
    # casper-client keygen defaults to ED25519: secret_key.pem, public_key.pem, public_key_hex
    casper-client keygen $Keys
}

$PubHex = Get-Content (Join-Path $Keys "public_key_hex")
# ponytail: verify casper-client 5.0 - account-address subcommand/flag for deriving account hash.
try { $Acct = casper-client account-address --public-key (Join-Path $Keys "public_key.pem") }
catch { $Acct = "account-hash-<run: casper-client account-address --public-key keys\public_key.pem>" }

Write-Host ""
Write-Host "Keypair ready in $Keys"
Write-Host "  Public key (hex): $PubHex"
Write-Host "  Account hash:     $Acct"
Write-Host ""
Write-Host "Fund this account on testnet before deploying:"
Write-Host "  - https://testnet.casper.network/   (connect wallet / use faucet)"
Write-Host "  - or the cspr.live testnet faucet"
Write-Host "Paste the public key hex above into the faucet, then run scripts\deploy.ps1."
