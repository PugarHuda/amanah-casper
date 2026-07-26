// Autonomous native staking — the agent decides, on its own, to put idle treasury CSPR to
// work earning real Casper staking yield, instead of it being a manual one-off. This closes the
// loop on the "autonomous yield optimizer" thesis: the yield DECISION is made by the model,
// signed, attested on-chain (proof-of-reasoning), checked by a deterministic guard, and only
// then executed as a real delegation — with a reserve buffer the agent must respect so it can
// never stake funds the treasury needs liquid.
//
// Run:  DRY_RUN=false npx tsx src/autostake.ts     (attests the decision; delegates if warranted)
//       DRY_RUN=true  npx tsx src/autostake.ts     (real decide + attest-logged, no on-chain send)
import { loadPrivateKey, makeRpcClient } from "./casper.js";
import { attest } from "./attest.js";
import { readIdleCspr, delegate } from "./stake.js";
import { config } from "./config.js";
import type { Decision, ReasoningBlob } from "./types.js";

const RESERVE_BUFFER_CSPR = Number(process.env.STAKE_RESERVE_BUFFER || "250"); // never stake below this liquid
const MIN_DELEGATION = 500;                                                    // network minimum
const MAX_STAKE_CSPR = Number(process.env.STAKE_MAX || "5000");                // per-decision cap
const NATIVE_APR_PCT = Number(process.env.STAKE_APR_PCT || "11");              // ~Casper staking APR, for the model

const rpc = makeRpcClient(config.rpcUrl);

type StakeDecision = { action: "stake" | "hold"; amountCspr: number; confidence: number; reasoningSteps: string[] };

