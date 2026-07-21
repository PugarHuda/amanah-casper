# Research → design decisions

Amanah's controls were not chosen because they demo well. This file records the primary
sources we checked, what they actually say, which design decision each one drove — and,
just as importantly, **where our own claims do not reach**.

Method: five research angles searched in parallel, sources deduplicated and fetched, then
reduced to falsifiable claims. Each claim was checked by three independent verifiers
against the primary source and kept only on a 2-of-3 or 3-of-3 majority. Vote counts are
noted. **Three of the five angles produced nothing that survived verification, and we
draw no conclusions from them** ([§4](#4-not-answered--open-research)).

---

## 1. What auditors actually accept as proof-of-reserves

**The de facto professional standard is accounting criteria, not cryptography.** The AICPA
*2025 Criteria for Stablecoin Reporting* is **voluntary "suitable criteria" for a CPA
attestation engagement** at reasonable assurance — Part I (Mar 2025) covers point-in-time
presentation of tokens outstanding vs backing assets; **Part II, "2025 Criteria for
Controls Supporting Token Operations" (12 Jan 2026)**, adds design and operating
effectiveness of controls **over a period**: issuance, redemptions, asset custody, vendor
management, private key management, token recordkeeping. *(3-0)*

Under the **GENIUS Act** (enacted July 2025) the monthly reserve report must be examined by
a **registered public accounting firm** — so a ZK proof **cannot discharge the obligation**;
at most it is evidence a CPA evaluates. *(3-0)*

> ⚠️ **Scope caveat we must not paper over.** These criteria are explicitly scoped to
> **asset-backed fiat-pegged stablecoins — not tokenized RWA or treasuries**. Applying them
> to Amanah is a **defensible analogy, not a citation**. They are also voluntary: as of May
> 2026 the AICPA was still urging the OCC/FDIC to reference them in GENIUS Act rulemaking.

→ [AICPA criteria](https://www.aicpa-cima.com/resources/download/stablecoin-reporting-criteria) ·
[Part II announcement](https://www.aicpa-cima.com/news/article/aicpa-updates-criteria-for-stablecoin-reporting-to-address-controls-over)

**Design consequence:** we treat our ZK proof as an **evidence artifact feeding an
attestation engagement**, never as a substitute for one. The control mapping in
[§1a](#1a-control-mapping-by-analogy-to-aicpa-part-ii) is written as a self-assessment by
analogy, and says so.

### Why exchange-style proof-of-reserves is criticised

- The **Maxwell-Todd summation Merkle tree** — behind most exchange "proof of reserves"
  pages — is **unsound**: a malicious prover can set an internal node to `max(left,right)`
  instead of the sum and still produce inclusion proofs that verify. The fix (Maxwell+)
  binds child values into the parent hash and adds verifier-side path-sum and
  non-negativity checks. Camacho's scheme inherits the flaw. *(3-0)*
- Naive Merkle PoR **leaks**: a user learns a neighbour's balance from their own inclusion
  proof, and population is inferable from leaf position and tree height. Provisions and
  DAPOL only partially fix this; DAPOL's padding nodes are distinguishable and bound the
  user count within a range (DAPOL+ closes it). *(3-0)*
- **Proof-of-liabilities is a probabilistic distributed audit**, not an absolute guarantee:
  it only bounds liabilities to users who actually verify. This "failure probability" is
  formally *separate from cryptographic soundness* — prior work (DAPOL) conflated the two.
  A **public bulletin board is required** so a prover cannot show different totals to
  different verifiers. *(3-0 / 2-1)*

→ [Ji et al., *Generalized Proof of Liabilities*](https://www.yji.me/publication/gpol/gpol.pdf) ·
[DAPOL (eprint 2018/1139)](https://eprint.iacr.org/2018/1139) ·
[PoL attacks](https://yji.me/publication/pol-attacks/pol-attacks.pdf)

**Design consequence:** Amanah uses **Pedersen commitments + a Schnorr sum-proof**, not a
summation Merkle tree — so the Maxwell-Todd unsoundness does not apply to us. We use the
**Casper chain as the public bulletin board** so the same commitment is shown to everyone.

### The criticism aimed squarely at us

> "zk-PoR's cryptographic strength does not translate into practical auditability… only
> specialists can assess proofs" — **asymmetric verifiability**. Trust is not removed, it is
> **relocated onto circuit and proof-system correctness**. *(3-0)*
> → [arXiv 2606.08211](https://arxiv.org/pdf/2606.08211)

Our answer is a **layered verification story**:

1. **Anyone**: [`/verify`](https://amanah-casper-rwa.vercel.app/verify) re-runs the proof in
   your own browser against the exact bytes the contract accepted, with a tamper button
   that makes it visibly fail. No cryptographic literacy required to falsify our claim.
2. **Specialists**: two independent implementations of the same maths —
   [`web/lib/zk-verify.ts`](web/lib/zk-verify.ts) (noble) and
   [`contracts/src/zk_reserves.rs`](contracts/src/zk_reserves.rs) (curve25519-dalek).

> ⚠️ **Honest limitation.** The research is explicit that **without an independent audit of
> the ZK circuit itself, "we have a ZK proof" is not evidence to an auditor** — a
> green-verifying-but-unsound proof is a live risk. A circuit audit is a Phase-1 roadmap
> item; we do not claim auditor-grade assurance today.

### Solvency has two halves

Solvency requires **liabilities and reserves**; the inequality (liabilities ≤ assets) can in
principle be proven in zero knowledge without revealing either figure. *(2-1)*

**Design consequence:** `ZkReserves` is presented as a **proof of solvency** — the hidden
per-asset allocations must sum to the claimed total (assets) **and** that total must cover
the locked principal (our liability). `/verify` requires **both** before showing a green
verdict; a valid sum-proof for a total *below* principal reports
**"proof valid, but reserves < principal"**. We state the **verification-participation
assumption** openly: a distributed audit only binds what verifiers actually check.

### 1a-i. Reserve presentation (by analogy to AICPA Part I)

Part I is about presenting, at a point in time, **what is outstanding** and **what backs
it**. Same caveat as below: scoped to fiat-pegged stablecoins, so this is an analogy.
Amanah's difference is that each line is *provable* rather than asserted.

| Part I presentation element | Amanah equivalent | How it is evidenced |
|---|---|---|
| Tokens outstanding at a point in time | locked principal (our liability) — `principal_locked` | read live from the vault; shown on the dashboard |
| Value of backing assets | sum of per-asset allocations | read live; re-derived independently by `/verify` |
| Composition of the reserve | four asset legs (gold, US T-bond, WTI, CSPR) | per-asset commitments published; amounts hidden |
| Assets ≥ outstanding | `total ≥ principal` | **proven in zero knowledge and verified on-chain each cycle**, and re-checkable in your browser |
| Point-in-time basis | timestamped proof per cycle | `provenAt` + the deploy hash in `/proofs/reserves.json` |
| Independent examination | ✗ **not done** | requires a CPA engagement — Phase 1 |

The one place we go beyond Part I: it is a **point-in-time** framework, and that is the
structural criticism of snapshot attestations. We therefore re-prove **every cycle**
(`agent/src/solvency.ts`), which is closer to Part II's "over a period" posture.

### 1a. Control mapping (by analogy to AICPA Part II)

**This is a self-assessment by analogy** — Part II is scoped to fiat-pegged stablecoins, and
acceptance requires an independent CPA examination, which we have not had.

| Part II control area | Amanah control (contract-enforced) | Live evidence |
|---|---|---|
| Authorisation of operations | K-of-N **auditor quorum**; `reallocate` reverts `NotApproved` | [`ba368de3`](https://testnet.cspr.live/deploy/ba368de335840645486c7692cf1fdee8b0ca3f7f61514091515a32052ac2d7b7) refused · [`e68d4218`](https://testnet.cspr.live/deploy/e68d42184b6f7fac2e226bea10c6a3e0942a276da6d6065618ac0f2d6c533c8e) executed |
| Segregation of duties | **Custodian key** owns SpendGate + ComplianceRegistry | custodian `0109cd12…` |
| Asset custody / integrity | principal invariant; `SameAsset` guard prevents value creation | [`34ccd244`](https://testnet.cspr.live/deploy/34ccd2449d391db96279487294b5036da1c09faade0b151938a6636ef23e96b5) refused |
| Limits & exceptions | **SpendGate** per-tx cap + daily limit; `check` callable only by the vault | live on the dashboard |
| Monitoring & incident response | **dead-man's switch** (anyone freezes a silent agent; custodian-only unfreeze) | [`13729bde`](https://testnet.cspr.live/deploy/13729bdebafd2d3d6e928df56febfa0043d447470a8747ddc723c933a1d5897d) · [`1a4897f2`](https://testnet.cspr.live/deploy/1a4897f2576bf2ad246548ccc8503ba6fab709031072cf86b2d13b1f58c22773) denied · [`302530d2`](https://testnet.cspr.live/deploy/302530d2d9b2db38aec1a502caafd0450487b828f48ae75d67e3469acec1fb9a) lifted |
| Conduct / accountability | reputation floor; `adjust` + `record_payment` authority-only | [`82dc878b`](https://testnet.cspr.live/deploy/82dc878b617a352f999d15577ce58660a8e107496d19ce7870dba0cde85e2350) blocked |
| Recordkeeping | every decision hashed, signed, **verified inside the contract**, pinned to IPFS | any attestation |

---

## 2. Regulation for autonomous agents managing assets

### EU AI Act — Article 14

> ⚠️ **Conditional.** These duties bite **only if the system is classified high-risk**, which
> is **NOT established** for tokenized treasury management. We present this as a
> preparedness posture, not as a compliance claim.

- **Art. 14(1)**: high-risk systems "shall be designed and developed in such a way,
  **including with appropriate human-machine interface tools**, that they can be effectively
  overseen by natural persons" — an **ex-ante provider obligation** (Art. 16(a)), with a
  parallel deployer duty to assign competent, trained, authorised overseers (Art. 26(2)). *(3-0)*
- **Art. 14(4)(e)**: the overseer must be able to "intervene… or interrupt the system through
  a **stop button** or a similar procedure that allows the system to come to a **halt in a
  safe state**." *(3-0)*
- **Art. 14(4)(a)–(c)**: understand capacities and limitations, stay aware of **automation
  bias**, and correctly interpret output — satisfied only if reasoning is
  **human-interpretable, not merely signed**. *(3-0)*

→ [Article 14](https://artificialintelligenceact.eu/article/14/) · Regulation (EU) 2024/1689

**Design consequence:** the dashboard and `/verify` are oversight tooling; `reasoningSteps`
are stored in plain language because a signature proves *authenticity*, not *explainability*;
the **dead-man's switch is our stop-button-to-safe-halt**.

### MiCA / MiFID II — and what a quorum CANNOT do

- Conduct duty — "act honestly, fairly and professionally in the best interests of clients" —
  applies via **MiCA Art. 66**, or via **MiFID II Art. 24(1)** if the token is a financial
  instrument. **MiCA Art. 2(4) excludes MiFID financial instruments**, so **tokenized T-bills
  and money-market fund shares likely fall under MiFID II, not MiCA.** *(2-1)*
- Custody duties: client agreement with mandatory content (**Art. 75(1)**), a custody policy
  made available to clients (**Art. 75(2)**), segregation on separate DLT addresses not used
  for the provider's own account (**Arts. 70(1), 75(7)**), and **liability for losses from
  incidents attributable to the provider, including ICT (Art. 73)**. *(2-1)*

> ⚠️ **Limitation on our own "separation of duties" story.** These duties **attach to the
> authorised provider and cannot be shifted onto the protocol or its auditor quorum**. Our
> K-of-N quorum improves *control*; it does **not** transfer *legal liability*.

→ [Regulation (EU) 2023/1114](https://eur-lex.europa.eu/eli/reg/2023/1114/oj/eng) · MiFID II 2014/65/EU Art. 24(1)

### US — the most directly actionable hook

SEC examination staff, applying **Advisers Act Rule 206(4)-7**, expect an adviser using an
automated platform to have **written policies and procedures assessing whether "algorithms
were performing as intended"** and whether "asset allocation and/or rebalancing services were
occurring as disclosed." The same alert flags advisers using **white-label/B2B platforms**
that "lacked policies and procedures that addressed the platform providers' attention to
these matters." Endorsed practice: periodic algorithm testing, **exception reports**,
restricted code access, advance notice of substantive algorithm changes or overrides. *(3-0)*

→ [SEC EIA risk alert](https://www.sec.gov/files/exams-eia-risk-alert.pdf) · 17 CFR 275.206(4)-7 ·
SEC IM Guidance Update: Robo-Advisers (2017)

**This is the highest-impact / lowest-effort finding in the whole report**, and it points
straight at a controls layer sold to advisers: Amanah's **proof-of-reasoning log is exactly
the artifact that evidences "the algorithm performed as intended"**, and its refused
transactions are ready-made **exception reports**.

### DORA

**Art. 5(2)(a)**: the management body "shall bear the **final responsibility** for managing the
financial entity's ICT risk", approving the risk-tolerance level and the ICT third-party
policy; **Art. 28(1)(a)**: the entity must "**remain fully responsible at all times**" when
using ICT third-party providers. *(3-0)*

→ Regulation (EU) 2022/2554

**Design consequence (roadmap):** expose explicit **governance hooks** — policy sign-off,
risk-tolerance parameter setting, named-owner attribution on every autonomous action — so a
DORA-scoped client's management body can *evidence* approval and oversight. Responsibility
is theirs by law; our job is to make it provable.

---

## 3. Ranked recommendations

| # | Recommendation | Impact | Effort | Status |
|---|---|---|---|---|
| 1 | Package the proof-of-reasoning log + refused-transaction feed as the **Rule 206(4)-7 evidence pack** (algorithm-performed-as-intended + exception reports) | Highest | Lowest | roadmap |
| 2 | Document which PoR construction we use and why Maxwell-Todd unsoundness doesn't apply; cite Maxwell+/DAPOL+ | High | Low | ✅ done (§1) |
| 3 | Layered verification: one-click check for anyone + auditor-grade path | High | Medium | ✅ done (`/verify`) |
| 4 | **Independent audit of the ZK circuit** — without it the proof is not auditor evidence | High | High | roadmap Phase 1 |
| 5 | Map zk output line-by-line to Part I criteria; expose mint/redeem, custodian and vendor controls as period evidence for Part II | High | Medium | partial (§1a) |
| 6 | Governance hooks for DORA-scoped clients (sign-off, risk tolerance, named owner) | Medium | Low | roadmap |
| 7 | Use the chain as an append-only commitment bulletin board; state the verification-participation assumption in the threat model | Medium | Low-Med | ✅ done ([`THREAT_MODEL.md`](THREAT_MODEL.md)) |
| 8 | **Prove solvency every cycle**, not once — answers the point-in-time critique and matches Part II's "controls over a period" | High | Medium | ✅ done (`agent/src/solvency.ts`) |
| 9 | **Rule 206(4)-7 evidence pack** with exception reports | Highest | Low | ✅ done (`/compliance`) |

---

## 4. NOT answered — open research

Questions **3 (tokenized-treasury adoption drivers and GTM)**, **4 (x402 / ERC-8004 / DIDs /
EIP-7702 agent identity)** and **5 (TEE attested inference, zkML, optimistic ML)** produced
**zero claims that survived adversarial verification**. Per the report: *no finding, and
specifically no recommendation, should be drawn on these three areas from this pass.*

We therefore make **no claims** about institutional allocation drivers, about which agent
identity standard to align with, or about attested inference. Area 5 remains our clearest
honest limitation: **we prove a decision was signed by the agent's key and is
human-interpretable — not that a specific model produced it.**
