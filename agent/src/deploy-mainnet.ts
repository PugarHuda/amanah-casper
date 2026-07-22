// Push-button Casper MAINNET touch.
//
// The submission requires TESTNET; mainnet is a differentiator ("live on mainnet", which the
// closest rivals have and we don't). The full 12-contract suite on mainnet costs ~$8-16 of
// CSPR, but a genuine, verifiable mainnet presence is much cheaper: deploy the AttestationLog
// (the proof-of-reasoning heart) and attest one real decision — ~500 CSPR (~$1). That yields
// a real deploy on cspr.live's MAINNET explorer, killing "testnet-only".
//
// This is push-button: it generates a mainnet key if needed, checks the balance, and — only
// once funded — deploys + attests. Run:
//   npx tsx src/deploy-mainnet.ts          (prints the address to fund, or deploys if funded)
// Then fund the printed address with ~500 CSPR from any exchange and re-run.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { blake2b } from "blakejs";
import { makeRpcClient } from "./casper.js";
import { SessionBuilder, AccountIdentifier, CLValue, CLTypeUInt8, Args, PrivateKey, KeyAlgorithm } from "./sdk.js";
import type { PrivateKey as PrivateKeyT } from "casper-js-sdk";

const RPC = process.env.MAINNET_RPC_URL || "https://node.mainnet.casper.network/rpc";
const CHAIN = "casper"; // mainnet chain name (testnet is "casper-test")
const WASM = resolve(import.meta.dirname, "../../contracts/wasm/AttestationLog.lowered.wasm");
const KEY_PEM = process.env.MAINNET_KEY_PEM || resolve(import.meta.dirname, "../secret/mainnet_key.pem");
const STATE = resolve(import.meta.dirname, "../../.env.mainnet");
const KEY_NAME = "amanah_attestation_mainnet_package_hash";
// A real reasoning hash from an attested testnet cycle — the same decision, now on mainnet.
const REASONING_HASH = process.env.MAINNET_REASONING_HASH || "7c409e7bfce729cea460c03d3557277ad14e12da2b5d1a82c35860b60fba2df4";

const rpc = makeRpcClient(RPC);
const state: Record<string, string> = {};
if (existsSync(STATE)) for (const l of readFileSync(STATE, "utf8").split("\n")) { const m = l.match(/^([A-Za-z0-9_]+)=(.+)$/); if (m) state[m[1]] = m[2].trim(); }
const save = (k: string, v: string) => { state[k] = v; writeFileSync(STATE, Object.entries(state).map(([a, b]) => `${a}=${b}`).join("\n") + "\n"); };

function loadOrGenKey(): PrivateKeyT {
  if (existsSync(KEY_PEM)) return PrivateKey.fromPem(readFileSync(KEY_PEM, "utf8"), KeyAlgorithm.ED25519);
  const k = PrivateKey.generate(KeyAlgorithm.ED25519);
  writeFileSync(KEY_PEM, k.toPem());
  console.log(`  generated a fresh MAINNET key at ${KEY_PEM}`);
  return PrivateKey.fromPem(readFileSync(KEY_PEM, "utf8"), KeyAlgorithm.ED25519);
}

async function mainnetBalanceMotes(pubHex: string): Promise<bigint> {
  const r: any = await fetch(RPC, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "query_balance", params: { purse_identifier: { main_purse_under_public_key: pubHex } } }),
  }).then((x) => x.json());
  const b = r?.result?.balance;
  return b ? BigInt(b) : 0n;
}

async function waitForDeploy(hash: string): Promise<void> {
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    const r: any = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "info_get_deploy", params: { deploy_hash: hash } }) }).then((x) => x.json());
    const info = r?.result?.execution_info;
    if (info?.execution_result) { const v2 = info.execution_result.Version2 ?? info.execution_result; if (v2?.error_message) throw new Error(`reverted: ${v2.error_message}`); return; }
    await new Promise((res) => setTimeout(res, 5000));
  }
  throw new Error("timed out");
}

