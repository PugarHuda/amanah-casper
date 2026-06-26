# amanah-mcp

Read-only MCP server (stdio) exposing Amanah on-chain state so a judge or LLM can
ask "why did it rebalance?" and inspect the proof-of-reasoning trail.

## Tools

| Tool | Args | Returns |
| --- | --- | --- |
| `get_vault_state` | — | Holdings, total treasury, locked principal, guardrails |
| `get_attestation` | `hash` | Signed attestation (decision, signer, block time, verified) |
| `get_reputation` | `address` | Reputation score |
| `get_audit_trail` | — | Recent reallocations / attestations / x402 settlements / escalations |

Reads are behind typed functions in `src/chain.ts`, currently returning the same
shapes the web mock uses. Each has a `ponytail:` marking where the real
CSPR.cloud / contract-state query goes.

## Run

```bash
npm install
npm run dev        # stdio MCP server
npm run typecheck
```

Add to an MCP client with `mcp-client-config.example.json` (set `cwd` to this dir).
