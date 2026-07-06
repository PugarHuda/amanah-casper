// Deploy RwaVault v4 (on-chain circuit breakers: reputation floor + dead-man's
// switch) and DEMONSTRATE the reputation gate live: the agent starts below the floor
// (benched), a reallocate REVERTS (BelowReputationFloor), then it earns reputation via
// a real settlement and reallocate SUCCEEDS — trading auto-resumes. Reuses the existing
// custodian-owned SpendGate + Compliance v3 + Reputation v3. Resumable via ../.env.vaultv4b.
// Run: DRY_RUN=false npx tsx src/migrate-vault-v4.ts
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadPrivateKey, makeRpcClient, callEntryPoint } from "./casper.js";
import { SessionBuilder, AccountIdentifier, CLValue, Key, Args } from "./sdk.js";
import { config } from "./config.js";

const WASM = resolve(import.meta.dirname, "../../contracts/wasm/RwaVault.lowered.wasm");
const CUSTODIAN_PEM = resolve(import.meta.dirname, "../secret/custodian_key.pem");
const STATE = resolve(import.meta.dirname, "../../.env.vaultv4b");
const KEY_NAME = "amanah_vault_v4b_package_hash";
const SPENDGATE = "fc36ac817cc68533fee59d9e03a7e2457cadb4edf3c5b469428a93ad6c04f8fc";
const COMPLIANCE = "93bc5e1389517acfb57b659ec1427c2979d6d931f1c1d587537427d5595f9ea5";
const REPUTATION = "8d27187d49f2efe5d060033774b845864eace898d5bbc300d775130e1023304b";
const MIN_REPUTATION = 4; // agent score is 2 -> starts benched; earns its way in

const agentKey = loadPrivateKey(config.agentKeyPath);
const custodian = loadPrivateKey(CUSTODIAN_PEM);
const rpc = makeRpcClient(config.rpcUrl);
const pub = agentKey.publicKey;
const agentAddr = CLValue.newCLKey(Key.newKey(pub.accountHash().toPrefixedString()));
const custodianAddr = CLValue.newCLKey(Key.newKey(custodian.publicKey.accountHash().toPrefixedString()));

const state: Record<string, string> = {};
if (existsSync(STATE)) for (const l of readFileSync(STATE, "utf8").split("\n")) {
  const m = l.match(/^([A-Za-z0-9_]+)=(.+)$/); if (m) state[m[1]] = m[2].trim();
}
const save = (k: string, v: string) => { state[k] = v; writeFileSync(STATE, Object.entries(state).map(([a, b]) => `${a}=${b}`).join("\n") + "\n"); };

async function deployResult(hash: string): Promise<{ ok: boolean; error?: string }> {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const r = await fetch(config.rpcUrl, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "info_get_deploy", params: { deploy_hash: hash } }) }).then((x) => x.json() as Promise<any>);
    const info = r?.result?.execution_info;
    if (info?.execution_result) {
      const v2 = info.execution_result.Version2 ?? info.execution_result;
      return v2?.error_message ? { ok: false, error: v2.error_message } : { ok: true };
    }
    await new Promise((res) => setTimeout(res, 4000));
  }
  throw new Error(`timed out waiting for ${hash}`);
}

async function reallocate(): Promise<{ hash: string; ok: boolean; error?: string }> {
  // callEntryPoint waits for execution and THROWS "deploy <hash> reverted: <reason>"
  // on a revert — catch it so a BelowReputationFloor revert is a captured proof, not a crash.
  try {
    const { deployHash } = await callEntryPoint({ rpc, key: agentKey, contractHash: state.VAULT_V4, entryPoint: "reallocate",
      args: Args.fromMap({ from_asset: CLValue.newCLUint8(0), to_asset: CLValue.newCLUint8(1), amount: CLValue.newCLUInt256(50_000_000_000),
        attestation_hash: CLValue.newCLByteArray(Uint8Array.from(Buffer.from("7c409e7bfce729cea460c03d3557277ad14e12da2b5d1a82c35860b60fba2df4", "hex"))) }),
      chainName: config.chainName, paymentMotes: config.paymentMotes });
    return { hash: deployHash, ok: true };
  } catch (e) {
    const m = (e as Error).message.match(/deploy ([a-f0-9]{64}) reverted: (.+)/);
    if (m) return { hash: m[1], ok: false, error: m[2] };
    throw e;
  }
}

