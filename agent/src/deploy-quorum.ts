// Deploy AuditorQuorum (K-of-N independent auditors) and DEMONSTRATE a real 2-of-3
// quorum on-chain: three distinct auditor keys are authorized; two independently sign
// a decision's reasoning hash and vote APPROVE; the contract verifies each Ed25519
// signature in-VM and, at threshold, `approved(hash)` flips true. No single auditor
// (or the agent) can forge a quorum. Run: DRY_RUN=false npx tsx src/deploy-quorum.ts
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadPrivateKey, makeRpcClient, callEntryPoint } from "./casper.js";
import { SessionBuilder, NativeTransferBuilder, AccountIdentifier, CLValue, CLTypeUInt8, CLTypePublicKey, PrivateKey, KeyAlgorithm, Args } from "./sdk.js";
import type { PrivateKey as PrivateKeyT } from "casper-js-sdk";
import { config } from "./config.js";

const WASM = resolve(import.meta.dirname, "../../contracts/wasm/AuditorQuorum.lowered.wasm");
const SECRET_DIR = resolve(import.meta.dirname, "../secret");
const CUSTODIAN_PEM = resolve(SECRET_DIR, "custodian_key.pem");
const STATE = resolve(import.meta.dirname, "../../.env.quorum");
const KEY_NAME = "amanah_auditor_quorum_package_hash";
// The decision being voted on (a real reasoning hash from the reallocate attestation).
const REASONING_HASH = "7c409e7bfce729cea460c03d3557277ad14e12da2b5d1a82c35860b60fba2df4";

const agentKey = loadPrivateKey(config.agentKeyPath);
const custodian = loadPrivateKey(CUSTODIAN_PEM);
const rpc = makeRpcClient(config.rpcUrl);
const pub = agentKey.publicKey;

const state: Record<string, string> = {};
if (existsSync(STATE)) for (const l of readFileSync(STATE, "utf8").split("\n")) {
  const m = l.match(/^([A-Za-z0-9_]+)=(.+)$/); if (m) state[m[1]] = m[2].trim();
}
const save = (k: string, v: string) => { state[k] = v; writeFileSync(STATE, Object.entries(state).map(([a, b]) => `${a}=${b}`).join("\n") + "\n"); };

// Two extra independent auditor keys (custodian is the third). Generated once, saved.
function loadOrGenAuditor(name: string): PrivateKeyT {
  const pem = resolve(SECRET_DIR, `${name}.pem`);
  if (existsSync(pem)) return loadPrivateKey(pem);
  const k = PrivateKey.generate(KeyAlgorithm.ED25519);
  writeFileSync(pem, k.toPem());
  return loadPrivateKey(pem);
}

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

async function fund(target: PrivateKeyT, key: string): Promise<void> {
  if (state[key]) return;
  const tx = new NativeTransferBuilder().from(pub).target(target.publicKey).amount("120000000000")
    .chainName(config.chainName).payment(100_000_000).buildFor1_5();
  tx.sign(agentKey);
  const dh = (await rpc.putTransaction(tx)).transactionHash.toHex();
  console.log(`  fund ${key}:`, dh); await waitForDeploy(dh); save(key, dh);
}

async function vote(voter: PrivateKeyT, label: string, stateKey: string): Promise<void> {
  if (state[stateKey]) { console.log(`[skip] ${label} already voted`); return; }
  const hashBytes = Uint8Array.from(Buffer.from(REASONING_HASH, "hex"));
  const sig = voter.signAndAddAlgorithmBytes(hashBytes);
  const { deployHash } = await callEntryPoint({ rpc, key: voter, contractHash: state.QUORUM, entryPoint: "vote",
    args: Args.fromMap({
      reasoning_hash: CLValue.newCLByteArray(hashBytes),
      approve: CLValue.newCLValueBool(true),
      signature: CLValue.newCLList(CLTypeUInt8, Array.from(sig, (b) => CLValue.newCLUint8(b))),
      pubkey: CLValue.newCLPublicKey(voter.publicKey),
    }), chainName: config.chainName, paymentMotes: config.paymentMotes });
  console.log(`  ${label} APPROVE:`, deployHash); save(stateKey, deployHash);
}

async function main() {
  if (config.dryRun) throw new Error("DRY_RUN is on — run with DRY_RUN=false");
  const auditor2 = loadOrGenAuditor("auditor2_key");
  const auditor3 = loadOrGenAuditor("auditor3_key");
  console.log("auditors (3 independent keys):");
  console.log("  1 custodian:", custodian.publicKey.toHex());
  console.log("  2 auditor2 :", auditor2.publicKey.toHex());
  console.log("  3 auditor3 :", auditor3.publicKey.toHex(), "\n");

  await fund(auditor2, "FUND2");
  await fund(auditor3, "FUND3");

  if (!state.QUORUM) {
    const wasm = new Uint8Array(readFileSync(WASM));
    const tx = new SessionBuilder().from(pub).chainName(config.chainName).wasm(wasm).installOrUpgrade()
      .runtimeArgs(Args.fromMap({
        odra_cfg_package_hash_key_name: CLValue.newCLString(KEY_NAME),
        odra_cfg_allow_key_override: CLValue.newCLValueBool(false),
        odra_cfg_is_upgradable: CLValue.newCLValueBool(false),
        odra_cfg_is_upgrade: CLValue.newCLValueBool(false),
        auditors: CLValue.newCLList(CLTypePublicKey, [
          CLValue.newCLPublicKey(custodian.publicKey),
          CLValue.newCLPublicKey(auditor2.publicKey),
          CLValue.newCLPublicKey(auditor3.publicKey),
        ]),
        threshold: CLValue.newCLUInt32(2),
      })).payment(300_000_000_000).buildFor1_5();
    tx.sign(agentKey);
    const dh = (await rpc.putTransaction(tx)).transactionHash.toHex();
    console.log("deploy AuditorQuorum:", dh, "— waiting..."); await waitForDeploy(dh);
    const info = await rpc.getAccountInfo(null, new AccountIdentifier(undefined, pub));
    const nk = info.account.namedKeys.find((k) => k.name === KEY_NAME);
    if (!nk) throw new Error("named key absent");
    save("QUORUM", nk.key.toPrefixedString().replace(/^.*-/, ""));
    console.log("  QUORUM =", state.QUORUM);
  }

  // Two of the three independent auditors sign + vote APPROVE -> 2-of-3 quorum passes.
  await vote(custodian, "auditor 1 (custodian)", "VOTE1");
  await vote(auditor2, "auditor 2", "VOTE2");

  console.log("\n=== AUDITOR QUORUM (2-of-3) LIVE ===");
  console.log("QUORUM   :", state.QUORUM);
  console.log("vote #1  :", state.VOTE1);
  console.log("vote #2  :", state.VOTE2, "(quorum reached)");
  console.log("Each vote is an independent on-chain Ed25519 signature from a distinct key.");
}

main().catch((e) => { console.error("FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
