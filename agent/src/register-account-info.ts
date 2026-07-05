// Register the agent's identity with MAKE's Casper Account Info contract so the
// account shows up as "Amanah" (verified) on cspr.live / CSPR.cloud — a real
// partner-tool identity adoption. Two halves:
//   1. host /.well-known/casper/account-info.casper-test.json on our domain (done in web/public)
//   2. call set_url(<domain>) on the account-info contract from the agent account
// The explorer then fetches the JSON, sees the agent's public key in
// affiliated_accounts, and displays the verified name. First set_url burns ~9 CSPR.
// Run: DRY_RUN=false npx tsx src/register-account-info.ts
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadPrivateKey, makeRpcClient, callEntryPoint } from "./casper.js";
import { CLValue, Args } from "./sdk.js";
import { config } from "./config.js";

// Account Info contract PACKAGE hash on casper-test (contract 2f36a35e… lives in it).
const ACCOUNT_INFO_PKG = "b37227b83822aba42c72e9ee441e681f102929d608c7acf28d4bc2024dca0215";
const DOMAIN = "https://amanah-casper-rwa.vercel.app";
const STATE = resolve(import.meta.dirname, "../../.env.accountinfo");

const key = loadPrivateKey(config.agentKeyPath);
const rpc = makeRpcClient(config.rpcUrl);

const state: Record<string, string> = {};
if (existsSync(STATE)) for (const l of readFileSync(STATE, "utf8").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.+)$/); if (m) state[m[1]] = m[2].trim();
}

async function main() {
  if (config.dryRun) throw new Error("DRY_RUN is on — run with DRY_RUN=false");
  console.log("agent   ", key.publicKey.toHex());
  console.log("domain  ", DOMAIN);
  console.log("account-info pkg", ACCOUNT_INFO_PKG, "\n");

  const { deployHash } = await callEntryPoint({
    rpc, key, contractHash: ACCOUNT_INFO_PKG,
    entryPoint: "set_url",
    args: Args.fromMap({ url: CLValue.newCLString(DOMAIN) }),
    chainName: config.chainName,
    // First set_url burns ~9 CSPR + gas — budget generously.
    paymentMotes: 12_000_000_000,
  });
  writeFileSync(STATE, `SET_URL=${deployHash}\n`);
  console.log("set_url:", deployHash);
  console.log("\nVerify: it must NOT revert, and");
  console.log(`  ${DOMAIN}/.well-known/casper/account-info.casper-test.json must serve the JSON.`);
  console.log("Then cspr.live will show the agent account as 'Amanah' (verified).");
}

main().catch((e) => { console.error("FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
