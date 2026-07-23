// B4 — deploy PolicyEngine v2 + GovernanceTimelock, hand governance to the timelock, and
// PROVE the queue -> delay -> execute flow live. Run: DRY_RUN=false npx tsx src/deploy-timelock.ts
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadPrivateKey, makeRpcClient, callEntryPoint } from "./casper.js";
import { SessionBuilder, AccountIdentifier, CLValue, Key, Args } from "./sdk.js";
import { config } from "./config.js";

const PE_WASM = resolve(import.meta.dirname, "../../contracts/wasm/PolicyEngine.lowered.wasm");
const TL_WASM = resolve(import.meta.dirname, "../../contracts/wasm/GovernanceTimelock.lowered.wasm");
const CUSTODIAN_PEM = resolve(import.meta.dirname, "../secret/custodian_key.pem");
const STATE = resolve(import.meta.dirname, "../../.env.timelock");
const POLICY_VERSION = "6c357c64c137d1597e5663466121ed8e88f00a43abb55dbf9939f0fcb7a064a8";
const DELAY_MS = 60_000; // 60s for the demo; production would be 24-48h.

const agentKey = loadPrivateKey(config.agentKeyPath);
const custodian = loadPrivateKey(CUSTODIAN_PEM);
const rpc = makeRpcClient(config.rpcUrl);

const state: Record<string, string> = {};
if (existsSync(STATE)) for (const l of readFileSync(STATE, "utf8").split("\n")) { const m = l.match(/^([A-Za-z0-9_]+)=(.+)$/); if (m) state[m[1]] = m[2].trim(); }
const save = (k: string, v: string) => { state[k] = v; writeFileSync(STATE, Object.entries(state).map(([a, b]) => `${a}=${b}`).join("\n") + "\n"); };

async function waitForDeploy(hash: string): Promise<void> {
  const deadline = Date.now() + 200_000;
  while (Date.now() < deadline) {
    const r: any = await fetch(config.rpcUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "info_get_deploy", params: { deploy_hash: hash } }) }).then((x) => x.json());
    const info = r?.result?.execution_info;
    if (info?.execution_result) { const v2 = info.execution_result.Version2 ?? info.execution_result; if (v2?.error_message) throw new Error(`reverted: ${v2.error_message}`); return; }
    await new Promise((res) => setTimeout(res, 4000));
  }
  throw new Error("timed out");
}

async function install(signer: typeof custodian, wasmPath: string, keyName: string, initArgs: Record<string, unknown>): Promise<string> {
  const bytes = new Uint8Array(readFileSync(wasmPath));
  const tx = new SessionBuilder().from(signer.publicKey).chainName(config.chainName).wasm(bytes).installOrUpgrade()
    .runtimeArgs(Args.fromMap({
      odra_cfg_package_hash_key_name: CLValue.newCLString(keyName),
      odra_cfg_allow_key_override: CLValue.newCLValueBool(false),
      odra_cfg_is_upgradable: CLValue.newCLValueBool(false),
      odra_cfg_is_upgrade: CLValue.newCLValueBool(false),
      ...initArgs,
    })).payment(320_000_000_000).buildFor1_5();
  tx.sign(signer);
  const dh = (await rpc.putTransaction(tx)).transactionHash.toHex();
  console.log(`  install ${keyName}:`, dh); await waitForDeploy(dh);
  const info = await rpc.getAccountInfo(null, new AccountIdentifier(undefined, signer.publicKey));
  const nk = info.account.namedKeys.find((k) => k.name === keyName);
  if (!nk) throw new Error(`named key ${keyName} absent`);
  return nk.key.toPrefixedString().replace(/^.*-/, "");
}

async function main() {
  if (config.dryRun) throw new Error("DRY_RUN is on — run with DRY_RUN=false");
  const custodianAddr = CLValue.newCLKey(Key.newKey(custodian.publicKey.accountHash().toPrefixedString()));

  if (!state.POLICY_V2) {
    save("POLICY_V2", await install(agentKey, PE_WASM, "amanah_policy_engine_v2_package_hash", {
      owner: custodianAddr,
      confidence_threshold_bps: CLValue.newCLUInt32(7000),
      max_rebalance_bps: CLValue.newCLUInt32(800),
      min_reputation: CLValue.newCLInt64(1),
      policy_version: CLValue.newCLByteArray(Uint8Array.from(Buffer.from(POLICY_VERSION, "hex"))),
    }));
    console.log("  POLICY_V2 =", state.POLICY_V2);
  }
  if (!state.TIMELOCK) {
    save("TIMELOCK", await install(agentKey, TL_WASM, "amanah_governance_timelock_package_hash", {
      owner: custodianAddr,
      policy_engine: CLValue.newCLKey(Key.newKey(`hash-${state.POLICY_V2}`)),
      delay_ms: CLValue.newCLUint64(DELAY_MS),
    }));
    console.log("  TIMELOCK =", state.TIMELOCK);
  }
  // Hand PolicyEngine v2 governance to the timelock — now only the queue can change params.
  if (!state.TRANSFER) {
    const { deployHash } = await callEntryPoint({ rpc, key: custodian, contractHash: state.POLICY_V2, entryPoint: "set_owner", args: Args.fromMap({ new_owner: CLValue.newCLKey(Key.newKey(`hash-${state.TIMELOCK}`)) }), chainName: config.chainName, paymentMotes: config.paymentMotes });
    await waitForDeploy(deployHash); save("TRANSFER", deployHash);
    console.log("  PolicyEngine v2 owner -> timelock:", deployHash);
  }
  // PROVE the flow: queue a change, then execute it after the delay.
  if (!state.QUEUE) {
    const { deployHash } = await callEntryPoint({ rpc, key: custodian, contractHash: state.TIMELOCK, entryPoint: "queue_confidence", args: Args.fromMap({ new_confidence_bps: CLValue.newCLUInt32(7500) }), chainName: config.chainName, paymentMotes: config.paymentMotes });
    await waitForDeploy(deployHash); save("QUEUE", deployHash);
    console.log("  queued confidence -> 0.75:", deployHash);
  }
  if (!state.EXECUTE) {
    console.log(`  waiting out the ${DELAY_MS / 1000}s timelock delay…`);
    await new Promise((res) => setTimeout(res, DELAY_MS + 8000));
    const { deployHash } = await callEntryPoint({ rpc, key: agentKey, contractHash: state.TIMELOCK, entryPoint: "execute_confidence", args: Args.fromMap({}), chainName: config.chainName, paymentMotes: config.paymentMotes });
    await waitForDeploy(deployHash); save("EXECUTE", deployHash);
    console.log("  executed after delay (anyone can):", deployHash);
  }
  console.log("\n=== B4 timelock governance live ===");
  console.log("PolicyEngine v2:", state.POLICY_V2, "| Timelock:", state.TIMELOCK);
  console.log("queue:", state.QUEUE, "| execute:", state.EXECUTE);
}

main().catch((e) => { console.error("FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
