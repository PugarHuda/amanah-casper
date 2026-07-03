# Amanah — reproducible read-only demo. Proves the live on-chain state in ~30s
# without spending gas. From the repo root:  ./scripts/demo.ps1
$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot

Write-Host "`n=== 1. Live treasury off the vault (no entrypoint call) ===" -ForegroundColor Cyan
Push-Location (Join-Path $root "agent"); npx tsx src/read-vault.ts; Pop-Location

Write-Host "`n=== 2. Ask the agent over MCP (all 4 tools, live chain) ===" -ForegroundColor Cyan
Push-Location (Join-Path $root "mcp"); npx tsx src/smoke.ts; Pop-Location

Write-Host "`n=== 3. The agent consumes the official CSPR.cloud + CSPR.trade MCP ===" -ForegroundColor Cyan
Push-Location (Join-Path $root "agent"); npx tsx src/cspr-mcp.ts; npx tsx src/trade-mcp.ts; Pop-Location

Write-Host "`n=== Verifiable proofs (open on testnet.cspr.live/deploy/<hash>) ===" -ForegroundColor Yellow
Write-Host "  autonomous reallocate (LLM-decided): 9e266b0554d2930cd5716da9493e4ab7991d834d4a688fee20e02b6283b26d1a"
Write-Host "  attestation (sig verified on-chain):  a87e10c77a873ace20d580b13d4b0c2a31e6899ed0ac5fe92412f3145dd870e8"
Write-Host "  x402 settlement (CEP-3009):           391274dcad1ebd7dd2641bd94aa17893084adf76f58b5603d7d69c0c4cce4398"
Write-Host "  custodian-separated reallocate:       e81b4abc0c96b73d2c3d65e4800b2c208e106c78fc0ab57e552fa82c1c6f7149"
Write-Host "`nFor a LIVE paid cycle (spends gas): start signal-service, then: cd agent; MAX_CYCLES=1 npm run dev" -ForegroundColor DarkGray
