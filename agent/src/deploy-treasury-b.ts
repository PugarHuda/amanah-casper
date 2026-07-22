// Multi-treasury / multi-tenant (B3) — deploy a SECOND independent treasury.
//
// Multi-tenancy on Casper is deploy-per-tenant: each treasury is its own RwaVault + SpendGate
// with its own principal and holdings, sharing the stateless registries (Compliance,
// Reputation, AuditorQuorum). This deploys "Treasury B" ALONGSIDE the proven Treasury A —
// additive, so nothing about Treasury A changes — with a different principal ($400k) and asset
// mix, proving the system runs N independent treasuries, not one hard-coded vault.
// Run: DRY_RUN=false npx tsx src/deploy-treasury-b.ts
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadPrivateKey, makeRpcClient, callEntryPoint } from "./casper.js";
import { SessionBuilder, AccountIdentifier, CLValue, Key, Args } from "./sdk.js";
import { config } from "./config.js";

const VAULT_WASM = resolve(import.meta.dirname, "../../contracts/wasm/RwaVault.lowered.wasm");
const SPENDGATE_WASM = resolve(import.meta.dirname, "../../contracts/wasm/SpendGate.lowered.wasm");
const CUSTODIAN_PEM = resolve(import.meta.dirname, "../secret/custodian_key.pem");
const STATE = resolve(import.meta.dirname, "../../.env.treasuryb");

// Shared, stateless registries (reused from Treasury A).
const COMPLIANCE = "93bc5e1389517acfb57b659ec1427c2979d6d931f1c1d587537427d5595f9ea5";
const REPUTATION = "265ebc7dc27997529587517c8a6cc502fd187f163fefe4d3e0946ba10438669c";
const QUORUM = "2663d7ce209f999670be56dc2732512cd500f1cd4423f1623383fff68ff3dfeb";
const MIN_REPUTATION = 1;

const agentKey = loadPrivateKey(config.agentKeyPath);
const custodian = loadPrivateKey(CUSTODIAN_PEM);
const rpc = makeRpcClient(config.rpcUrl);
const pub = agentKey.publicKey;

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

async function installFrom(signer: typeof custodian, wasmPath: string, keyName: string, initArgs: Record<string, unknown>): Promise<string> {
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
  console.log(`  install ${keyName}:`, dh, "— waiting..."); await waitForDeploy(dh);
  const info = await rpc.getAccountInfo(null, new AccountIdentifier(undefined, signer.publicKey));
  const nk = info.account.namedKeys.find((k) => k.name === keyName);
  if (!nk) throw new Error(`named key ${keyName} absent`);
  return nk.key.toPrefixedString().replace(/^.*-/, "");
}

async function main() {
  if (config.dryRun) throw new Error("DRY_RUN is on — run with DRY_RUN=false");
  const agentAddr = CLValue.newCLKey(Key.newKey(pub.accountHash().toPrefixedString()));
  const custodianAddr = CLValue.newCLKey(Key.newKey(custodian.publicKey.accountHash().toPrefixedString()));

  // 1) Treasury B's own SpendGate (custodian-owned). Its own limits.
  if (!state.SPENDGATE_B) {
    save("SPENDGATE_B", await installFrom(custodian, SPENDGATE_WASM, "amanah_spend_gate_treasuryb_package_hash", {
      max_per_tx: CLValue.newCLUInt512(50_000_000_000),
      daily_limit: CLValue.newCLUInt512(500_000_000_000),
      expiry: CLValue.newCLUint64(0),
    }));
    console.log("  SPENDGATE_B =", state.SPENDGATE_B);
  }
  if (!state.ALLOWLIST_B) {
    const { deployHash } = await callEntryPoint({ rpc, key: custodian, contractHash: state.SPENDGATE_B, entryPoint: "add_allowlist", args: Args.fromMap({ addr: agentAddr }), chainName: config.chainName, paymentMotes: config.paymentMotes });
    await waitForDeploy(deployHash); save("ALLOWLIST_B", deployHash);
  }

  // 2) Treasury B's own RwaVault — different principal ($400k), shared registries.
  if (!state.VAULT_B) {
    save("VAULT_B", await installFrom(agentKey, VAULT_WASM, "amanah_rwa_vault_treasuryb_package_hash", {
      agent: agentAddr,
      spend_gate: CLValue.newCLKey(Key.newKey(`hash-${state.SPENDGATE_B}`)),
      compliance: CLValue.newCLKey(Key.newKey(`hash-${COMPLIANCE}`)),
      principal: CLValue.newCLUInt512(400_000_000_000),
      reputation: CLValue.newCLKey(Key.newKey(`hash-${REPUTATION}`)),
      min_reputation: CLValue.newCLInt64(MIN_REPUTATION),
      custodian: custodianAddr,
      quorum: CLValue.newCLKey(Key.newKey(`hash-${QUORUM}`)),
    }));
    console.log("  VAULT_B =", state.VAULT_B);
  }

  // 3) Point Treasury B's SpendGate at Treasury B's vault (only it may call check()).
  if (!state.SETSPENDER_B) {
    const { deployHash } = await callEntryPoint({ rpc, key: custodian, contractHash: state.SPENDGATE_B, entryPoint: "set_spender", args: Args.fromMap({ spender: CLValue.newCLKey(Key.newKey(`hash-${state.VAULT_B}`)) }), chainName: config.chainName, paymentMotes: config.paymentMotes });
    await waitForDeploy(deployHash); save("SETSPENDER_B", deployHash);
  }

  // 4) Seed a DIFFERENT asset mix ($500k total, > $400k principal).
  const deposits: [number, bigint][] = [[0, 150_000_000_000n], [1, 250_000_000_000n], [2, 50_000_000_000n], [3, 50_000_000_000n]];
  for (const [asset, amt] of deposits) {
    const k = `DEP_B_${asset}`;
    if (state[k]) continue;
    const { deployHash } = await callEntryPoint({ rpc, key: agentKey, contractHash: state.VAULT_B, entryPoint: "deposit", args: Args.fromMap({ asset: CLValue.newCLUint8(asset), amount: CLValue.newCLUInt256(amt) }), chainName: config.chainName, paymentMotes: config.paymentMotes });
    await waitForDeploy(deployHash); save(k, deployHash);
    console.log(`  deposit asset ${asset}:`, deployHash);
  }

  console.log("\n=== Treasury B live (multi-tenant, independent of Treasury A) ===");
  console.log("VAULT_B     :", state.VAULT_B, "(principal $400k, holdings $500k)");
  console.log("SPENDGATE_B :", state.SPENDGATE_B);
}

main().catch((e) => { console.error("FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
