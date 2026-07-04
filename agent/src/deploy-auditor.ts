// Deploy a SECOND AttestationLog — the "AuditorLog" — registered to the CUSTODIAN
// key. This lets an independent auditor agent (a different key) sign + attest its
// grade of the primary agent's decision on-chain, so every autonomous move carries
// TWO independent on-chain attestations from TWO keys. Uses the existing generic
// AttestationLog.wasm (init just takes a pubkey). Run: DRY_RUN=false npx tsx src/deploy-auditor.ts
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadPrivateKey, makeRpcClient } from "./casper.js";
import { SessionBuilder, AccountIdentifier, CLValue, Args } from "./sdk.js";
import { config } from "./config.js";

const WASM = resolve(import.meta.dirname, "../../contracts/wasm/AttestationLog.lowered.wasm");
const CUSTODIAN_PEM = resolve(import.meta.dirname, "../secret/custodian_key.pem");
const STATE = resolve(import.meta.dirname, "../../.env.auditor");
const KEY_NAME = "amanah_auditor_log_package_hash";

const agentKey = loadPrivateKey(config.agentKeyPath);        // deployer + pays gas
const custodianKey = loadPrivateKey(CUSTODIAN_PEM);          // the auditor's key (registered)
const rpc = makeRpcClient(config.rpcUrl);
const pub = agentKey.publicKey;

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
  console.log("deployer (agent)  ", pub.toHex());
  console.log("auditor key (custodian, registered):", custodianKey.publicKey.toHex(), "\n");

  const wasm = new Uint8Array(readFileSync(WASM));
  const tx = new SessionBuilder().from(pub).chainName(config.chainName).wasm(wasm).installOrUpgrade()
    .runtimeArgs(Args.fromMap({
      odra_cfg_package_hash_key_name: CLValue.newCLString(KEY_NAME),
      odra_cfg_allow_key_override: CLValue.newCLValueBool(false),
      odra_cfg_is_upgradable: CLValue.newCLValueBool(false),
      odra_cfg_is_upgrade: CLValue.newCLValueBool(false),
      // The auditor log is registered to the CUSTODIAN pubkey — only the auditor can attest.
      agent_pubkey: CLValue.newCLPublicKey(custodianKey.publicKey),
    })).payment(300_000_000_000).buildFor1_5();
  tx.sign(agentKey);
  const dh = (await rpc.putTransaction(tx)).transactionHash.toHex();
  console.log("deploy AuditorLog:", dh, "— waiting...");
  await waitForDeploy(dh);

  const info = await rpc.getAccountInfo(null, new AccountIdentifier(undefined, pub));
  const nk = info.account.namedKeys.find((k) => k.name === KEY_NAME);
  if (!nk) throw new Error("named key absent — install reverted");
  const hex = nk.key.toPrefixedString().replace(/^.*-/, "");
  writeFileSync(STATE, `AUDITOR_LOG_HASH=${hex}\n`);
  console.log("\nAUDITOR_LOG_HASH =", hex);
  console.log("Set AUDITOR_LOG_HASH + CUSTODIAN_KEY_PEM in agent/.env, then run a cycle.");
}

main().catch((e) => { console.error("FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
