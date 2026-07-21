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

## Regulatory posture (research-led — see [`RESEARCH.md`](RESEARCH.md))

We do not position Amanah as living outside regulation. Two primary sources set the target:

- **MiCA** regulates *"providing advice on crypto-assets and providing portfolio management
  of crypto-assets"* as crypto-asset services — an autonomous agent managing client
  portfolios in the EU is **inside the CASP authorisation perimeter**. Phase 2 therefore
  assumes operating under (or in partnership with) an authorised CASP, not around it.
- **EU AI Act Article 14** makes human oversight a **design-time obligation** — but *only if*
  the system is classified high-risk, which is **not established** for tokenized treasury
  management. We treat the mapping below as a **preparedness posture, not a compliance
  claim**:

| AI Act obligation | Amanah feature |
|---|---|
| Art. 14(1) — effective oversight *via human-machine interface tools* | the live dashboard + [`/verify`](https://amanah-casper-rwa.vercel.app/verify) proof lab (oversight surface, not decoration) |
| Art. 14(4)(a)–(c) — understand capacities/limits, resist automation bias, interpret output | plain-language `reasoningSteps` in every attested blob, rendered in the agent console — a signature proves authenticity, it does not discharge explainability |
| Human-in-the-loop / stop authority | independent auditor + K-of-N quorum enforced by the vault; low-confidence decisions escalate to a human instead of executing |
| Ability to halt the system | **dead-man's switch** (anyone may freeze a silent agent; custodian-only unfreeze) — [proven live](https://testnet.cspr.live/deploy/13729bdebafd2d3d6e928df56febfa0043d447470a8747ddc723c933a1d5897d) |
| Record retention / audit trail | every decision hashed, signed, verified **inside** the contract, and pinned to IPFS |

**Implemented:** every attested decision blob now carries governance attribution — the
approved policy version, who approved it, the machine-readable risk tolerance (the
confidence threshold below which the agent escalates instead of acting), and the named
accountable owner — so a DORA-scoped client's management body can *evidence* oversight.
Attribution only: it does not transfer the duty.

Two limits we state plainly rather than gloss:

- **A quorum improves control, not liability.** MiCA/MiFID conduct and custody duties
  (MiCA Arts. 66, 70(1), 73, 75; MiFID II Art. 24(1)) **attach to the authorised provider and
  cannot be shifted onto the protocol or its auditor quorum** — and tokenized T-bills likely
  sit under **MiFID II**, since MiCA Art. 2(4) excludes financial instruments. Under **DORA
  Art. 5(2)(a)** the client's management body bears **final, non-delegable** ICT
  responsibility. Our job is to make their oversight *provable*, not to absorb it.
- **Reserve reporting.** The auditor-accepted frame is the **AICPA 2025 Criteria** (Part II,
  Jan 2026 — controls *over a period*). Those criteria are scoped to fiat-pegged
  stablecoins, so applying them to us is an **analogy, not a citation**, and under the
  **GENIUS Act** a reserve report must be examined by a **registered public accounting
  firm** — a ZK proof is evidence for that engagement, never a substitute. An independent
  **CPA examination and a ZK-circuit audit** are Phase-1 items; without the circuit audit,
  "we have a ZK proof" is not auditor evidence.

**Nearest-term commercial hook (research-ranked highest impact / lowest effort):** SEC staff
applying **Advisers Act Rule 206(4)-7** expect advisers on automated platforms to hold
written policies testing that *"algorithms were performing as intended"* — and explicitly
flag **white-label/B2B platform** gaps. Amanah's proof-of-reasoning log is that evidence, and
its refused transactions are ready-made **exception reports**. See [`RESEARCH.md`](RESEARCH.md).

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
- **X / Twitter:** [@BangDropID](https://x.com/BangDropID) · **Discord:** hajilamet · **Telegram:** [@lynx129](https://t.me/lynx129) · launch kit in [`LAUNCH.md`](LAUNCH.md).
