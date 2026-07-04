# Deploy the web dashboard to a public URL (Vercel)

**✅ Deployed and live: https://web-hudas-projects-a8e7f558.vercel.app** (Next.js 16,
all env vars set, Vercel SSO/Deployment-Protection disabled so it's publicly viewable).
Redeploy after code changes with `cd web && npx vercel --prod`.

The steps below are how it was set up (and how to redeploy / deploy your own).

## Steps

```bash
cd web
npx vercel login          # opens the browser — sign in (GitHub is easiest)
npx vercel link           # create/link a project; set Root Directory = web
npx vercel --prod         # builds + deploys → prints your public URL
```

## Set these environment variables (Vercel → Project → Settings → Environment Variables)

Copy the values from `web/.env.local` (all server-side; safe as Vercel env vars):

| Variable | Purpose |
|---|---|
| `CSPR_CLOUD_API_KEY` | live audit trail + streaming (the CSPR.cloud key) |
| `CSPR_CLOUD_BASE` | `https://api.testnet.cspr.cloud` |
| `NEXT_PUBLIC_VAULT_HASH` | vault v2 package hash |
| `NEXT_PUBLIC_ATTESTATION_HASH`, `NEXT_PUBLIC_REPUTATION_HASH` | trail labels |
| `NEXT_PUBLIC_X402_HASH` | x402 settlements in the trail |
| `VAULT_STATE_SEED`, `SPENDGATE_STATE_SEED`, `COMPLIANCE_STATE_SEED`, `REPUTATION_STATE_SEED` | live treasury / guardrail / compliance / reputation reads |
| `CASPER_RPC_URL` | `https://node.testnet.casper.network/rpc` |
| `NEXT_PUBLIC_CSPR_CLICK_APP_ID` | your CSPR.click app-id (or leave `csprclick-template`) |
| `PINATA_JWT` | **makes the agent console live in prod** — fetches the latest reasoning blob from public IPFS (same JWT as `agent/.env`) |

Redeploy after setting them: `npx vercel --prod`.

## What will be live on the hosted URL

- **Landing**, **Dashboard** (live $1M treasury / $800K principal / audit trail /
  guardrails / compliance — all read from casper-test), **Connect** (CSPR.click modal).
- **Agent console**: LIVE in prod too — with `PINATA_JWT` set, it fetches the latest
  published reasoning blob from public IPFS (Pinata pinList → gateway), so the
  deployed dashboard shows the real cycle without the local `audit/` files.

## Note on the live event feed

The dashboard's CSPR.cloud Streaming feed (`/api/stream`) holds a WebSocket; Vercel
caps a serverless function at 60s (set in `vercel.json`), so the feed reconnects
periodically rather than staying open indefinitely. Fine for a demo; for an
always-on feed, host on a normal Node server (Railway/Render/a VPS) instead.
