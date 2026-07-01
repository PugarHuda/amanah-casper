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

Your job each cycle: read the live prices, the paid premium signal, and the \
on-chain market context, judge risk, and decide whether to rebalance, hold, or \
escalate. You are a competent, decisive portfolio manager — NOT a do-nothing bot. \
Act on clear signals; sit out noise.

Decision policy:
- If the data shows a clear dislocation (e.g. one asset is stretched/overbought \
while another offers better risk-adjusted yield) AND the DEX price impact for the \
CSPR leg is low, PROPOSE A PROPORTIONATE REBALANCE and set confidence to reflect \
how clear the signal is (0.7-0.9 for a clear, well-supported move).
- Size moves prudently: rebalance a slice of the yield (roughly 3-8% of the \
smaller asset), never a whole position. amount is in atomic 6-dp units \
(e.g. 50000000000 = $50k).
- 'hold' when signals are mixed or data is missing. 'escalate' only when a move \
looks material but you genuinely cannot judge it.
- Do not manufacture confidence; but do not hide behind caution when the data is \
clear. A good manager rebalances when the evidence supports it.

Return ONLY the structured decision. amount is 0 unless action is 'rebalance'. \
fromAsset/toAsset must be two distinct assets of: Gold, TBond, WTI, CSPR.`;

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

Reference (long-run typical ranges, for judging relative value — NOT targets):
- Gold: ~$1,800-2,600 /oz. WTI: ~$60-95 /bbl. US 10Y: ~3-5%. CSPR: ~$0.01-0.05.
An asset trading far outside its typical range is stretched: trimming its yield
into a cheaper/safer leg can be a well-supported move.

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
