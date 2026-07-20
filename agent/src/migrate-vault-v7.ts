// Vault v7 — fixes a VALUE-CREATION bug found by edge-case testing.
//
// In v6 and earlier, `reallocate(X, X, amount)` wrote both sides of the SAME balance:
// the credit (`set(to, to_bal + amount)`) overwrote the debit (`set(from, from_bal -
// amount)`), leaving `bal + amount` — minting `amount` from nothing. The principal
// invariant could not catch it, because that check only fires when the total is too LOW.
// v7 rejects `from == to` with `SameAsset` (17), so reallocation always conserves value.
//
// Proves three things live: SameAsset refused -> NotApproved refused -> approved move
// executes. Reuses the existing ReputationRegistry v4, AuditorQuorum v2 and SpendGate v2.
// Run: DRY_RUN=false npx tsx src/migrate-vault-v7.ts
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadPrivateKey, makeRpcClient, callEntryPoint } from "./casper.js";
import { SessionBuilder, AccountIdentifier, CLValue, Key, Args } from "./sdk.js";
import { config } from "./config.js";

const VAULT_WASM = resolve(import.meta.dirname, "../../contracts/wasm/RwaVault.lowered.wasm");
const CUSTODIAN_PEM = resolve(import.meta.dirname, "../secret/custodian_key.pem");
const STATE = resolve(import.meta.dirname, "../../.env.vaultv7");
const VAULT_KEY = "amanah_vault_v7_package_hash";

const SPENDGATE = "f19ed0e9b235e8422aef7d8fbbcaa9cbc34ef4864efd81bbeb7c82d2b77d0cf3"; // v2
const COMPLIANCE = "93bc5e1389517acfb57b659ec1427c2979d6d931f1c1d587537427d5595f9ea5"; // v3
const REPUTATION = "265ebc7dc27997529587517c8a6cc502fd187f163fefe4d3e0946ba10438669c"; // v4 (reused)
const QUORUM = "55c09fab84ef3153a1872da422af15c61127d72fd0e1b08f6da2520accd3a293";     // v2 (2-of-3)
const APPROVED_HASH = "7c409e7bfce729cea460c03d3557277ad14e12da2b5d1a82c35860b60fba2df4";
const UNAPPROVED_HASH = "77".repeat(32);
const MIN_REPUTATION = 1; // the agent has already earned credit on the reused registry

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

async function reallocate(from: number, to: number, attHash: string) {
  try {
    const { deployHash } = await callEntryPoint({
      rpc, key: agentKey, contractHash: state.VAULT_V7, entryPoint: "reallocate",
      args: Args.fromMap({
        from_asset: CLValue.newCLUint8(from),
        to_asset: CLValue.newCLUint8(to),
        amount: CLValue.newCLUInt256(50_000_000_000),
        attestation_hash: CLValue.newCLByteArray(Uint8Array.from(Buffer.from(attHash, "hex"))),
      }),
      chainName: config.chainName, paymentMotes: config.paymentMotes,
    });
    return { hash: deployHash, ok: true as const, error: "" };
  } catch (e) {
    const m = (e as Error).message.match(/deploy ([a-f0-9]{64}) reverted: (.+)/);
    if (m) return { hash: m[1], ok: false as const, error: m[2] };
    throw e;
  }
}

