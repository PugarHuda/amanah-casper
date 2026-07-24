# Hosting the autonomous loop 24/7 (C3)

The agent loop (`agent/src/index.ts`) cycles forever and **attests every cycle on-chain**.
Once it's running on a host, the web heartbeat at
[`/api/heartbeat`](https://amanah-casper-rwa.vercel.app/api/heartbeat) — and the green
"Hosted loop live" badge on [`/agent`](https://amanah-casper-rwa.vercel.app/agent) — light
up **on their own**, because the last `AttestationLog` deploy *is* the last heartbeat. Stop
the process and it goes stale on its own. Nothing to lie to; the chain is the witness.

Locally it already runs with `cd agent && npm run start`. To make it 24/7, run the same
container anywhere. Two secrets rules, always:

- **Every** contract hash / API key / PEM is a **runtime secret**, never baked into the image
  (`.dockerignore` excludes `secret/`, `*.pem`, `.env*`).
- The two keys are passed as their **PEM string** — `loadPrivateKey` accepts inline PEM, so no
  file needs to exist in the container.

## Fly.io (recommended — one always-on machine, free-tier friendly)

From the **repo root** (the Dockerfile copies `agent/` + `contracts/wasm`):

```bash
fly launch --no-deploy --copy-config --dockerfile agent/Dockerfile   # uses agent/fly.toml

# String secrets (fill from your agent/.env):
fly secrets set \
  VENICE_API_KEY=...  CSPR_CLOUD_KEY=...  EIA_API_KEY=...  METALS_API_KEY=...  PINATA_JWT=... \
  ATTESTATION_LOG_HASH=...  RWA_VAULT_HASH=...  REPUTATION_REGISTRY_HASH=... \
  AUDITOR_LOG_HASH=...  AUDITOR_QUORUM_HASH=...  ZK_RESERVES_HASH=...  AUDITOR_QUORUM_INSTANCE_ID=... \
  SIGNAL_URL=...  POLICY_VERSION=...  POLICY_APPROVED_BY=...  ACCOUNTABLE_OWNER=...

# The two keys, AS strings (not files):
fly secrets set \
  AGENT_KEY_PEM="$(cat agent/secret/agent_key.pem)" \
  CUSTODIAN_KEY_PEM="$(cat agent/secret/custodian_key.pem)"

# Optional user-facing alert webhook (Slack/Discord/email relay) + operator Telegram:
fly secrets set USER_WEBHOOK_URL=...  TELEGRAM_BOT_TOKEN=...  TELEGRAM_CHAT_ID=...

fly deploy
fly logs        # watch the cycles: "🧠 panel AGREED …", "⛓ attest deploy: …"
```

`CASPER_RPC_URL`, `CASPER_CHAIN_NAME`, and `CYCLE_MS` are set in `fly.toml` `[env]` (public,
non-secret). Override `PANEL_MODELS`, `CONFIDENCE_THRESHOLD`, or `SIMULATE` with a secret if
you want to change them.

## Railway / Render / any Docker host

Same image, same rules: point the platform at `agent/Dockerfile` with **build context =
repo root**, set the same variables (mark the keys + API keys as secret), one instance,
restart-on-crash. `CMD` is `npm run start`.

## Verifying it worked

- `fly logs` shows a cycle every ~60s ending in an `⛓ attest deploy: <hash>`.
- Open [`/api/heartbeat`](https://amanah-casper-rwa.vercel.app/api/heartbeat): `alive: true`,
  `agoSeconds` under ~210.
- The [`/agent`](https://amanah-casper-rwa.vercel.app/agent) page shows a green **Hosted loop
  live** badge with a "verify last cycle on-chain ↗" link.

## Cost

One `shared-cpu-1x` / 512 MB machine. The real cost is gas + LLM: each cycle does ~1–3
testnet deploys (free testnet CSPR) and one consensus panel (~3 Venice calls at
`deepseek-v4-flash` ≈ pennies). `SIMULATE=true` runs the whole pipeline with **zero** on-chain
deploys if you want a live-looking loop without spending gas.
