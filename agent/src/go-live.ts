// Make RwaVault.reallocate genuinely succeed on the live deployment, then prove it.
// Three real txs: (1) allowlist the agent in SpendGate (owner-only — the agent IS
// the owner), (2) mark the agent Valid in ComplianceRegistry, (3) one real
// reallocate of $50k yield Gold->TBond (< $100k per-tx cap, < $1M daily limit, and
// total is conserved so the principal invariant holds). Prints all three tx hashes
// for testnet.cspr.live. Idempotent: steps 1-2 are set-then-true, safe to re-run.
// Run: npx tsx src/go-live.ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadPrivateKey, makeRpcClient, callEntryPoint } from "./casper.js";
import { CLValue, Key, Args } from "./sdk.js";
import { executeReallocation } from "./execute.js";
import { config } from "./config.js";
import type { Decision } from "./types.js";

function envDeployed(name: string): string {
  const file = resolve(import.meta.dirname, "../../.env.deployed");
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.+)$/);
    if (m && m[1] === name) return m[2].trim();
  }
  throw new Error(`${name} not found in .env.deployed`);
}

const key = loadPrivateKey(config.agentKeyPath);
const rpc = makeRpcClient(config.rpcUrl);
// Same Address representation the vault stored as `agent` and uses as `target`.
const accountKey = Key.newKey(key.publicKey.accountHash().toPrefixedString());
const agentAddr = CLValue.newCLKey(accountKey);

const spendGate = envDeployed("SPEND_GATE_HASH");
const compliance = envDeployed("COMPLIANCE_HASH");

async function main() {
  if (config.dryRun) throw new Error("DRY_RUN is on — run with DRY_RUN=false to submit");
  console.log("agent ", key.publicKey.toHex());
  console.log("vault ", config.rwaVaultHash, "\n");

  const allow = await callEntryPoint({
    rpc, key, contractHash: spendGate, entryPoint: "add_allowlist",
    args: Args.fromMap({ addr: agentAddr }),
    chainName: config.chainName, paymentMotes: config.paymentMotes,
  });
  console.log("1/3 add_allowlist     ", allow.deployHash);

  const valid = await callEntryPoint({
    rpc, key, contractHash: compliance, entryPoint: "set_status",
    // Status::Valid = fieldless odra_type enum variant 1 (u8). identity_hash = [u8;32].
    args: Args.fromMap({
      addr: agentAddr,
      status: CLValue.newCLUint8(1),
      identity_hash: CLValue.newCLByteArray(new Uint8Array(32)),
    }),
    chainName: config.chainName, paymentMotes: config.paymentMotes,
  });
  console.log("2/3 set_status(Valid) ", valid.deployHash);

  const decision: Decision = {
    riskScore: 0, action: "rebalance", fromAsset: "Gold", toAsset: "TBond",
    amount: 50_000_000_000, reasoningSteps: ["go-live reallocate"], confidence: 1,
  };
  // A real, already-attested reasoning hash from the live smoke test.
  const attHash = "7c409e7bfce729cea460c03d3557277ad14e12da2b5d1a82c35860b60fba2df4";
  const dh = await executeReallocation(rpc, key, decision, attHash);
  console.log("3/3 reallocate $50k   ", dh, "  <-- SUCCEEDED");
}

main().catch((e) => {
  console.error("\nFAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
