# Amanah — web

Next.js 15 (App Router) + React 19 + TypeScript front-end for the Amanah autonomous
RWA treasury agent. Everything user-facing reads live on-chain state — no mock data.

## Run

```bash
npm install
npm run dev                      # http://localhost:3000
npm run build && npm run start   # production
npm run test:unit                # formatter unit tests (node:test)
npm run test:e2e                 # Playwright manual-click E2E (server on :3100)
```

## Routes

`/` Landing · `/connect` CSPR.click wallet · `/agent` Agent console · `/dashboard` Audit dashboard.
"Read the spec" in the nav links to the GitHub README.

## Live data (all real, env-gated)

All screen data flows through `lib/data.ts`. With the env vars set (copy
`.env.example` → `.env.local`) every surface reads live chain state:

| Surface | Source |
|---|---|
| Treasury total + per-asset holdings + **$800K locked principal** | RwaVault v2 Odra `state` dict (`getVaultState`, gated on `VAULT_STATE_SEED`) |
| Guardrail limits (per-tx cap / daily / spent) | SpendGate `state` dict (`SPENDGATE_STATE_SEED`) |
| Compliance status + agent allowlisted | ComplianceRegistry + SpendGate (`COMPLIANCE_STATE_SEED`) |
| Reputation score | ReputationRegistry `state` dict (`REPUTATION_STATE_SEED`) |
| Audit trail (dashboard) | CSPR.cloud `GET /deploys` per package hash, deep-linked to cspr.live |
| Live contract-event feed (dashboard) | CSPR.cloud **Streaming API** via the SSE relay at `/api/stream` (key stays server-side) |
| Agent console (reasoning steps, decision, prices) | the latest published reasoning blob — local `audit/` in dev, **public IPFS (Pinata)** in prod |

If a chain read is unavailable, the UI shows `—` or a **"representative"** label —
never a fabricated number dressed as live. See `../TESTING.md` and `../DEPLOY_WEB.md`.

## Wallet

`/connect` uses the **official CSPR.click hosted SDK** (`lib/useCsprClick.ts`) —
`signIn()` opens the real modal (Casper Wallet / Ledger / MetaMask Snap / Google+Apple).
`csprclick-template` app-id works on localhost; set `NEXT_PUBLIC_CSPR_CLICK_APP_ID`
for a deployed domain.
