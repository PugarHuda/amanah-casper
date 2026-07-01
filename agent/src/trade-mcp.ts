// Consume the OFFICIAL CSPR.trade MCP server (https://mcp.cspr.trade/mcp) — the
// leading Casper DEX, exposed as 23 agentic tools (quotes, swaps, liquidity,
// portfolio). Public + non-custodial: no API key, and it never touches our key
// (swaps are built server-side, signed locally). Amanah uses it read-only as live
// DEX market intelligence for the CSPR reserve leg (e.g. the CSPR↔sCSPR
// liquid-staking rate), an extra signal alongside the off-DEX price feeds.
//
// Run the demo: npx tsx src/trade-mcp.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const ENDPOINT = process.env.CSPR_TRADE_MCP_URL ?? "https://mcp.cspr.trade/mcp";

export async function withTradeMcp<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const transport = new StreamableHTTPClientTransport(new URL(ENDPOINT));
  const client = new Client({ name: "amanah-agent", version: "0.1.0" });
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close().catch(() => {});
  }
}

function toText(res: unknown): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = (res as any)?.content;
  return Array.isArray(c) ? (c.find((x: { type?: string }) => x.type === "text")?.text ?? "") : "";
}

export interface DexQuote {
  pair: string;
  executionPrice: number | null;
  priceImpactPct: number | null;
  amountOut: number | null;
}

/** Best-effort live DEX quote for `amount` CSPR -> tokenOut. Never throws, time-bounded. */
export async function getDexQuote(tokenOut = "sCSPR", amount = "1000", timeoutMs = 6000): Promise<DexQuote | null> {
  try {
    return await Promise.race([
      withTradeMcp(async (c) => {
        const txt = toText(await c.callTool({ name: "get_quote", arguments: { token_in: "CSPR", token_out: tokenOut, amount, type: "exact_in" } }));
        const q = JSON.parse(txt) as { executionPrice?: string; amountOutFormatted?: string; priceImpact?: string; priceImpactPct?: string };
        const impact = q.priceImpactPct ?? q.priceImpact;
        return {
          pair: `CSPR/${tokenOut}`,
          executionPrice: q.executionPrice != null ? Number(q.executionPrice) : null,
          priceImpactPct: impact != null ? Number(impact) : null,
          amountOut: q.amountOutFormatted != null ? Number(q.amountOutFormatted) : null,
        };
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
  } catch {
    return null;
  }
}

// --- CLI demo: prove real consumption of the CSPR.trade DEX MCP ---------------
async function main(): Promise<void> {
  await withTradeMcp(async (c) => {
    const { tools } = await c.listTools();
    console.log(`Connected to official CSPR.trade MCP — ${tools.length} tools.\n`);
    const tokens = JSON.parse(toText(await c.callTool({ name: "get_tokens", arguments: {} })));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    console.log("tradable:", tokens.map((t: any) => t.symbol).join(", "));
    console.log("\nget_quote 1000 CSPR -> sCSPR (exact_in):");
    console.log(" ", toText(await c.callTool({ name: "get_quote", arguments: { token_in: "CSPR", token_out: "sCSPR", amount: "1000", type: "exact_in" } })).slice(0, 360));
    console.log("\nanalyze_trade 1000 CSPR -> sCSPR (pre-trade risk):");
    console.log(" ", toText(await c.callTool({ name: "analyze_trade", arguments: { token_in: "CSPR", token_out: "sCSPR", amount: "1000", type: "exact_in" } }).catch(() => ({}))).slice(0, 360) || "(analyze_trade args differ — see get_quote)");
  });
}

if (/trade-mcp\.(ts|js|mts)$/.test(process.argv[1] ?? "")) {
  main().catch((e) => {
    console.error("FAILED:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
