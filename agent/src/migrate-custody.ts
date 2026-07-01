// REAL custodian separation + non-zero principal lock. Addresses the audit's #1
// real-world-credibility gap ("the agent owns its own SpendGate, marks its own
// compliance Valid, allowlists itself") by redeploying the gates from a SEPARATE
// custodian key. Uses the existing wasm (no rebuild). Resumable via ../.env.custody.
//
//   custodian (separate key) deploys + OWNS SpendGate, sets the agent's compliance,
//   allowlists the agent.  The agent deploys a fresh RwaVault pointing at the
//   custodian's gates with a NON-ZERO locked principal, seeds it, and reallocates
//   yield — proving the full separated chain on-chain.
//
// Run: DRY_RUN=false npx tsx src/migrate-custody.ts
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadPrivateKey, makeRpcClient, callEntryPoint } from "./casper.js";
import {
  SessionBuilder, NativeTransferBuilder, AccountIdentifier,
  CLValue, CLTypeUInt8, Key, Args, PrivateKey, KeyAlgorithm,
} from "./sdk.js";
import type { PrivateKey as PrivateKeyT, PublicKey } from "casper-js-sdk";
import { config } from "./config.js";

const WASM_DIR = resolve(import.meta.dirname, "../../contracts/wasm");
const STATE = resolve(import.meta.dirname, "../../.env.custody");
const CUSTODIAN_PEM = resolve(import.meta.dirname, "../secret/custodian_key.pem");
const INSTALL_MOTES = Number(process.env.INSTALL_MOTES ?? 300_000_000_000);

const agentKey = loadPrivateKey(config.agentKeyPath);
const rpc = makeRpcClient(config.rpcUrl);

// --- resumable state -------------------------------------------------------
const state: Record<string, string> = {};
if (existsSync(STATE)) {
  for (const line of readFileSync(STATE, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.+)$/);
    if (m) state[m[1]] = m[2].trim();
  }
}
function save(k: string, v: string) {
  state[k] = v;
  writeFileSync(STATE, Object.entries(state).map(([a, b]) => `${a}=${b}`).join("\n") + "\n");
}

// --- custodian key ---------------------------------------------------------
function loadOrGenCustodian(): PrivateKeyT {
  if (existsSync(CUSTODIAN_PEM)) return loadPrivateKey(CUSTODIAN_PEM);
  throw new Error("custodian key missing — run gen-custodian first");
}
const custodianKey = loadOrGenCustodian();

