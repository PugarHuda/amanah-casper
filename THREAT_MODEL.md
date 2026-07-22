# Threat model

What Amanah's controls do and — more importantly — **what they do not do**. Written because
the research behind [`RESEARCH.md`](RESEARCH.md) is explicit that proof systems relocate
trust rather than remove it, and that a distributed audit only binds what verifiers
actually check. Stating those assumptions is part of the design, not a disclaimer bolted on.

## Assets being protected

| Asset | Protected against |
|---|---|
| Vault allocations (the treasury) | unauthorised movement, value creation, principal erosion |
| The decision record | forgery, silent revision, repudiation |
| Reserve/solvency claim | overstatement |
| Agent authority | continuing to trade while misbehaving or dead |

## Adversaries considered

1. **The agent itself** — misbehaving, poorly-reasoned, or captured by prompt injection.
2. **A holder of the agent's key** — full compromise of the autonomous signer.
3. **A third party** — anyone on the network, including a griefer.
4. **The operator (us)** — attempting to overstate solvency or quietly rewrite history.

## What each control actually stops

| Threat | Control | Enforced by | Limit of the control |
|---|---|---|---|
| Agent moves funds on its own say-so | K-of-N **auditor quorum**; `reallocate` reverts `NotApproved` | contract | Assumes a majority of auditor keys are not jointly compromised. Quorum is 2-of-3 today — **not** Byzantine-robust at scale. Votes are bound to this deployment's `instance_id`, so a signature farmed on a decoy quorum cannot be replayed here. |
| **Compromised agent key** | same as above | contract | Proven live: a decision signed by the agent's own key was still refused ([`ba368de3`](https://testnet.cspr.live/deploy/ba368de335840645486c7692cf1fdee8b0ca3f7f61514091515a32052ac2d7b7)). Does **not** stop an attacker who also holds ≥K auditor keys. |
| Principal erosion | vault invariant → `TouchesPrincipal` | contract | Only checks the total is not too **low**. It cannot detect inflation — which is why the next row exists. |
| **Value creation** | `SameAsset` guard | contract | Found by edge-case testing: `reallocate(X, X)` previously minted, because the credit overwrote the debit. Fixed in v7 ([`34ccd244`](https://testnet.cspr.live/deploy/34ccd2449d391db96279487294b5036da1c09faade0b151938a6636ef23e96b5)). |
| Agent raises its own limits / clears its own KYC | custodian-owned SpendGate + ComplianceRegistry | contract | Moves trust to the **custodian key**. A compromised custodian is a single point of failure today. |
| Griefing the daily limit | `check` callable only by the vault (`set_spender`) | contract | Previously any account could exhaust the daily limit; fixed in SpendGate v2. |
| Agent farms reputation to escape the breaker | `record_payment` + `adjust` are **authority-only** | contract | A contract cannot verify an off-chain settlement, so the **custodian attests it**. That trust boundary is explicit and key-separated, not eliminated. |
| Agent goes silent / rogue | **dead-man's switch**, 6h floor | contract | Permissionless to trip, custodian-only to lift ([`13729bde`](https://testnet.cspr.live/deploy/13729bdebafd2d3d6e928df56febfa0043d447470a8747ddc723c933a1d5897d) / [`1a4897f2`](https://testnet.cspr.live/deploy/1a4897f2576bf2ad246548ccc8503ba6fab709031072cf86b2d13b1f58c22773) denied). The floor exists because a caller-supplied window let anyone freeze an active vault. |
| Forged decision | signature verified **inside** `AttestationLog` before recording | contract | Proves *authenticity*, **not** that the reasoning is sound — that is the auditor's job. |
| Overstated solvency | Pedersen + Schnorr proof, checked on-chain and in your browser | contract + client | See the assumptions below. |

## Explicit assumptions and residual risk

- **The ZK circuit is unaudited.** Trust is *relocated* onto circuit and proof-system
  correctness, not removed. A green-verifying-but-unsound proof is a live risk.
  Independent circuit audit is a Phase-1 item; until then the solvency proof is **not**
  auditor-grade evidence.
- **Verification participation.** A distributed audit only binds what verifiers actually
  check — this "failure probability" is formally separate from cryptographic soundness.
  We publish to the chain as a **public bulletin board** so the same commitment is shown to
  everyone, which removes the "different totals to different verifiers" attack but not the
  participation assumption.
- **What the solvency proof does and does not hide.** The commitments are perfectly hiding,
  so no individual allocation appears in the proof — but this vault stores `allocations` as a
  **public plaintext `Mapping` with a public getter**, so anyone can read the split straight
  off the chain anyway. We previously described this as hiding the strategy from front-runners;
  that was an overclaim. The cryptography is real and sound, the privacy benefit for *this*
  vault is currently notional. Meaningful hiding needs a confidential vault that stores
  commitments instead of balances — a roadmap item, not a shipped property.
- **The proof is bound to vault state.** A Schnorr sum-proof only says the commitments add
  up to the total the prover claimed — it says nothing about that total being the
  treasury's. `prove_reserves` therefore reads the vault's real allocations over
  `ALL_ASSETS` and reverts `TotalMismatch` unless they equal the claimed total. Proven live:
  a **cryptographically valid** proof for $1.05M was refused because the vault holds $1.00M
  ([`3c114651`](https://testnet.cspr.live/deploy/3c114651e1a0008e81286016264c05dcc570959279d1964b86b54409e60ff1ee)).
  Residual assumption: the `vault` address configured at `init` is the right one.
- **Auditors can vote from a browser now, not just the agent's panel.** The quorum gained a
  caller-authenticated path (`vote_as_caller`) and an open registry (`open_register`): a human
  auditor connects a wallet and casts a REAL on-chain vote — the wallet signs the deploy, the
  contract counts the vote by the signing account, so no detached raw-message signature (which a
  wallet can't produce in our format) is needed. Proven live: two independent wallets registered
  and voted the same decision to a 2-of-N quorum
  ([register](https://testnet.cspr.live/deploy/52d0a10ba216d41c2827cd7d4b9e07f0f1a225e32882bc373a93cf5424115302), [vote](https://testnet.cspr.live/deploy/bb921506ee62cc8e1d232f37a0c01496d96244af3e18714e450cb5e0d90fd2cb),
  [vote](https://testnet.cspr.live/deploy/c7ebe71400c6a7c1064ec9c87776abb75ae893fbb353901154ee3779be53f2dd)). Registration is permissionless in this
  deployment (a demo of the open-auditor-registry roadmap item — production gates it behind a
  stake). This runs on a SEPARATE quorum (`6e9ba8517d65…`); the vault still enforces via the proven
  signed-vote quorum, so the interactive path can't weaken the agent's own control.
- **Custodian centralisation.** Segregation of duties currently rests on one custodian key.
  Progressive decentralisation to a governance quorum is on the roadmap.
- **We do not prove which model reasoned.** We prove a decision was signed by the agent's
  key and is human-interpretable. Attested inference (TEE) is unimplemented — our clearest
  honest limitation.
- **Legal liability is not transferred.** MiCA/MiFID II conduct and custody duties and DORA
  ICT responsibility attach to the authorised provider. These controls make oversight
  *provable*; they do not move the duty.
- **Testnet.** Values are demonstration amounts, not client assets.

## Out of scope

Casper consensus/validator security, RPC and indexer availability (degradation is handled
by showing honest empty states rather than stale numbers), LLM provider availability, and
the security of the operator's own machine.
