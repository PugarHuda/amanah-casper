// Thin CSPR.cloud testnet REST read client. Only the reads the screens need.
// Auth + base from env; no SDK, just fetch. All calls are server-side (the API
// key must never reach the browser) so these run inside Server Components.
//
// Verified against docs.cspr.cloud:
//   base (testnet)  https://api.testnet.cspr.cloud
//   auth header     authorization: <access_key>
//   GET /accounts/{public_key}/deploys      (account deploys)
//   GET /deploys                            (deploys list)
//   GET /rates/{currency_id}/latest         (currency rate)
// Account/contract GETs below are idiomatic but unconfirmed — see ponytail notes.

import { blake2b } from "blakejs";

const BASE = process.env.CSPR_CLOUD_BASE || "https://api.testnet.cspr.cloud";
const KEY = process.env.CSPR_CLOUD_API_KEY || "";

export const cloudConfigured = () => !!KEY;

async function cloudGet<T = unknown>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { accept: "application/json", authorization: KEY },
    // ponytail: 60s ISR cache via native Next fetch; drop/lower if you need realtime.
    next: { revalidate: 60 },
  });
  if (!res.ok) throw new Error(`CSPR.cloud ${path} -> ${res.status}`);
  return res.json() as Promise<T>;
}

// --- CSPR price / rate -----------------------------------------------------
// ponytail: verify CSPR.cloud endpoint — currency_id mapping. "1" assumed = USD;
// set CSPR_CLOUD_RATE_CURRENCY if different. Response shape unverified, so we
// probe a couple of likely fields.
export async function getCsprRate(): Promise<number | null> {
  const cur = process.env.CSPR_CLOUD_RATE_CURRENCY || "1";
  try {
    const d = await cloudGet<{ data?: { amount?: number; rate?: number }; amount?: number; rate?: number }>(
      `/rates/${cur}/latest`
    );
    return d.data?.amount ?? d.data?.rate ?? d.amount ?? d.rate ?? null;
  } catch {
    return null;
  }
}

// --- Vault contract state --------------------------------------------------
// ponytail: verify CSPR.cloud endpoint — GET /contracts/{hash}. Returns contract
// metadata; the treasury totals/holdings live in named keys or a dictionary whose
// layout is contract-specific. Decode once RwaVault is deployed and its ABI known.
export async function getContract(contractHash: string): Promise<Record<string, unknown> | null> {
  try {
    return await cloudGet<Record<string, unknown>>(`/contracts/${contractHash}`);
  } catch {
    return null;
  }
}

// --- Recent deploys (audit trail) ------------------------------------------
// Verified live against api.testnet.cspr.cloud: GET /deploys returns
// { item_count, page_count, data: [ { deploy_hash, timestamp, status,
// error_message, contract_package_hash, entry_point_id, ... } ] }. Note there is
// NO string `entry_point` field — only numeric `entry_point_id` — so we label
// rows by which contract (contract_package_hash) was called, not the EP name.
// Filtering by `?contract_package_hash=<hash>` is supported (verified).
export type RawDeploy = {
  deploy_hash?: string;
  timestamp?: string;
  status?: string;
  error_message?: string | null;
  contract_package_hash?: string;
  entry_point_id?: number;
};

/** Total deploy count for a contract package from CSPR.cloud item_count. */
export async function getDeployCount(packageHash: string): Promise<number | null> {
  try {
    const d = await cloudGet<{ item_count?: number }>(
      `/deploys?contract_package_hash=${packageHash}&page=1&page_size=1`,
    );
    return d.item_count ?? null;
  } catch {
    return null;
  }
}

export async function getRecentDeploys(limit = 6): Promise<RawDeploy[]> {
  try {
    const d = await cloudGet<{ data?: RawDeploy[] }>(`/deploys?page=1&page_size=${limit}`);
    return d.data ?? [];
  } catch {
    return [];
  }
}

