# SOC 2 readiness narrative

**What this is.** A mapping of Amanah's controls to the AICPA **Trust Services Criteria**
(TSC 2017, rev. 2022), written the way a service organisation prepares for a SOC 2
examination. **What this is not:** a SOC 2 report. A real SOC 2 Type II is an *independent*
CPA firm's opinion on whether controls operated effectively over a period — it cannot be
self-issued. This document is the control narrative such an auditor would start from, and it
states plainly where the evidence is strong and where it is not yet auditor-grade.

Amanah's differentiator for this exercise: most of the evidence is **on-chain and
third-party-verifiable**, not screenshots of an internal system. An examiner can re-derive
it rather than take our word.

## Common Criteria (Security — the CC series)

| Criterion | Amanah control | Evidence |
|---|---|---|
| **CC5.2 / CC6.1** Logical access, least privilege | Key-separated roles: agent, custodian, and auditor keys are distinct. The agent cannot raise its own limits, clear its own KYC, credit its own reputation, or lift a freeze. | On-chain: authority-gated entry points; `record_payment`/`adjust` revert for the agent (`NotAuthorized`). |
| **CC6.6** Boundary protection against external threats | Prompt-injection defence: untrusted inputs (price feeds, paid signal, MCP output) are fenced and scanned; a detection taints the cycle and forces escalate. | Red-team battery 7/7 blocked, published (`/verify`, `redteam.json`). |
| **CC6.7** Restriction of information in transit / movement of data | Every fund movement is gated by SpendGate (per-tx cap, daily limit, allowlist) and the auditor quorum before it executes. | On-chain refusals (`OverTxCap`, `NotApproved`) in the exception report. |
| **CC7.2** Detection & monitoring of anomalies | Circuit breakers: reputation floor benches a misbehaving agent; the dead-man's switch lets anyone freeze a silent agent. | Live proofs: `BelowReputationFloor`, `Frozen` reverts on cspr.live. |
| **CC7.3 / CC7.4** Incident response & mitigation | Emergency stop: one custodian call (`revoke`) halts every agent move; reversible. | Proven live: pause → a valid move blocked with `Expired` → re-enable. |
| **CC8.1** Change management | The written treasury policy is versioned and its version hash is approved on-chain by the auditor quorum before it governs decisions. | `POLICY.md` + on-chain 2/2 sign-off. |
| **CC3.x / CC4.x** Risk assessment & monitoring | The threat model enumerates adversaries, controls, and the explicit limit of each control; the agent's independent auditor (a different model family) grades every decision. | `THREAT_MODEL.md`; audit verdict attested on-chain. |

## Processing Integrity (PI)

| Criterion | Control | Evidence |
|---|---|---|
| **PI1.1 / PI1.2** Inputs are complete, accurate, authorised | Every decision is Ed25519-signed and the signature is verified *inside* the contract before it is recorded; a forged decision is refused. | `InvalidAttestation` refusals; proof-of-reasoning blobs pinned to IPFS. |
| **PI1.4 / PI1.5** Outputs are complete and accurate; value is conserved | The principal invariant blocks any move that would erode locked capital; the `SameAsset` guard blocks value creation (a real minting bug we found and fixed). | `TouchesPrincipal`, `SameAsset` reverts on-chain. |
| **PI1.3** Processing is authorised | No reallocation executes without an independent K-of-N auditor quorum approving that exact decision. | `NotApproved` refusal even for a decision signed by the agent's own key. |

## Availability (A)

| Criterion | Control | Evidence |
|---|---|---|
| **A1.1** Capacity / degradation | The dashboard degrades to honest empty states ("—") on an RPC failure rather than showing stale numbers; each read fails independently. | Resilience tests; per-read fallbacks in the data layer. |
| **A1.2** Recovery / continuity | Segregated custodian key can re-enable the vault after an emergency stop or a dead-man freeze. | `set_limits` re-enable proof; custodian-only unfreeze. |

## Confidentiality (C) & Privacy (P)

| Criterion | Control | Evidence |
|---|---|---|
| **C1.1** Confidential information is protected | Solvency is proven with a zero-knowledge proof-of-reserves — no individual allocation appears in the proof — bound to the vault's real total. | ZK proof re-runnable in the browser; `TotalMismatch` binds it to state. |
| **P-series** Personal data minimisation | KYC is proven with a Schnorr NIZK: the credential is never transmitted or stored on-chain. | ZkKycVerifier; verify in-VM. |

## Honest gaps (what an examiner would flag as not-yet-ready)

- **No independent examination.** Everything above is self-asserted; a SOC 2 opinion requires
  a CPA firm's testing over a period. That engagement is a Phase-1 item.
- **The ZK circuit is unaudited.** The proof-of-reserves is not auditor-grade evidence until
  an independent circuit audit (see `THREAT_MODEL.md`).
- **Custodian centralisation.** Segregation of duties currently rests on one custodian key;
  progressive decentralisation to a governance quorum is on the roadmap.
- **Period of operation.** SOC 2 Type II tests controls *over a period* (typically 3–12
  months). Amanah's on-chain history is the raw material for that, but the period is short.
- **Confidential vault.** Allocations are still public plaintext on-chain, so the ZK proof
  hides amounts *in the proof*, not in the system. A confidential vault is roadmap.

See also: [`THREAT_MODEL.md`](THREAT_MODEL.md) (what each control does *not* do),
[`RESEARCH.md`](RESEARCH.md) (the regulatory sources), and the live control evidence at
`/compliance`.
