// Live re-migration to the HARDENED ComplianceRegistry (set_status/revoke now
// owner-gated). Reuses the existing custodian-owned SpendGate (the agent is already
// allowlisted there) and only redeploys: (1) the hardened ComplianceRegistry (v3,
// custodian-owned), (2) a fresh RwaVault pointing at the existing SpendGate + the
// new Compliance, re-seeded to $1M / $800K principal. Resumable via ../.env.compliance.
// Run: DRY_RUN=false npx tsx src/migrate-compliance.ts
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadPrivateKey, makeRpcClient, callEntryPoint } from "./casper.js";
import { SessionBuilder, NativeTransferBuilder, AccountIdentifier, CLValue, Key, Args } from "./sdk.js";
import type { PrivateKey as PrivateKeyT, PublicKey } from "casper-js-sdk";
import { config } from "./config.js";

const WASM_DIR = resolve(import.meta.dirname, "../../contracts/wasm");
const STATE = resolve(import.meta.dirname, "../../.env.compliance");
const CUSTODIAN_PEM = resolve(import.meta.dirname, "../secret/custodian_key.pem");
const INSTALL_MOTES = Number(process.env.INSTALL_MOTES ?? 300_000_000_000);
// Existing custodian-owned SpendGate (agent already allowlisted) — reused as-is.
const EXISTING_SPENDGATE = "fc36ac817cc68533fee59d9e03a7e2457cadb4edf3c5b469428a93ad6c04f8fc";

const agentKey = loadPrivateKey(config.agentKeyPath);
const custodianKey = loadPrivateKey(CUSTODIAN_PEM);
const rpc = makeRpcClient(config.rpcUrl);

const state: Record<string, string> = {};
if (existsSync(STATE)) for (const l of readFileSync(STATE, "utf8").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.+)$/); if (m) state[m[1]] = m[2].trim();
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

async function readPkgHash(pub: PublicKey, keyName: string): Promise<string> {
  const info = await rpc.getAccountInfo(null, new AccountIdentifier(undefined, pub));
  const nk = info.account.namedKeys.find((k) => k.name === keyName);
  if (!nk) throw new Error(`named key "${keyName}" absent — install reverted`);
  return nk.key.toPrefixedString().replace(/^.*-/, "");
}

function cfg(keyName: string) {
  return {
    odra_cfg_package_hash_key_name: CLValue.newCLString(keyName),
    odra_cfg_allow_key_override: CLValue.newCLValueBool(false),
    odra_cfg_is_upgradable: CLValue.newCLValueBool(false),
    odra_cfg_is_upgrade: CLValue.newCLValueBool(false),
  };
}

async function install(deployer: PrivateKeyT, envVar: string, wasm: string, keyName: string, initArgs: Record<string, unknown> = {}): Promise<string> {
  if (state[envVar]) { console.log(`[skip] ${envVar}=${state[envVar]}`); return state[envVar]; }
  const wasmBytes = new Uint8Array(readFileSync(resolve(WASM_DIR, wasm)));
  const tx = new SessionBuilder().from(deployer.publicKey).chainName(config.chainName).wasm(wasmBytes)
    .installOrUpgrade().runtimeArgs(Args.fromMap({ ...cfg(keyName), ...initArgs })).payment(INSTALL_MOTES).buildFor1_5();
  tx.sign(deployer);
  const dh = (await rpc.putTransaction(tx)).transactionHash.toHex();
  console.log(`[deploy] ${wasm} -> ${envVar}  ${dh} — waiting...`);
  await waitForDeploy(dh);
  const hex = await readPkgHash(deployer.publicKey, keyName);
  save(envVar, hex);
  console.log(`  ${envVar}=${hex}`);
  return hex;
}

