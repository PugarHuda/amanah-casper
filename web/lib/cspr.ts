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

const BASE = (process.env.CSPR_CLOUD_BASE || "https://api.testnet.cspr.cloud").trim();
// trim(): guard against a stray newline/space (e.g. from an env-var pipe) that
// would be an "invalid header character" when sent as the authorization header.
const KEY = (process.env.CSPR_CLOUD_API_KEY || "").trim();

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

/**
 * The contract error enum (contracts/src/common.rs). A revert is not a failure here — it
 * is a control firing, so each code is mapped to the control it evidences. This is what
 * turns raw `User error: N` into an exception report a compliance officer can read.
 */
export const CONTRACT_ERRORS: Record<number, { name: string; control: string }> = {
  1: { name: "NotAuthorized", control: "Access control — caller is not the authorised party" },
  2: { name: "OverTxCap", control: "Spend limit — per-transaction cap exceeded" },
  3: { name: "NotAllowlisted", control: "Counterparty allowlist" },
  4: { name: "OverDailyLimit", control: "Spend limit — rolling daily limit exceeded" },
  5: { name: "Expired", control: "Kill switch — gate expired/revoked" },
  6: { name: "NotCompliant", control: "KYC/AML — counterparty not Valid" },
  7: { name: "InvalidAttestation", control: "Proof-of-reasoning — signature did not verify" },
  8: { name: "UnknownSigner", control: "Signer is not an authorised auditor" },
  9: { name: "ReplayedProof", control: "Anti-replay — proof already consumed" },
  10: { name: "TouchesPrincipal", control: "Capital preservation — principal invariant" },
  11: { name: "InsufficientAllocation", control: "Balance check" },
  12: { name: "AddressNotSet", control: "Configuration guard" },
  13: { name: "Frozen", control: "Dead-man's switch — vault frozen" },
  14: { name: "BelowReputationFloor", control: "Circuit breaker — agent benched on reputation" },
  15: { name: "NotStale", control: "Dead-man's switch — agent not actually silent" },
  16: { name: "NotApproved", control: "Separation of duties — auditor quorum has not approved" },
  17: { name: "SameAsset", control: "Value conservation — reallocation must move between assets" },
};

/**
 * Classify a revert. This distinction matters for an evidence pack: a POLICY refusal is a
 * control working as designed, whereas a PLATFORM error (Odra/VM codes, which sit in a
 * high reserved range) is an operational failure. Presenting the two as the same thing
 * would overstate how often the controls fired.
 */
export function describeRevert(
  errorMessage?: string | null,
): { name: string; control: string; kind: "policy" | "platform" } | null {
  if (!errorMessage) return null;
  const m = errorMessage.match(/User error:\s*(\d+)/);
  if (!m) return { name: errorMessage.slice(0, 60), control: "Unclassified revert", kind: "platform" };
  const code = Number(m[1]);
  const known = CONTRACT_ERRORS[code];
  if (known) return { ...known, kind: "policy" };
  return {
    name: `Odra/VM ${code}`,
    control: "Platform or runtime error — not a policy control (e.g. deployment or gas condition)",
    kind: "platform",
  };
}

/** One refused transaction, described as the control (or platform fault) behind it. */
export type Exception = {
  deployHash: string; timestamp: string | null; error: string; name: string; control: string;
  kind: "policy" | "platform";
};

/**
 * Exception report: every transaction a control REFUSED, across the given packages.
 * SEC staff applying Advisers Act Rule 206(4)-7 expect exception reports evidencing that
 * automated systems behaved as intended — refusals are that evidence.
 */
