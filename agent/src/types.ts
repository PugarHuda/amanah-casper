// Shared off-chain types for Amanah. Copied (not imported) into each package —
// ponytail: lazy, no monorepo. Keep the four copies in sync by hand; they're tiny.

/** The four real-world assets the treasury holds. Order MUST match the on-chain
 *  `AssetId` enum in contracts/src/common.rs (Gold=0, TBond=1, WTI=2, CSPR=3). */
export type AssetId = "Gold" | "TBond" | "WTI" | "CSPR";

export const ASSET_INDEX: Record<AssetId, number> = {
  Gold: 0,
  TBond: 1,
  WTI: 2,
  CSPR: 3,
};

export type AgentAction = "rebalance" | "hold" | "escalate";

/** Real RWA price snapshot. A field is `null` when its data source is
 *  unavailable (e.g. missing API key) — never faked. */
export interface PriceSnapshot {
  /** US 10Y Treasury par yield, percent (e.g. 4.21). */
  tbondYieldPct: number | null;
  /** WTI crude spot, USD/bbl. */
  wtiUsd: number | null;
  /** Gold spot, USD/oz. */
  goldUsd: number | null;
  /** CSPR spot, USD (primary: CoinGecko). */
  csprUsd: number | null;
  /** Cross-validation of CSPR against a second independent source (Coinpaprika).
   *  divergencePct is |a-b|/mean*100 — a data-trust signal; null if either is down. */
  csprCrossCheck: { source2Usd: number | null; divergencePct: number | null };
  /** Per-source notes (errors, "needs KEY", endpoints used). */
  notes: string[];
  at: string; // ISO timestamp
}

/** The structured decision returned by the reasoning model. */
export interface Decision {
  riskScore: number; // 0..1
  action: AgentAction;
  fromAsset: AssetId;
  toAsset: AssetId;
  amount: number; // atomic vault units to move (0 for hold/escalate)
  reasoningSteps: string[];
  confidence: number; // 0..1
}

/** The blob that gets hashed + signed + attested on-chain. */
export interface ReasoningBlob {
  cycle: number;
  pubkey: string; // hex-encoded Ed25519 public key that signed the blob
  prices: PriceSnapshot;
  premiumSignal: unknown;
  /** Governance attribution for the cycle (DORA oversight evidence). */
  governance?: unknown;
  /** Market context from the official CSPR.cloud + CSPR.trade MCP servers, fed into
   *  the reasoning and attested alongside it. */
  marketContext?: unknown;
  decision: Decision;
  /** Prompt-injection attempts detected in this cycle's untrusted inputs, and any
   *  policy violations found in the model's own output. Both live INSIDE the signed
   *  blob so an attempted attack is attested on-chain, not just logged locally. */
  guard?: { detections: unknown[]; violations: unknown[]; forcedEscalate: boolean };
  /** The multi-model consensus panel for this cycle (C2): which model families agreed or
   *  split on the decision. Signed alongside it so the consensus is verifiable on-chain. */
  consensus?: { agreed: boolean; summary: string; agreeing: number; panelSize: number; votes: unknown[] };
  model: string;
  at: string;
}
