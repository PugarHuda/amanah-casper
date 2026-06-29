// One-shot installer: deploy the Amanah contracts to casper-test in dependency
// order using the already-built wasm in contracts/wasm/, then write the package
// hashes to ../.env.deployed under the var names the agent + signal-service read.
//
// Pure JS path (casper-js-sdk SessionBuilder) so it needs no casper-client / jq /
// rust toolchain — it reuses the funded agent key + RPC from casper.ts.
// Run: npm run deploy   (DRY_RUN is irrelevant here — this always submits).
//
// ponytail: first real deploy ever. The byHash-vs-byPackageHash seam (casper.ts)
// and the Odra Address=Key serialization are verified HERE against the live node.
// We store the package hash both ways (prefixed key + bare 64-hex) so whichever
// the consumer needs is available; trim once a live call confirms the format.
import { readFileSync, appendFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadPrivateKey, makeRpcClient } from "./casper.js";
import { SessionBuilder, AccountIdentifier, CLValue, Key, Args } from "./sdk.js";
import type { PublicKey } from "casper-js-sdk";
import { config } from "./config.js";

const WASM_DIR = resolve(import.meta.dirname, "../../contracts/wasm");
const ENV_FILE = resolve(import.meta.dirname, "../../.env.deployed");
// Contract installs are heavy; 300 CSPR each is the deploy.sh default. We hold
// ~15000 CSPR, 6 installs ~= 1800 CSPR worst case.
const INSTALL_MOTES = Number(process.env.INSTALL_MOTES ?? 300_000_000_000);

const key = loadPrivateKey(config.agentKeyPath);
const rpc = makeRpcClient(config.rpcUrl);
const pub: PublicKey = key.publicKey;
const accountKey = Key.newKey(pub.accountHash().toPrefixedString());

// envVar -> { prefixed (hash-/package-…), hex (bare 64) } captured this run.
const deployed: Record<string, { prefixed: string; hex: string }> = {};

function cfg(keyName: string) {
  return {
    odra_cfg_package_hash_key_name: CLValue.newCLString(keyName),
    odra_cfg_allow_key_override: CLValue.newCLValueBool(false),
    odra_cfg_is_upgradable: CLValue.newCLValueBool(false),
    // Required bool the install entrypoint reads (odra wasm_parts.rs:138). false =
    // fresh install (reads the constructor args), not an upgrade. Omitting it -> MissingArg.
    odra_cfg_is_upgrade: CLValue.newCLValueBool(false),
  };
}

// Poll info_get_deploy until the deploy executes; throw with the VM error on
// failure. The SDK's getTransactionByTransactionHash can't look up a legacy
// (buildFor1_5) deploy by bare hash, so we hit the JSON-RPC directly.
async function waitForDeploy(hash: string, timeoutMs = 180_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await fetch(config.rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "info_get_deploy", params: { deploy_hash: hash } }),
    }).then((x) => x.json() as Promise<any>);
    const info = r?.result?.execution_info;
    if (info?.execution_result) {
      const v2 = info.execution_result.Version2 ?? info.execution_result;
      if (v2?.error_message) throw new Error(`deploy reverted: ${v2.error_message}`);
      return; // executed, no error
    }
    await new Promise((res) => setTimeout(res, 4_000));
  }
  throw new Error(`timed out waiting for ${hash}`);
}

async function readPkgHash(keyName: string): Promise<{ prefixed: string; hex: string }> {
  // Legacy account named keys hold the installed package under our chosen name.
  const info = await rpc.getAccountInfo(null, new AccountIdentifier(undefined, pub));
  const nk = info.account.namedKeys.find((k) => k.name === keyName);
  if (!nk) throw new Error(`named key "${keyName}" absent — install likely reverted`);
  const prefixed = nk.key.toPrefixedString();
  const hex = prefixed.replace(/^.*-/, "");
  return { prefixed, hex };
}

// Preload already-deployed hashes so a re-run skips them. Re-installing under the
// same package_hash_key_name reverts (allow_key_override=false), so this is required
// for resumable runs, not just an optimization.
function loadExisting() {
  if (!existsSync(ENV_FILE)) return;
  const flat: Record<string, string> = {};
  for (const line of readFileSync(ENV_FILE, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.+)$/);
    if (m) flat[m[1]] = m[2].trim();
  }
  for (const [k, v] of Object.entries(flat)) {
    if (k.endsWith("_KEY")) continue;
    deployed[k] = { hex: v, prefixed: flat[`${k}_KEY`] ?? `hash-${v}` };
  }
}

