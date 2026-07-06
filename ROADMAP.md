# Amanah — Roadmap & Launch Plan

**Amanah is a real project, not a hackathon throwaway.** The testnet build proves the
hard part — a complete, on-chain fiduciary-controls stack for autonomous RWA treasuries.
The plan below takes it to mainnet and to paying users.

**Live now:** https://amanah-casper-rwa.vercel.app · Repo: https://github.com/PugarHuda/amanah-casper

---

## The wedge (why this becomes a business)

Tokenized RWA is projected into the trillions on-chain, but institutions can't hand an
AI agent real money without controls a compliance officer can defend. Amanah is that
control layer: proof-of-reasoning, a two-agent auditor quorum, custody separation,
zero-knowledge KYC + proof-of-reserves, reputation-slashing, and on-chain circuit
breakers — **all already built and proven on Casper testnet (10 contracts).** We don't
need to invent the controls; we need to point them at real assets.

---

## Milestones

### ✅ Phase 0 — Testnet proof (done, Jul 2026)
10 Odra contracts live on casper-test; the full fiduciary stack proven with public tx
hashes; live dashboard + agent loop; 79 automated tests. See README proof table.

### Phase 1 — Harden & mainnet core (Q3 2026)
- **Third-party security audit** of the 10 contracts (the ZK verifiers + the vault
  invariant + the custody gates are the priority).
- **Mainnet deploy** of the core: RwaVault, AttestationLog, AuditorLog/Quorum,
  SpendGate, ComplianceRegistry, ReputationRegistry, ZkKycVerifier, ZkReserves.
- Replace the demo LLM with a hardened reasoning pipeline (guardrail prompts + the
  auditor quorum already gate every move).

### Phase 2 — First real assets & KYC (Q4 2026)
- Integrate a **real tokenized-RWA issuer on Casper** (T-bills / money-market first —
  the most demanded, simplest to model) behind the same vault + gates.
- Wire a **real KYC provider** as the issuer behind ZkKycVerifier (Sumsub/Persona-style),
  so the zero-knowledge KYC proves a real credential.
- Onboard **1–3 pilot treasuries** (DAOs / on-chain funds) under a design-partner
  agreement. Success metric: first $ of real AUM under Amanah's gates.

### Phase 3 — Open the auditor & reputation network (Q1 2027)
- Open the **auditor quorum to third parties** who stake to join; honest audits earn,
  bad ones get slashed (the reputation-slash primitive already exists).
- Publish an **Amanah SDK + MCP** so any Casper agent can plug into the controls
  (attestation, auditor quorum, ZK KYC/reserves) — turning our stack into a shared
  Casper primitive.

### Phase 4 — Scale & governance (Q2 2027)
- Multi-treasury, multi-strategy; per-treasury policy contracts.
- Progressive decentralization of the custodian role → a governance quorum.

---

## Business model (how it pays for itself)

Three revenue lines, all on rails that **already work today**:
1. **Management fee** — a few bps on assets under Amanah's gates (standard fiduciary fee).
2. **Pay-per-proof** — the two-sided x402 earn side is live: parties pay Amanah for its
   verified proof-of-reasoning / proof-of-reserves (proven on-chain: `cf48c91d`).
3. **Controls-as-a-service** — license the fiduciary stack (auditor quorum, ZK KYC/
   reserves, circuit breakers) to other Casper RWA protocols.

---

## Contribution to the Casper ecosystem

Amanah ships **reusable Casper primitives** the ecosystem lacks today: on-chain
proof-of-reasoning, an EC-Schnorr NIZK KYC verifier, a Pedersen+Schnorr proof-of-reserves
verifier, a K-of-N signature-quorum contract, and reputation-gated circuit breakers —
all in Odra, all open source. Any RWA or agent project on Casper can build on them.

---

## Team & links

- **Builder:** Pugar Huda Mantoro
- **Repo:** https://github.com/PugarHuda/amanah-casper
- **Live:** https://amanah-casper-rwa.vercel.app
- **Socials:** see [`LAUNCH.md`](LAUNCH.md) for the launch kit (X / Discord going live at submission).
