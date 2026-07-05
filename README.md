# Amanah — Autonomous Compliant RWA Treasury Agent

**🔗 Live dashboard:** https://amanah-casper-rwa.vercel.app — treasury,
audit trail, guardrails, compliance, live event feed, and the agent console all read
live from casper-test (+ IPFS). Repo is public.

> Casper Agentic Buildathon 2026. **Amanah** (fiduciary trust). An autonomous AI
> agent manages a tokenized RWA treasury (gold, US T-bond, oil, CSPR) on **Casper
> testnet**: it ingests live RWA prices, pays for a premium signal via **x402**,
> reasons with an LLM, **signs its reasoning (Ed25519) and attests it on-chain**,
> checks guardrails + compliance, and only then reallocates **yield** (principal
> stays locked).

**The differentiator — proof, not a diary.** Every decision is cryptographically
signed and **verified on-chain by the contract itself** before it's recorded —
publicly checkable on [cspr.live](https://testnet.cspr.live), not logged to a
private database.

**Why it matters (the real-world case → [USE_CASE.md](USE_CASE.md)).** Tokenized
RWA is heading on-chain at scale, and that capital needs management that a
fiduciary can defend to a regulator: capital preserved, mandate + KYC enforced,
and every decision independently verifiable after the fact. Amanah makes all three
**structural and on-chain** — principal is untouchable by a vault invariant,
spending passes SpendGate + ComplianceRegistry, and each decision proves itself.
Prices are real and attributed (US EIA, US Treasury, metalpriceapi, CoinGecko) —
no invented numbers.

**Status: live on casper-test.** All contracts are deployed and the off-chain
loop runs end-to-end against the live node. Every step is verified with public proof
hashes — including an **autonomous reallocate the LLM itself decided and executed**,
plus **attestation**, **x402 settlement**, **reputation** (caller-gated
`record_payment`), and a **custodian-separated** vault with an **$800K locked
principal** (the agent can't touch principal, raise its own limits, or clear its own
KYC — a separate custodian key holds those powers).

**Separation of duties for AI — the agent that decides is not the agent that
approves.** An **independent auditor agent** (its own custodian key) reviews every
decision and attests an APPROVE/VETO verdict **on-chain to a second AttestationLog**,
and the reallocate only executes if it approves. This is proven **both ways** on
casper-test: the auditor **vetoed** a flawed Gold→CSPR move (it caught reasoning that
leaned on unstated priors) and **blocked** the reallocate, and separately **approved**
a sound Gold→TBond move that then executed — two independent on-chain signatures from
two keys per cycle, neither able to forge the other's. **Skin in the game:** a veto
also **slashes the agent's on-chain reputation** — `ReputationRegistry.adjust` is gated
to the custodian, so the agent can't inflate its own score and a griefer can't nuke
it; reputation reflects the agent's real audit track record (settlements up, vetoes down). Partner integrations are
live too: **CSPR.cloud** REST (audit trail + treasury) **and Streaming API** (live
contract-event feed over WebSocket→SSE); the agent **consumes two official hosted MCP
servers** each cycle and **reasons over their data** — **CSPR.cloud MCP** (82 tools:
balance + rates) and the **CSPR.trade DEX MCP** (23 tools: a live CSPR↔sCSPR quote)
are fed into the LLM prompt and attested in the reasoning blob (the model cites the
DEX price impact in its decision); the **CSPR.click** wallet on `/connect` (official hosted SDK — Casper Wallet
/ Ledger / social login); our own **MCP** server (all four tools read live chain
state); **public IPFS pinning** of every reasoning blob (Pinata); and **Venice**
reasoning. The dashboard's treasury, audit trail,
reputation, live event feed, and **guardrail limits read live from chain**; the agent
console renders the latest published reasoning blob + its on-chain attestation.
See [Live deployment](#live-on-casper-test) for addresses + proof hashes.

## Cycle (every `CYCLE_MS`, default 60s — all steps real, no mock)

```
ingest live RWA prices  →  enrich via the official CSPR.cloud + CSPR.trade MCP servers
  →  pay premium signal via x402 (CEP-3009 settle, real tx)
  →  LLM reasons over all of it: risk score + decision + reasoning steps
  →  blake2b256(reasoning) + Ed25519 sign  →  AttestationLog.attest (verifies sig ON-CHAIN)
       + publish blob to IPFS  →  ReputationRegistry.record_payment (caller-gated)
  →  INDEPENDENT AUDITOR agent (custodian key) grades the decision, attests APPROVE/VETO
       on-chain to a second AuditorLog  →  a VETO blocks the reallocate
  →  SpendGate.check + ComplianceRegistry.assert_valid (custodian-owned gates)
  →  RwaVault.reallocate (yield only, $800K principal locked) — only if the auditor approved
```

Real on-chain transactions per cycle (x402 settle, attest, and reallocate when a
rebalance fires) — all verifiable on [testnet.cspr.live](https://testnet.cspr.live).

## Live on casper-test

Contract **package hashes** (also in [`.env.deployed`](.env.deployed)):

| Contract | Package hash |
|---|---|
| RwaVault (v3, principal-locked $800K, owner-gated compliance) | `497cf5ba192570db43d3ee960d0ccf4d1393f20a3805cad97da97f33a95e1733` |
| AttestationLog (agent's reasoning) | `365913a7a26d3e50798c2c0ce31d0850b8b24b2e1a641f990e41f7ad219a6532` |
| AuditorLog (auditor's verdict, custodian key) | `ec0721feef72482e745e8950f57fb17def15a51dda382f31de0004e886b1bf89` |
| SpendGate (owned by custodian) | `fc36ac817cc68533fee59d9e03a7e2457cadb4edf3c5b469428a93ad6c04f8fc` |
| ComplianceRegistry (v3, `set_status`/`revoke` owner-gated to custodian) | `93bc5e1389517acfb57b659ec1427c2979d6d931f1c1d587537427d5595f9ea5` |
| ReputationRegistry (v3, `adjust` gated to custodian) | `8d27187d49f2efe5d060033774b845864eace898d5bbc300d775130e1023304b` |
| PaymentToken (CEP-18 + CEP-3009) | `d784f72c17d143cd96e8bcd2b19fc893f003c1ce9ea29f059eb033bcbd347d79` |
| ZkKycVerifier (on-chain Schnorr NIZK, real ZK KYC) | `e9394a31557d33a6f5f26e4d5d996f7cbd7e98138cef60cc5921eee2617dfd0f` |

Agent account: `0147ebe715f3fb6d387ae2f102e55032ba54c8c4557293d7800cad11561496fdaa`
Custodian account (owns the gates, separate key): `0109cd12284a8fe4cde3be32b28bd1c6f71ca80f7455571fd127f55573b74bb197`

**Separation of powers is real:** the **custodian** (a different key) deploys and
**owns** SpendGate *and* ComplianceRegistry — both `set_status`/`revoke` and the spend
limits/allowlist are **owner-gated to the custodian** (no one else can mark an account
KYC-Valid, revoke it, or raise a limit). The **agent** can only reallocate yield through
those custodian-owned gates. The vault locks **$800K of the $1M as principal** — the
agent moves only the $200K yield.

**Verifiable proof transactions** (paste into [testnet.cspr.live](https://testnet.cspr.live)):

| What | Hash |
|---|---|
| Attestation — reasoning signed + verified on-chain | `a87e10c77a873ace20d580b13d4b0c2a31e6899ed0ac5fe92412f3145dd870e8` |
| x402 settlement — `transfer_with_authorization` | `391274dcad1ebd7dd2641bd94aa17893084adf76f58b5603d7d69c0c4cce4398` |
| Reallocate — $50K yield Gold→T-bond (SpendGate + Compliance gated) | `eeecb9d136a622d07ab41b641272439919d37d14689e7392feee56bb195ac8a0` |
| Reputation — `record_payment` credits the x402 proof (anti-replay) | `de899bef804a0cce3f0e77b9db08e8f4226e097245098ea7bbca0eb469b90711` |
| Reallocate — through **custodian-owned** gates, vault v2 (principal $800K) | `e81b4abc0c96b73d2c3d65e4800b2c208e106c78fc0ab57e552fa82c1c6f7149` |
| **Autonomous reallocate — the LLM decided it** (Gold→CSPR, conf 0.85) then signed + executed it | `9e266b0554d2930cd5716da9493e4ab7991d834d4a688fee20e02b6283b26d1a` |
| **Auditor VETO** — 2nd agent (custodian key) blocked a flawed move, attested on-chain | `987a3700aeb127649d26680fe5c92012f5d4990a24a6dc0f13e4f177936afe11` |
| **Auditor APPROVE** — 2nd agent OK'd a sound Gold→TBond move (grade 0.9) | `93585d75dd8133bde3e40803ecb8e6fdfcb8c9acefdbbd26405aa13e09528f1e` |
| Reallocate executed **after** the auditor approved | `204b3c9c74e21cda22abe846cddefa57c68583411602dd7d6ad03c206dd117fa` |
| **Reputation slash** — auditor veto docked the agent's score (custodian-gated `adjust`) | `a2ac131fb79dd1ae208a57719db86caa77806c0a22f3443f338e0112655977fc` |
| **Zero-knowledge KYC** — Schnorr NIZK verified ON-CHAIN in the WASM VM (secret x never sent) | `da738fc1b49bea83988956dae45543785a71279be5a6dcb5582ddab5c0882ed4` |
| Reallocate through the **owner-gated** compliance v3 (custodian-only KYC) | `33905a576154aacf42872414e1f647a5f9d024bf469a941b532b61f72702323b` |

The autonomous reallocate above is the whole thesis in one tx: a live cycle
(`MAX_CYCLES=1 npm run dev`) where the **LLM itself** read gold at a ~$4,000 extreme
vs cheap CSPR + the live CSPR.trade DEX price impact, decided to rotate a slice of
gold yield into CSPR at confidence 0.85, signed that reasoning, attested it, and
executed the move through the custodian-owned gates — no scripted decision. The
attestation (`0746b729…`) and its published reasoning are checkable on-chain + IPFS.

Setup was done by the **custodian** (a separate key), not the agent itself:
`agent/src/migrate-custody.ts` deployed the custodian-owned SpendGate + Compliance,
allowlisted the agent, set its KYC, deployed the vault with the $800K principal, and
seeded $1M. The autonomous reallocate then moved Gold $200K→$199K / CSPR $200K→$201K —
verify the live vault any time with `agent/src/read-vault.ts`.

## Monorepo

| Module | Stack | What it is |
|---|---|---|
| [`contracts/`](contracts) | Rust · **Odra 2.8.1** → WASM | 8 contracts: RwaVault, **AttestationLog** (proof-of-reasoning), **AuditorLog** (2nd agent's on-chain verdict), SpendGate, ComplianceRegistry, ReputationRegistry (record_payment caller-gated; `adjust`/slash gated to the custodian authority), PaymentToken, **ZkKycVerifier** (on-chain Schnorr NIZK — real ZK KYC). On-chain Ed25519 + ZK verification is the heart. 12/12 OdraVM tests pass. |
| [`agent/`](agent) | TypeScript · casper-js-sdk v5 · Venice · MCP client | The autonomous loop: ingest → **enrich via CSPR.cloud MCP + CSPR.trade DEX MCP** → x402 → reason → attest (+ **pin blob to IPFS**) → guardrail → execute → reputation. `npm run deploy` installs all contracts; `npm run dev` runs the loop. Demos: `npx tsx src/cspr-mcp.ts` (official MCP), `npx tsx src/trade-mcp.ts` (DEX MCP), `npx tsx src/stream.ts` (live events). |
| [`signal-service/`](signal-service) | TypeScript · Express · casper-x402 | Two-sided x402 commerce (distinct payee per route), both directions proven on-chain: `GET /alpha` (Amanah **pays a separate provider** — the custodian — proof `785ceb25`) and `GET /verified-reasoning` (the **earn** side — a buyer paid Amanah, proof `cf48c91d`). |
| [`mcp/`](mcp) | TypeScript · MCP SDK | Read-only MCP server so a judge or LLM can ask "why did it rebalance?". **All 4 tools live**: `get_vault_state` + `get_reputation` decode on-chain state, `get_attestation` verifies the published reasoning blob against its on-chain hash, `get_audit_trail` lists real deploys via CSPR.cloud. `npx tsx src/smoke.ts` checks all four. |
| [`bot/`](bot) | TypeScript · grammy | Optional Telegram notifier + `/audit`. |
| [`skill/`](skill) | `SKILL.md` + `references/llms.txt` | **AI Agent Skill** — drop into Claude Code / Cursor / etc. so any AI agent can inspect and *verify* the Amanah treasury (holdings, attestations, reputation, proofs) through our MCP + cspr.live. Completes the prized **AI Agent Skills + MCP + x402** trio. |
| [`web/`](web) | Next.js 15 · React 19 | Landing + dashboard + agent console + connect. **Live**: treasury/holdings + reputation decoded from chain, audit trail + **real-time contract-event feed** (CSPR.cloud Streaming API via an SSE relay at `/api/stream`), **CSPR.click** wallet on `/connect`, agent console from the latest published reasoning blob. Playwright manual-click E2E: `npm run test:e2e` (12/12). |

## Quickstart

```bash
# 1. contracts → wasm  (Linux/WSL: rustup nightly + wasm32 + `cargo install cargo-odra`)
cd contracts && cargo odra build && cargo odra test    # 12/12 tests green
#    cargo-odra's wasm-opt step needs binaryen >=121; if it errors, the per-contract
#    wasm is already written — lower bulk-memory ops yourself before deploy:
#    npx -p binaryen@130 wasm-opt --enable-bulk-memory --enable-sign-ext \
#      --llvm-memory-copy-fill-lowering --signext-lowering IN.wasm -o OUT.wasm

# 2. deploy all contracts to casper-test  (funded AGENT_KEY_PEM, writes .env.deployed)
cd agent && npm install && cp .env.example .env   # fill keys + hashes (see below)
npm run deploy

# 3. run the agent loop
npm run dev                  # or:  MAX_CYCLES=1 npm run dev   (one bounded cycle)

# 4. web dashboard
cd ../web && npm install && npm run build && npm run dev   # http://localhost:3000
```

## Demo (full live cycle, ~1 min)

```bash
# terminal A — the x402 premium-signal seller (needs signal-service/.env)
cd signal-service && npm install && npm run dev      # :8402, GET /alpha is x402-gated

# terminal B — one agent cycle that pays for the signal and attests on-chain
cd agent && MAX_CYCLES=1 npm run dev

# terminal C — watch the on-chain events stream in LIVE (CSPR.cloud Streaming API)
cd agent && npx tsx src/stream.ts     # prints "Attested" the instant terminal B lands it
```

Watch the agent log emit, in order: `ingest` (real prices) → `x402.settle` (a real
settlement tx hash) → `reason` (decision using the paid signal) → `attest` (a real
AttestationLog tx hash). Paste either hash into [testnet.cspr.live](https://testnet.cspr.live)
to confirm it executed. The dashboard's treasury figures read the same vault state
on-chain (`agent/src/read-vault.ts` is the standalone reader).

### Configuration

Per-module `.env.example` files list everything. To go live you need: an LLM key
(`VENICE_API_KEY`), RWA data keys (`EIA_API_KEY`, `METALS_API_KEY`), a funded
Casper testnet key (`AGENT_KEY_PEM`), a CSPR.cloud access token (x402 facilitator),
and the deployed hashes (written by `npm run deploy` to `.env.deployed`). Secrets,
`*.pem`, and `web/.env.local` are gitignored.

## Testing

**67 automated tests** across the pyramid (details + commands in [TESTING.md](TESTING.md)):

- **39 unit + regression** (`node:test`, offline): the on-chain codec (dict-address
  golden vectors, U256/U512 blob + **i64 little-endian-array** decode), the reasoning
  `normalize` (**riskScore 0..100→0..1 regression**) + tolerant JSON parser, the
  escalation safety gate, the auditor verdict parser, **the ZK-KYC Schnorr NIZK**
  (soundness + TS↔Rust golden vector), price cross-validation, the web formatters, MCP
  attestation round-trip. Every fixed bug has a regression test.
- **4 integration** (live casper-test): vault decodes to **$1M / $800K principal**,
  reputation ≥ 1, compliance Valid, and every published blob hashes to its filename.
- **12 E2E** (Playwright manual-click): live data, real deep links, no stale fakes.
- **11 smart-contract** (OdraVM `cargo odra test`): incl. the principal invariant.

`./scripts/test-all.ps1` runs the offline layers; `tsc --noEmit` is clean on all
four TS packages.

## No-mock contract

Banned in the core loop: hardcoded prices, fake tx, static reasoning templates,
simulated settlement. Every loop step (ingest → x402 → reason → attest →
guardrail → reallocate) touches testnet or a real public API a judge can check,
and the dashboard's treasury + audit trail read live chain state.

Guardrail limits (per-tx cap, daily limit, spent today) AND compliance state
(KYC status, allowlist) on the dashboard/console are read live from the SpendGate
and ComplianceRegistry contracts — no longer hardcoded.

When a chain read is unavailable (e.g. a clone without env vars), the UI shows `—`
or a **"representative"** label — never a fabricated number dressed as live. The
audit trail's "live · testnet" badge only appears when the trail is actually live.

Honest caveats (small, disclosed): the principal-lock invariant is enforced
in-contract, unit-tested, AND live — the deployed vault v2 locks $800K principal
(the agent can only touch the $200K yield); reasoning
blobs are published to `audit/<hash>.json` and integrity-checked by the MCP, and
pinned to **public IPFS** (Pinata) — the agent console links "verify blob on IPFS"
so anyone can fetch the exact reasoning and recompute the attested hash without the
repo; the `/connect` wallet uses a **production CSPR.click app-id** (`7535146b…`, domain
`amanah-casper-rwa.vercel.app`) — verified live on prod. All such seams are marked
`// ponytail:` in the source. Run the manual-click QA with `cd web && npm run test:e2e`.
