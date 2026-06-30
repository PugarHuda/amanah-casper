---
name: amanah-rwa-treasury
description: >-
  Inspect and verify the Amanah autonomous RWA treasury agent on Casper testnet.
  Use this skill when a user asks to check the treasury's holdings, audit why the
  agent rebalanced, verify a proof-of-reasoning attestation, look up the agent's
  reputation, or confirm any Amanah on-chain action. Amanah signs every AI decision
  (Ed25519), attests it on-chain, and guards spending — this skill lets an agent
  read and verify all of it.
license: MIT
---

# Amanah — RWA Treasury Agent Skill

Amanah is an autonomous, compliant real-world-asset (gold, US T-bond, WTI, CSPR)
treasury agent on **Casper testnet**. Its thesis is **"proof, not a diary"**: every
decision is Ed25519-signed, hashed (blake2b), and **verified on-chain by the
AttestationLog contract itself** before it is recorded. It only reallocates *yield*
— principal is locked by a vault invariant — and every spend passes an on-chain
SpendGate (cap + daily limit + allowlist) and ComplianceRegistry (KYC status) check.

## When to use this skill

- "What does the Amanah treasury hold right now?" → `get_vault_state`
- "Why did the agent rebalance / what did it decide?" → `get_audit_trail` then `get_attestation`
- "Is this reasoning hash really what was signed on-chain?" → `get_attestation <hash>`
- "What's the agent's reputation?" → `get_reputation <account-hash>`
- "Verify the agent actually did X on-chain" → cross-check the deploy hash on cspr.live

## How to connect

Amanah ships its own read-only **MCP server** (stdio). Tools:

| Tool | Input | Returns |
|------|-------|---------|
| `get_vault_state` | — | holdings, total treasury, locked principal, **live SpendGate guardrails** |
| `get_audit_trail` | — | recent on-chain actions (attest / reallocate / x402 / reputation), labelled |
| `get_attestation` | `hash` (blake2b reasoning hash, hex) | the published reasoning blob, recomputed-hash integrity check (`verified`), and the decision |
| `get_reputation` | `address` (account-hash) | live i64 score from the ReputationRegistry |

Run it: `cd mcp && npx tsx src/server.ts` (needs `CSPR_CLOUD_API_KEY`, `VAULT_STATE_SEED`,
`REPUTATION_STATE_SEED`, `SPENDGATE_STATE_SEED` — see `mcp/.env.example`).

You can also consume the **official CSPR.cloud MCP server** for raw network data:
`https://mcp.testnet.cspr.cloud/mcp` (header `X-CSPR-Cloud-Api-Key`). Amanah's agent
already does this each cycle for an independent second source of truth.

## The verification workflow (the important part)

1. `get_audit_trail` → find a recent **Attestation** row, note its deploy hash.
2. `get_attestation <reasoning_hash>` → it reads the published reasoning blob from
   `audit/<hash>.json`, recomputes blake2b over the exact bytes, and returns
   `verified: true` only if the recomputed hash matches the one that was attested.
3. Confirm independently on-chain: open `https://testnet.cspr.live/deploy/<deploy_hash>`
   — the AttestationLog contract `attest` call **verified the Ed25519 signature inside
   the contract**, so a forged reasoning hash would have reverted. Success = real proof.

A claim is only trustworthy when (2) `verified` is true AND (3) the deploy succeeded.
Never assert an attestation is valid from the blob alone — always cross-check the chain.

## Key facts to ground answers

- Network: **casper-test**. Explorer: `https://testnet.cspr.live`.
- The agent reasons with an LLM (Venice), but the *proof* is the on-chain signature
  verification — not the model output. Treat the reasoning text as context, the
  attestation as truth.
- Principal is locked: the vault rejects any reallocation that would drop total
  allocations below locked principal (`TouchesPrincipal`). The agent can only move yield.
- Full addresses, proof hashes, and the MCP/contract reference are in
  [`references/llms.txt`](references/llms.txt).

## Safety

This is a **read/verify** skill. It never signs or sends transactions. If a user asks
to move funds, explain that only the Amanah agent (holding its key) can reallocate,
gated on-chain by SpendGate + ComplianceRegistry — and point them to the proofs.