/** Ask the model whether idle CSPR should be delegated for native yield, and how much. */
async function decideStaking(idle: number, alreadyStaked: number): Promise<StakeDecision> {
  const stakeable = Math.max(0, idle - RESERVE_BUFFER_CSPR);
  const prompt = `You manage a tokenized treasury's CSPR reserve on Casper. Decide whether to delegate idle CSPR for native staking yield.
Facts:
- Idle (undelegated) CSPR: ${idle}
- Already staked (earning): ${alreadyStaked}
- Mandatory liquid reserve buffer (never stake below this): ${RESERVE_BUFFER_CSPR}
- Stakeable now (idle - buffer): ${stakeable}
- Network minimum delegation: ${MIN_DELEGATION} CSPR (a delegation must be >= this)
- Native staking APR: ~${NATIVE_APR_PCT}% (rewards auto-compound; principal recoverable via undelegate after ~7 eras)
- Per-decision cap: ${MAX_STAKE_CSPR} CSPR
Rules: only "stake" if stakeable >= ${MIN_DELEGATION}. Keep the buffer liquid for gas and operations. Prefer staking idle capital that clearly exceeds the buffer + minimum; otherwise hold.
Return ONLY JSON: {"action":"stake"|"hold","amountCspr":<integer>,"confidence":<0..1>,"reasoningSteps":["...","..."]}`;

  const res = await fetch(`${config.veniceBaseUrl}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${config.veniceKey}` },
    body: JSON.stringify({
      model: config.model, temperature: 0.2, max_tokens: 1200,
      messages: [
        { role: "system", content: "You are a prudent, decisive treasury yield manager. Respond only with the requested JSON." },
        { role: "user", content: prompt },
      ],
      venice_parameters: { include_venice_system_prompt: false },
    }),
  });
  if (!res.ok) throw new Error(`Venice ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const content = ((await res.json()) as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content ?? "";
  const m = content.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("staking model returned no JSON");
  const d = JSON.parse(m[0]) as StakeDecision;
  d.amountCspr = Math.floor(Number(d.amountCspr) || 0);
  if (d.confidence > 1) d.confidence = d.confidence / 100;
  return d;
}

/** Deterministic guard: the model's decision must respect the buffer, the minimum, and the cap.
 *  A failing "stake" is forced to hold — the model can't talk its way past the numeric limits. */
/** Deterministic staking evaluation for the main loop — no LLM call on the hot path. Applies
 *  the same reserve-buffer / minimum / cap policy the model is asked to follow, so a cycle can
 *  cheaply decide stake-vs-hold every time and attest it. The standalone autostake.ts keeps the
 *  LLM-reasoned variant. Stakes the largest whole amount that respects the buffer, up to the cap. */
export function evaluateStakingRule(
  idle: number,
  buffer = RESERVE_BUFFER_CSPR,
  min = MIN_DELEGATION,
  max = MAX_STAKE_CSPR,
): StakeDecision {
  const stakeable = Math.min(max, Math.floor(idle - buffer));
  if (stakeable >= min) {
    return { action: "stake", amountCspr: stakeable, confidence: 0.8, reasoningSteps: [
      `Idle ${idle} CSPR, reserve buffer ${buffer} → ${stakeable} stakeable (≥ ${min} minimum).`,
      `Delegating ${stakeable} CSPR for native staking yield; principal recoverable, buffer kept liquid.`,
    ] };
  }
  return { action: "hold", amountCspr: 0, confidence: 0.9, reasoningSteps: [
    `Idle ${idle} CSPR minus ${buffer} buffer = ${Math.max(0, Math.floor(idle - buffer))}, below the ${min} CSPR minimum delegation — holding for liquidity.`,
  ] };
}

export function guardStaking(d: StakeDecision, idle: number): { ok: boolean; reason?: string } {
  if (d.action !== "stake") return { ok: true };
  if (d.amountCspr < MIN_DELEGATION) return { ok: false, reason: `below minimum delegation (${d.amountCspr} < ${MIN_DELEGATION})` };
  if (d.amountCspr > MAX_STAKE_CSPR) return { ok: false, reason: `over per-decision cap (${d.amountCspr} > ${MAX_STAKE_CSPR})` };
  if (idle - d.amountCspr < RESERVE_BUFFER_CSPR) return { ok: false, reason: `would breach the ${RESERVE_BUFFER_CSPR} CSPR reserve buffer` };
  return { ok: true };
}

async function main() {
  // Separation of duties: the AGENT decides + attests the reasoning (AttestationLog accepts its
  // key); the CUSTODIAN — the treasury authority that holds the CSPR — executes any delegation.
  const agent = loadPrivateKey(config.agentKeyPath);
  const custodian = loadPrivateKey(config.custodianKeyPath);
  const idle = await readIdleCspr(custodian.publicKey.toHex());
  const alreadyStaked = Number(process.env.STAKE_CURRENT || "500"); // known current position
  console.log(`Idle CSPR: ${idle} · already staked: ${alreadyStaked} · buffer: ${RESERVE_BUFFER_CSPR}`);

  let d = await decideStaking(idle, alreadyStaked);
  console.log(`  model decision: ${d.action}${d.action === "stake" ? ` ${d.amountCspr} CSPR` : ""} (conf ${d.confidence})`);
  d.reasoningSteps?.forEach((s) => console.log(`    · ${s}`));

  const guard = guardStaking(d, idle);
  if (!guard.ok) {
    console.log(`  ⚠ guard forced HOLD: ${guard.reason}`);
    d = { action: "hold", amountCspr: 0, confidence: d.confidence, reasoningSteps: [...(d.reasoningSteps ?? []), `GUARD: forced to hold — ${guard.reason}`] };
  }

  // Attest the yield decision on-chain, exactly like an RWA decision — proof-of-reasoning for
  // the staking action, not just a log line.
  const decision: Decision = {
    riskScore: 0.2, action: d.action === "stake" ? "stake" : "hold",
    fromAsset: "CSPR", toAsset: "CSPR", amount: d.amountCspr, confidence: d.confidence,
    reasoningSteps: d.reasoningSteps ?? [],
  };
  const blob: ReasoningBlob = {
    cycle: Number(process.env.CYCLE ?? Date.parse(new Date().toISOString().slice(0, 10)) / 86_400_000 | 0),
    pubkey: agent.publicKey.toHex(),
    prices: { note: "staking decision — inputs are treasury balances, not market prices", idle, alreadyStaked, bufferCspr: RESERVE_BUFFER_CSPR, nativeAprPct: NATIVE_APR_PCT } as unknown as ReasoningBlob["prices"],
    premiumSignal: null,
    decision,
    model: config.model,
    at: new Date().toISOString(),
  };

  if (config.dryRun) {
    console.log("  ◌ DRY_RUN: decision made + would attest; nothing sent on-chain.");
    console.log(`  decision: ${JSON.stringify(decision)}`);
    return;
  }

  const attestation = await attest(rpc, agent, blob);
  console.log(`  ⛓  staking decision attested on-chain: ${attestation.deployHash} (hash ${attestation.reasoningHash.slice(0, 16)}…)`);

  if (decision.action === "stake") {
    console.log(`  delegating ${decision.amount} CSPR for native yield…`);
    const dh = await delegate(custodian, decision.amount);
    console.log(`  ✅ delegated autonomously: ${dh}`);
  } else {
    console.log("  → HOLD: the agent chose not to stake this cycle (reserve/minimum respected). Decision is attested.");
  }
}

// Direct-run guard so importing this module (e.g. for the guard unit test) doesn't fire a live
// decision. import.meta.url file:// comparison is unreliable on Windows, so match argv.
if (/autostake\.(ts|js|mts)$/.test(process.argv[1] ?? "")) {
  main().catch((e) => { console.error("FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
}
