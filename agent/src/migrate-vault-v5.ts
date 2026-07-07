// Vault v5 + SpendGate v2 — security-fix redeploy. Fixes: (#1) dead-man's switch no
// longer freezable by a caller-supplied tiny window (6h floor, in-contract); (#4)
// SpendGate.check is gated to the vault only (set_spender), so nobody can grief the
// daily limit. Deploys SpendGate v2 (custodian-owned), Vault v5 (points at it), wires
// set_spender, re-seeds $1M, re-demos the reputation circuit breaker, and heartbeats.
// Run: DRY_RUN=false npx tsx src/migrate-vault-v5.ts
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadPrivateKey, makeRpcClient, callEntryPoint } from "./casper.js";
import { SessionBuilder, AccountIdentifier, CLValue, Key, Args } from "./sdk.js";
import { config } from "./config.js";

const SG_WASM = resolve(import.meta.dirname, "../../contracts/wasm/SpendGate.lowered.wasm");
const VAULT_WASM = resolve(import.meta.dirname, "../../contracts/wasm/RwaVault.lowered.wasm");
const CUSTODIAN_PEM = resolve(import.meta.dirname, "../secret/custodian_key.pem");
const STATE = resolve(import.meta.dirname, "../../.env.vaultv5");
const SG_KEY = "amanah_spend_gate_v3_package_hash";
const VAULT_KEY = "amanah_vault_v5_package_hash";
const COMPLIANCE = "93bc5e1389517acfb57b659ec1427c2979d6d931f1c1d587537427d5595f9ea5";
const REPUTATION = "8d27187d49f2efe5d060033774b845864eace898d5bbc300d775130e1023304b";
const MIN_REPUTATION = 5; // agent score is 4 -> starts benched; earns its way in

const agentKey = loadPrivateKey(config.agentKeyPath);
const custodian = loadPrivateKey(CUSTODIAN_PEM);
const rpc = makeRpcClient(config.rpcUrl);
const pub = agentKey.publicKey;
const custPub = custodian.publicKey;
const agentAddr = CLValue.newCLKey(Key.newKey(pub.accountHash().toPrefixedString()));
const custodianAddr = CLValue.newCLKey(Key.newKey(custPub.accountHash().toPrefixedString()));

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

// Install a wasm signed by `key`, return the resulting package hash from its named keys.
async function install(key: typeof agentKey, wasm: string, keyName: string, args: Record<string, unknown>): Promise<string> {
  const bytes = new Uint8Array(readFileSync(wasm));
  const tx = new SessionBuilder().from(key.publicKey).chainName(config.chainName).wasm(bytes).installOrUpgrade()
    .runtimeArgs(Args.fromMap({
      odra_cfg_package_hash_key_name: CLValue.newCLString(keyName),
      odra_cfg_allow_key_override: CLValue.newCLValueBool(false),
      odra_cfg_is_upgradable: CLValue.newCLValueBool(false),
      odra_cfg_is_upgrade: CLValue.newCLValueBool(false),
      ...args,
    })).payment(300_000_000_000).buildFor1_5();
  tx.sign(key);
  const dh = (await rpc.putTransaction(tx)).transactionHash.toHex();
  console.log(`  install ${keyName}:`, dh, "— waiting...");
  const r = await deployResult(dh); if (!r.ok) throw new Error(`install ${keyName} reverted: ${r.error}`);
  const info = await rpc.getAccountInfo(null, new AccountIdentifier(undefined, key.publicKey));
  const nk = info.account.namedKeys.find((k) => k.name === keyName);
  if (!nk) throw new Error(`named key ${keyName} absent`);
  return nk.key.toPrefixedString().replace(/^.*-/, "");
}

