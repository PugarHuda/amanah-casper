// Amanah autonomous loop:
//   ingest -> pay(x402) -> reason -> attest -> guardrail/confidence -> execute -> reputation
// Each step logs structured output and prints every real deploy hash so the run
// is verifiable on cspr.live (mirrors the Agent-console proof-of-reasoning stream).
import { config } from "./config.js";
import { loadPrivateKey, makeRpcClient } from "./casper.js";
import { ingest } from "./ingest.js";
import { payForSignal } from "./x402.js";
import { reason } from "./reason.js";
import { attest } from "./attest.js";
import {
  executeReallocation,
  shouldEscalate,
  escalateToHuman,
} from "./execute.js";
import { recordPayment, slashAgent } from "./reputation.js";
import { getAgentInsights } from "./cspr-mcp.js";
import { getDexQuote } from "./trade-mcp.js";
import { auditDecision, attestAudit } from "./audit.js";
import { castQuorumVotes } from "./quorum.js";
import { notifyCycle, type CycleReport } from "./notify.js";
import { proveSolvency } from "./solvency.js";
import { governanceContext } from "./governance.js";
import { readVault } from "./read-vault.js";
import type { ReasoningBlob } from "./types.js";

function log(cycle: number, step: string, detail: unknown) {
  console.log(
    JSON.stringify({ at: new Date().toISOString(), cycle, step, detail }),
  );
}

