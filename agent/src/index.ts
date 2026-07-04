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
    const repHash = await recordPayment(rpc, key, x402DeployHash);
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

  // 7. GUARDRAIL / CONFIDENCE / AUDITOR
  if (shouldEscalate(decision)) {
    await escalateToHuman(decision, attestation.reasoningHash);
    log(cycle, "escalate", { confidence: decision.confidence });
    return;
  }
  if (decision.action !== "rebalance" || decision.amount <= 0) {
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
    log(cycle, "auditor-veto", { grade: verdict.grade, concerns: verdict.concerns, slashHash });
    return; // the auditor blocked the move — no reallocate
  }

  // 8. EXECUTE — RwaVault.reallocate (SpendGate + Compliance gated on-chain).
  const execHash = await executeReallocation(
    rpc,
    key,
    decision,
    attestation.reasoningHash,
  );
  log(cycle, "execute", { deployHash: execHash });
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
