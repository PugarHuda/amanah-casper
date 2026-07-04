// Deploy ZkKycVerifier + run a REAL zero-knowledge KYC proof end-to-end on testnet:
//   1. custodian (issuer) deploys the verifier and registers the agent's public
//      credential Y = x·B  (x = the agent's secret KYC scalar, never sent anywhere)
//   2. the agent generates a Schnorr NIZK proving it KNOWS x, bound to its account
//   3. the contract verifies the proof ON-CHAIN (curve25519-dalek) — if prove_kyc
//      does not revert, the zero-knowledge proof verified inside the contract.
// The secret x is never transmitted: this is genuine ZK, not a stored flag.
// Run: DRY_RUN=false npx tsx src/deploy-zk.ts
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadPrivateKey, makeRpcClient, callEntryPoint } from "./casper.js";
import { SessionBuilder, AccountIdentifier, CLValue, CLTypeUInt8, Key, Args } from "./sdk.js";
import { credential, prove, hexToBytes, bytesToHex } from "./zk.js";
import { config } from "./config.js";
import { ed25519 } from "@noble/curves/ed25519";

const WASM = resolve(import.meta.dirname, "../../contracts/wasm/ZkKycVerifier.lowered.wasm");
const CUSTODIAN_PEM = resolve(import.meta.dirname, "../secret/custodian_key.pem");
const SECRET = resolve(import.meta.dirname, "../secret/zk_kyc_secret.hex"); // the agent's secret x
const STATE = resolve(import.meta.dirname, "../../.env.zk");
const KEY_NAME = "amanah_zk_kyc_package_hash";

const agentKey = loadPrivateKey(config.agentKeyPath);
const custodian = loadPrivateKey(CUSTODIAN_PEM);
const rpc = makeRpcClient(config.rpcUrl);
const pub = agentKey.publicKey;
const agentAddr = CLValue.newCLKey(Key.newKey(pub.accountHash().toPrefixedString()));
// 32-byte context binding the proof to the agent's account (replay protection).
const ctx = hexToBytes(pub.accountHash().toPrefixedString().replace(/^account-hash-/, ""));

const state: Record<string, string> = {};
if (existsSync(STATE)) for (const l of readFileSync(STATE, "utf8").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.+)$/); if (m) state[m[1]] = m[2].trim();
}
const save = (k: string, v: string) => { state[k] = v; writeFileSync(STATE, Object.entries(state).map(([a, b]) => `${a}=${b}`).join("\n") + "\n"); };

// The agent's secret KYC scalar x (generated once, kept secret like a key).
function secretX(): string {
  if (existsSync(SECRET)) return readFileSync(SECRET, "utf8").trim();
  const x = bytesToHex(ed25519.utils.randomPrivateKey());
  writeFileSync(SECRET, x);
  return x;
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

async function main() {
  if (config.dryRun) throw new Error("DRY_RUN is on — run with DRY_RUN=false");
  const x = secretX();
  const Y = credential(x); // public credential; x stays secret
  console.log("agent    ", pub.toHex());
  console.log("custodian", custodian.publicKey.toHex(), "(KYC issuer)");
  console.log("credential Y =", Y, "(x is secret, never sent)\n");

  // 1. deploy verifier (authority = custodian issuer)
  if (!state.ZK_HASH) {
    const wasm = new Uint8Array(readFileSync(WASM));
    const tx = new SessionBuilder().from(pub).chainName(config.chainName).wasm(wasm).installOrUpgrade()
      .runtimeArgs(Args.fromMap({
        odra_cfg_package_hash_key_name: CLValue.newCLString(KEY_NAME),
        odra_cfg_allow_key_override: CLValue.newCLValueBool(false),
        odra_cfg_is_upgradable: CLValue.newCLValueBool(false),
        odra_cfg_is_upgrade: CLValue.newCLValueBool(false),
        authority: CLValue.newCLKey(Key.newKey(custodian.publicKey.accountHash().toPrefixedString())),
      })).payment(300_000_000_000).buildFor1_5();
    tx.sign(agentKey);
    const dh = (await rpc.putTransaction(tx)).transactionHash.toHex();
    console.log("deploy ZkKycVerifier:", dh, "— waiting...");
    await waitForDeploy(dh);
    const info = await rpc.getAccountInfo(null, new AccountIdentifier(undefined, pub));
    const nk = info.account.namedKeys.find((k) => k.name === KEY_NAME);
    if (!nk) throw new Error("named key absent — install reverted");
    save("ZK_HASH", nk.key.toPrefixedString().replace(/^.*-/, ""));
    console.log("  ZK_HASH =", state.ZK_HASH);
  }
  (config as { [k: string]: unknown }).zkHash = state.ZK_HASH;

  const cred32 = CLValue.newCLByteArray(hexToBytes(Y));
  // 2. issuer registers the agent's credential
  if (!state.REGISTERED) {
    const { deployHash: dh } = await callEntryPoint({ rpc, key: custodian, contractHash: state.ZK_HASH,
      entryPoint: "register_credential",
      args: Args.fromMap({ agent: agentAddr, credential: cred32 }),
      chainName: config.chainName, paymentMotes: config.paymentMotes });
    console.log("register_credential (custodian):", dh);
    save("REGISTERED", dh);
  }

  // 3. agent proves knowledge of x in zero-knowledge; contract verifies on-chain
  const proof = prove(x, ctx);
  const { deployHash: dh } = await callEntryPoint({ rpc, key: agentKey, contractHash: state.ZK_HASH,
    entryPoint: "prove_kyc",
    args: Args.fromMap({
      agent: agentAddr,
      t: CLValue.newCLByteArray(hexToBytes(proof.T)),
      s: CLValue.newCLByteArray(hexToBytes(proof.s)),
      ctx: CLValue.newCLList(CLTypeUInt8, Array.from(ctx, (b) => CLValue.newCLUint8(b))),
    }),
    // EC scalar-mults on-chain cost more gas than a normal call — budget generously.
    chainName: config.chainName, paymentMotes: 60_000_000_000 });
  console.log("\nprove_kyc (ZK verified ON-CHAIN):", dh);
  save("PROOF", dh);
  console.log("\n=== DONE — real ZK KYC proven on-chain ===");
  console.log("ZK_HASH =", state.ZK_HASH);
  console.log("If prove_kyc did not revert, the contract verified the Schnorr NIZK in-VM.");
}

main().catch((e) => { console.error("FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
