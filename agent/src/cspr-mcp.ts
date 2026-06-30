// Consume the OFFICIAL CSPR.cloud MCP server (https://mcp.testnet.cspr.cloud/mcp).
// This is the partner's hosted agentic tool — 82 read tools over the Casper
// network. Amanah uses it as a second, independent source of on-chain truth
// (account balance, deploy status, CSPR rate) alongside our own reads, and ships
// a CLI demo proving real consumption.
//
// Auth: the CSPR.cloud access key in the X-CSPR-Cloud-Api-Key header.
// Run the demo: npx tsx src/cspr-mcp.ts
import "dotenv/config";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const ENDPOINT = process.env.CSPR_CLOUD_MCP_URL ?? "https://mcp.testnet.cspr.cloud/mcp";
const KEY = process.env.CSPR_CLOUD_KEY ?? process.env.CSPR_CLOUD_API_KEY ?? "";

/** Connect to the official CSPR.cloud MCP, run `fn`, always close. */
export async function withCsprCloudMcp<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  if (!KEY) throw new Error("Missing CSPR_CLOUD_KEY for the official CSPR.cloud MCP");
  const transport = new StreamableHTTPClientTransport(new URL(ENDPOINT), {
    requestInit: { headers: { "X-CSPR-Cloud-Api-Key": KEY } },
  });
  const client = new Client({ name: "amanah-agent", version: "0.1.0" });
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close().catch(() => {});
  }
}

// MCP tool results come back as content blocks; pull the first JSON/text payload.
function parseResult(res: unknown): unknown {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content = (res as any)?.content;
  const text = Array.isArray(content) ? content.find((c: { type?: string }) => c.type === "text")?.text : undefined;
  if (typeof text !== "string") return res;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export interface AgentInsights {
  balanceCspr: number | null;
  csprRateUsd: number | null;
}

const num = (s: string) => Number(s.replace(/,/g, ""));

/** Best-effort: agent CSPR balance + CSPR/USD rate from the official MCP. Never
 *  throws and is time-bounded, so the autonomous loop can call it safely. The
 *  tools return markdown, so we regex the figures out. */
export async function getAgentInsights(accountIdentifier: string, timeoutMs = 6000): Promise<AgentInsights | null> {
  if (!KEY) return null;
  try {
    return await Promise.race([
      withCsprCloudMcp(async (c) => {
        const [balText, rateText] = await Promise.all([
          c.callTool({ name: "get_account_balance", arguments: { accountIdentifier } }).then((r) => String(parseResult(r))).catch(() => ""),
          c.callTool({ name: "get_current_currency_rate", arguments: { currencyId: "1" } }).then((r) => String(parseResult(r))).catch(() => ""),
        ]);
        const bal = /Total[^:]*:\*\*\s*([\d,.]+)\s*CSPR/i.exec(balText) ?? /Liquid Balance:\*\*\s*([\d,.]+)\s*CSPR/i.exec(balText);
        const rate = /Rate:\*\*\s*([\d.]+)/i.exec(rateText);
        return {
          balanceCspr: bal ? num(bal[1]) : null,
          csprRateUsd: rate ? Number(rate[1]) : null,
        };
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
  } catch {
    return null;
  }
}

// --- CLI demo: prove real consumption of the official CSPR.cloud MCP ----------
async function main(): Promise<void> {
  const AGENT_PK = "0147ebe715f3fb6d387ae2f102e55032ba54c8c4557293d7800cad11561496fdaa";
  const PROOF_DEPLOY = "eeecb9d136a622d07ab41b641272439919d37d14689e7392feee56bb195ac8a0"; // reallocate
  await withCsprCloudMcp(async (c) => {
    const { tools } = await c.listTools();
    console.log(`Connected to official CSPR.cloud MCP — ${tools.length} tools available.\n`);

    console.log("get_account_balance (agent):");
    console.log(" ", JSON.stringify(parseResult(await c.callTool({ name: "get_account_balance", arguments: { accountIdentifier: AGENT_PK } }))).slice(0, 300));

    console.log("\nget_current_currency_rate (USD):");
    console.log(" ", JSON.stringify(parseResult(await c.callTool({ name: "get_current_currency_rate", arguments: { currencyId: "1" } }))).slice(0, 300));

    console.log("\nget_deploy (our reallocate proof):");
    console.log(" ", JSON.stringify(parseResult(await c.callTool({ name: "get_deploy", arguments: { deployHash: PROOF_DEPLOY } }))).slice(0, 300));
  });
}

// Run main() only when invoked directly (not when imported by the loop).
if (/cspr-mcp\.(ts|js|mts)$/.test(process.argv[1] ?? "")) {
  main().catch((e) => {
    console.error("FAILED:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
