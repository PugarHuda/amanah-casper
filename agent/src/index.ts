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
import { recordPayment } from "./reputation.js";
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

  // 3. REASON
  const decision = await reason(cycle, prices, premiumSignal);
  log(cycle, "reason", decision);

  // 4. ATTEST — hash + sign + record reasoning on-chain.
  const blob: ReasoningBlob = {
    cycle,
    prices,
    premiumSignal,
    decision,
    model: config.model,
    at: new Date().toISOString(),
  };
  const attestation = await attest(rpc, key, blob);
  log(cycle, "attest", attestation);
  console.log(`  ⛓  attest deploy: ${attestation.deployHash}`);

  // 5. GUARDRAIL / CONFIDENCE
  if (shouldEscalate(decision)) {
    await escalateToHuman(decision, attestation.reasoningHash);
    log(cycle, "escalate", { confidence: decision.confidence });
    return;
  }
  if (decision.action !== "rebalance" || decision.amount <= 0) {
    log(cycle, "hold", { reason: "no reallocation this cycle" });
    return;
  }

  // 6. EXECUTE — RwaVault.reallocate (SpendGate + Compliance gated on-chain).
  const execHash = await executeReallocation(
    rpc,
    key,
    decision,
    attestation.reasoningHash,
  );
  log(cycle, "execute", { deployHash: execHash });
  console.log(`  ⛓  reallocate deploy: ${execHash}`);

  // 7. REPUTATION — credit the x402 payment proof, if we have one.
  if (x402DeployHash) {
    const repHash = await recordPayment(rpc, key, x402DeployHash);
    log(cycle, "reputation", { deployHash: repHash });
    console.log(`  ⛓  reputation deploy: ${repHash}`);
  }
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
