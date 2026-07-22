# Amanah — DoraHacks submission (ready to paste)

**▶️ Demo video:** https://youtu.be/lqG0nfVifA8 · **Live:** https://amanah-casper-rwa.vercel.app · **Repo:** https://github.com/PugarHuda/amanah-casper

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

**More, all live + proven on-chain:** a **K-of-N auditor quorum** enforced by the vault
(proven 2-of-3, and a human can now **cast a real vote from a browser wallet**); a
**reputation-gated circuit breaker**; a **dead-man's switch**; a one-call **emergency stop**;
**economic slashing** (auditors stake CSPR, a bad actor's bond burns); the **trading policy as
on-chain governed parameters** (a `PolicyEngine` the agent reads each cycle) versioned to a
policy the quorum **signs off on-chain**; a **human approval inbox** where escalated decisions
get real on-chain sign-off; a **prompt-injection red team** (7/7 attacks blocked) with an
**independent auditor on a different model family**; and **verifiable auditor selection** so the
agent can't pick its own judges.

**A COMPLETE, browser-verifiable ZK solvency proof** — the differentiator no rival has: the ZK
proof-of-reserves proves the commitments **sum** to the total, **range proofs** prove each hidden
allocation is non-negative, the total is **bound to the vault's real balance**, and a Merkle
**proof-of-liabilities** proves reserves ≥ what's owed to clients. Re-run every check **in your
own browser** at [/verify](https://amanah-casper-rwa.vercel.app/verify), then tamper and watch it
break. 12 Odra contracts; 24 contract + 65 agent + 24 end-to-end tests.

## Live proof transactions (testnet.cspr.live/deploy/<hash>)
| What | Hash |
|---|---|
| **Autonomous reallocate — the LLM decided it** (Gold→CSPR, conf 0.85) | `9e266b0554d2930cd5716da9493e4ab7991d834d4a688fee20e02b6283b26d1a` |
| **Auditor VETO** — 2nd agent (custodian key) blocked a flawed move, on-chain | `987a3700aeb127649d26680fe5c92012f5d4990a24a6dc0f13e4f177936afe11` |
| **Auditor APPROVE** (grade 0.9) → reallocate executed | `93585d75dd8133bde3e40803ecb8e6fdfcb8c9acefdbbd26405aa13e09528f1e` |
| Reallocate executed after the auditor approved (Gold→TBond) | `204b3c9c74e21cda22abe846cddefa57c68583411602dd7d6ad03c206dd117fa` |
| **Reputation slash** — a veto docked the agent's score (custodian-gated `adjust`) | `a2ac131fb79dd1ae208a57719db86caa77806c0a22f3443f338e0112655977fc` |
| **Auditor quorum** — 2-of-3 independent auditors signed APPROVE on-chain | `483f66cdbdc0803333f35c7f70ad8bde3bd32e275e66af7ba83aaf6c27f64ca2` |
| **Circuit breaker** — reallocate blocked below reputation floor, then resumed | `82dc878b617a352f999d15577ce58660a8e107496d19ce7870dba0cde85e2350` |
| **ZK proof-of-reserves** — solvency proven on-chain against the vault's real balances | `70318a98ecc37822aad441264931daa5712953deaec19c7fcd920e882d29b252` |
| **Emergency stop** — custodian pauses the whole vault in one call; a valid quorum-approved reallocation is then blocked with `Expired`, then re-enabled | `9ed255984b014dc8abf3572d9c74e6bd141c087fbf9159bf36c97a3096538966` |
| **REFUSED** — a valid ZK proof claiming $1.05M when the vault holds $1.00M (`TotalMismatch`) | `3c114651e1a0008e81286016264c05dcc570959279d1964b86b54409e60ff1ee` |
| **Auditor vote from a browser** — a human auditor connects a wallet and casts a real on-chain vote (2 independent wallets → 2-of-N quorum) | `bb921506ee62cc8e1d232f37a0c01496d96244af3e18714e450cb5e0d90fd2cb` |
| 🔒 **Auditor quorum ENFORCED by the vault** — unapproved decision refused (`NotApproved`) | `ba368de335840645486c7692cf1fdee8b0ca3f7f61514091515a32052ac2d7b7` |
| **Approved decision executed** on the same vault | `e68d42184b6f7fac2e226bea10c6a3e0942a276da6d6065618ac0f2d6c533c8e` |
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
Casper L1 (Odra, 10 contracts) · x402 / CEP-3009 (two-sided: pays *and* earns) ·
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
111 automated tests: 69 unit/regression + 4 live-testnet integration + 20 Playwright
E2E + 20 OdraVM contract tests. See TESTING.md.

## Long-term launch plan
Amanah is a real project, not a throwaway. Testnet proves the hard part — a complete
on-chain fiduciary-controls stack (10 contracts). Next: security audit → mainnet core →
first real tokenized RWA + real KYC issuer → an open, staked auditor network + an Amanah
SDK/MCP that turns our controls into shared Casper primitives. Revenue: management-fee
bps on AUM, pay-per-proof (x402 earn side already live), and controls-as-a-service to
other RWA protocols. Full plan in `ROADMAP.md`; launch kit (socials, thread) in `LAUNCH.md`.

## What to look at
- `/compliance` + `/api/compliance-report` — Rule 206(4)-7 evidence pack: exception report of every refused transaction, named by control.
- `THREAT_MODEL.md` — what each control stops and, explicitly, what it does NOT.
- `RESEARCH.md` — primary-source research (AICPA Part II, EU AI Act Art. 14, MiCA) mapped to each control, incl. the criticism of our own approach.
- `ROADMAP.md` — milestones, business model, regulatory posture (CASP). `LAUNCH.md` — socials.
- `USE_CASE.md` — the real-world case + separation-of-powers.
- `DEMO.md` — 2.5-min video script + runbook. `./scripts/demo.ps1` — 30s read-only demo.
- `README.md` — architecture, addresses, the cycle.
