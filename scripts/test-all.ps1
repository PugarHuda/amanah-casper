# Run the whole Amanah test pyramid. From the repo root: ./scripts/test-all.ps1
$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot

function Run($name, $dir, $cmd) {
  Write-Host "`n=== $name ===" -ForegroundColor Cyan
  Push-Location (Join-Path $root $dir)
  Invoke-Expression $cmd
  Pop-Location
}

# 1. Unit tests (pure logic, fast, offline)
Run "agent unit"          "agent"          "npm test"
Run "web unit"            "web"            "npm run test:unit"
Run "mcp unit"            "mcp"            "npm test"
Run "signal-service unit" "signal-service" "npm test"

# 2. Type safety (all TS packages)
Run "agent typecheck"          "agent"          "npm run typecheck"
Run "web typecheck"            "web"            "npx tsc --noEmit"
Run "mcp typecheck"            "mcp"            "npm run typecheck"
Run "signal-service typecheck" "signal-service" "npx tsc --noEmit"

Write-Host "`n--- On-demand suites (network / browser needed) ---" -ForegroundColor Yellow
Write-Host "  agent integration (live testnet):  cd agent; npm run test:integration"
Write-Host "  web E2E (Playwright, manual-click): cd web; npm run test:e2e   (server on :3100)"
Write-Host "  contracts (OdraVM, WSL):            cd contracts; cargo odra test"
