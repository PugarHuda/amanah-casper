// Redeploy the HARDENED ReputationRegistry (record_payment now requires caller ==
// payer — you can't credit someone else) and re-credit the agent's real x402
// payment so the score reads 1 again on the new contract. Uses the freshly-lowered
// wasm. Run: DRY_RUN=false npx tsx src/redeploy-reputation.ts
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadPrivateKey, makeRpcClient, callEntryPoint } from "./casper.js";
import { SessionBuilder, AccountIdentifier, CLValue, Key, Args } from "./sdk.js";
import { recordPayment } from "./reputation.js";
import { config } from "./config.js";

const WASM = resolve(import.meta.dirname, "../../contracts/wasm/ReputationRegistry.lowered.wasm");
const STATE = resolve(import.meta.dirname, "../../.env.repv2");
const KEY_NAME = "amanah_reputation_v2_package_hash";
const X402_SETTLEMENT = "391274dcad1ebd7dd2641bd94aa17893084adf76f58b5603d7d69c0c4cce4398";

const key = loadPrivateKey(config.agentKeyPath);
const rpc = makeRpcClient(config.rpcUrl);
const pub = key.publicKey;

const state: Record<string, string> = {};
if (existsSync(STATE)) for (const l of readFileSync(STATE, "utf8").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.+)$/); if (m) state[m[1]] = m[2].trim();
}
const save = (k: string, v: string) => { state[k] = v; writeFileSync(STATE, Object.entries(state).map(([a, b]) => `${a}=${b}`).join("\n") + "\n"); };

async function waitForDeploy(hash: string): Promise<void> {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const r = await fetch(config.rpcUrl, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "info_get_deploy", params: { deploy_hash: hash } }) }).then((x) => x.json() as Promise<any>);
    const info = r?.result?.execution_info;
    if (info?.execution_result) {
      const v2 = info.execution_result.Version2 ?? info.execution_result;
      if (v2?.error_message) throw new Error(`reverted: ${v2.error_message}`);
      return;
    }
    await new Promise((res) => setTimeout(res, 4000));
  }
  throw new Error(`timed out waiting for ${hash}`);
}

async function main() {
  if (config.dryRun) throw new Error("DRY_RUN is on — run with DRY_RUN=false");
  console.log("agent", pub.toHex(), "\n");

  if (!state.REP_V2) {
    const wasm = new Uint8Array(readFileSync(WASM));
    const tx = new SessionBuilder().from(pub).chainName(config.chainName).wasm(wasm).installOrUpgrade()
      .runtimeArgs(Args.fromMap({
        odra_cfg_package_hash_key_name: CLValue.newCLString(KEY_NAME),
        odra_cfg_allow_key_override: CLValue.newCLValueBool(false),
        odra_cfg_is_upgradable: CLValue.newCLValueBool(false),
        odra_cfg_is_upgrade: CLValue.newCLValueBool(false),
      })).payment(300_000_000_000).buildFor1_5();
    tx.sign(key);
    const dh = (await rpc.putTransaction(tx)).transactionHash.toHex();
    console.log("deploy ReputationRegistry v2:", dh, "— waiting...");
    await waitForDeploy(dh);
    const info = await rpc.getAccountInfo(null, new AccountIdentifier(undefined, pub));
    const nk = info.account.namedKeys.find((k) => k.name === KEY_NAME);
    if (!nk) throw new Error("named key absent — install reverted");
    save("REP_V2", nk.key.toPrefixedString().replace(/^.*-/, ""));
    console.log("  REP_V2 =", state.REP_V2);
  }

  // Re-credit: caller == payer (the agent), so the hardened guard passes.
  if (!state.CREDITED) {
    const prev = config.reputationRegistryHash;
    (config as { reputationRegistryHash: string }).reputationRegistryHash = state.REP_V2;
    const dh = await recordPayment(rpc, key, X402_SETTLEMENT);
    (config as { reputationRegistryHash: string }).reputationRegistryHash = prev;
    console.log("record_payment (agent credits itself):", dh);
    save("CREDITED", dh);
  }

  console.log("\n=== DONE ===\nREP_V2 package:", state.REP_V2);
  console.log("Next: find the state seed + contract hash via query_global_state, then re-wire.");
}

main().catch((e) => { console.error("FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