// Deploys for our own contracts only — fetch per package hash, merge, newest first.
export async function getContractDeploys(
  packageHashes: string[],
  limit = 6,
): Promise<RawDeploy[]> {
  const hashes = packageHashes.filter(Boolean);
  if (!hashes.length) return getRecentDeploys(limit);
  try {
    const lists = await Promise.all(
      hashes.map((h) =>
        cloudGet<{ data?: RawDeploy[] }>(
          `/deploys?contract_package_hash=${h}&page=1&page_size=${limit}`,
        ).then((d) => d.data ?? []),
      ),
    );
    return lists
      .flat()
      .sort((a, b) => (b.timestamp ?? "").localeCompare(a.timestamp ?? ""))
      .slice(0, limit);
  } catch {
    return [];
  }
}

// --- RwaVault on-chain state (Odra "state" dictionary, no entrypoint call) ---
// Verified derivation (see agent/src/read-vault.ts): each Var/Mapping value lives
// in the contract's named dictionary "state" under item key
//   hex( blake2b256( field_index_be32 ++ mapping_key_bytes ) )
// RwaVault fields are 1-indexed (Odra reserves 0): allocations=1, principal=2;
// AssetId mapping key = 1-byte variant. The Casper dict address is then
//   blake2b256( state_seed_uref_addr ++ ascii(item_key) ), queried as
//   { Dictionary: "dictionary-<addr>" }. Values are stored as a List<U8> blob =
//   the bytesrepr of U256/U512: [significant_byte_count, ...little-endian bytes].
const RPC = process.env.CASPER_RPC_URL || "https://node.testnet.casper.network/rpc";
const STATE_SEED = process.env.VAULT_STATE_SEED || ""; // vault "state" dict seed uref addr (hex)
export const ASSET_ORDER = ["Gold", "TBond", "WTI", "CSPR"] as const;
export type VaultAsset = (typeof ASSET_ORDER)[number];

export const vaultReadable = () => !!STATE_SEED;

const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
const be32 = (n: number) =>
  new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);

function dictAddr(index: number, mappingKey: number[] = []): string {
  const itemKey = hex(blake2b(new Uint8Array([...be32(index), ...mappingKey]), undefined, 32));
  const seed = Buffer.from(STATE_SEED, "hex");
  return hex(blake2b(Buffer.concat([seed, Buffer.from(itemKey, "utf8")]), undefined, 32));
}

async function rpc(method: string, params: unknown): Promise<{ result?: any; error?: any }> {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    next: { revalidate: 60 },
  });
  return res.json();
}

async function readBig(index: number, mappingKey: number[] = []): Promise<bigint> {
  const srh = (await rpc("chain_get_state_root_hash", {})).result?.state_root_hash;
  if (!srh) return 0n;
  const r = await rpc("state_get_dictionary_item", {
    state_root_hash: srh,
    dictionary_identifier: { Dictionary: `dictionary-${dictAddr(index, mappingKey)}` },
  });
  if (r.error) return 0n; // missing item => never written => 0 (get_or_default)
  const arr: number[] = r.result?.stored_value?.CLValue?.parsed ?? [];
  const len = arr[0] ?? 0;
  let v = 0n;
  for (let i = 0; i < len; i++) v += BigInt(arr[1 + i] ?? 0) << BigInt(8 * i);
  return v;
}

/** Live per-asset allocations + principal from RwaVault. Atomic 6-dp units. */
export async function getVaultState(): Promise<{
  holdings: Record<VaultAsset, bigint>;
  principal: bigint;
  total: bigint;
} | null> {
  if (!STATE_SEED) return null;
  try {
    const holdings = {} as Record<VaultAsset, bigint>;
    let total = 0n;
    for (let i = 0; i < ASSET_ORDER.length; i++) {
      const v = await readBig(1, [i]); // allocations[AssetId(i)]
      holdings[ASSET_ORDER[i]] = v;
      total += v;
    }
    const principal = await readBig(2);
    return { holdings, principal, total };
  } catch {
    return null;
  }
}

// --- formatting helpers (shared by data.ts mappers) ------------------------
export function shortHash(h?: string): string {
  if (!h) return "—";
  const s = h.replace(/^0x/, "");
  return `0x${s.slice(0, 4)}·${s.slice(4, 8)}·…·${s.slice(-4)}`;
}

export function relTime(ts?: string): string {
  if (!ts) return "";
  const diff = Date.now() - new Date(ts).getTime();
  if (Number.isNaN(diff)) return "";
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