async function main() {
  if (config.dryRun) throw new Error("DRY_RUN is on — run with DRY_RUN=false");
  const agentPub = agentKey.publicKey;
  const custodianPub = custodianKey.publicKey;
  const agentAddr = CLValue.newCLKey(Key.newKey(agentPub.accountHash().toPrefixedString()));
  console.log("agent    ", agentPub.toHex());
  console.log("custodian", custodianPub.toHex(), "(reuses SpendGate", EXISTING_SPENDGATE.slice(0, 8) + "…)\n");

  // Top up the custodian so it can pay for the compliance deploy + set_status.
  if (!state.FUNDED) {
    const tx = new NativeTransferBuilder().from(agentPub).target(custodianPub).amount("400000000000")
      .chainName(config.chainName).payment(100_000_000).buildFor1_5();
    tx.sign(agentKey);
    const dh = (await rpc.putTransaction(tx)).transactionHash.toHex();
    console.log(`[fund] 400 CSPR agent->custodian  ${dh} — waiting...`);
    await waitForDeploy(dh); save("FUNDED", dh); console.log("  custodian topped up\n");
  }

  // 1. CUSTODIAN deploys the HARDENED ComplianceRegistry (init sets owner = custodian).
  const comp = await install(custodianKey, "COMPLIANCE_V3", "ComplianceRegistry.lowered.wasm", "amanah_compliance_v3_package_hash");

  // 2. CUSTODIAN marks the agent KYC-Valid (owner-only — now actually enforced).
  if (!state.KYC) {
    const r = await callEntryPoint({ rpc, key: custodianKey, contractHash: comp, entryPoint: "set_status",
      args: Args.fromMap({ addr: agentAddr, status: CLValue.newCLUint8(1), identity_hash: CLValue.newCLByteArray(new Uint8Array(32)) }),
      chainName: config.chainName, paymentMotes: config.paymentMotes });
    console.log("  custodian set_status(agent,Valid):", r.deployHash); save("KYC", r.deployHash);
  }

  // 3. AGENT deploys a fresh RwaVault at the EXISTING SpendGate + the new Compliance.
  const vault = await install(agentKey, "RWA_VAULT_V3", "RwaVault.lowered.wasm", "amanah_vault_v3_package_hash", {
    agent: agentAddr,
    spend_gate: CLValue.newCLKey(Key.newKey(`hash-${EXISTING_SPENDGATE}`)),
    compliance: CLValue.newCLKey(Key.newKey(`hash-${comp}`)),
    principal: CLValue.newCLUInt512(800_000_000_000),
  });

  // 4. AGENT re-seeds the vault ($1M total across the 4 assets).
  const seeds: [string, number, number][] = [["Gold", 0, 250_000_000_000], ["TBond", 1, 400_000_000_000], ["WTI", 2, 150_000_000_000], ["CSPR", 3, 200_000_000_000]];
  for (const [name, idx, amt] of seeds) {
    const skey = `SEED_${name}`;
    if (state[skey]) { console.log(`[skip] seed ${name}`); continue; }
    const r = await callEntryPoint({ rpc, key: agentKey, contractHash: vault, entryPoint: "deposit",
      args: Args.fromMap({ asset: CLValue.newCLUint8(idx), amount: CLValue.newCLUInt256(amt) }),
      chainName: config.chainName, paymentMotes: config.paymentMotes });
    console.log(`  seed ${name} ${amt}:`, r.deployHash); save(skey, r.deployHash);
  }

  // 5. AGENT reallocates $50k Gold->TBond through the (now fully gated) chain.
  if (!state.REALLOCATE) {
    const r = await callEntryPoint({ rpc, key: agentKey, contractHash: vault, entryPoint: "reallocate",
      args: Args.fromMap({ from_asset: CLValue.newCLUint8(0), to_asset: CLValue.newCLUint8(1), amount: CLValue.newCLUInt256(50_000_000_000),
        attestation_hash: CLValue.newCLByteArray(Uint8Array.from(Buffer.from("7c409e7bfce729cea460c03d3557277ad14e12da2b5d1a82c35860b60fba2df4", "hex"))) }),
      chainName: config.chainName, paymentMotes: config.paymentMotes });
    console.log("  reallocate $50k Gold->TBond:", r.deployHash, "<-- SUCCEEDED"); save("REALLOCATE", r.deployHash);
  }

  console.log("\n=== COMPLIANCE RE-MIGRATION COMPLETE ===");
  console.log("COMPLIANCE_V3 (owner-gated):", comp);
  console.log("RWA_VAULT_V3               :", vault);
  console.log("reallocate proof           :", state.REALLOCATE);
  console.log("\nNext: find-state-seeds (add v3 hashes) -> re-wire web/mcp/agent + Vercel.");
}

main().catch((e) => { console.error("FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
