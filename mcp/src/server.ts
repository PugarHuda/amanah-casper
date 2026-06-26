// Amanah MCP server (stdio). Exposes read-only on-chain state so a judge or LLM
// can ask "why did it rebalance?" and inspect attestations, reputation, and the
// audit trail.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  getVaultState,
  getAttestation,
  getReputation,
  getAuditTrail,
} from "./chain.js";

const json = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

const server = new McpServer({ name: "amanah-mcp", version: "0.1.0" });

server.registerTool(
  "get_vault_state",
  {
    description:
      "Current RWA vault state: holdings, total treasury, locked principal, and active guardrails.",
    inputSchema: {},
  },
  async () => json(await getVaultState()),
);

server.registerTool(
  "get_attestation",
  {
    description:
      "Look up a signed, on-chain proof-of-reasoning attestation by its blake2b reasoning hash.",
    inputSchema: { hash: z.string().describe("blake2b-256 reasoning hash (hex)") },
  },
  async ({ hash }) => json(await getAttestation(hash)),
);

server.registerTool(
  "get_reputation",
  {
    description: "Reputation score for an address from the ReputationRegistry.",
    inputSchema: { address: z.string().describe("account-hash or public key") },
  },
  async ({ address }) => json(await getReputation(address)),
);

server.registerTool(
  "get_audit_trail",
  {
    description:
      "Recent on-chain actions by the agent (reallocations, attestations, x402 settlements, escalations).",
    inputSchema: {},
  },
  async () => json(await getAuditTrail()),
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout is the MCP channel — log to stderr only.
  console.error("amanah-mcp server connected (stdio)");
}

main().catch((e) => {
  console.error("fatal:", e);
  process.exit(1);
});
