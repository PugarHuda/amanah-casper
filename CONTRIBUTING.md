# Contributing to Amanah

Thanks for your interest! Amanah is an autonomous compliant RWA treasury agent on
Casper. This guide gets you from clone to a green build.

## Layout

| Path | What |
|------|------|
| `contracts/` | Rust · Odra 2.8.1 → WASM (10 contracts). Tests: `cargo odra test`. |
| `agent/` | TypeScript agent loop, deploy/migration scripts, on-chain state codec. |
| `mcp/` | Amanah MCP server (reads live chain state). |
| `web/` | Next.js dashboard (live on-chain reads) + Playwright E2E. |
| `signal-service/`, `bot/` | x402 signal seller; Telegram notifier. |

## Prerequisites

- Node.js ≥ 20, Rust (stable) + [`cargo-odra`](https://odra.dev), and `wasm-opt` (binaryen)
  for lowering. Copy `.env.example` → `.env` in each package and fill keys (all secrets
  are gitignored — never commit `agent/secret/*` or `.env*`).

## Build & test

```bash
# contracts
cd contracts && cargo odra test           # 16 OdraVM tests

# TypeScript packages
cd agent && npm ci && npx tsc --noEmit && npm test
cd web   && npm ci && npx tsc --noEmit && npm run build && npx playwright test
```

Integration tests (`agent: npm run test:integration`) read **live** casper-test state
and need network access. The full suite is **79 automated tests**.

## Pull requests

1. Branch from `master`; keep the project in a **functional state** on every commit.
2. Run typecheck + tests for the packages you touch before pushing.
3. Never commit secrets, private keys, or `.env` files.
4. Describe on-chain changes with the resulting deploy/proof hashes where relevant.

By contributing you agree to the [Code of Conduct](CODE_OF_CONDUCT.md) and that your
contributions are licensed under the repository's [MIT License](LICENSE).