async function install(
  envVar: string,
  wasm: string,
  keyName: string,
  initArgs: Record<string, unknown> = {},
): Promise<void> {
  if (deployed[envVar]) {
    console.log(`[skip] ${envVar} already deployed (${deployed[envVar].hex})`);
    return;
  }
  const wasmBytes = new Uint8Array(readFileSync(resolve(WASM_DIR, wasm)));
  const tx = new SessionBuilder()
    .from(pub)
    .chainName(config.chainName)
    .wasm(wasmBytes)
    .installOrUpgrade()
    .runtimeArgs(Args.fromMap({ ...cfg(keyName), ...initArgs }))
    .payment(INSTALL_MOTES)
    .buildFor1_5();
  tx.sign(key);

  const res = await rpc.putTransaction(tx);
  const dh = res.transactionHash.toHex();
  console.log(`[deploy] ${wasm} -> ${envVar}\n  deploy hash: ${dh} — waiting...`);
  await waitForDeploy(dh);

  const h = await readPkgHash(keyName);
  deployed[envVar] = h;
  console.log(`  ${envVar}=${h.hex}  (key ${h.prefixed})`);
}

async function main() {
  if (!existsSync(WASM_DIR)) throw new Error(`no wasm at ${WASM_DIR} — build contracts first`);
  loadExisting();
  console.log(`Deployer ${pub.toHex()}\n  account ${pub.accountHash().toPrefixedString()}\n  RPC ${config.rpcUrl}\n`);

  // 1-4: independent dependencies.
  await install("SPEND_GATE_HASH", "SpendGate.wasm", "amanah_spend_gate_package_hash", {
    max_per_tx: CLValue.newCLUInt512(100_000_000_000),
    daily_limit: CLValue.newCLUInt512(1_000_000_000_000),
    expiry: CLValue.newCLUint64(0),
  });
  await install("COMPLIANCE_HASH", "ComplianceRegistry.wasm", "amanah_compliance_package_hash");
  await install("ATTESTATION_LOG_HASH", "AttestationLog.wasm", "amanah_attestation_package_hash", {
    agent_pubkey: CLValue.newCLPublicKey(pub),
  });
  await install("REPUTATION_REGISTRY_HASH", "ReputationRegistry.wasm", "amanah_reputation_package_hash");

  // x402 payment asset: PaymentToken (local CEP-18 wrapper). init mints
  // initial_supply (1,000,000 @ 6dp) to the deployer.
  await install("X402_ASSET_PACKAGE_HASH", "PaymentToken.wasm", "amanah_payment_token_package_hash", {
    symbol: CLValue.newCLString("AMANAH"),
    name: CLValue.newCLString("Amanah Test USD"),
    decimals: CLValue.newCLUint8(6),
    initial_supply: CLValue.newCLUInt256(1_000_000_000_000),
  });

  // 5: RwaVault depends on the spend-gate + compliance package hashes (Odra Address = Key).
  await install("RWA_VAULT_HASH", "RwaVault.wasm", "amanah_vault_package_hash", {
    agent: CLValue.newCLKey(accountKey),
    spend_gate: CLValue.newCLKey(Key.newKey(deployed.SPEND_GATE_HASH.prefixed)),
    compliance: CLValue.newCLKey(Key.newKey(deployed.COMPLIANCE_HASH.prefixed)),
    principal: CLValue.newCLUInt512(0),
  });

  // Write bare-hex hashes (agent config strips the prefix) plus a *_KEY line with
  // the full prefixed package key for anything that needs it.
  const lines = ["# Written by agent/src/deploy.ts — Amanah contract package hashes"];
  for (const [v, h] of Object.entries(deployed)) {
    lines.push(`${v}=${h.hex}`);
    lines.push(`${v}_KEY=${h.prefixed}`);
  }
  writeFileSync(ENV_FILE, lines.join("\n") + "\n");
  console.log(`\nDone. Wrote ${Object.keys(deployed).length} contracts to ${ENV_FILE}`);
}

main().catch((e) => {
  console.error("\nDEPLOY FAILED:", e instanceof Error ? e.message : e);
  if (Object.keys(deployed).length) {
    console.error("Partial deploys this run:", deployed);
    // Persist partials so a re-run / manual wiring keeps them.
    appendFileSync(ENV_FILE, `\n# partial (deploy failed mid-run)\n` +
      Object.entries(deployed).map(([v, h]) => `${v}=${h.hex}\n${v}_KEY=${h.prefixed}`).join("\n") + "\n");
  }
  process.exit(1);
});
