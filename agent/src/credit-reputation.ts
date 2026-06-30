// Credit the agent's real, settled x402 payment on-chain via
// ReputationRegistry.record_payment(payer, deploy_hash). This is the exact call
// the autonomous loop makes after a paid cycle — we run it standalone here for
// the one real x402 settlement (391274dc…, a CEP-3009 transfer_with_authorization
// that SUCCEEDED on testnet) that wasn't credited because that cycle held.
//
// Honest: the deploy hash is a genuine payment the agent made. record_payment is
// anti-replay (each hash single-use), so this can only ever count it once.
// After this, MCP get_reputation + the agent's score read 1.
//
// Run: DRY_RUN=false npx tsx src/credit-reputation.ts
import { loadPrivateKey, makeRpcClient } from "./casper.js";
import { recordPayment } from "./reputation.js";
import { config } from "./config.js";

// The real x402 settlement (CEP-3009 transfer_with_authorization, SUCCESS).
const X402_SETTLEMENT =
  process.env.X402_SETTLEMENT_HASH ??
  "391274dcad1ebd7dd2641bd94aa17893084adf76f58b5603d7d69c0c4cce4398";

async function main() {
  if (config.dryRun) throw new Error("DRY_RUN is on — run with DRY_RUN=false to submit");
  if (!config.reputationRegistryHash) throw new Error("REPUTATION_REGISTRY_HASH not set in .env");

  const key = loadPrivateKey(config.agentKeyPath);
  const rpc = makeRpcClient(config.rpcUrl);

  console.log("agent     ", key.publicKey.toHex());
  console.log("registry  ", config.reputationRegistryHash);
  console.log("crediting ", X402_SETTLEMENT, "\n");

  const deployHash = await recordPayment(rpc, key, X402_SETTLEMENT);
  console.log("record_payment deploy:", deployHash);
  console.log("verify: https://testnet.cspr.live/deploy/" + deployHash);
  console.log("\nIf this reverts with ReplayedProof, the payment was already credited (score already 1+).");
}

main().catch((e) => {
  console.error("\nFAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
