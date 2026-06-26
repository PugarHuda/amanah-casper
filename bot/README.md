# amanah-bot

Optional thin Telegram notifier (grammy). Posts decision notifications and
answers `/audit` with the latest attestation + deploy links on cspr.live.

## Run

```bash
cp .env.example .env   # set TELEGRAM_BOT_TOKEN
npm install
npm run dev            # long polling
npm run typecheck
```

## Commands

- `/start` — intro
- `/audit` — latest attested decision, reasoning hash, and deploy links

`notifyDecision({...})` is exported for the agent to push the latest cycle's
hashes into the bot. The agent also has a direct Telegram escalation path
(`escalateToHuman`) that needs no bot process.
