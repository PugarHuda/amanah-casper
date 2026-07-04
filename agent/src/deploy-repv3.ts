// Redeploy ReputationRegistry v3: `adjust` is now GATED to an authority (the
// custodian), so the auditor can slash the agent's score on a VETO and nobody can
// tamper with scores. Deploys with init(authority = custodian), re-credits the
// agent's real x402 settlement, and proves the gated slash+reward on live testnet.
// Run: DRY_RUN=false npx tsx src/deploy-repv3.ts
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadPrivateKey, makeRpcClient, callEntryPoint } from "./casper.js";
import { SessionBuilder, AccountIdentifier, CLValue, CLTypeUInt8, Key, Args } from "./sdk.js";
import { recordPayment } from "./reputation.js";
import { config } from "./config.js";

const WASM = resolve(import.meta.dirname, "../../contracts/wasm/ReputationRegistry.lowered.wasm");
const CUSTODIAN_PEM = resolve(import.meta.dirname, "../secret/custodian_key.pem");
const STATE = resolve(import.meta.dirname, "../../.env.repv3");
const KEY_NAME = "amanah_reputation_v3_package_hash";
const X402_SETTLEMENT = "391274dcad1ebd7dd2641bd94aa17893084adf76f58b5603d7d69c0c4cce4398";

const key = loadPrivateKey(config.agentKeyPath);
const custodian = loadPrivateKey(CUSTODIAN_PEM);
const rpc = makeRpcClient(config.rpcUrl);
const pub = key.publicKey;
const agentAddr = CLValue.newCLKey(Key.newKey(pub.accountHash().toPrefixedString()));

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

/** adjust(addr, delta, outcome_ref) — custodian-only. */
async function adjust(delta: number, outcomeRef: number[]): Promise<string> {
  const args = Args.fromMap({
    addr: agentAddr,
    delta: CLValue.newCLInt64(delta),
    _outcome_ref: CLValue.newCLByteArray(new Uint8Array(outcomeRef)),
  });
  const { deployHash } = await callEntryPoint({
    rpc, key: custodian, contractHash: state.REP_V3, entryPoint: "adjust", args,
    chainName: config.chainName, paymentMotes: config.paymentMotes,
  });
  return deployHash;
}

async function main() {
  if (config.dryRun) throw new Error("DRY_RUN is on — run with DRY_RUN=false");
  console.log("agent    ", pub.toHex());
  console.log("custodian", custodian.publicKey.toHex(), "(reputation authority)\n");

  if (!state.REP_V3) {
    const wasm = new Uint8Array(readFileSync(WASM));
    const tx = new SessionBuilder().from(pub).chainName(config.chainName).wasm(wasm).installOrUpgrade()
      .runtimeArgs(Args.fromMap({
        odra_cfg_package_hash_key_name: CLValue.newCLString(KEY_NAME),
        odra_cfg_allow_key_override: CLValue.newCLValueBool(false),
        odra_cfg_is_upgradable: CLValue.newCLValueBool(false),
        odra_cfg_is_upgrade: CLValue.newCLValueBool(false),
        authority: CLValue.newCLKey(Key.newKey(custodian.publicKey.accountHash().toPrefixedString())),
      })).payment(300_000_000_000).buildFor1_5();
    tx.sign(key);
    const dh = (await rpc.putTransaction(tx)).transactionHash.toHex();
    console.log("deploy ReputationRegistry v3:", dh, "— waiting...");
    await waitForDeploy(dh);
    const info = await rpc.getAccountInfo(null, new AccountIdentifier(undefined, pub));
    const nk = info.account.namedKeys.find((k) => k.name === KEY_NAME);
    if (!nk) throw new Error("named key absent — install reverted");
    save("REP_V3", nk.key.toPrefixedString().replace(/^.*-/, ""));
    console.log("  REP_V3 =", state.REP_V3);
  }

  // Re-credit the agent's real x402 settlement (caller == payer). Score -> 1.
  if (!state.CREDITED) {
    const prev = config.reputationRegistryHash;
    (config as { reputationRegistryHash: string }).reputationRegistryHash = state.REP_V3;
    const dh = await recordPayment(rpc, key, X402_SETTLEMENT);
    (config as { reputationRegistryHash: string }).reputationRegistryHash = prev;
    console.log("record_payment (agent credits itself):", dh, "-> score 1");
    save("CREDITED", dh);
  }

  // Live proof the gated adjust works both ways: custodian slashes -1 then rewards
  // +1 (net 0, ends at score 1). A non-authority call is proven to revert in the
  // OdraVM test `adjust_is_gated_to_the_authority`.
  if (!state.SLASH) { const dh = await adjust(-1, Array(32).fill(1)); console.log("custodian slash -1:", dh, "-> score 0"); save("SLASH", dh); }
  if (!state.REWARD) { const dh = await adjust(1, Array(32).fill(2)); console.log("custodian reward +1:", dh, "-> score 1"); save("REWARD", dh); }

  console.log("\n=== DONE ===\nREP_V3 package:", state.REP_V3);
  console.log("Next: find the state seed via query_global_state, then re-wire agent/mcp/web envs.");
}

main().catch((e) => { console.error("FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
