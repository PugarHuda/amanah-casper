// Real native CSPR staking (real yield). The treasury's CSPR reserve leg doesn't have to sit
// idle — Casper pays native staking rewards to delegators. This delegates a slice of the
// treasury's CSPR to an established validator through the system auction contract, so "yield
// only, principal preserved" becomes literally true with REAL native yield: the delegated
// principal is recoverable (undelegate), and rewards accrue every era.
//
// Signed by the CUSTODIAN — the treasury's controlling authority — because staking the reserve
// is a treasury action, not an agent trade. The staked position and its rewards are then public
// on-chain (state_get_auction_info), so this is verifiable, not asserted.
//
// Run:  DRY_RUN=false npx tsx src/stake.ts
// Env override: STAKE_VALIDATOR, STAKE_AMOUNT_CSPR (min 500), STAKE_PAYMENT_CSPR.
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadPrivateKey, makeRpcClient } from "./casper.js";
import { config } from "./config.js";
import { makeAuctionManagerDeploy, AuctionManagerEntryPoint, CasperNetworkName } from "./sdk.js";

// Established testnet validator (7.4M CSPR staked, 178+ delegators, 10% commission) — chosen
// for reliability. Override with STAKE_VALIDATOR to stake elsewhere.
const VALIDATOR = process.env.STAKE_VALIDATOR || "0106ca7c39cd272dbf21a86eeb3b36b7c26e2e9b94af64292419f7862936bca2ca";
const AMOUNT_CSPR = BigInt(process.env.STAKE_AMOUNT_CSPR || "500"); // network minimum is 500
const PAYMENT_CSPR = BigInt(process.env.STAKE_PAYMENT_CSPR || "5");
const MOTES = 1_000_000_000n;
const STATE = resolve(import.meta.dirname, "../../.env.stake");

const rpc = makeRpcClient(config.rpcUrl);

const state: Record<string, string> = {};
if (existsSync(STATE)) for (const l of readFileSync(STATE, "utf8").split("\n")) { const m = l.match(/^([A-Za-z0-9_]+)=(.+)$/); if (m) state[m[1]] = m[2].trim(); }
const save = (k: string, v: string) => { state[k] = v; writeFileSync(STATE, Object.entries(state).map(([a, b]) => `${a}=${b}`).join("\n") + "\n"); };

async function waitForDeploy(hash: string): Promise<void> {
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    const r = await fetch(config.rpcUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "info_get_deploy", params: { deploy_hash: hash } }) }).then((x) => x.json()) as { result?: { execution_info?: { execution_result?: Record<string, { error_message?: string }> } } };
    const info = r?.result?.execution_info;
    if (info?.execution_result) {
      const v2 = (info.execution_result.Version2 ?? info.execution_result) as { error_message?: string };
      if (v2?.error_message) throw new Error(`reverted: ${v2.error_message}`);
      return;
    }
    await new Promise((res) => setTimeout(res, 5000));
  }
  throw new Error("timed out waiting for delegate deploy");
}

/** Read the treasury's live staked position + accrued delegation at this validator. */
async function readStake(delegatorPk: string): Promise<{ staked: bigint } | null> {
  const r = await fetch(config.rpcUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "state_get_auction_info", params: [] }) }).then((x) => x.json()) as { result?: { auction_state?: { bids?: { public_key?: string; bid?: { delegators?: { delegator_public_key?: string; public_key?: string; staked_amount?: string }[] } }[] } } };
  const bid = r?.result?.auction_state?.bids?.find((b) => b.public_key?.toLowerCase() === VALIDATOR.toLowerCase());
  const d = bid?.bid?.delegators?.find((x) => (x.delegator_public_key ?? x.public_key)?.toLowerCase() === delegatorPk.toLowerCase());
  return d ? { staked: BigInt(d.staked_amount ?? "0") } : null;
}

async function main() {
  if (config.dryRun) throw new Error("DRY_RUN is on — run with DRY_RUN=false to stake real CSPR");
  if (AMOUNT_CSPR < 500n) throw new Error("minimum delegation is 500 CSPR");
  const custodian = loadPrivateKey(config.custodianKeyPath);
  const delegatorPk = custodian.publicKey.toHex();
  console.log(`Delegating ${AMOUNT_CSPR} CSPR from treasury custodian to validator ${VALIDATOR.slice(0, 16)}…`);

  if (!state.DELEGATE) {
    const deploy = makeAuctionManagerDeploy({
      contractEntryPoint: AuctionManagerEntryPoint.delegate,
      delegatorPublicKeyHex: delegatorPk,
      validatorPublicKeyHex: VALIDATOR,
      amount: (AMOUNT_CSPR * MOTES).toString(),
      paymentAmount: (PAYMENT_CSPR * MOTES).toString(),
      chainName: CasperNetworkName.Testnet,
    });
    deploy.sign(custodian);
    const hash = (await rpc.putDeploy(deploy)).deployHash.toHex();
    console.log("  delegate deploy:", hash);
    await waitForDeploy(hash);
    save("DELEGATE", hash);
    save("VALIDATOR", VALIDATOR);
    save("AMOUNT_CSPR", AMOUNT_CSPR.toString());
    console.log("  ✅ delegated — SUCCESS on-chain");
  } else {
    console.log("  already delegated:", state.DELEGATE);
  }

  // Prove the position is real — read it back from the auction state.
  const pos = await readStake(delegatorPk);
  if (pos) {
    console.log(`  📈 live staked position: ${pos.staked / MOTES} CSPR at this validator — earning native rewards every era`);
    save("STAKED_MOTES", pos.staked.toString());
  } else {
    console.log("  (position not yet visible in auction state — may take an era to appear)");
  }
  console.log("\n=== treasury CSPR reserve now earns REAL native staking yield ===");
  console.log("delegate:", state.DELEGATE, "| validator:", VALIDATOR);
  console.log("verify:  state_get_auction_info → bids[validator].delegators[custodian]");
}

main().catch((e) => { console.error("FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