export async function getExceptions(packageHashes: string[], limit = 100): Promise<Exception[]> {
  const hashes = packageHashes.filter(Boolean);
  if (!hashes.length) return [];
  try {
    const lists = await Promise.all(
      hashes.map((h) =>
        cloudGet<{ data?: RawDeploy[] }>(`/deploys?contract_package_hash=${h}&page=1&page_size=${limit}`)
          .then((d) => d.data ?? [])
          .catch(() => []),
      ),
    );
    return lists
      .flat()
      .filter((d) => !!d.error_message)
      .map((d) => {
        const desc = describeRevert(d.error_message)!;
        return {
          deployHash: d.deploy_hash ?? "",
          timestamp: d.timestamp ?? null,
          error: d.error_message ?? "",
          name: desc.name,
          control: desc.control,
          kind: desc.kind,
        };
      })
      .sort((a, b) => (b.timestamp ?? "").localeCompare(a.timestamp ?? ""));
  } catch {
    return [];
  }
}

/**
 * Real on-chain activity for a contract package over the last `days`: how many of its
 * transactions succeeded and how many were REFUSED by a guard rail. Reverts are a
 * feature here — they are the circuit breakers and the auditor quorum doing their job —
 * so we surface both rather than a placeholder metric.
 */
export async function getActivity(
  packageHash: string,
  days = 30,
): Promise<{ executed: number; refused: number; lastAt: string | null } | null> {
  if (!packageHash) return null;
  try {
    const d = await cloudGet<{ data?: RawDeploy[] }>(
      `/deploys?contract_package_hash=${packageHash}&page=1&page_size=100`,
    );
    const rows = d.data ?? [];
    if (!rows.length) return { executed: 0, refused: 0, lastAt: null };
    const cutoff = Date.now() - days * 86_400_000;
    const recent = rows.filter((r) => {
      const t = r.timestamp ? Date.parse(r.timestamp) : NaN;
      return Number.isFinite(t) && t >= cutoff;
    });
    const refused = recent.filter((r) => !!r.error_message).length;
    return {
      executed: recent.length - refused,
      refused,
      lastAt: recent[0]?.timestamp ?? rows[0]?.timestamp ?? null,
    };
  } catch {
    return null;
  }
}

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
    // No fetch-cache: the state-root-hash changes every block, and caching it
    // serves stale reads (e.g. a reputation write looks absent). Page-level ISR
    // (revalidate on /agent, /dashboard) already throttles re-render frequency.
    cache: "no-store",
  });
  return res.json();
}

// Fetch the state-root-hash once, then pass it to every field read in a request —
// the SRH changes per block, so re-fetching it for each of ~12 dashboard reads is
// pure waste. "" signals the node was unreachable.
async function stateRootHash(): Promise<string> {
  return (await rpc("chain_get_state_root_hash", {})).result?.state_root_hash ?? "";
}

async function readBig(srh: string, index: number, mappingKey: number[] = []): Promise<bigint> {
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
    const srh = await stateRootHash();
    // One SRH, all reads in parallel.
    const [g, t, w, c, principal] = await Promise.all([
      readBig(srh, 1, [0]), readBig(srh, 1, [1]), readBig(srh, 1, [2]), readBig(srh, 1, [3]),
      readBig(srh, 2),
    ]);
    const holdings = { Gold: g, TBond: t, WTI: w, CSPR: c } as Record<VaultAsset, bigint>;
    const total = g + t + w + c;
    return { holdings, principal, total };
  } catch {
    return null;
  }
}

// --- SpendGate live limits (Var fields, U512 blob, 6-dp USD units) -----------
// Field order from spend_gate.rs (1-indexed, Odra reserves 0): owner=1,
// max_per_tx=2, daily_limit=3, spent_today=4. Needs SPENDGATE_STATE_SEED.
const SPENDGATE_SEED = process.env.SPENDGATE_STATE_SEED || "";
export const spendGateReadable = () => !!SPENDGATE_SEED;

function sgDictAddr(index: number): string {
  const itemKey = hex(blake2b(new Uint8Array([...be32(index)]), undefined, 32));
  const seed = Buffer.from(SPENDGATE_SEED, "hex");
  return hex(blake2b(Buffer.concat([seed, Buffer.from(itemKey, "utf8")]), undefined, 32));
}

