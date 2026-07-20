// Prove the DEAD-MAN'S SWITCH on-chain, for real.
//
// It was only ever proven in the OdraVM test suite while every other guard rail has a
// public transaction. This runs it live against the SUPERSEDED vault v5 (no longer the
// vault the dashboard reads, and long past its last heartbeat) so nothing in production
// is disturbed:
//
//   1. an UNRELATED THIRD PARTY (auditor2 — not the agent, not the custodian) trips the
//      switch on a vault whose agent has gone silent            -> frozen
//   2. that same third party tries to lift the freeze           -> NotAuthorized
//   3. the custodian lifts it                                    -> unfrozen
//
// Run: DRY_RUN=false npx tsx src/demo-deadman.ts
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadPrivateKey, makeRpcClient, callEntryPoint } from "./casper.js";
import { CLValue, Args } from "./sdk.js";
import { config } from "./config.js";

const VAULT_V5 = "540051ac4dacd251a9afe8bb14e4b47199ea7cdfb55f861e1531d17b4b47a1d1";
const SIX_HOURS_MS = 21_600_000; // MIN_STALE_MS in the contract
const STATE = resolve(import.meta.dirname, "../../.env.deadman");
const SECRET = resolve(import.meta.dirname, "../secret");

const rpc = makeRpcClient(config.rpcUrl);
const custodian = loadPrivateKey(resolve(SECRET, "custodian_key.pem"));
const thirdParty = loadPrivateKey(resolve(SECRET, "auditor2_key.pem")); // neither agent nor custodian

const state: Record<string, string> = {};
if (existsSync(STATE)) for (const l of readFileSync(STATE, "utf8").split("\n")) {
  const m = l.match(/^([A-Za-z0-9_]+)=(.+)$/); if (m) state[m[1]] = m[2].trim();
}
const save = (k: string, v: string) => { state[k] = v; writeFileSync(STATE, Object.entries(state).map(([a, b]) => `${a}=${b}`).join("\n") + "\n"); };

async function call(
  key: typeof custodian,
  entryPoint: string,
  args: Parameters<typeof Args.fromMap>[0],
) {
  try {
    const { deployHash } = await callEntryPoint({
      rpc, key, contractHash: VAULT_V5, entryPoint,
      args: Args.fromMap(args), chainName: config.chainName, paymentMotes: config.paymentMotes,
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
  console.log("vault (superseded v5):", VAULT_V5.slice(0, 12) + "…");
  console.log("third party          :", thirdParty.publicKey.toHex().slice(0, 14) + "…  (not the agent, not the custodian)\n");

  // 1. Anyone may trip the switch once the agent has been silent past the window.
  if (!state.FROZEN) {
    const r = await call(thirdParty, "freeze_if_stale", { max_age_ms: CLValue.newCLUint64(SIX_HOURS_MS) });
    console.log("[1] third party trips the dead-man's switch:", r.hash, "->", r.ok ? "FROZEN" : `refused (${r.error})`);
    if (!r.ok) throw new Error(`freeze refused: ${r.error} — the vault is not stale enough yet (needs 6h of silence)`);
    save("FROZEN", r.hash);
  }

  // 2. That same third party must NOT be able to lift it.
  if (!state.UNFREEZE_DENIED) {
    const r = await call(thirdParty, "unfreeze", {});
    console.log("[2] third party tries to unfreeze  :", r.hash, "->", r.ok ? "UNEXPECTEDLY OK" : `DENIED (${r.error})`);
    if (r.ok) throw new Error("a non-custodian was able to unfreeze — that is a security hole");
    save("UNFREEZE_DENIED", r.hash);
  }

  // 3. Only the custodian can lift it, after a human has reviewed the incident.
  if (!state.UNFROZEN) {
    const r = await call(custodian, "unfreeze", {});
    console.log("[3] custodian lifts the freeze     :", r.hash, "->", r.ok ? "UNFROZEN" : `failed (${r.error})`);
    if (!r.ok) throw new Error("custodian unfreeze failed: " + r.error);
    save("UNFROZEN", r.hash);
  }

  console.log("\n=== DEAD-MAN'S SWITCH PROVEN ON-CHAIN ===");
  console.log("frozen by a third party :", state.FROZEN);
  console.log("non-custodian unfreeze  :", state.UNFREEZE_DENIED, "(denied)");
  console.log("custodian unfroze       :", state.UNFROZEN);
}

main().catch((e) => { console.error("FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
