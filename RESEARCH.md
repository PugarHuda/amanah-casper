# Research → design decisions

Amanah's controls were not chosen because they demo well. This file records the primary
sources we checked, what they actually say, and which design decision each one drove —
including one finding that is a direct criticism of our own approach.

Every claim below was independently verified (2-of-3 or 3-of-3 adversarial verification
against the primary source). Where verification failed we say so rather than cite it.

---

## 1. What auditors actually accept as proof-of-reserves

**The settled standard is accounting criteria, not cryptography.** The AICPA published
*2025 Criteria for Stablecoin Reporting: Specific to Asset-Backed Fiat-Pegged Tokens*,
explicitly designed as **"suitable criteria" for a CPA examination engagement at a
reasonable assurance level**.
→ [AICPA criteria](https://www.aicpa-cima.com/resources/download/stablecoin-reporting-criteria) *(verified 3-0)*

**Consequence for us:** a zero-knowledge proof-of-reserves does **not substitute** for an
attestation engagement — it has to *map into* one. We therefore treat our ZK proof as
evidence supporting a control objective, not as a replacement for an auditor.

**Part II (published 12 January 2026) is about controls over a period of time** — token
issuance, redemption, **asset custody and vendor management** — not point-in-time
snapshots. Auditor acceptance now "hinges on control design/operating effectiveness, not
only a cryptographic reserve snapshot."
→ [AICPA Part II announcement](https://www.aicpa-cima.com/news/article/aicpa-updates-criteria-for-stablecoin-reporting-to-address-controls-over) *(verified 3-0)*

**Consequence for us:** this is the frame Amanah actually fits. See the control mapping in
[§1a](#1a-control-mapping-aicpa-part-ii) below.

### Why exchange-style proof-of-reserves is criticised

- The **Maxwell-Todd summation Merkle tree** — the construction behind most exchange "proof
  of reserves" pages — has a security flaw: a malicious prover can set each internal node
  to `max(left, right)` instead of the sum and **still produce inclusion proofs that
  verify**, under-reporting total liabilities. *(verified 3-0)*
- Naive Merkle PoR **leaks material private data**: total liabilities are public, a user can
  infer a neighbouring user's balance from their own inclusion proof, and the customer
  count is inferable from tree height and leaf position. *(verified 3-0)*
- **Proof-of-liabilities only binds the subset of users who actually verify.** A prover can
  omit balances of users who never check and remain undetected — a probabilistic
  distributed audit, not an absolute guarantee. *(verified 3-0 / 2-1)*
- **Third-party attestation alone is insufficient**: records can be manipulated, accounts
  omitted, and customers cannot detect auditor–company collusion. The paper argues for
  customer-verifiable distributed audit *as a complement to* attestation, and notes a
  **public bulletin board (a blockchain) is required** so the prover cannot show different
  totals to different verifiers. *(verified 3-0)*

→ [Ji et al., *Generalized Proof of Liabilities*](https://www.yji.me/publication/gpol/gpol.pdf)

### The criticism aimed squarely at us

> "zk-PoR's cryptographic strength does not translate into practical auditability: its
> proof infrastructure is substantially more complex and non-technical users cannot
> inspect or verify it directly, creating **asymmetric verifiability** where only auditors
> can assess proofs."
> → [arXiv 2606.08211](https://arxiv.org/pdf/2606.08211) *(verified 3-0)*

This is the strongest argument against building a ZK proof-of-reserves at all, and we take
it seriously rather than ignoring it.

**Our answer is [`/verify`](https://amanah-casper-rwa.vercel.app/verify).** The proof is
re-verified **in the visitor's own browser**, against the exact bytes the contract
accepted, with a one-click tamper button that makes the proof visibly fail. No
cryptographic literacy is required to observe that claiming $1,000 more than we hold
breaks the proof. That is the concrete mitigation for asymmetric verifiability: *anyone*
can falsify our claim, not only an auditor.

Two independent implementations of the same maths are published so the check is not
self-referential — [`web/lib/zk-verify.ts`](web/lib/zk-verify.ts) (browser, noble) and
[`contracts/src/zk_reserves.rs`](contracts/src/zk_reserves.rs) (on-chain, curve25519-dalek).

### Solvency has two halves

Solvency requires **proof of liabilities *and* proof of reserves**; the liabilities side can
be proven in zero knowledge (total liabilities ≤ total assets) without revealing either
figure. *(verified 2-1)*

**Consequence for us:** we now describe `ZkReserves` as a **proof of solvency**, because it
proves both halves: the hidden per-asset allocations sum to a total (assets) **and** that
total covers the locked principal (our liability). The `/verify` page enforces both
conditions before it shows a green verdict — a valid sum-proof for a total *below* the
principal is reported as **"proof valid, but reserves < principal"**, not as success.

### 1a. Control mapping: AICPA Part II

Part II asks whether controls over token operations are **designed and operating
effectively over a period**. Amanah's controls map as follows — each is enforced by a
contract, and each has a public transaction demonstrating it.

| AICPA Part II control area | Amanah control (contract-enforced) | Live evidence |
|---|---|---|
| Authorisation of operations | K-of-N independent **auditor quorum**; `reallocate` reverts `NotApproved` | [`ba368de3`](https://testnet.cspr.live/deploy/ba368de335840645486c7692cf1fdee8b0ca3f7f61514091515a32052ac2d7b7) refused · [`e68d4218`](https://testnet.cspr.live/deploy/e68d42184b6f7fac2e226bea10c6a3e0942a276da6d6065618ac0f2d6c533c8e) executed |
| Segregation of duties | **Custodian key** owns SpendGate + ComplianceRegistry; the agent cannot raise its own limits or clear its own KYC | custodian `0109cd12…` |
| Asset custody / integrity | Vault **principal invariant**; `SameAsset` guard prevents value creation | [`34ccd244`](https://testnet.cspr.live/deploy/34ccd2449d391db96279487294b5036da1c09faade0b151938a6636ef23e96b5) refused |
| Limits & exception handling | **SpendGate** per-tx cap + rolling daily limit; `check` callable only by the vault | on-chain limits read live on the dashboard |
| Monitoring & incident response | **Dead-man's switch** (anyone may freeze a silent agent; custodian-only unfreeze) | [`13729bde`](https://testnet.cspr.live/deploy/13729bdebafd2d3d6e928df56febfa0043d447470a8747ddc723c933a1d5897d) froze · [`1a4897f2`](https://testnet.cspr.live/deploy/1a4897f2576bf2ad246548ccc8503ba6fab709031072cf86b2d13b1f58c22773) denied · [`302530d2`](https://testnet.cspr.live/deploy/302530d2d9b2db38aec1a502caafd0450487b828f48ae75d67e3469acec1fb9a) lifted |
| Conduct / accountability | **Reputation floor** benches a misbehaving agent; `adjust` and `record_payment` are authority-only so it cannot inflate its own score | [`82dc878b`](https://testnet.cspr.live/deploy/82dc878b617a352f999d15577ce58660a8e107496d19ce7870dba0cde85e2350) blocked |
| Audit trail / record retention | Every decision blake2b-hashed, Ed25519-signed and **verified inside the contract** before recording; blob pinned to IPFS | any attestation on the dashboard |

**Honest gap:** this is a *self-assessed* mapping. Part II acceptance requires an
independent CPA examination, which is a Phase-1 roadmap item, not a claim we make today.

---

## 2. Regulation for autonomous agents managing assets

### EU AI Act — Article 14 (human oversight)

- **Art. 14(1)**: high-risk AI systems must be *designed and developed* so natural persons
  can effectively oversee them during use, **including via appropriate human-machine
  interface tools**. Oversight tooling is a **design-time obligation on the provider**, not
  an operational afterthought. *(verified 3-0, twice)*
  → **Amanah:** the dashboard and `/verify` are therefore compliance surface, not
  decoration.
- **Art. 14(4)(a)–(c)**: the system must let overseers understand its capacities and
  limitations, stay aware of **automation bias**, and correctly interpret its output — an
  explainability obligation that on-chain proof-of-reasoning satisfies **only if the
  reasoning is human-interpretable, not merely signed**. *(verified 3-0)*
  → **Amanah:** this is why each attested blob stores `reasoningSteps` in plain language
  and the agent console renders them, rather than storing only a hash and a signature.
  A signature proves *authenticity*; it does not discharge *explainability*.

→ [EU AI Act Article 14](https://artificialintelligenceact.eu/article/14/)

### MiCA

- MiCA regulates **"providing advice on crypto-assets and providing portfolio management of
  crypto-assets"** as crypto-asset services — an autonomous agent managing client
  crypto-asset portfolios in the EU falls **inside the CASP authorisation perimeter**, not
  in an unregulated gap. *(verified 3-0)*
- For asset-referenced tokens, MiCA mandates a **reserve at least equal in value to tokens
  in circulation**, plus **public website disclosure** of the amount in circulation and the
  value and composition of the reserve. *(verified 3-0)*

→ [Regulation (EU) 2023/1114](https://eur-lex.europa.eu/eli/reg/2023/1114/oj/eng)

→ **Amanah:** we position the roadmap around **obtaining or operating under CASP
authorisation**, not around being outside regulation. MiCA's public-reserve-disclosure
regime is a natural target for our proof-of-solvency output.

### Explicitly NOT claimed

Verification of **SEC / FINRA robo-adviser guidance, Advisers Act Rule 206(4)-7, and DORA
Article 5(2)** did not complete, so this document makes **no claims** about them. They are
open research items, not asserted facts.

---

## 3–5. Open research areas

The following angles did not produce independently verified claims in this pass and are
therefore recorded as **open questions**, not findings:

- **Tokenized-treasury go-to-market** — what actually drove institutional allocation into
  BUIDL / BENJI / OUSG (custody partners, transfer agents, redemption guarantees,
  qualified-custodian rules), and who the realistic buyer of a controls layer is.
- **Agent identity & payment standards** — ERC-8004, DIDs/verifiable credentials, EIP-7702
  and how a Casper-native agent should align rather than stay bespoke.
- **Verifiable AI / attested inference** — TEE-attested inference, zkML, optimistic ML.
  This is our clearest honest limitation: we prove that a decision was *signed by the
  agent's key* and is *human-interpretable*; we do **not** prove that a specific model
  produced it. Attested inference in a TEE is the most likely practical upgrade path.

---

## Method

Sources were gathered by parallel search across five angles, deduplicated, fetched, and
reduced to falsifiable claims. Each claim was then checked by three independent verifiers
against the primary source, and kept only with a 2-of-3 or 3-of-3 majority. Vote counts are
noted inline. Claims whose verification did not complete are excluded and listed as open
questions above — we would rather ship a shorter document than an unverified one.