async function sgReadBig(srh: string, index: number): Promise<bigint> {
  if (!srh) return 0n;
  const r = await rpc("state_get_dictionary_item", {
    state_root_hash: srh,
    dictionary_identifier: { Dictionary: `dictionary-${sgDictAddr(index)}` },
  });
  if (r.error) return 0n;
  const arr: number[] = r.result?.stored_value?.CLValue?.parsed ?? [];
  const len = arr[0] ?? 0;
  let v = 0n;
  for (let i = 0; i < len; i++) v += BigInt(arr[1 + i] ?? 0) << BigInt(8 * i);
  return v;
}

/** Live SpendGate limits (atomic 6-dp USD units). null if seed unset. */
export async function getSpendGateState(): Promise<{ maxPerTx: bigint; dailyLimit: bigint; spentToday: bigint } | null> {
  if (!SPENDGATE_SEED) return null;
  try {
    const srh = await stateRootHash();
    const [maxPerTx, dailyLimit, spentToday] = await Promise.all([sgReadBig(srh, 2), sgReadBig(srh, 3), sgReadBig(srh, 4)]);
    return { maxPerTx, dailyLimit, spentToday };
  } catch {
    return null;
  }
}

// --- ComplianceRegistry status + SpendGate allowlist (live KYC/allowlist) ----
// Compliance status: Mapping<Address,Status> field 1; Status enum byte 0=Pending,
// 1=Valid, 2=Revoked. SpendGate allowlist: Mapping<Address,bool> field 7.
// Mapping key = Key::Account bytesrepr = [0x00] + 32 account-hash bytes.
const COMPLIANCE_SEED = process.env.COMPLIANCE_STATE_SEED || "";
export const complianceReadable = () => !!COMPLIANCE_SEED && !!SPENDGATE_SEED;

const STATUS_LABEL = ["Pending", "Valid", "Revoked"] as const;

async function readByte(srh: string, seed: string, index: number, mappingKey: number[]): Promise<number | null> {
  if (!srh) return null;
  const itemKey = hex(blake2b(new Uint8Array([...be32(index), ...mappingKey]), undefined, 32));
  const dictAddr = hex(blake2b(Buffer.concat([Buffer.from(seed, "hex"), Buffer.from(itemKey, "utf8")]), undefined, 32));
  const r = await rpc("state_get_dictionary_item", {
    state_root_hash: srh,
    dictionary_identifier: { Dictionary: `dictionary-${dictAddr}` },
  });
  if (r.error) return null; // missing entry
  const p = r.result?.stored_value?.CLValue?.parsed;
  if (Array.isArray(p)) return p[0] ?? 0;
  if (typeof p === "number") return p;
  if (typeof p === "boolean") return p ? 1 : 0;
  return null;
}

/** Live KYC status + allowlist flag for an account-hash (hex). */
export async function getComplianceState(
  accountHashHex: string,
): Promise<{ status: string; allowlisted: boolean } | null> {
  if (!COMPLIANCE_SEED || !SPENDGATE_SEED || accountHashHex.length !== 64) return null;
  try {
    const key = [0x00, ...Array.from(Buffer.from(accountHashHex, "hex"))];
    const srh = await stateRootHash();
    // ComplianceRegistry v3 struct order: owner=1, status=2, identity_hash=3 (Odra
    // 1-indexes by declaration order; adding owner shifted status from 1 to 2).
    const [statusByte, allowByte] = await Promise.all([
      readByte(srh, COMPLIANCE_SEED, 2, key),
      readByte(srh, SPENDGATE_SEED, 7, key),
    ]);
    return {
      status: STATUS_LABEL[statusByte ?? 0] ?? "Pending",
      allowlisted: (allowByte ?? 0) === 1,
    };
  } catch {
    return null;
  }
}

// --- RwaVault v4 circuit breaker: live frozen flag (Var field 10) -----------
/** Live dead-man's-switch state from the vault (frozen = Var field 10, a bool).
 *  null if the vault seed is unset. */
