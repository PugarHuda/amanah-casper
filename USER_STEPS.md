# Amanah — Your Step-by-Step Guide (what only YOU can do)

The code is done and live on Casper testnet. This file is the human checklist —
the things I (the agent) cannot do for you, in priority order, with exact steps.

---

## 🔴 PRIORITY 1 — Submission-critical (do these or you can't win)

### 1. Record the demo video (~2.5 min)
A demo video is **mandatory** for the DoraHacks submission.

1. Start the three pieces (each in its own terminal):
   ```powershell
   cd signal-service ; npm install ; npm run dev      # x402 signal seller (:8402)
   cd web ; npm run build ; npm run start              # the UI (:3000)
   ```
2. Open the script in [`DEMO.md` §3](DEMO.md) — it's 6 segments, word for word.
3. Screen-record (OBS / Loom / Windows Game Bar `Win+G`). Follow the script:
   - landing page → `MAX_CYCLES=1 npm run dev` in `agent/` → narrate each log line
   - paste a tx hash into **testnet.cspr.live** → show SUCCESS
   - open the dashboard (`:3000/dashboard`) → real $1M treasury + clickable audit trail
   - open `:3000/agent` → live reasoning + reputation = 1
4. Upload (YouTube unlisted / Loom) and **copy the link** for step 3 below.

### 2. Register on CSPR.fans
Top-3 by community vote **auto-advance to the jury**. Not registered = you rely
only on the jury seeing you.
1. Go to **cspr.fans**, sign up, create the project page for Amanah.
2. Paste: one-liner, the repo link, the demo video, the proof hashes from `DEMO.md`.
3. Share the vote link so people can vote.

### 3. Submit on DoraHacks
1. Go to the **Casper Agentic Buildathon 2026** page on DoraHacks.
2. Fill the form: repo `https://github.com/PugarHuda/amanah-casper`, demo video link,
   the proof table from `DEMO.md §1`, the pitch from the top of `DEMO.md`.
3. Submit before **July 7 2026**.

---

## 🟠 PRIORITY 2 — Security (do before sharing the repo/zip publicly)

### 4. Rotate the exposed API keys
These keys are in chat transcripts and reused across `.env` files — rotate them:
- **CSPR.cloud** token `019f04a5-…` → regenerate at console.cspr.build, update
  `agent/.env`, `signal-service/.env`, `web/.env.local`, `mcp/.env`.
- **Venice** key in `agent/.env` → regenerate at venice.ai.
- The agent's private key `agent/secret/agent_key.pem` is gitignored, but **never
  put it in a zip/share**. It controls the testnet account holding ~15k CSPR.

---

## 🟢 PRIORITY 3 — Optional polish (more partner-integration points = more judge value)

### 5. Public IPFS pin (5 min — just an env var)
Makes every reasoning blob verifiable by anyone, not just repo holders.
1. Get a free JWT at **pinata.cloud** (API Keys → New Key).
2. Add to `agent/.env`: `PINATA_JWT=<your_jwt>`
3. Next agent cycle pins automatically (code is already wired in `attest.ts`).

### 6. CSPR.click real wallet — ✅ DONE (just swap in your prod app-id)
The official CSPR.click SDK is wired on `/connect` (loads from the CSPR.click CDN —
no stub). `signIn()` opens the real modal: Casper Wallet, Ledger, MetaMask Snap,
and Google/Apple social login. It works **right now on localhost** with the
`csprclick-template` app-id.
- For a **deployed domain** you need your own app-id: get it at console.cspr.build,
  then set `NEXT_PUBLIC_CSPR_CLICK_APP_ID=<your-id>` in `web/.env.local` (rebuild).
- That's the only change — the integration code is done and tested
  (`npm run test:e2e` includes a live SDK check).

### 7. Consume official Casper MCP / CSPR.trade MCP
1. Get the endpoint + auth for those MCP servers from the buildathon partners.
2. Tell me — I'll have the agent *call* them (e.g. execute a swap) alongside our
   read-only server.

---

## ✅ How to verify everything yourself (QA)

### Run the click-through QA (Playwright)
```powershell
cd web
npm run build
npm run start -- -p 3100          # terminal 1: serve the prod build
# terminal 2:
$env:QA_BASE="http://localhost:3100" ; npm run test:e2e
```
Expect **12 passed** — it clicks every page, checks live data (treasury $1M,
reputation 1, live SpendGate cap, live stream connects), asserts every cspr.live
link is a real deep link (no fake numbers, no homepage links), and verifies the
CSPR.click modal actually opens.

### Check all 4 MCP tools are live
```powershell
cd mcp ; npx tsx src/smoke.ts
```
Expect: reputation **score=1**, vault **$1,000,000**, attestation **verified=true**,
audit trail with real deploy hashes.

### Re-prove on-chain from scratch (optional)
```powershell
cd agent
DRY_RUN=false npx tsx src/go-live.ts            # allowlist + compliance + reallocate
DRY_RUN=false npx tsx src/credit-reputation.ts  # record_payment (will say "already credited")
npx tsx src/read-vault.ts                        # live holdings off the vault
npx tsx src/find-state-seeds.ts                  # rediscover state-dict seeds via RPC
```

---

## What's already live (you don't need to do anything)

| Thing | Status | Proof |
|---|---|---|
| 6 Odra contracts on testnet | ✅ live | `.env.deployed` |
| On-chain attestation (Ed25519 verified in-contract) | ✅ live | `a87e10c8…` |
| x402 agent-pays-agent (CEP-3009 settled) | ✅ live | `391274dc…` |
| Reallocate (SpendGate + Compliance gated) | ✅ live | `eeecb9d1…` |
| Reputation (record_payment, score=1) | ✅ live | `c4c65c94…` |
| Treasury/holdings decoded from vault ($1M) | ✅ live | dashboard |
| MCP: all 4 tools read live chain state | ✅ live | `src/smoke.ts` |
| CSPR.click wallet on /connect (hosted SDK) | ✅ live | `/connect` |
| CSPR.cloud Streaming API live event feed | ✅ live | `/dashboard` + `agent/src/stream.ts` |
| Agent consumes official CSPR.cloud MCP (82 tools) | ✅ live | `agent/src/cspr-mcp.ts` |
| Guardrails + compliance read live (SpendGate + ComplianceRegistry) | ✅ live | dashboard + `/agent` |
| AI Agent Skill (SKILL.md + references) | ✅ shipped | `skill/` |
| Web: dashboard + agent console, real deep links | ✅ live | `test:e2e` 12/12 |