async function main() {
  const key = loadOrGenKey();
  const pub = key.publicKey;
  const pubHex = pub.toHex();
  const acct = pub.accountHash().toHex();
  console.log("MAINNET key:", pubHex);
  console.log("MAINNET account-hash:", acct);

  const bal = await mainnetBalanceMotes(pubHex);
  const cspr = Number(bal) / 1e9;
  console.log(`MAINNET balance: ${cspr.toFixed(2)} CSPR`);

  const NEED = 400_000_000_000n; // ~400 CSPR: one contract install + one attest
  if (bal < NEED) {
    console.log("\n⛔ Not enough CSPR to deploy yet.");
    console.log(`   FUND THIS ADDRESS with ~500 CSPR (≈ $1) from any exchange, then re-run:`);
    console.log(`   ${pubHex}`);
    console.log("   (Buy CSPR on Coinbase/Gate/KuCoin/etc., withdraw to the public key above on Casper mainnet.)");
    return;
  }

  // 1) install AttestationLog on mainnet
  if (!state.ATTESTATION_MAINNET) {
    const wasm = new Uint8Array(readFileSync(WASM));
    const tx = new SessionBuilder().from(pub).chainName(CHAIN).wasm(wasm).installOrUpgrade().runtimeArgs(Args.fromMap({
      odra_cfg_package_hash_key_name: CLValue.newCLString(KEY_NAME),
      odra_cfg_allow_key_override: CLValue.newCLValueBool(false),
      odra_cfg_is_upgradable: CLValue.newCLValueBool(false),
      odra_cfg_is_upgrade: CLValue.newCLValueBool(false),
      agent_pubkey: CLValue.newCLPublicKey(pub),
    })).payment(300_000_000_000).buildFor1_5();
    tx.sign(key);
    const dh = (await rpc.putTransaction(tx)).transactionHash.toHex();
    console.log("\ninstall AttestationLog (MAINNET):", dh, "— waiting..."); await waitForDeploy(dh);
    const info = await rpc.getAccountInfo(null, new AccountIdentifier(undefined, pub));
    const nk = info.account.namedKeys.find((k) => k.name === KEY_NAME);
    if (!nk) throw new Error("named key absent");
    save("ATTESTATION_MAINNET", nk.key.toPrefixedString().replace(/^.*-/, ""));
    save("INSTALL_DEPLOY", dh);
    console.log("  ATTESTATION_MAINNET =", state.ATTESTATION_MAINNET);
  }

  // 2) attest one decision on mainnet (sign the reasoning hash, verified in-contract)
  if (!state.ATTEST_DEPLOY) {
    const hash = Uint8Array.from(Buffer.from(REASONING_HASH, "hex"));
    const sig = key.signAndAddAlgorithmBytes(hash);
    const { callEntryPoint } = await import("./casper.js");
    const { deployHash } = await callEntryPoint({
      rpc, key, contractHash: state.ATTESTATION_MAINNET, entryPoint: "attest",
      args: Args.fromMap({
        reasoning_hash: CLValue.newCLByteArray(hash),
        decision: CLValue.newCLString("Amanah proof-of-reasoning — live on Casper MAINNET"),
        signature: CLValue.newCLList(CLTypeUInt8, Array.from(sig, (b) => CLValue.newCLUint8(b))),
        pubkey: CLValue.newCLPublicKey(pub),
      }),
      chainName: CHAIN, paymentMotes: 5_000_000_000,
    });
    save("ATTEST_DEPLOY", deployHash);
    console.log("attest ON MAINNET:", deployHash);
  }

  console.log("\n=== LIVE ON CASPER MAINNET ===");
  console.log("AttestationLog:", state.ATTESTATION_MAINNET);
  console.log("install:", `https://cspr.live/deploy/${state.INSTALL_DEPLOY}`);
  console.log("attest :", `https://cspr.live/deploy/${state.ATTEST_DEPLOY}`);
}

main().catch((e) => { console.error("FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
