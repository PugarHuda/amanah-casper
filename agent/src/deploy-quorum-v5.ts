// Deploy AuditorQuorum v4 — the interactive quorum. Same contract, now with a
// CALLER-AUTHENTICATED voting path (`vote_as_caller`) and an open registry
// (`open_register`), so an auditor can cast a REAL on-chain vote straight from a browser
// wallet: the wallet signs the deploy, the contract trusts the on-chain caller identity —
// no detached message signature (which a wallet can't produce in our format) needed.
//
// This deploy is ADDITIVE and isolated: the vault keeps enforcing via the proven v3
// quorum (signed votes from the agent's auditors). v4 exists so a human — a judge — can
// participate. We seed one approval on a pending decision so a single connecting auditor
// becomes the DECIDING vote that flips `approved()` true, live.
//
// Run: DRY_RUN=false npx tsx src/deploy-quorum-v4.ts
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadPrivateKey, makeRpcClient, callEntryPoint } from "./casper.js";
import { SessionBuilder, AccountIdentifier, CLValue, CLTypeByteArray, CLTypePublicKey, Args, Key } from "./sdk.js";
import { config } from "./config.js";

const WASM = resolve(import.meta.dirname, "../../contracts/wasm/AuditorQuorum.lowered.wasm");
const SECRET_DIR = resolve(import.meta.dirname, "../secret");
const CUSTODIAN_PEM = resolve(SECRET_DIR, "custodian_key.pem");
const STATE = resolve(import.meta.dirname, "../../.env.quorumv5");
const KEY_NAME = "amanah_auditor_quorum_v5_package_hash";
const INSTANCE_ID = "c3".repeat(32).slice(0, 64);
// The decision a connecting auditor is asked to vote on. A real reasoning hash from an
// attested cycle — the thing an auditor actually reviews.
const PENDING_HASH = "7c409e7bfce729cea460c03d3557277ad14e12da2b5d1a82c35860b60fba2df4";

const agentKey = loadPrivateKey(config.agentKeyPath);
const custodian = loadPrivateKey(CUSTODIAN_PEM);
const rpc = makeRpcClient(config.rpcUrl);
const pub = agentKey.publicKey;

const state: Record<string, string> = {};
if (existsSync(STATE)) for (const l of readFileSync(STATE, "utf8").split("\n")) {
  const m = l.match(/^([A-Za-z0-9_]+)=(.+)$/); if (m) state[m[1]] = m[2].trim();
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

const hashBytes = Uint8Array.from(Buffer.from(PENDING_HASH, "hex"));

async function main() {
  if (config.dryRun) throw new Error("DRY_RUN is on — run with DRY_RUN=false");

  if (!state.QUORUM) {
    const wasm = new Uint8Array(readFileSync(WASM));
    const tx = new SessionBuilder().from(pub).chainName(config.chainName).wasm(wasm).installOrUpgrade()
      .runtimeArgs(Args.fromMap({
        odra_cfg_package_hash_key_name: CLValue.newCLString(KEY_NAME),
        odra_cfg_allow_key_override: CLValue.newCLValueBool(false),
        odra_cfg_is_upgradable: CLValue.newCLValueBool(false),
        odra_cfg_is_upgrade: CLValue.newCLValueBool(false),
        // The signed-vote auditors (the agent's panel). The browser path uses the open
        // registry instead, but init still needs at least one and a threshold.
        auditors: CLValue.newCLList(CLTypePublicKey, [CLValue.newCLPublicKey(custodian.publicKey)]),
        threshold: CLValue.newCLUInt32(2), // 2-of-N: one seeded vote + the connecting auditor
        instance_id: CLValue.newCLByteArray(Uint8Array.from(Buffer.from(INSTANCE_ID, "hex"))),
        // B6: the custodian may slash staked auditors; a staked registration must attach >= 100 CSPR.
        slasher: CLValue.newCLKey(Key.newKey(custodian.publicKey.accountHash().toPrefixedString())),
        min_stake: CLValue.newCLUInt512("100000000000"),
      })).payment(320_000_000_000).buildFor1_5();
    tx.sign(agentKey);
    const dh = (await rpc.putTransaction(tx)).transactionHash.toHex();
    console.log("deploy AuditorQuorum v4:", dh, "— waiting..."); await waitForDeploy(dh);
    const info = await rpc.getAccountInfo(null, new AccountIdentifier(undefined, pub));
    const nk = info.account.namedKeys.find((k) => k.name === KEY_NAME);
    if (!nk) throw new Error("named key absent");
    save("QUORUM", nk.key.toPrefixedString().replace(/^.*-/, ""));
    console.log("  QUORUM =", state.QUORUM);
  }

  // Seed ONE approval from the custodian (a demo auditor) via the caller-auth path, so a
  // single connecting auditor becomes the deciding second vote.
  if (!state.SEED_REGISTER) {
    const { deployHash } = await callEntryPoint({ rpc, key: custodian, contractHash: state.QUORUM,
      entryPoint: "open_register", args: Args.fromMap({}), chainName: config.chainName, paymentMotes: config.paymentMotes });
    console.log("  custodian open_register:", deployHash); await waitForDeploy(deployHash); save("SEED_REGISTER", deployHash);
  }
  if (!state.SEED_VOTE) {
    const { deployHash } = await callEntryPoint({ rpc, key: custodian, contractHash: state.QUORUM, entryPoint: "vote_as_caller",
      args: Args.fromMap({ reasoning_hash: CLValue.newCLByteArray(hashBytes), approve: CLValue.newCLValueBool(true) }),
      chainName: config.chainName, paymentMotes: config.paymentMotes });
    console.log("  custodian vote_as_caller APPROVE:", deployHash); await waitForDeploy(deployHash); save("SEED_VOTE", deployHash);
  }

  console.log("\n=== AuditorQuorum v4 live ===");
  console.log("QUORUM       :", state.QUORUM);
  console.log("INSTANCE_ID  :", INSTANCE_ID);
  console.log("PENDING_HASH :", PENDING_HASH, "(1/2 approvals seeded — a browser auditor casts the 2nd)");
  console.log("STAKING      : min_stake 100 CSPR, slasher = custodian. register_with_stake/slash/");
  console.log("               withdraw_stake are live entrypoints; the free open_register keeps the");
  console.log("               browser demo frictionless. (Native-CSPR stake needs Odra's proxy-caller");
  console.log("               to attach value from a direct deploy — OdraVM tests prove stake->slash->burn.)");
}


main().catch((e) => { console.error("FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
