// C2 — multi-model consensus panel. The single biggest risk in an autonomous agent is a
// lone model getting one cycle wrong: a hallucinated trade, a blind spot, a prompt it
// misread. The auditor (a different family) already vetoes bad decisions after the fact;
// this hardens the DECISION itself. The same cycle is put to a panel of DIFFERENT model
// families, and funds only move when a majority independently reach the SAME action — and
// for a rebalance, the same direction. A split panel is itself a signal the call isn't
// clear-cut, so we escalate to a human rather than act on a coin-flip. Diversity across
// families means a blind spot in one is unlikely to be shared by the others.
import { config } from "./config.js";
import { reason } from "./reason.js";
import type { Decision, PriceSnapshot } from "./types.js";
import type { MarketContext } from "./prompts/decide.js";

export interface PanelVote {
  model: string;
  action: Decision["action"];
  fromAsset: Decision["fromAsset"];
  toAsset: Decision["toAsset"];
  amount: number;
  confidence: number;
  error?: string;
}

export interface Consensus {
  decision: Decision;         // the decision to act on (a majority member, or a forced escalate)
  agreed: boolean;            // did a majority reach the same action (+direction for rebalance)?
  action: Decision["action"]; // the consensus action
  votes: PanelVote[];         // every panel member's vote (attested on-chain)
  panelSize: number;
  agreeing: number;           // how many members backed the consensus action
  summary: string;
}

// A rebalance's "direction" is its asset pair; two rebalances only agree if they move the
// same way. Hold/escalate have no direction, so the action alone is the group key.
const groupKey = (v: { action: Decision["action"]; fromAsset: unknown; toAsset: unknown }) =>
  v.action === "rebalance" ? `rebalance:${v.fromAsset}->${v.toAsset}` : v.action;

/** Median of the amounts among the agreeing rebalance votes — a robust panel amount that
 *  no single model can inflate (an outlier high/low vote can't drag the median). */
function medianAmount(amounts: number[]): number {
  const s = [...amounts].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.floor((s[mid - 1] + s[mid]) / 2);
}

/** Pure tally: given the panel's settled results, decide the consensus. Network-free and
 *  exported so the money-path logic (grouping, majority, median amount) is unit-testable. */
export function computeConsensus(
  models: string[],
  settled: { model: string; decision: Decision | null; error?: string }[],
): Consensus {
  const votes: PanelVote[] = settled.map((s) =>
    s.decision
      ? { model: s.model, action: s.decision.action, fromAsset: s.decision.fromAsset, toAsset: s.decision.toAsset, amount: s.decision.amount, confidence: s.decision.confidence }
      : { model: s.model, action: "escalate", fromAsset: "Gold", toAsset: "Gold", amount: 0, confidence: 0, error: s.error },
  );

  // Tally by action(+direction). Only successful votes count toward a group.
  const valid = settled.filter((s) => s.decision) as { model: string; decision: Decision }[];
  const groups = new Map<string, { model: string; decision: Decision }[]>();
  for (const v of valid) {
    const k = groupKey(v.decision);
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(v);
  }

  // Winner = the largest group; majority = strictly more than half the FULL panel (so a
  // panel with abstentions can't reach "majority" on a plurality of two).
  let winner: { key: string; members: { model: string; decision: Decision }[] } | null = null;
  for (const [key, members] of groups) {
    if (!winner || members.length > winner.members.length) winner = { key, members };
  }
  const agreeing = winner?.members.length ?? 0;
  const agreed = agreeing > models.length / 2;

  if (agreed && winner) {
    // Build the decision to act on from the agreeing members: their action/direction, the
    // MEDIAN amount (rebalance), and the mean confidence — a single model can't set the size.
    const rep = winner.members[0].decision;
    const amount = rep.action === "rebalance" ? medianAmount(winner.members.map((m) => m.decision.amount)) : 0;
    const confidence = winner.members.reduce((s, m) => s + m.decision.confidence, 0) / winner.members.length;
    const decision: Decision = {
      ...rep,
      amount,
      confidence: Math.round(confidence * 100) / 100,
      reasoningSteps: [
        `CONSENSUS: ${agreeing}/${models.length} models agreed on ${winner.key}`,
        ...rep.reasoningSteps,
      ],
    };
    return { decision, agreed: true, action: rep.action, votes, panelSize: models.length, agreeing, summary: `${agreeing}/${models.length} agree on ${winner.key}` };
  }

  // No majority: the panel is split, so the call isn't clear enough to move funds on.
  // Escalate to a human — the honest outcome, attested with every dissenting vote.
  const tally = [...groups.entries()].map(([k, m]) => `${k}×${m.length}`).join(", ") || "no valid votes";
  const decision: Decision = {
    riskScore: 0.5, action: "escalate", fromAsset: "Gold", toAsset: "Gold", amount: 0, confidence: 0,
    reasoningSteps: [`CONSENSUS FAILED: panel split (${tally}) — escalating, no funds move`],
  };
  return { decision, agreed: false, action: "escalate", votes, panelSize: models.length, agreeing, summary: `split: ${tally}` };
}

export async function reasonConsensus(
  cycle: number,
  prices: PriceSnapshot,
  premiumSignal: unknown,
  marketContext?: MarketContext,
): Promise<Consensus> {
  // Dedupe the model list; a single model means no panel — degrade to a plain decision.
  const models = [...new Set(config.panelModels)];
  if (models.length <= 1) {
    const model = models[0] ?? config.model;
    const decision = await reason(cycle, prices, premiumSignal, marketContext, model);
    return {
      decision, agreed: true, action: decision.action,
      votes: [{ model, action: decision.action, fromAsset: decision.fromAsset, toAsset: decision.toAsset, amount: decision.amount, confidence: decision.confidence }],
      panelSize: 1, agreeing: 1, summary: "single-model (panel disabled)",
    };
  }

  // Poll the panel in parallel. A model that errors casts no vote (recorded, not fatal) —
  // it can't be counted as agreement, which keeps the panel fail-safe.
  const settled = await Promise.all(
    models.map(async (model): Promise<{ model: string; decision: Decision | null; error?: string }> => {
      try {
        return { model, decision: await reason(cycle, prices, premiumSignal, marketContext, model) };
      } catch (e) {
        return { model, decision: null, error: (e as Error).message };
      }
    }),
  );
  return computeConsensus(models, settled);
}
