import type { PriceSnapshot } from "../types.js";

export const SYSTEM_PROMPT = `You are Amanah, an autonomous, compliance-bound treasury agent managing a \
real-world-asset (RWA) reserve on the Casper blockchain. The reserve holds four \
assets: Gold (tokenized), TBond (tokenized US treasury), WTI (crude oil), and \
CSPR (native reserve).

Hard rules you operate under (enforced on-chain regardless of what you decide):
- You may only ever reallocate YIELD between assets. Principal is locked and \
cannot be touched.
- Every move is gated by a SpendGate (per-tx cap, daily limit, allowlist) and a \
ComplianceRegistry. A move that violates them will revert.

Your job each cycle: read the live prices and the paid premium signal, judge \
risk, and decide whether to rebalance, hold, or escalate to a human. Be \
conservative: prefer 'hold' when data is missing or confidence is low, and \
'escalate' when a move is material but you are unsure.

Return ONLY the structured decision. amount is in atomic vault units and must be \
0 unless action is 'rebalance'. fromAsset/toAsset must be two of: Gold, TBond, \
WTI, CSPR.`;

/** Extra market context sourced from the official Casper agentic MCP servers. */
export interface MarketContext {
  /** Agent's live CSPR balance + CSPR/USD rate (official CSPR.cloud MCP). */
  csprCloud?: { balanceCspr: number | null; csprRateUsd: number | null } | null;
  /** Live DEX quote for the CSPR reserve leg (official CSPR.trade DEX MCP). */
  csprTradeDex?: { pair: string; executionPrice: number | null; priceImpactPct: number | null } | null;
}

export function buildUserPrompt(
  cycle: number,
  prices: PriceSnapshot,
  premiumSignal: unknown,
  marketContext?: MarketContext,
): string {
  const ctx = marketContext
    ? `\nOn-chain market context (from the official Casper CSPR.cloud + CSPR.trade MCP servers):
${JSON.stringify(marketContext, null, 2)}
Use the DEX execution price + price impact to judge CSPR reserve liquidity, and the
balance as available capital. Don't rebalance into a leg with high DEX price impact.\n`
    : "";
  return `Cycle #${cycle}.

Live RWA prices (null = data source unavailable this cycle):
${JSON.stringify(prices, null, 2)}

Premium signal (paid for via x402):
${JSON.stringify(premiumSignal, null, 2)}
${ctx}
Decide the single best action for this cycle.`;
}

// JSON schema the model output is constrained to (output_config.format).
export const DECISION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    riskScore: { type: "number" },
    action: { type: "string", enum: ["rebalance", "hold", "escalate"] },
    fromAsset: { type: "string", enum: ["Gold", "TBond", "WTI", "CSPR"] },
    toAsset: { type: "string", enum: ["Gold", "TBond", "WTI", "CSPR"] },
    amount: { type: "number" },
    reasoningSteps: { type: "array", items: { type: "string" } },
    confidence: { type: "number" },
  },
  required: [
    "riskScore",
    "action",
    "fromAsset",
    "toAsset",
    "amount",
    "reasoningSteps",
    "confidence",
  ],
} as const;
