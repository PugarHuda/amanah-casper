# Deploy the 5 Amanah contracts to casper-test in dependency order and write
# their package hashes to amanah\.env.deployed.
# Idempotent-ish: a contract whose *_HASH is already in .env.deployed is skipped.
# Requires: casper-client 5.0.0, a funded key (scripts\keygen.ps1), built wasm
# (cargo odra build -b casper -> contracts\wasm\). PowerShell parses JSON natively.
$ErrorActionPreference = "Stop"
$Root    = Split-Path -Parent $PSScriptRoot
$Node    = if ($env:CASPER_NODE) { $env:CASPER_NODE } else { "https://node.testnet.cspr.cloud/rpc" }
$Chain   = if ($env:CASPER_CHAIN) { $env:CASPER_CHAIN } else { "casper-test" }
$Keys    = if ($env:KEYS_DIR) { $env:KEYS_DIR } else { Join-Path $Root "keys" }
$Secret  = if ($env:CASPER_SECRET_KEY) { $env:CASPER_SECRET_KEY } else { Join-Path $Keys "secret_key.pem" }
$WasmDir = if ($env:WASM_DIR) { $env:WASM_DIR } else { Join-Path $Root "contracts\wasm" }
$EnvFile = if ($env:ENV_FILE) { $env:ENV_FILE } else { Join-Path $Root ".env.deployed" }
# ponytail: 300 CSPR default; tune per faucet grant / rejected-payment errors.
$Payment = if ($env:PAYMENT) { $env:PAYMENT } else { "300000000000" }

if (-not (Get-Command casper-client -ErrorAction SilentlyContinue)) { throw "casper-client not found" }
if (-not (Test-Path $Secret))  { throw "no secret key at $Secret - run scripts\keygen.ps1" }
if (-not (Test-Path $WasmDir)) { throw "no wasm at $WasmDir - run: cargo odra build -b casper" }
if (-not (Test-Path $EnvFile)) { New-Item -ItemType File $EnvFile | Out-Null }

$PubHex    = Get-Content (Join-Path $Keys "public_key_hex")
# ponytail: verify casper-client 5.0 - account-address derivation.
$AgentHash = casper-client account-address --public-key (Join-Path $Keys "public_key.pem")

# Load already-deployed hashes (KEY=VALUE lines) into a hashtable.
$Deployed = @{}
foreach ($line in Get-Content $EnvFile) {
    if ($line -match '^\s*([A-Z_]+)=(.+)$') { $Deployed[$Matches[1]] = $Matches[2] }
}

function Wait-Deploy([string]$Dh) {
    Write-Host "  deploy hash: $Dh - waiting for execution..."
    for ($i = 0; $i -lt 60; $i++) {
        try {
            $j = casper-client get-deploy --node-address $Node $Dh | ConvertFrom-Json
            # ponytail: verify casper-client 5.0 - execution_results[0].result has one key (Success/Failure).
            $r = $j.result.execution_results[0].result
            $name = ($r.PSObject.Properties | Select-Object -First 1).Name
            if ($name -eq "Success") { Write-Host "  executed: Success"; return }
            if ($name -eq "Failure") { throw "deploy $Dh FAILED: $($r.Failure.error_message)" }
        } catch { }
        Start-Sleep -Seconds 5
    }
    throw "timed out waiting for $Dh"
}

function Get-PkgHash([string]$KeyName) {
    # ponytail: verify casper-client 5.0 - query-global-state defaults/named_keys shape.
    $j = casper-client query-global-state --node-address $Node --key $AgentHash | ConvertFrom-Json
    $nk = $j.result.stored_value.Account.named_keys | Where-Object { $_.name -eq $KeyName }
    return $nk.key
}

# Deploy-One -Var X -Wasm f.wasm -KeyName k -Args @("--session-arg","a:..","--session-arg","b:..")
function Deploy-One([string]$Var, [string]$Wasm, [string]$KeyName, [string[]]$Args = @()) {
    if ($Deployed.ContainsKey($Var) -and $Deployed[$Var]) {
        Write-Host "[skip] $Var already set ($($Deployed[$Var]))"; return $Deployed[$Var]
    }
    Write-Host "[deploy] $Wasm -> $Var"
    $base = @(
        "put-deploy","--node-address",$Node,"--chain-name",$Chain,
        "--secret-key",$Secret,"--pricing-mode","fixed","--gas-price-tolerance","1",
        "--payment-amount",$Payment,"--session-path",(Join-Path $WasmDir $Wasm),
        "--session-arg","odra_cfg_package_hash_key_name:string='$KeyName'",
        "--session-arg","odra_cfg_allow_key_override:bool='false'",
        "--session-arg","odra_cfg_is_upgradable:bool='false'",
        "--session-arg","odra_cfg_is_upgrade:bool='false'"
    )
    $out = casper-client @($base + $Args) | ConvertFrom-Json
    # ponytail: verify casper-client 5.0 - .result.deploy_hash.
    Wait-Deploy $out.result.deploy_hash
    $hash = Get-PkgHash $KeyName
    if (-not $hash) { throw "could not read package hash for $KeyName" }
    Add-Content $EnvFile "$Var=$hash"
    $Deployed[$Var] = $hash
    Write-Host "  $Var=$hash"
    return $hash
}

# 1-4: dependencies.
$SpendGate  = Deploy-One "SPEND_GATE_HASH" "SpendGate.wasm" "amanah_spend_gate_package_hash" @(
    "--session-arg","max_per_tx:u512='100000000000'",
    "--session-arg","daily_limit:u512='1000000000000'",
    "--session-arg","expiry:u64='0'")
$Compliance = Deploy-One "COMPLIANCE_HASH" "ComplianceRegistry.wasm" "amanah_compliance_package_hash"
Deploy-One "ATTESTATION_HASH" "AttestationLog.wasm" "amanah_attestation_package_hash" @(
    "--session-arg","agent_pubkey:public_key='$PubHex'") | Out-Null
Deploy-One "REPUTATION_HASH" "ReputationRegistry.wasm" "amanah_reputation_package_hash" | Out-Null

# x402 payment asset: stock CEP-18. Package hash becomes X402_ASSET_PACKAGE_HASH.
# init mints initial_supply (1,000,000 @ 6dp) to the deployer.
Deploy-One "X402_ASSET_PACKAGE_HASH" "Cep18.wasm" "amanah_payment_token_package_hash" @(
    "--session-arg","symbol:string='AMANAH'",
    "--session-arg","name:string='Amanah Test USD'",
    "--session-arg","decimals:u8='6'",
    "--session-arg","initial_supply:u256='1000000000000'") | Out-Null

# 5: RwaVault needs spend-gate + compliance hashes.
# ponytail: verify casper-client 5.0 - Odra Address args serialize as CLType Key (account-hash-.../hash-.../package-...).
Deploy-One "VAULT_HASH" "RwaVault.wasm" "amanah_vault_package_hash" @(
    "--session-arg","agent:key='$AgentHash'",
    "--session-arg","spend_gate:key='$SpendGate'",
    "--session-arg","compliance:key='$Compliance'",
    "--session-arg","principal:u512='0'") | Out-Null

Write-Host ""
Write-Host "Done. Addresses written to ${EnvFile}:"
Get-Content $EnvFile
