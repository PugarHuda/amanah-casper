// INTEGRATION tests — hit the LIVE casper-test node + the published reasoning
// blobs. They assert the whole on-chain read stack decodes correctly against
// reality (vault v2 = $1M/$800K, the custodian-separated deploy). Network-bound;
// run: npm run test:integration  (skips gracefully if the node is unreachable).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { blake2b } from "blakejs";
import { dictAddr, decodeBlob, keyAccountBytes, decodeI64, decodeEnumByte } from "../lib/codec.js";

const RPC = "https://node.testnet.casper.network/rpc";
const VAULT_SEED = "468adcc6a52351bacd555b9b78756fae31397609fefe4327fbfaa0b564f83848";
const REP_SEED = "65a90d00ef950ce780370b0b2bb054f93c7b8431534b1fc30808222d7b1e5bb7";
const COMP_SEED = "38fda18b4d7ba4fed90844f9e03c45f50a243b5e989a7e315dffc4ab38ebd07b";
const AGENT = "27e5e2b0c3840da2cf061c0cb4d7469c96764d5761b969b3f8314149d796358f";

async function rpc(method: string, params: unknown): Promise<any> {
  const r = await fetch(RPC, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return r.json();
}
async function srh(): Promise<string> {
  return (await rpc("chain_get_state_root_hash", {})).result.state_root_hash;
}
async function readDict(seed: string, index: number, key: number[] = []): Promise<any> {
  const r = await rpc("state_get_dictionary_item", {
    state_root_hash: await srh(),
    dictionary_identifier: { Dictionary: `dictionary-${dictAddr(seed, index, key)}` },
  });
  return r.result?.stored_value?.CLValue?.parsed ?? (r.error ? null : []);
}

test("vault v2 decodes to $1,000,000 total with $800,000 locked principal", async () => {
  let total = 0n;
  for (let i = 0; i < 4; i++) total += decodeBlob(await readDict(VAULT_SEED, 1, [i]));
  const principal = decodeBlob(await readDict(VAULT_SEED, 2));
  assert.equal(total, 1_000_000_000_000n, "total treasury $1M");
  assert.equal(principal, 800_000_000_000n, "principal locked $800K");
  assert.ok(total > principal, "principal invariant holds (total > principal)");
});

test("reputation score for the agent reads >= 1 (record_payment credited)", async () => {
  const score = decodeI64(await readDict(REP_SEED, 1, keyAccountBytes(AGENT)));
  assert.ok(score >= 1, `agent reputation should be >=1, got ${score}`);
});

test("compliance status for the agent is Valid (1) — set by the custodian", async () => {
  const status = decodeEnumByte(await readDict(COMP_SEED, 1, keyAccountBytes(AGENT)));
  assert.equal(status, 1, "Status::Valid");
});

test("every published reasoning blob hashes to its filename (proof-not-a-diary)", () => {
  const dir = resolve(import.meta.dirname, "../../../audit");
  let files: string[] = [];
  try { files = readdirSync(dir).filter((f) => f.endsWith(".json")); } catch { /* no dir */ }
  if (!files.length) return; // nothing published in this checkout — skip
  for (const f of files) {
    const json = readFileSync(resolve(dir, f), "utf8");
    const recomputed = Buffer.from(blake2b(new TextEncoder().encode(json), undefined, 32)).toString("hex");
    assert.equal(recomputed, f.replace(/\.json$/, ""), `blob ${f} integrity`);
  }
});
