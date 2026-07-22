# Competitive landscape — Casper Agentic Buildathon 2026 Final Round

Analysis of **all 148 other finalist BUIDLs** (149 total, minus Amanah #46767), fetched
from DoraHacks and, where available, their GitHub. Purpose: know exactly where Amanah is
differentiated and where it is contested, so the submission leans on its defensible edges.

> Method note: DoraHacks sits behind an AWS WAF; pages were read via the server-rendered
> `__NUXT_DATA__` blob and linked GitHub READMEs. "Verified on-chain" = a real
> `testnet.cspr.live` deploy/tx/contract-package link was present; "claimed" = testnet
> prose only.

## The one-sentence finding

The **autonomous RWA-treasury / vault-guard agent** is the single most crowded category in
the field (~30+ entries). Amanah is **not** differentiated by being one — it is
differentiated by being the **only** one that combines the whole fiduciary stack in a
single vault **and** is the only one doing **ZK proof-of-reserves**. Lead with that, not
with "RWA treasury agent".

## Amanah's pillars vs the field

| Pillar | Who else has it (strongest) | Is Amanah unique? |
|---|---|---|
| Autonomous RWA treasury agent | Caliber, Helios, Agent Casper, CasperSolvent, Custodian, Steward, AutonomyHQ, Cedar, CasperMind, Faktura… (~30) | **No — red ocean** |
| On-chain proof-of-reasoning | Steward, CasperGuard (46187), OmniAgent, AgentLedger, Bondsman, sasha-x402-kit | No — fairly common |
| Vault-enforced K-of-N auditor quorum | Concordia, AutonomyHQ, Casproof, Casper3643, Conclave, Vouch, Tribunal, ARIA | No — but rarer |
| Reputation slashing | Bondsman, AVAL, Vouch, Tribunal, Verity, verity, KARMA, Casper Trust Layer | No |
| Circuit breakers / vault-can't-override | Cinder, Caspilot, Chainleash, Leash, ProxyKey, AgentOps, Magen3, Aegis | No |
| **ZK KYC** | Writ, Casper3643, Bastion, AgentPass (ZK passport), Atmos, Claros | Rare (~6) |
| **ZK proof-of-reserves** | **nobody** | **YES — unique** |
| Prompt-injection red team / defense | eraya (KAVACHA), Casper AgentShield | Rare (~3) |
| **Interactive verification** (judge re-runs the ZK proof, casts a real on-chain vote, attacks the agent, all in-browser) | **nobody** | **YES — unique** |
| The full stack in one vault | **nobody** | **YES — unique** |

## The competitors that actually matter (ranked)

### Tier 1 — sharpest, near-identical thesis
- **Caliber (46574)** — "policy-driven AI treasury control plane for tokenized RWA." Almost a
  verbatim restatement of Amanah. Verified on-chain. *Our edge:* quorum + ZK + proof-of-reasoning.
- **AutonomyHQ (46737)** — multi-agent compliant treasury, on-chain quorum enforcement,
  ed25519-signed votes. *Our edge:* ZK, slashing, interactive voting.
- **Concordia DAO Council (46732)** — chain-enforced K-of-N quorum + treasury % caps +
  proof-of-reasoning, cleanest verifiable-revert proof (QuorumNotMet → passes at 2-of-3).
  *Our edge:* it's DAO-governance, not RWA prices; no ZK.
- **Casper3643 (46182)** — ERC-3643 permissioned token + 3-agent audit→vote→attest quorum +
  some ZK. The only rival pairing a compliance-token standard with a multi-agent quorum.
  *Our edge:* ZK proof-of-reserves, treasury custody, interactive voting.
- **Steward (46122)** / **Cinder (46145)** / **Helios (46055)** — each nails one pillar
  (proof-of-reasoning / vault+auditor / RWA-risk-policy) with verified deploys.

### Tier 2 — strong on a specific pillar
- **Writ (46775)** — **ZK KYC + on-chain verifier quorum** for RWA (T-REX/ERC-3643, CEP-78
  transfer filter). The closest anyone gets to Amanah's ZK+quorum combo. *Our edge:* Writ is a
  transfer-compliance layer — no proof-of-reserves, no autonomous treasury, no proof-of-reasoning.
- **Bondsman (46779)** — commit-reasoning-hash + slashable bond + watchdog auditor + auto-slash,
  4 deployed contracts, RWA payout pools. Hits proof-of-reasoning + slashing + auditor hard.
- **AVAL (46724)** — RWA underwriting + stake-slashing + "constitution" guardrails + attestation.
- **eraya (46749)** — agentic treasury + adversarial critic + self-healing + **its own
  prompt-injection guard (KAVACHA)** — the one rival that also defends injection.
- **CasperGuard (46187)** — writes the LLM's full reasoning verbatim on-chain.
- **Vouch (45565)** / **Tribunal (46050)** — multi-agent adversarial quorum + reputation slashing.

### Tier 3 — a real edge Amanah lacks
- **Agent Casper (44340)** and **AiFinPay (44178)** are **live on Casper MAINNET**. Almost
  everyone else (Amanah included) is testnet-only. This is their single clearest advantage.

## Honest read on where Amanah is behind

1. **Testnet-only** while ≥2 rivals touched mainnet. Admin explicitly said *"more (and recent)
   txes on Testnet help"* — Amanah's per-cycle proofs, browser votes, and red-team runs should
   keep generating them right up to the deadline.
2. **Not the flashiest single feature** — Concordia's verifiable-revert demo and Bondsman's
   auto-slash are individually crisp. Amanah wins on **breadth + ZK + let-the-judge-do-it**,
   which only lands if the description/video makes that legible fast.

## What this means for the submission

1. **Reposition the one-liner** away from the crowded "RWA treasury agent" toward the unique
   claims: *proven-in-zero-knowledge solvency + an auditor quorum you can join from your wallet
   + attack-it-yourself* — verifiable in minutes, in the browser. (The new landing "check us"
   strip does exactly this.)
2. **Keep the tx count climbing** on testnet before the deadline.
3. **Simplify** the written description (admin guidance) without dropping the ZK/quorum essence.
4. Optional/risky: a single mainnet touch would neutralize the only edge Tier-3 rivals hold.