async function main() {
  if (config.dryRun) throw new Error("DRY_RUN is on — run with DRY_RUN=false");
  console.log("agent", pub.toHex(), "| floor", MIN_REPUTATION, "\n");

  if (!state.VAULT_V4) {
    const wasm = new Uint8Array(readFileSync(WASM));
    const tx = new SessionBuilder().from(pub).chainName(config.chainName).wasm(wasm).installOrUpgrade()
      .runtimeArgs(Args.fromMap({
        odra_cfg_package_hash_key_name: CLValue.newCLString(KEY_NAME),
        odra_cfg_allow_key_override: CLValue.newCLValueBool(false),
        odra_cfg_is_upgradable: CLValue.newCLValueBool(false),
        odra_cfg_is_upgrade: CLValue.newCLValueBool(false),
        agent: agentAddr,
        spend_gate: CLValue.newCLKey(Key.newKey(`hash-${SPENDGATE}`)),
        compliance: CLValue.newCLKey(Key.newKey(`hash-${COMPLIANCE}`)),
        principal: CLValue.newCLUInt512(800_000_000_000),
        reputation: CLValue.newCLKey(Key.newKey(`hash-${REPUTATION}`)),
        min_reputation: CLValue.newCLInt64(MIN_REPUTATION),
        custodian: custodianAddr,
      })).payment(300_000_000_000).buildFor1_5();
    tx.sign(agentKey);
    const dh = (await rpc.putTransaction(tx)).transactionHash.toHex();
    console.log("deploy RwaVault v4:", dh, "— waiting...");
    const r = await deployResult(dh); if (!r.ok) throw new Error("install reverted: " + r.error);
    const info = await rpc.getAccountInfo(null, new AccountIdentifier(undefined, pub));
    const nk = info.account.namedKeys.find((k) => k.name === KEY_NAME);
    if (!nk) throw new Error("named key absent");
    save("VAULT_V4", nk.key.toPrefixedString().replace(/^.*-/, ""));
    console.log("  VAULT_V4 =", state.VAULT_V4);
  }

  // Seed $1M (deposit is not reputation-gated).
  const seeds: [string, number, number][] = [["Gold", 0, 250_000_000_000], ["TBond", 1, 400_000_000_000], ["WTI", 2, 150_000_000_000], ["CSPR", 3, 200_000_000_000]];
  for (const [name, idx, amt] of seeds) {
    if (state[`SEED_${name}`]) continue;
    const { deployHash } = await callEntryPoint({ rpc, key: agentKey, contractHash: state.VAULT_V4, entryPoint: "deposit",
      args: Args.fromMap({ asset: CLValue.newCLUint8(idx), amount: CLValue.newCLUInt256(amt) }), chainName: config.chainName, paymentMotes: config.paymentMotes });
    console.log(`  seed ${name}:`, deployHash); save(`SEED_${name}`, deployHash);
  }

  // 1) CIRCUIT BREAKER: agent is below the floor (score 2 < 3) -> reallocate REVERTS.
  if (!state.BLOCKED) {
    const r = await reallocate();
    console.log("\n[circuit breaker] reallocate while benched:", r.hash, "->", r.ok ? "UNEXPECTEDLY OK" : `BLOCKED (${r.error})`);
    if (r.ok) throw new Error("expected BelowReputationFloor revert but it succeeded");
    save("BLOCKED", r.hash);
  }

  // 2) Reputation reaches the floor: the CUSTODIAN (the registry authority) rewards the
  //    agent +1 for good standing (score 2 -> 3 = floor). A legitimate authority action.
  if (!state.CREDITED) {
    const { deployHash } = await callEntryPoint({ rpc, key: custodian, contractHash: REPUTATION, entryPoint: "adjust",
      args: Args.fromMap({ addr: agentAddr, delta: CLValue.newCLInt64(1), _outcome_ref: CLValue.newCLByteArray(new Uint8Array(32).fill(4)) }),
      chainName: config.chainName, paymentMotes: config.paymentMotes });
    console.log("  custodian reward +1 (reputation reaches floor):", deployHash);
    save("CREDITED", deployHash);
    await new Promise((r) => setTimeout(r, 8000)); // let the write settle
  }

  // 3) RESUME: reputation now meets the floor -> reallocate SUCCEEDS.
  if (!state.RESUMED) {
    const r = await reallocate();
    console.log("[resumed] reallocate after earning reputation:", r.hash, "->", r.ok ? "SUCCESS" : `still blocked (${r.error})`);
    if (!r.ok) throw new Error("expected success after reaching floor: " + r.error);
    save("RESUMED", r.hash);
  }

  console.log("\n=== VAULT v4 (circuit breakers) LIVE ===");
  console.log("VAULT_V4      :", state.VAULT_V4);
  console.log("blocked proof :", state.BLOCKED, "(BelowReputationFloor)");
  console.log("resumed proof :", state.RESUMED, "(after earning reputation)");
}

main().catch((e) => { console.error("FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
