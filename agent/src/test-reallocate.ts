// One-off: probe RwaVault.reallocate ARG ENCODING against the live contract.
// We don't expect a successful move (allocations are 0, agent isn't allowlisted/
// KYC'd) — we only care WHICH revert we get:
//   * a low "User error: N" (a SpendGate/Compliance/Vault domain error) => the
//     AssetId(u8)/U256/[u8;32] args deserialized fine. ENCODING OK.
//   * "User error: 645xx" (EarlyEndOfStream etc.) => a codec mismatch to fix,
//     like the attest signature was.
// Run: npx tsx src/test-reallocate.ts
import { loadPrivateKey, makeRpcClient } from "./casper.js";
import { executeReallocation } from "./execute.js";
import { config } from "./config.js";
import type { Decision } from "./types.js";

const key = loadPrivateKey(config.agentKeyPath);
const rpc = makeRpcClient(config.rpcUrl);

const decision: Decision = {
  riskScore: 0,
  action: "rebalance",
  fromAsset: "Gold",
  toAsset: "TBond",
  amount: 1,
  reasoningSteps: ["encoding probe"],
  confidence: 1,
};
// A real, already-attested reasoning hash from the live smoke test.
const attHash = "7c409e7bfce729cea460c03d3557277ad14e12da2b5d1a82c35860b60fba2df4";

try {
  const dh = await executeReallocation(rpc, key, decision, attHash);
  console.log("reallocate SUCCEEDED (unexpected but fine):", dh);
} catch (e) {
  console.log("reallocate reverted:", e instanceof Error ? e.message : e);
}
