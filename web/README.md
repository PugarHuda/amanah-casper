# Amanah — web

Next.js (App Router) + TypeScript front-end for the Amanah autonomous RWA treasury agent.

## Run

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
```

## Routes

`/` Landing · `/connect` Sign-in · `/agent` Agent console · `/dashboard` Audit dashboard · `/writing` Blog

## Mock ↔ live data switch

All screen data flows through `lib/data.ts` (async functions). It is **env-gated**:

- **No env set → mock** (`lib/mock.ts`). The app runs fully on realistic mock data, so
  nothing breaks before contracts are deployed.
- **Live** when `CSPR_CLOUD_API_KEY` *and* `NEXT_PUBLIC_VAULT_HASH` are set: reads go through
  `lib/cspr.ts`, a thin CSPR.cloud testnet REST client (`fetch` only, no SDK). Any failed/empty
  read falls back to the mock for that field, so a partial config degrades gracefully.

Copy `.env.example` → `.env.local` and fill in the values to go live.

### What's live vs still mock

| Data | Source when live |
|---|---|
| Audit-trail rows (dashboard) | **Live** — `GET /deploys` filtered by our package hashes, mapped to rows |
| Treasury total + per-asset holdings | **Live** — decoded from RwaVault's Odra `state` dictionary (`getVaultState` in `lib/cspr.ts`), gated on `VAULT_STATE_SEED` |
| CSPR price/rate | **Live** — `GET /rates/{currency_id}/latest` (helper in `lib/cspr.ts`) |
| Banner copy + agent-console metrics/step stream | Mock — cosmetic; the proof-of-reasoning stream should become an SSE/poll feed off the live cycle. Marked `// ponytail:`. |

Endpoints verified against `docs.cspr.cloud`: base `https://api.testnet.cspr.cloud`,
`authorization: <key>` header, `/accounts/{pk}/deploys`, `/deploys`, `/rates/{id}/latest`.
The `/contracts/{hash}` GET and exact deploy field names are written idiomatically and flagged
with `// ponytail: verify CSPR.cloud endpoint` until confirmed against a live response.

## Wallet

`/connect` stubs the CSPR.click wallet + email magic-link actions. The SDK plug-in point is
marked `// ponytail:` in `app/connect/page.tsx`.