async function runCycle(cycle: number): Promise<void> {
  const key = loadPrivateKey(config.agentKeyPath);
  const rpc = makeRpcClient(config.rpcUrl);

  // 1. INGEST
  const prices = await ingest();
  log(cycle, "ingest", prices);

  // 1b. ENRICH (best-effort) — second, independent source of on-chain truth from
  // the OFFICIAL CSPR.cloud MCP server (agent balance + CSPR/USD rate). Time-bounded
  // and never throws, so it can't stall or break the cycle.
  const insights = await getAgentInsights(key.publicKey.toHex());
  if (insights) log(cycle, "cspr-mcp.insights", insights);

  // 1c. DEX intelligence (best-effort) — live CSPR↔sCSPR quote from the official
  // CSPR.trade DEX MCP, an extra market signal for the CSPR reserve leg.
  const dexQuote = await getDexQuote();
  if (dexQuote) log(cycle, "trade-mcp.quote", dexQuote);

  // 2. PAY (x402) — buy the premium signal; capture settlement deploy hash.
  let premiumSignal: unknown = null;
  let x402DeployHash: string | null = null;
  try {
    const paid = await payForSignal(config.signalUrl, key);
    premiumSignal = paid.data;
    x402DeployHash = paid.deployHash;
    log(cycle, "x402.settle", {
      deployHash: x402DeployHash,
      signal: premiumSignal,
    });
    if (x402DeployHash) console.log(`  ⛓  x402 settle deploy: ${x402DeployHash}`);
  } catch (e) {
    log(cycle, "x402.error", { message: (e as Error).message });
  }

  // 3. REASON — the LLM now reasons over the official-MCP market context too, not
  // just prices + the paid signal. The context is attested in the blob below.
  const marketContext = {
    csprCloud: insights,
    csprTradeDex: dexQuote
      ? { pair: dexQuote.pair, executionPrice: dexQuote.executionPrice, priceImpactPct: dexQuote.priceImpactPct }
      : null,
  };
  const decision = await reason(cycle, prices, premiumSignal, marketContext);
  log(cycle, "reason", decision);

  // 4. ATTEST — hash + sign + record reasoning on-chain.
  const blob: ReasoningBlob = {
    cycle,
    pubkey: key.publicKey.toHex(),
    prices,
    premiumSignal,
    marketContext,
    decision,
    // Recorded IN the signed blob so the attribution is attested on-chain with the
    // decision itself, not kept in a mutable side-channel.
    governance: governanceContext(),
    model: config.model,
    at: new Date().toISOString(),
  };
  const attestation = await attest(rpc, key, blob);
  log(cycle, "attest", attestation);
  console.log(`  ⛓  attest deploy: ${attestation.deployHash}`);

  // 5. REPUTATION — credit the settled x402 payment. This happens on EVERY paid
  // cycle (the payment is real regardless of the hold/escalate/rebalance outcome),
  // so it runs before the branches below — not only on reallocation cycles.
  if (x402DeployHash) {
    // Signed by the CUSTODIAN — record_payment is authority-only so the agent cannot
    // credit itself past the vault's reputation floor. Payer is still the agent.
    const repHash = await recordPayment(
      rpc,
      loadPrivateKey(config.custodianKeyPath),
      x402DeployHash,
      key.publicKey.accountHash().toPrefixedString(),
    );
    log(cycle, "reputation", { deployHash: repHash });
    console.log(`  ⛓  reputation deploy: ${repHash}`);
  }

  // 6. AUDIT — an INDEPENDENT second agent (custodian key) grades the decision and
  // attests its verdict on-chain to a separate AuditorLog. Separation of duties: the
  // agent that decides is not the agent that approves. A veto blocks the reallocate.
  const verdict = await auditDecision(cycle, prices, premiumSignal, marketContext, decision);
  let auditProof: string | undefined;
  if (config.auditorLogHash) {
    try {
      const custodianKey = loadPrivateKey(config.custodianKeyPath);
      const a = await attestAudit(rpc, custodianKey, attestation.reasoningHash, verdict);
      auditProof = a.deployHash;
      console.log(`  ⛓  audit attest (custodian): ${a.deployHash}`);
    } catch (e) {
      log(cycle, "audit.attest.error", { message: (e as Error).message });
    }
  }
  log(cycle, "audit", { approved: verdict.approved, grade: verdict.grade, concerns: verdict.concerns, deployHash: auditProof });

  // Operator notification for EVERY outcome (not just escalations) — the on-call human
  // gets the verdict plus every deploy hash as a cspr.live link, and can verify it.
  const report = (outcome: CycleReport["outcome"], extra: Partial<CycleReport> = {}) =>
    notifyCycle({
      cycle,
      action: `${decision.action} ${decision.amount} ${decision.fromAsset}->${decision.toAsset}`,
      summary: decision.reasoningSteps?.[0] ?? "(no reasoning step recorded)",
      confidence: decision.confidence ?? null,
      reasoningHash: attestation.reasoningHash,
      attestDeploy: attestation.deployHash,
      x402Deploy: x402DeployHash || undefined,
      auditDeploy: auditProof,
      auditorApproved: verdict.approved,
      outcome,
      ...extra,
    });

  // 7. GUARDRAIL / CONFIDENCE / AUDITOR
  if (shouldEscalate(decision)) {
    await escalateToHuman(decision, attestation.reasoningHash);
    await report("escalated");
    log(cycle, "escalate", { confidence: decision.confidence });
    return;
  }
  if (decision.action !== "rebalance" || decision.amount <= 0) {
    await report("held");
    log(cycle, "hold", { reason: "no reallocation this cycle" });
    return;
  }
  if (!verdict.approved) {
    // Skin in the game: the custodian (registry authority) slashes the agent's
    // reputation for a vetoed move, linked to the on-chain veto that justified it.
    let slashHash: string | undefined;
    if (config.reputationRegistryHash && auditProof) {
      try {
        const custodianKey = loadPrivateKey(config.custodianKeyPath);
        slashHash = await slashAgent(rpc, custodianKey, key.publicKey.accountHash().toPrefixedString(), 1, auditProof);
        console.log(`  ⛓  reputation slash (custodian): ${slashHash}`);
      } catch (e) {
        log(cycle, "slash.error", { message: (e as Error).message });
      }
    }
    await escalateToHuman(decision, attestation.reasoningHash);
    await report("vetoed");
    log(cycle, "auditor-veto", { grade: verdict.grade, concerns: verdict.concerns, slashHash });
    return; // the auditor blocked the move — no reallocate
  }

  // 7b. QUORUM — the vault ENFORCES a K-of-N auditor quorum: reallocate reverts
  // NotApproved unless the independent auditors have signed APPROVE for THIS decision
  // hash on-chain. Collect those votes before attempting the move.
  const quorumVotes = await castQuorumVotes(rpc, attestation.reasoningHash);
  if (quorumVotes.length) {
    log(cycle, "quorum", { votes: quorumVotes });
    console.log(`  ⛓  quorum votes: ${quorumVotes.length} (${quorumVotes[0].slice(0, 10)}…)`);
  }

  // 8. EXECUTE — RwaVault.reallocate (SpendGate + Compliance + QUORUM gated on-chain).
  const execHash = await executeReallocation(
    rpc,
    key,
    decision,
    attestation.reasoningHash,
  );
  await report("executed", { reallocateDeploy: execHash, quorumVotes });
  log(cycle, "execute", { deployHash: execHash });

  // 9. PROVE SOLVENCY — every cycle, from the vault's REAL post-move allocations. A
  // point-in-time proof says nothing about the periods around it; proving each cycle is
  // what makes this a control operating over a period rather than a snapshot.
  try {
    const v = await readVault();
    const s = await proveSolvency(rpc, key, [
      v.holdings.Gold, v.holdings.TBond, v.holdings.WTI, v.holdings.CSPR,
    ], v.principal);
    if (s) {
      log(cycle, "solvency", { deployHash: s.deployHash, total: s.total.toString(), principal: s.principal.toString() });
      console.log(`  ⛓  solvency proof (ZK, on-chain): ${s.deployHash}`);
    }
  } catch (e) {
    log(cycle, "solvency.error", { message: (e as Error).message });
  }
  console.log(`  ⛓  reallocate deploy: ${execHash}`);
}

async function main(): Promise<void> {
  console.log(
    `Amanah agent starting — cycle every ${config.cycleMs}ms on ${config.chainName}` +
      (config.dryRun
        ? "\n  ◌ DRY_RUN: real ingest + Venice reasoning + Ed25519 signing; on-chain submissions are logged, not sent."
        : ""),
  );
  const maxCycles = Number(process.env.MAX_CYCLES ?? 0); // 0 = run forever
  let cycle = 1;
  // First run immediately, then on the interval.
  for (;;) {
    try {
      await runCycle(cycle);
    } catch (e) {
      log(cycle, "cycle.error", { message: (e as Error).message });
    }
    if (maxCycles && cycle >= maxCycles) break;
    cycle++;
    await new Promise((r) => setTimeout(r, config.cycleMs));
  }
}

main().catch((e) => {
  console.error("fatal:", e);
  process.exit(1);
});
