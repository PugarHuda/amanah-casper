// Read RwaVault on-chain state (per-asset allocations + principal) straight from
// the Odra "state" dictionary — no entrypoint call. Verified derivation:
//   Odra item key = hex( blake2b256( field_index_be32 ++ mapping_key_bytes ) )
//     RwaVault fields are 1-indexed (Odra reserves 0): allocations=1, principal=2.
//     AssetId mapping key = 1 byte variant (Gold0 TBond1 WTI2 CSPR3).
//   Casper dict item address = blake2b256( state_seed_uref_addr ++ ascii(itemKey) )
//   query { Dictionary: "dictionary-<addr>" } -> CLValue (U256/U512).
// The state-dictionary seed uref addr is stable per contract (from install
// effects); pass it via VAULT_STATE_SEED or the constant below.
// Run: npx tsx src/read-vault.ts
import { blake2b } from "blakejs";
import { config } from "./config.js";
import { ASSET_INDEX, type AssetId } from "./types.js";

const RPC = config.rpcUrl;
// RwaVault v2 (c638780d…, custodian-separated) "state" dict seed uref address.
const STATE_SEED =
  process.env.VAULT_STATE_SEED ??
  "468adcc6a52351bacd555b9b78756fae31397609fefe4327fbfaa0b564f83848";

const ALLOCATIONS_INDEX = 1;
const PRINCIPAL_INDEX = 2;

async function rpc(method: string, params: unknown): Promise<any> {
  const r = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  }).then((x) => x.json());
  return r;
}
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
const be32 = (n: number) => new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);

/** Casper Dictionary item address for an Odra field/mapping entry. */
function dictAddr(index: number, mappingKey: number[] = []): string {
  const itemKey = hex(blake2b(new Uint8Array([...be32(index), ...mappingKey]), undefined, 32));
  const seed = Buffer.from(STATE_SEED, "hex");
  return hex(blake2b(Buffer.concat([seed, Buffer.from(itemKey, "utf8")]), undefined, 32));
}

async function readBig(index: number, mappingKey: number[] = []): Promise<bigint> {
  const srh = (await rpc("chain_get_state_root_hash", {})).result.state_root_hash;
  const r = await rpc("state_get_dictionary_item", {
    state_root_hash: srh,
    dictionary_identifier: { Dictionary: `dictionary-${dictAddr(index, mappingKey)}` },
  });
  if (r.error) {
    // Missing item = never written = 0 (get_or_default).
    if (String(r.error.data || r.error.message).includes("not found")) return 0n;
    throw new Error(JSON.stringify(r.error));
  }
  // Odra stores each value as a List<U8> blob = the casper bytesrepr of the value.
  // For U256/U512 that's [significant_byte_count, ...little-endian bytes].
  const arr: number[] = r.result.stored_value.CLValue.parsed ?? [];
  const len = arr[0] ?? 0;
  let v = 0n;
  for (let i = 0; i < len; i++) v += BigInt(arr[1 + i] ?? 0) << BigInt(8 * i);
  return v;
}

export async function readVault(): Promise<{ holdings: Record<AssetId, bigint>; principal: bigint; total: bigint }> {
  const holdings = {} as Record<AssetId, bigint>;
  let total = 0n;
  for (const asset of Object.keys(ASSET_INDEX) as AssetId[]) {
    const v = await readBig(ALLOCATIONS_INDEX, [ASSET_INDEX[asset]]);
    holdings[asset] = v;
    total += v;
  }
  const principal = await readBig(PRINCIPAL_INDEX);
  return { holdings, principal, total };
}

const { holdings, principal, total } = await readVault();
for (const [a, v] of Object.entries(holdings)) console.log(`${a.padEnd(6)} ${v}`);
console.log(`principal ${principal}`);
console.log(`TOTAL     ${total}`);