async function reallocate(): Promise<{ hash: string; ok: boolean; error?: string }> {
  try {
    const { deployHash } = await callEntryPoint({ rpc, key: agentKey, contractHash: state.VAULT_V5, entryPoint: "reallocate",
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
  console.log("agent", pub.toHex(), "| custodian", custPub.toHex(), "| floor", MIN_REPUTATION, "\n");

  // 1) SpendGate v2 (custodian-owned): $100K/tx, $1M/day, no expiry.
  if (!state.SPENDGATE_V2) {
    save("SPENDGATE_V2", await install(custodian, SG_WASM, SG_KEY, {
      max_per_tx: CLValue.newCLUInt512(100_000_000_000),
      daily_limit: CLValue.newCLUInt512(1_000_000_000_000),
      expiry: CLValue.newCLUint64(0),
    }));
    console.log("  SPENDGATE_V2 =", state.SPENDGATE_V2);
  }
  if (!state.ALLOWLIST) {
    const { deployHash } = await callEntryPoint({ rpc, key: custodian, contractHash: state.SPENDGATE_V2, entryPoint: "add_allowlist",
      args: Args.fromMap({ addr: agentAddr }), chainName: config.chainName, paymentMotes: config.paymentMotes });
    console.log("  custodian allowlists agent:", deployHash); save("ALLOWLIST", deployHash);
  }

  // 2) RwaVault v5 (agent-deployed) pointing at SpendGate v2 + compliance v3 + reputation v3.
  if (!state.VAULT_V5) {
    save("VAULT_V5", await install(agentKey, VAULT_WASM, VAULT_KEY, {
      agent: agentAddr,
      spend_gate: CLValue.newCLKey(Key.newKey(`hash-${state.SPENDGATE_V2}`)),
      compliance: CLValue.newCLKey(Key.newKey(`hash-${COMPLIANCE}`)),
      principal: CLValue.newCLUInt512(800_000_000_000),
      reputation: CLValue.newCLKey(Key.newKey(`hash-${REPUTATION}`)),
      min_reputation: CLValue.newCLInt64(MIN_REPUTATION),
      custodian: custodianAddr,
    }));
    console.log("  VAULT_V5 =", state.VAULT_V5);
  }

  // 3) Custodian tells SpendGate v2 the vault is its only allowed spender (#4 fix).
  if (!state.SET_SPENDER) {
    const { deployHash } = await callEntryPoint({ rpc, key: custodian, contractHash: state.SPENDGATE_V2, entryPoint: "set_spender",
      args: Args.fromMap({ spender: CLValue.newCLKey(Key.newKey(`hash-${state.VAULT_V5}`)) }), chainName: config.chainName, paymentMotes: config.paymentMotes });
    console.log("  set_spender(vault v5):", deployHash); save("SET_SPENDER", deployHash);
  }

  // 4) Seed $1M (deposit is not reputation-gated).
  const seeds: [string, number, number][] = [["Gold", 0, 250_000_000_000], ["TBond", 1, 400_000_000_000], ["WTI", 2, 150_000_000_000], ["CSPR", 3, 200_000_000_000]];
  for (const [name, idx, amt] of seeds) {
    if (state[`SEED_${name}`]) continue;
    const { deployHash } = await callEntryPoint({ rpc, key: agentKey, contractHash: state.VAULT_V5, entryPoint: "deposit",
      args: Args.fromMap({ asset: CLValue.newCLUint8(idx), amount: CLValue.newCLUInt256(amt) }), chainName: config.chainName, paymentMotes: config.paymentMotes });
    console.log(`  seed ${name}:`, deployHash); save(`SEED_${name}`, deployHash);
  }

  // 5) CIRCUIT BREAKER: agent below the floor -> reallocate REVERTS; custodian rewards
  //    +1 to reach the floor; reallocate then SUCCEEDS (auto-resume).
  if (!state.BLOCKED) {
    const r = await reallocate();
    console.log("\n[circuit breaker] reallocate while benched:", r.hash, "->", r.ok ? "UNEXPECTEDLY OK" : `BLOCKED (${r.error})`);
    if (r.ok) throw new Error("expected BelowReputationFloor revert but it succeeded");
    save("BLOCKED", r.hash);
  }
  if (!state.CREDITED) {
    const { deployHash } = await callEntryPoint({ rpc, key: custodian, contractHash: REPUTATION, entryPoint: "adjust",
      args: Args.fromMap({ addr: agentAddr, delta: CLValue.newCLInt64(1), _outcome_ref: CLValue.newCLByteArray(new Uint8Array(32).fill(5)) }),
      chainName: config.chainName, paymentMotes: config.paymentMotes });
    console.log("  custodian reward +1 (reputation reaches floor):", deployHash); save("CREDITED", deployHash);
    await new Promise((r) => setTimeout(r, 8000));
  }
  if (!state.RESUMED) {
    const r = await reallocate();
    console.log("[resumed] reallocate after earning reputation:", r.hash, "->", r.ok ? "SUCCESS" : `still blocked (${r.error})`);
    if (!r.ok) throw new Error("expected success after reaching floor: " + r.error);
    save("RESUMED", r.hash);
  }

  // 6) Heartbeat so the dead-man's switch reads fresh (Armed, not stale).
  if (!state.HEARTBEAT) {
    const { deployHash } = await callEntryPoint({ rpc, key: agentKey, contractHash: state.VAULT_V5, entryPoint: "heartbeat",
      args: Args.fromMap({}), chainName: config.chainName, paymentMotes: config.paymentMotes });
    console.log("  heartbeat:", deployHash); save("HEARTBEAT", deployHash);
  }

  console.log("\n=== VAULT v5 + SPENDGATE v2 (security fixes) LIVE ===");
  console.log("SPENDGATE_V2 :", state.SPENDGATE_V2);
  console.log("VAULT_V5     :", state.VAULT_V5);
  console.log("set_spender  :", state.SET_SPENDER);
  console.log("blocked proof:", state.BLOCKED);
  console.log("resumed proof:", state.RESUMED);
}

main().catch((e) => { console.error("FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