export async function getVaultFrozen(): Promise<boolean | null> {
  if (!STATE_SEED) return null;
  try {
    const srh = await stateRootHash();
    const byte = await readByte(srh, STATE_SEED, 10, []); // frozen: Var<bool>, no mapping key
    return byte == null ? false : byte === 1; // absent => never frozen => false
  } catch {
    return null;
  }
}

// --- ZkReserves: live ZK proof-of-reserves solvency (Var field 1) -----------
const RESERVES_SEED = (process.env.ZK_RESERVES_STATE_SEED || "").trim();
/** Live solvency flag from the ZkReserves contract (solvent = Var field 1, a bool).
 *  True once a valid ZK proof-of-reserves was verified on-chain. */
export async function getReservesSolvent(): Promise<boolean | null> {
  if (!RESERVES_SEED) return null;
  try {
    const srh = await stateRootHash();
    const byte = await readByte(srh, RESERVES_SEED, 1, []); // solvent: Var<bool>, no mapping key
    return byte == null ? false : byte === 1;
  } catch {
    return null;
  }
}

// --- ZkKycVerifier: live zero-knowledge KYC status --------------------------
// zk_verified: Mapping<Address,bool> is field 3 (struct order authority=1,
// credentials=2, zk_verified=3; Odra 1-indexes, reserves 0). Key = Key::Account.
const ZK_SEED = (process.env.ZK_KYC_STATE_SEED || "").trim();
export const zkReadable = () => !!ZK_SEED;

/** Live ZK-KYC verification flag for an account-hash (hex). true once the agent has
 *  proven knowledge of its KYC credential on-chain. null if unreadable / not proven. */
export async function getZkVerified(accountHashHex: string): Promise<boolean | null> {
  if (!ZK_SEED || accountHashHex.length !== 64) return null;
  try {
    const srh = await stateRootHash();
    const key = [0x00, ...Array.from(Buffer.from(accountHashHex, "hex"))];
    const byte = await readByte(srh, ZK_SEED, 3, key);
    return byte == null ? null : byte === 1;
  } catch {
    return null;
  }
}

// --- ReputationRegistry score (Mapping<Address,i64>, field index 1) ----------
// score key = Key::Account bytesrepr = [0x00] + 32 account-hash bytes. i64 parsed
// comes back as an 8-byte little-endian array on Casper 2.0. Needs REPUTATION_STATE_SEED.
const REP_SEED = process.env.REPUTATION_STATE_SEED || "";
export const reputationReadable = () => !!REP_SEED;

function repDictAddr(index: number, mappingKey: number[]): string {
  const itemKey = hex(blake2b(new Uint8Array([...be32(index), ...mappingKey]), undefined, 32));
  const seed = Buffer.from(REP_SEED, "hex");
  return hex(blake2b(Buffer.concat([seed, Buffer.from(itemKey, "utf8")]), undefined, 32));
}

/** Live reputation score for an account-hash (hex, no prefix). null if unreadable. */
export async function getReputationScore(accountHashHex: string): Promise<number | null> {
  if (!REP_SEED || accountHashHex.length !== 64) return null;
  try {
    const srh = (await rpc("chain_get_state_root_hash", {})).result?.state_root_hash;
    if (!srh) return null;
    const mappingKey = [0x00, ...Array.from(Buffer.from(accountHashHex, "hex"))];
    const r = await rpc("state_get_dictionary_item", {
      state_root_hash: srh,
      dictionary_identifier: { Dictionary: `dictionary-${repDictAddr(1, mappingKey)}` },
    });
    if (r.error) return 0; // missing = get_or_default = 0
    const v = r.result?.stored_value?.CLValue?.parsed;
    if (typeof v === "number") return Math.round(v);
    if (Array.isArray(v)) {
      let n = 0n;
      for (let i = 0; i < v.length; i++) n |= BigInt(v[i] & 0xff) << BigInt(8 * i);
      if (n >= 1n << 63n) n -= 1n << 64n;
      return Number(n);
    }
    return 0;
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