async function main() {
  if (config.dryRun) throw new Error("DRY_RUN is on — run with DRY_RUN=false");
  console.log("deploying vault v7 (SameAsset value-conservation fix)\n");

  if (!state.VAULT_V7) {
    const bytes = new Uint8Array(readFileSync(VAULT_WASM));
    const tx = new SessionBuilder().from(pub).chainName(config.chainName).wasm(bytes).installOrUpgrade()
      .runtimeArgs(Args.fromMap({
        odra_cfg_package_hash_key_name: CLValue.newCLString(VAULT_KEY),
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
        quorum: CLValue.newCLKey(Key.newKey(`hash-${QUORUM}`)),
      })).payment(300_000_000_000).buildFor1_5();
    tx.sign(agentKey);
    const dh = (await rpc.putTransaction(tx)).transactionHash.toHex();
    console.log("  install vault v7:", dh, "— waiting...");
    const r = await deployResult(dh); if (!r.ok) throw new Error("install reverted: " + r.error);
    const info = await rpc.getAccountInfo(null, new AccountIdentifier(undefined, pub));
    const nk = info.account.namedKeys.find((k) => k.name === VAULT_KEY);
    if (!nk) throw new Error("named key absent");
    save("VAULT_V7", nk.key.toPrefixedString().replace(/^.*-/, ""));
    console.log("  VAULT_V7 =", state.VAULT_V7);
  }

  if (!state.SET_SPENDER) {
    const { deployHash } = await callEntryPoint({ rpc, key: custodian, contractHash: SPENDGATE, entryPoint: "set_spender",
      args: Args.fromMap({ spender: CLValue.newCLKey(Key.newKey(`hash-${state.VAULT_V7}`)) }), chainName: config.chainName, paymentMotes: config.paymentMotes });
    console.log("  set_spender(vault v7):", deployHash); save("SET_SPENDER", deployHash);
  }

  const seeds: [string, number, number][] = [["Gold", 0, 250_000_000_000], ["TBond", 1, 400_000_000_000], ["WTI", 2, 150_000_000_000], ["CSPR", 3, 200_000_000_000]];
  for (const [name, idx, amt] of seeds) {
    if (state[`SEED_${name}`]) continue;
    const { deployHash } = await callEntryPoint({ rpc, key: agentKey, contractHash: state.VAULT_V7, entryPoint: "deposit",
      args: Args.fromMap({ asset: CLValue.newCLUint8(idx), amount: CLValue.newCLUInt256(amt) }), chainName: config.chainName, paymentMotes: config.paymentMotes });
    console.log(`  seed ${name}:`, deployHash); save(`SEED_${name}`, deployHash);
  }

  // PROOF 1 — the mint bug is closed: an asset cannot be reallocated to itself.
  if (!state.SAME_ASSET) {
    const r = await reallocate(0, 0, APPROVED_HASH);
    console.log("\n[1] Gold -> Gold (v6 would have minted):", r.hash, "->", r.ok ? "UNEXPECTEDLY OK" : `REFUSED (${r.error})`);
    if (r.ok) throw new Error("SameAsset guard did not fire — value could still be minted!");
    save("SAME_ASSET", r.hash);
  }

  // PROOF 2 — the quorum is still enforced by the contract.
  if (!state.NOT_APPROVED) {
    const r = await reallocate(0, 1, UNAPPROVED_HASH);
    console.log("[2] unapproved decision:", r.hash, "->", r.ok ? "UNEXPECTEDLY OK" : `REFUSED (${r.error})`);
    if (r.ok) throw new Error("quorum gate did not fire");
    save("NOT_APPROVED", r.hash);
  }

  // PROOF 3 — a legitimate, quorum-approved move still executes.
  if (!state.EXECUTED) {
    const r = await reallocate(0, 1, APPROVED_HASH);
    console.log("[3] quorum-approved move:", r.hash, "->", r.ok ? "SUCCESS" : `blocked (${r.error})`);
    if (!r.ok) throw new Error("expected success: " + r.error);
    save("EXECUTED", r.hash);
  }

  if (!state.HEARTBEAT) {
    const { deployHash } = await callEntryPoint({ rpc, key: agentKey, contractHash: state.VAULT_V7, entryPoint: "heartbeat",
      args: Args.fromMap({}), chainName: config.chainName, paymentMotes: config.paymentMotes });
    console.log("  heartbeat:", deployHash); save("HEARTBEAT", deployHash);
  }

  console.log("\n=== VAULT v7 LIVE (value-conservation fix) ===");
  console.log("VAULT_V7         :", state.VAULT_V7);
  console.log("SameAsset refused:", state.SAME_ASSET);
  console.log("NotApproved      :", state.NOT_APPROVED);
  console.log("approved move    :", state.EXECUTED);
}

main().catch((e) => { console.error("FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
