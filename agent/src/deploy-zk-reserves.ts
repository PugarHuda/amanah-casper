// Deploy ZkReserves + PROVE reserves on-chain in zero-knowledge: the agent commits to
// its (hidden) per-asset allocations and proves they sum to a public total ≥ the
// principal floor — WITHOUT revealing the split. Verified in-VM by curve25519-dalek.
// Run: DRY_RUN=false npx tsx src/deploy-zk-reserves.ts
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadPrivateKey, makeRpcClient, callEntryPoint } from "./casper.js";
import { SessionBuilder, AccountIdentifier, CLValue, CLTypeByteArray, Args, Key } from "./sdk.js";
import { readVault } from "./read-vault.js";
import { proveReserves, verifyReserves, hexToBytes } from "./zk-reserves.js";
import { config } from "./config.js";
import { ed25519 } from "@noble/curves/ed25519";

const WASM = resolve(import.meta.dirname, "../../contracts/wasm/ZkReserves.lowered.wasm");
const STATE = resolve(import.meta.dirname, "../../.env.zkreserves");
// Fresh key name per deploy — reusing one collides on-chain (User error: 64641).
const KEY_NAME = "amanah_zk_reserves_v2_package_hash";
const PRINCIPAL_FLOOR = 800_000_000_000n;

const agentKey = loadPrivateKey(config.agentKeyPath);
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

async function main() {
  if (config.dryRun) throw new Error("DRY_RUN is on — run with DRY_RUN=false");

  // The allocations come from the LIVE vault, never from a constant — v2 of the
  // contract reads the same values and rejects the proof if they disagree, so a
  // hardcoded array would simply revert TotalMismatch.
  const vault = await readVault();
  const ALLOCATIONS = Object.values(vault.holdings);
  console.log("live vault allocations:", ALLOCATIONS.map(String).join(", "), "total =", vault.total.toString());

  // Build the ZK proof off-chain (blindings are secret; the split never leaves here).
  const blindings = ALLOCATIONS.map(() => BigInt("0x" + Buffer.from(ed25519.utils.randomPrivateKey()).toString("hex")));
  const proof = proveReserves(ALLOCATIONS, blindings);
  if (!verifyReserves(proof)) throw new Error("local proof failed — aborting");
  console.log("proving reserves sum =", proof.total, "(≥ floor", PRINCIPAL_FLOOR.toString() + "); per-asset amounts never appear in the proof\n");

  if (!state.ZKR_HASH) {
    const wasm = new Uint8Array(readFileSync(WASM));
    const tx = new SessionBuilder().from(pub).chainName(config.chainName).wasm(wasm).installOrUpgrade()
      .runtimeArgs(Args.fromMap({
        odra_cfg_package_hash_key_name: CLValue.newCLString(KEY_NAME),
        odra_cfg_allow_key_override: CLValue.newCLValueBool(false),
        odra_cfg_is_upgradable: CLValue.newCLValueBool(false),
        odra_cfg_is_upgrade: CLValue.newCLValueBool(false),
        // v2: the contract needs to know WHICH vault it proves solvency for.
        vault: CLValue.newCLKey(Key.newKey(`hash-${config.rwaVaultHash}`)),
      })).payment(300_000_000_000).buildFor1_5();
    tx.sign(agentKey);
    const dh = (await rpc.putTransaction(tx)).transactionHash.toHex();
    console.log("deploy ZkReserves:", dh, "— waiting..."); await waitForDeploy(dh);
    const info = await rpc.getAccountInfo(null, new AccountIdentifier(undefined, pub));
    const nk = info.account.namedKeys.find((k) => k.name === KEY_NAME);
    if (!nk) throw new Error("named key absent");
    save("ZKR_HASH", nk.key.toPrefixedString().replace(/^.*-/, ""));
    console.log("  ZKR_HASH =", state.ZKR_HASH);
  }

  // Verify the ZK proof-of-reserves ON-CHAIN.
  const byteArray32 = new CLTypeByteArray(32);
  const { deployHash } = await callEntryPoint({ rpc, key: agentKey, contractHash: state.ZKR_HASH, entryPoint: "prove_reserves",
    args: Args.fromMap({
      commitments: CLValue.newCLList(byteArray32, proof.commitments.map((c) => CLValue.newCLByteArray(hexToBytes(c)))),
      total: CLValue.newCLUint64(Number(proof.total)),
      proof_t: CLValue.newCLByteArray(hexToBytes(proof.proofT)),
      s: CLValue.newCLByteArray(hexToBytes(proof.s)),
      principal_floor: CLValue.newCLUint64(Number(PRINCIPAL_FLOOR)),
    }),
    chainName: config.chainName, paymentMotes: 60_000_000_000 });
  save("PROOF", deployHash);
  console.log("\nprove_reserves (ZK verified ON-CHAIN):", deployHash);
  console.log("=== DONE — ZK proof-of-reserves proven on-chain, bound to live vault state ===");
  console.log("ZKR_HASH:", state.ZKR_HASH);
}

main().catch((e) => { console.error("FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
