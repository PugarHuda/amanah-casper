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

**All four tools are live** (decoded straight from chain in `src/chain.ts`):
`get_vault_state`/`get_reputation` read the Odra `state` dicts, `get_attestation`
recomputes blake2b over the published blob and confirms it matches the on-chain hash,
`get_audit_trail` lists real deploys via CSPR.cloud. Fill `.env` from `.env.example`
(state seeds + CSPR.cloud key).

## Run

```bash
npm install
npm run dev        # stdio MCP server
npm run typecheck
npm test           # attestation round-trip + address validation
npx tsx src/smoke.ts   # one-shot check of all 4 tools (reputation=1, vault=$1M, verified=true)
```

Add to an MCP client with `mcp-client-config.example.json` (set `cwd` to this dir).
