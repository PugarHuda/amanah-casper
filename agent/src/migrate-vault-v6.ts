// Vault v6 + ReputationRegistry v4 — the auditor quorum is now enforced BY THE CONTRACT.
// (#1) RwaVault.reallocate calls AuditorQuorum.approved(attestation_hash) and reverts
//      NotApproved — a compromised agent can no longer move funds on its own say-so.
// (#3) ReputationRegistry.record_payment is authority-only, so the agent can't farm its
//      own reputation to escape the circuit breaker.
// Proves three things live, in order: BelowReputationFloor -> NotApproved -> SUCCESS.
// Run: DRY_RUN=false npx tsx src/migrate-vault-v6.ts
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadPrivateKey, makeRpcClient, callEntryPoint } from "./casper.js";
import { SessionBuilder, AccountIdentifier, CLValue, Key, Args } from "./sdk.js";
import { config } from "./config.js";

const VAULT_WASM = resolve(import.meta.dirname, "../../contracts/wasm/RwaVault.lowered.wasm");
const REP_WASM = resolve(import.meta.dirname, "../../contracts/wasm/ReputationRegistry.lowered.wasm");
const CUSTODIAN_PEM = resolve(import.meta.dirname, "../secret/custodian_key.pem");
const STATE = resolve(import.meta.dirname, "../../.env.vaultv6");
const REP_KEY = "amanah_reputation_v4_package_hash";
const VAULT_KEY = "amanah_vault_v6_package_hash";

const SPENDGATE = "f19ed0e9b235e8422aef7d8fbbcaa9cbc34ef4864efd81bbeb7c82d2b77d0cf3"; // v2
const COMPLIANCE = "93bc5e1389517acfb57b659ec1427c2979d6d931f1c1d587537427d5595f9ea5"; // v3
const QUORUM = "55c09fab84ef3153a1872da422af15c61127d72fd0e1b08f6da2520accd3a293";     // v2 (2-of-3)
// The quorum already holds 2-of-3 signed APPROVE votes for this decision hash.
const APPROVED_HASH = "7c409e7bfce729cea460c03d3557277ad14e12da2b5d1a82c35860b60fba2df4";
// Never voted on -> the vault must refuse it.
const UNAPPROVED_HASH = "42".repeat(32);
const MIN_REPUTATION = 1; // fresh registry starts the agent at 0 -> benched until credited

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

