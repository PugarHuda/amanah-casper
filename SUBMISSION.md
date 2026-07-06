# Amanah — DoraHacks submission (ready to paste)

## One-liner
Amanah is an autonomous, compliant RWA-treasury agent on Casper: every AI decision
is Ed25519-signed and **verified on-chain by the contract itself** before it moves a
token — proof, not a diary. Principal is locked, spending is custodian-gated, and the
agent both pays and earns via x402.

## Elevator pitch
Tokenized real-world assets are moving on-chain at scale, and that capital needs
management a fiduciary can defend to a regulator: capital preserved, mandate + KYC
enforced, every decision independently verifiable after the fact. Amanah makes all
three **structural and on-chain**. An LLM reads live RWA prices + a paid x402 signal +
two official Casper MCP servers, decides, signs its reasoning, and the AttestationLog
contract verifies that signature *inside the contract* before recording it. Only then
does the vault reallocate — yield only, principal untouchable, through gates a separate
custodian key controls. We proved it end-to-end: **the LLM autonomously decided a
Gold→CSPR rebalance at 0.85 confidence and executed it on-chain.**

**Separation of duties for AI:** an **independent auditor agent** (its own custodian
key) grades every decision and attests an APPROVE/VETO verdict **on-chain to a second
log** — the reallocate only fires if it approves. Proven both ways: the auditor
**vetoed** a flawed move and blocked it, and **approved** a sound one that then executed.
A veto also **slashes the agent's on-chain reputation** (custodian-gated `adjust`), so
the score reflects its real audit track record — skin in the game. Prices are
**cross-validated** across two independent feeds (CoinGecko + Coinpaprika) with a
divergence signal, so a single stale/manipulated source is caught, not trusted.

**Zero-knowledge KYC (real, on-chain):** the agent proves it holds its KYC credential
via a **Schnorr NIZK verified inside the contract** (curve25519-dalek) — the secret is
never transmitted. Not a stored flag, not a toy: a genuine 256-bit zero-knowledge proof
verified in the Casper WASM VM.

## Live proof transactions (testnet.cspr.live/deploy/<hash>)
| What | Hash |
|---|---|
| **Autonomous reallocate — the LLM decided it** (Gold→CSPR, conf 0.85) | `9e266b0554d2930cd5716da9493e4ab7991d834d4a688fee20e02b6283b26d1a` |
| **Auditor VETO** — 2nd agent (custodian key) blocked a flawed move, on-chain | `987a3700aeb127649d26680fe5c92012f5d4990a24a6dc0f13e4f177936afe11` |
| **Auditor APPROVE** (grade 0.9) → reallocate executed | `93585d75dd8133bde3e40803ecb8e6fdfcb8c9acefdbbd26405aa13e09528f1e` |
| Reallocate executed after the auditor approved (Gold→TBond) | `204b3c9c74e21cda22abe846cddefa57c68583411602dd7d6ad03c206dd117fa` |
| **Reputation slash** — a veto docked the agent's score (custodian-gated `adjust`) | `a2ac131fb79dd1ae208a57719db86caa77806c0a22f3443f338e0112655977fc` |
| **Zero-knowledge KYC** — Schnorr NIZK verified ON-CHAIN (secret never sent) | `da738fc1b49bea83988956dae45543785a71279be5a6dcb5582ddab5c0882ed4` |
| **Verified identity** — `set_url` on MAKE's Account Info contract → "Amanah" on cspr.live | `ce60f0e4ddf288b208c33075793f2093c022255538226cc62c629561039db364` |
| Attestation — reasoning signed + verified on-chain | `a87e10c77a873ace20d580b13d4b0c2a31e6899ed0ac5fe92412f3145dd870e8` |
| x402 settlement — CEP-3009 transfer_with_authorization | `391274dcad1ebd7dd2641bd94aa17893084adf76f58b5603d7d69c0c4cce4398` |
| **x402 PAY** — Amanah → the custodian (agent-pays-another-agent, distinct payee) | `785ceb256649f9d61bd31e3ddd863d7861d2f991d600355377d2d64e3ccf0766` |
| **x402 EARN** — a buyer paid Amanah for verified reasoning (settled to Amanah) | `cf48c91df6240231461e0b75a06c93852569d13257a2ad9aa1239773ba8a1b4c` |
| Custodian-separated reallocate ($800K principal locked) | `e81b4abc0c96b73d2c3d65e4800b2c208e106c78fc0ab57e552fa82c1c6f7149` |
| Reputation — record_payment (anti-replay) | `de899bef804a0cce3f0e77b9db08e8f4226e097245098ea7bbca0eb469b90711` |

Live dashboard: https://amanah-casper-rwa.vercel.app
Repo (public): https://github.com/PugarHuda/amanah-casper

## Partner tools used (all genuinely integrated)
Casper L1 (Odra, 8 contracts) · x402 / CEP-3009 (two-sided: pays *and* earns) ·
CSPR.cloud REST + **Streaming API** + hosted **MCP server (consumed)** · **CSPR.trade
DEX MCP (consumed)** · CSPR.click wallet · **Casper Account Info** (verified "Amanah"
identity on cspr.live via `set_url`) · IPFS/Pinata · our own MCP server · an
installable **AI Agent Skill** · Venice (reasoning).

## Prized stack (AI Agent Skills + MCP + x402) — all three, wired together
- **MCP**: our read-only server (4 live tools) + the agent *consumes* the official
  CSPR.cloud (82 tools) and CSPR.trade (23 tools) servers, feeding their data into the LLM.
- **x402**: genuinely two-sided, both directions PROVEN on-chain with distinct parties.
  PAY — Amanah pays a separate signal provider (the custodian) for premium alpha
  (CEP-3009, proof `785ceb25`). EARN — a buyer (the custodian) paid Amanah for its
  verified proof-of-reasoning; the settlement credited Amanah's own account (proof
  `cf48c91d`). Distinct payTo per route (`X402_ALPHA_PAY_TO` vs Amanah).
- **AI Agent Skill**: `skill/SKILL.md` lets any coding agent inspect + verify the treasury.

## Testing
71 automated tests: 43 unit/regression + 4 live-testnet integration + 12 Playwright
E2E + 12 OdraVM contract tests. See TESTING.md.

## What to look at
- `USE_CASE.md` — the real-world case + separation-of-powers.
- `DEMO.md` — 2.5-min video script + runbook. `./scripts/demo.ps1` — 30s read-only demo.
- `README.md` — architecture, addresses, the cycle.