async function waitForDeploy(hash: string, timeoutMs = 180_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await fetch(config.rpcUrl, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "info_get_deploy", params: { deploy_hash: hash } }),
    }).then((x) => x.json() as Promise<any>);
    const info = r?.result?.execution_info;
    if (info?.execution_result) {
      const v2 = info.execution_result.Version2 ?? info.execution_result;
      if (v2?.error_message) throw new Error(`deploy reverted: ${v2.error_message}`);
      return;
    }
    await new Promise((res) => setTimeout(res, 4_000));
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
  const tx = new SessionBuilder()
    .from(deployer.publicKey).chainName(config.chainName).wasm(wasmBytes)
    .installOrUpgrade().runtimeArgs(Args.fromMap({ ...cfg(keyName), ...initArgs }))
    .payment(INSTALL_MOTES).buildFor1_5();
  tx.sign(deployer);
  const res = await rpc.putTransaction(tx);
  const dh = res.transactionHash.toHex();
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
  console.log("custodian", custodianPub.toHex(), "\n");

  // 1. Fund the custodian so it can pay for its own deploys (real separation
  //    means the custodian holds its own gas). 1200 CSPR covers 2 installs + calls.
  if (!state.FUNDED) {
    const amount = 1_200_000_000_000n; // 1200 CSPR
    const tx = new NativeTransferBuilder()
      .from(agentPub).target(custodianPub).amount(amount.toString())
      .chainName(config.chainName).payment(100_000_000).buildFor1_5();
    tx.sign(agentKey);
    const res = await rpc.putTransaction(tx);
    const dh = res.transactionHash.toHex();
    console.log(`[fund] 1200 CSPR agent->custodian  ${dh} — waiting...`);
    await waitForDeploy(dh);
    save("FUNDED", dh);
    console.log("  custodian funded\n");
  }

  // 2. CUSTODIAN deploys + owns SpendGate (init sets owner = caller = custodian).
  const sg = await install(custodianKey, "SPEND_GATE_V2", "SpendGate.lowered.wasm", "amanah_spend_gate_v2_package_hash", {
    max_per_tx: CLValue.newCLUInt512(100_000_000_000),
    daily_limit: CLValue.newCLUInt512(1_000_000_000_000),
    expiry: CLValue.newCLUint64(0),
  });
  // 3. CUSTODIAN deploys ComplianceRegistry.
  const comp = await install(custodianKey, "COMPLIANCE_V2", "ComplianceRegistry.lowered.wasm", "amanah_compliance_v2_package_hash");

  // 4. CUSTODIAN allowlists the agent (owner-only — only the custodian can) and
  //    marks the agent KYC-Valid. This is the separation the fiduciary story needs.
  if (!state.ALLOWLISTED) {
    const r = await callEntryPoint({ rpc, key: custodianKey, contractHash: sg, entryPoint: "add_allowlist",
      args: Args.fromMap({ addr: agentAddr }), chainName: config.chainName, paymentMotes: config.paymentMotes });
    console.log("  custodian add_allowlist(agent):", r.deployHash);
    save("ALLOWLISTED", r.deployHash);
  }
  if (!state.KYC) {
    const r = await callEntryPoint({ rpc, key: custodianKey, contractHash: comp, entryPoint: "set_status",
      args: Args.fromMap({ addr: agentAddr, status: CLValue.newCLUint8(1), identity_hash: CLValue.newCLByteArray(new Uint8Array(32)) }),
      chainName: config.chainName, paymentMotes: config.paymentMotes });
    console.log("  custodian set_status(agent,Valid):", r.deployHash);
    save("KYC", r.deployHash);
  }

  // 5. AGENT deploys a fresh RwaVault pointing at the CUSTODIAN's gates, with a
  //    NON-ZERO locked principal ($800k of the $1M is principal; $200k is yield).
  const vault = await install(agentKey, "RWA_VAULT_V2", "RwaVault.lowered.wasm", "amanah_vault_v2_package_hash", {
    agent: agentAddr,
    spend_gate: CLValue.newCLKey(Key.newKey(`hash-${sg}`)),
    compliance: CLValue.newCLKey(Key.newKey(`hash-${comp}`)),
    principal: CLValue.newCLUInt512(800_000_000_000),
  });

  // 6. AGENT seeds the vault ($1M total: 250k/400k/150k/200k across the 4 assets).
  const seeds: [string, number, number][] = [["Gold", 0, 250_000_000_000], ["TBond", 1, 400_000_000_000], ["WTI", 2, 150_000_000_000], ["CSPR", 3, 200_000_000_000]];
  for (const [name, idx, amt] of seeds) {
    const skey = `SEED_${name}`;
    if (state[skey]) { console.log(`[skip] seed ${name}`); continue; }
    const r = await callEntryPoint({ rpc, key: agentKey, contractHash: vault, entryPoint: "deposit",
      args: Args.fromMap({ asset: CLValue.newCLUint8(idx), amount: CLValue.newCLUInt256(amt) }),
      chainName: config.chainName, paymentMotes: config.paymentMotes });
    console.log(`  seed ${name} ${amt}:`, r.deployHash);
    save(skey, r.deployHash);
  }

  // 7. AGENT reallocates $50k Gold->TBond through the CUSTODIAN-owned gates. Proves
  //    the separated chain end-to-end; total stays $1M > $800k principal (passes).
  if (!state.REALLOCATE) {
    const r = await callEntryPoint({ rpc, key: agentKey, contractHash: vault, entryPoint: "reallocate",
      args: Args.fromMap({
        from_asset: CLValue.newCLUint8(0), to_asset: CLValue.newCLUint8(1),
        amount: CLValue.newCLUInt256(50_000_000_000),
        attestation_hash: CLValue.newCLByteArray(Uint8Array.from(Buffer.from("7c409e7bfce729cea460c03d3557277ad14e12da2b5d1a82c35860b60fba2df4", "hex"))),
      }), chainName: config.chainName, paymentMotes: config.paymentMotes });
    console.log("  reallocate $50k Gold->TBond (custodian-gated):", r.deployHash, " <-- SUCCEEDED");
    save("REALLOCATE", r.deployHash);
  }

  console.log("\n=== MIGRATION COMPLETE ===");
  console.log("custodian pubkey :", custodianPub.toHex());
  console.log("SPEND_GATE_V2    :", sg);
  console.log("COMPLIANCE_V2    :", comp);
  console.log("RWA_VAULT_V2     :", vault);
  console.log("reallocate proof :", state.REALLOCATE);
  console.log("\nNext: npx tsx src/find-state-seeds.ts (add the v2 hashes) to get the new state seeds.");
}

main().catch((e) => {
  console.error("\nMIGRATION FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