async function reallocate(attHash: string): Promise<{ hash: string; ok: boolean; error?: string }> {
  try {
    const { deployHash } = await callEntryPoint({ rpc, key: agentKey, contractHash: state.VAULT_V6, entryPoint: "reallocate",
      args: Args.fromMap({ from_asset: CLValue.newCLUint8(0), to_asset: CLValue.newCLUint8(1), amount: CLValue.newCLUInt256(50_000_000_000),
        attestation_hash: CLValue.newCLByteArray(Uint8Array.from(Buffer.from(attHash, "hex"))) }),
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
  console.log("agent", pub.toHex(), "| quorum", QUORUM.slice(0, 8), "| floor", MIN_REPUTATION, "\n");

  // 1) ReputationRegistry v4 — record_payment is now authority-only (#3).
  if (!state.REPUTATION_V4) {
    save("REPUTATION_V4", await install(custodian, REP_WASM, REP_KEY, { authority: custodianAddr }));
    console.log("  REPUTATION_V4 =", state.REPUTATION_V4);
  }

  // 2) RwaVault v6 — enforces the auditor quorum on-chain (#1).
  if (!state.VAULT_V6) {
    save("VAULT_V6", await install(agentKey, VAULT_WASM, VAULT_KEY, {
      agent: agentAddr,
      spend_gate: CLValue.newCLKey(Key.newKey(`hash-${SPENDGATE}`)),
      compliance: CLValue.newCLKey(Key.newKey(`hash-${COMPLIANCE}`)),
      principal: CLValue.newCLUInt512(800_000_000_000),
      reputation: CLValue.newCLKey(Key.newKey(`hash-${state.REPUTATION_V4}`)),
      min_reputation: CLValue.newCLInt64(MIN_REPUTATION),
      custodian: custodianAddr,
      quorum: CLValue.newCLKey(Key.newKey(`hash-${QUORUM}`)),
    }));
    console.log("  VAULT_V6 =", state.VAULT_V6);
  }

  // 3) Re-point SpendGate v2 at the new vault (only the vault may call check()).
  if (!state.SET_SPENDER) {
    const { deployHash } = await callEntryPoint({ rpc, key: custodian, contractHash: SPENDGATE, entryPoint: "set_spender",
      args: Args.fromMap({ spender: CLValue.newCLKey(Key.newKey(`hash-${state.VAULT_V6}`)) }), chainName: config.chainName, paymentMotes: config.paymentMotes });
    console.log("  set_spender(vault v6):", deployHash); save("SET_SPENDER", deployHash);
  }

  // 4) Seed $1M.
  const seeds: [string, number, number][] = [["Gold", 0, 250_000_000_000], ["TBond", 1, 400_000_000_000], ["WTI", 2, 150_000_000_000], ["CSPR", 3, 200_000_000_000]];
  for (const [name, idx, amt] of seeds) {
    if (state[`SEED_${name}`]) continue;
    const { deployHash } = await callEntryPoint({ rpc, key: agentKey, contractHash: state.VAULT_V6, entryPoint: "deposit",
      args: Args.fromMap({ asset: CLValue.newCLUint8(idx), amount: CLValue.newCLUInt256(amt) }), chainName: config.chainName, paymentMotes: config.paymentMotes });
    console.log(`  seed ${name}:`, deployHash); save(`SEED_${name}`, deployHash);
  }

  // PROOF 1 — circuit breaker: score 0 < floor 1 -> BelowReputationFloor.
  if (!state.BLOCKED_REP) {
    const r = await reallocate(APPROVED_HASH);
    console.log("\n[1] benched (score 0 < floor):", r.hash, "->", r.ok ? "UNEXPECTED OK" : `BLOCKED (${r.error})`);
    if (r.ok) throw new Error("expected BelowReputationFloor");
    save("BLOCKED_REP", r.hash);
  }

  // The CUSTODIAN credits a verified settlement (agent cannot credit itself — #3).
  if (!state.CREDITED) {
    const { deployHash } = await callEntryPoint({ rpc, key: custodian, contractHash: state.REPUTATION_V4, entryPoint: "record_payment",
      args: Args.fromMap({ payer: agentAddr, deploy_hash: CLValue.newCLByteArray(new Uint8Array(32).fill(6)) }),
      chainName: config.chainName, paymentMotes: config.paymentMotes });
    console.log("  custodian records a verified payment (+1):", deployHash); save("CREDITED", deployHash);
    await new Promise((r) => setTimeout(r, 8000));
  }

  // PROOF 2 — quorum enforced ON-CHAIN: a decision the auditors never approved is refused,
  // even though the agent's own key signed the transaction and reputation now passes.
  if (!state.BLOCKED_QUORUM) {
    const r = await reallocate(UNAPPROVED_HASH);
    console.log("[2] unapproved decision:", r.hash, "->", r.ok ? "UNEXPECTED OK" : `REFUSED (${r.error})`);
    if (r.ok) throw new Error("expected NotApproved — the quorum gate did not fire!");
    save("BLOCKED_QUORUM", r.hash);
  }

  // PROOF 3 — the quorum-approved decision executes.
  if (!state.RESUMED) {
    const r = await reallocate(APPROVED_HASH);
    console.log("[3] quorum-approved decision:", r.hash, "->", r.ok ? "SUCCESS" : `still blocked (${r.error})`);
    if (!r.ok) throw new Error("expected success: " + r.error);
    save("RESUMED", r.hash);
  }

  if (!state.HEARTBEAT) {
    const { deployHash } = await callEntryPoint({ rpc, key: agentKey, contractHash: state.VAULT_V6, entryPoint: "heartbeat",
      args: Args.fromMap({}), chainName: config.chainName, paymentMotes: config.paymentMotes });
    console.log("  heartbeat:", deployHash); save("HEARTBEAT", deployHash);
  }

  console.log("\n=== VAULT v6 — AUDITOR QUORUM ENFORCED ON-CHAIN ===");
  console.log("REPUTATION_V4 :", state.REPUTATION_V4);
  console.log("VAULT_V6      :", state.VAULT_V6);
  console.log("blocked (rep) :", state.BLOCKED_REP);
  console.log("REFUSED (quorum not approved):", state.BLOCKED_QUORUM);
  console.log("executed (approved):", state.RESUMED);
}

main().catch((e) => { console.error("FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
