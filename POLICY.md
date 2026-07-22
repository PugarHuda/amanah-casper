# Amanah Treasury Policy — v1

**Status:** signed off on-chain by the auditor quorum (see the sign-off proof below).
**Canonical hash:** the blake2b-256 of this file's body (the text between the two `===`
markers) is the policy version identifier the quorum approves. Changing one character
changes the hash, so an approval binds to *exactly* this text.

DORA Art. 5(2)(a) makes the client's management body accountable for ICT decisions; this
document is the written policy their oversight approves, and the on-chain sign-off is the
evidence that they did. The agent embeds this policy version in every attested decision
(governance attribution), so a decision can be tied back to the policy it ran under.

===
POLICY-BODY-V1

1. MANDATE. The agent manages a tokenized real-world-asset reserve (Gold, tokenized US
   T-bonds, WTI, native CSPR). It may reallocate YIELD between assets. It may never touch
   the locked principal.

2. PRINCIPAL LOCK. Total reserve value must never fall below the on-chain principal figure.
   Enforced by the vault invariant (TouchesPrincipal); the agent cannot override it.

3. AUTHORISATION. No reallocation executes unless an independent K-of-N auditor quorum has
   approved that exact decision on-chain. A decision signed only by the agent's own key is
   refused (NotApproved).

4. RISK TOLERANCE. The agent acts only on clear signals. Below a confidence of 0.70 it must
   ESCALATE to a human rather than act. Low-confidence and guard-tainted cycles are handed
   to the human approval inbox for on-chain sign-off.

5. SPEND CONTROLS. Every move is bounded by the SpendGate: a per-transaction cap, a rolling
   daily limit, a counterparty allowlist, and an instant custodian kill-switch (revoke)
   that halts all moves.

6. SEGREGATION OF DUTIES. The agent key, the custodian key, and the auditor keys are
   distinct. The agent cannot raise its own limits, clear its own KYC, or lift a freeze.

7. SOLVENCY REPORTING. Solvency is proven every cycle with a zero-knowledge proof-of-reserves
   verified on-chain, bound to the vault's real allocations.

8. ACCOUNTABILITY. Every decision is Ed25519-signed, hashed, and attested on-chain with the
   approved policy version, the approver, the machine-readable risk tolerance, and the named
   accountable owner. Records are pinned to IPFS.
===
