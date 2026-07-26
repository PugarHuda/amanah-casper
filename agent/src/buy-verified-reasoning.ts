// Demonstrate the EARN side of two-sided x402: a BUYER (the custodian, which holds
// PaymentToken from selling /alpha) pays Amanah for its verified proof-of-reasoning.
// The settlement credits Amanah's own account — Amanah genuinely EARNS on-chain.
// Run (with the signal-service up): DRY_RUN=false npx tsx src/buy-verified-reasoning.ts
import { resolve } from "node:path";
import { loadPrivateKey } from "./casper.js";
import { payForSignal, verifySettlement } from "./x402.js";
import { config } from "./config.js";

const CUSTODIAN_PEM = resolve(import.meta.dirname, "../secret/custodian_key.pem");
const URL = process.env.VERIFIED_REASONING_URL ?? "http://localhost:8402/verified-reasoning";

async function main() {
  const buyer = loadPrivateKey(CUSTODIAN_PEM); // the custodian acts as an external buyer
  console.log("buyer (custodian):", buyer.publicKey.toHex());
  console.log("buying:", URL, "-> settles to Amanah (the earn side)\n");

  const { data, deployHash } = await payForSignal(URL, buyer);
  console.log("earn settlement deploy:", deployHash ?? "(none — check facilitator/balance)");
  const d = data as { reasoningHash?: string; verified?: boolean } | null;
  if (d?.reasoningHash) console.log("product: verified-reasoning for", d.reasoningHash, "| verified:", d.verified);
  if (!deployHash) { console.error("FAILED: no settlement hash returned"); process.exit(1); }

  // A returned hash is a claim — confirm it actually executed on-chain before declaring the earn.
  console.log("verifying the settlement executed on-chain…");
  const v = await verifySettlement(config.rpcUrl, deployHash);
  if (!v.ok) { console.error(`SETTLEMENT REVERTED: ${v.error} — Amanah did NOT earn (hash ${deployHash})`); process.exit(1); }
  console.log("\n✅ Amanah EARNED: a buyer paid it for verified reasoning, settled on-chain. Verify: cspr.live/deploy/" + deployHash);
}

main().catch((e) => { console.error("FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
