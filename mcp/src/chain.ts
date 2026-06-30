// Typed read functions for Amanah on-chain state, for a judge/LLM to query the
// agent. getVaultState + getAuditTrail + getAttestation are LIVE.
// getReputation is live when REPUTATION_STATE_SEED is set (see .env.example).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { blake2b } from "blakejs";

const RPC = process.env.CASPER_RPC_URL || "https://node.testnet.casper.network/rpc";
const STATE_SEED = process.env.VAULT_STATE_SEED || "";      // RwaVault "state" dict seed uref addr
const REP_STATE_SEED = process.env.REPUTATION_STATE_SEED || ""; // ReputationRegistry seed (see .env.example)
const CLOUD_BASE = process.env.CSPR_CLOUD_BASE || "https://api.testnet.cspr.cloud";
const CLOUD_KEY = process.env.CSPR_CLOUD_API_KEY || "";

// package hashes the audit trail labels rows by (env-overridable, defaults = deployed)
const PKG = {
  vault: process.env.RWA_VAULT_HASH || "438118a13b5cdcaed1f3cd72bbdcbb3347cd38d2a0d98d2beaa2993a16233347",
  attestation: process.env.ATTESTATION_HASH || "365913a7a26d3e50798c2c0ce31d0850b8b24b2e1a641f990e41f7ad219a6532",
  payment: process.env.PAYMENT_TOKEN_HASH || "d784f72c17d143cd96e8bcd2b19fc893f003c1ce9ea29f059eb033bcbd347d79",
} as const;

export interface VaultState {
  treasuryId: string;
  totalTreasury: string;
  holdings: { name: string; sub: string; value: string; change: string }[];
  guards: string[];
  principalLocked: string;
}

export interface Attestation {
  reasoningHash: string;
  decision: string;
  signer: string;
  blockTime: number;
  verified: boolean;
}

export interface Reputation {
  address: string;
  score: number;
}

export interface AuditRow {
  kind: string;
  hash: string;
  status: string;
  time: string;
}

// --- RwaVault on-chain state (Odra "state" dictionary, no entrypoint call) ---
// dict addr = blake2b256( state_seed ++ ascii( blake2b256( field_index_be32 ++ key ) ) )
// fields 1-indexed: allocations=1 (key = 1-byte AssetId), principal=2.
// value stored as List<U8> = bytesrepr of U256/U512 = [len, ...little-endian].
const ASSET_ORDER = ["Gold", "TBond", "WTI", "CSPR"] as const;
const ASSET_VIEW: Record<(typeof ASSET_ORDER)[number], { name: string; sub: string }> = {
  Gold: { name: "Gold (tokenized)", sub: "XAU reserve" },
  TBond: { name: "US T-bond", sub: "10Y treasury" },
  WTI: { name: "WTI crude", sub: "oil benchmark" },
  CSPR: { name: "CSPR reserve", sub: "native token" },
};

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
  });
  return (await res.json()) as { result?: any; error?: any };
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

// Read an i64 field from the ReputationRegistry's "state" dict.
// i64 CLValue.parsed is a JSON number, not a List<U8> byte blob.
function repDictAddr(index: number, mappingKey: number[]): string {
  const itemKey = hex(blake2b(new Uint8Array([...be32(index), ...mappingKey]), undefined, 32));
  const seed = Buffer.from(REP_STATE_SEED, "hex");
  return hex(blake2b(Buffer.concat([seed, Buffer.from(itemKey, "utf8")]), undefined, 32));
}

async function readI64(index: number, mappingKey: number[]): Promise<number> {
  const srh = (await rpc("chain_get_state_root_hash", {})).result?.state_root_hash;
  if (!srh) return 0;
  const r = await rpc("state_get_dictionary_item", {
    state_root_hash: srh,
    dictionary_identifier: { Dictionary: `dictionary-${repDictAddr(index, mappingKey)}` },
  });
  if (r.error) return 0; // missing = get_or_default = 0
  const v = r.result?.stored_value?.CLValue?.parsed;
  return typeof v === "number" ? Math.round(v) : 0;
}

// 6-dp atomic units -> "$X,XXX" USD (the vault tracks notional USD value, 6 decimals)
const usd = (units: bigint) =>
  "$" + (Number(units) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 0 });

export async function getVaultState(): Promise<VaultState> {
  const guards = [
    "Cap $500K / tx",
    "Daily limit $2M",
    "Allowlist · 3 targets",
    "Principal locked",
    "Compliance: Valid",
  ]; // ponytail: configured guard params; read SpendGate/Compliance state to make live
  if (!STATE_SEED) {
    return {
      treasuryId: "TREASURY · CASPER-TEST (set VAULT_STATE_SEED for live reads)",
      totalTreasury: "—",
      principalLocked: "—",
      holdings: [],
      guards,
    };
  }
  let total = 0n;
  const holdings = [];
  for (let i = 0; i < ASSET_ORDER.length; i++) {
    const v = await readBig(1, [i]); // allocations[AssetId(i)]
    total += v;
    const view = ASSET_VIEW[ASSET_ORDER[i]];
    holdings.push({ name: view.name, sub: view.sub, value: usd(v), change: "" });
  }
  const principal = await readBig(2);
  return {
    treasuryId: `TREASURY ${PKG.vault.slice(0, 4)}…${PKG.vault.slice(-4)} · CASPER-TEST`,
    totalTreasury: usd(total),
    principalLocked: usd(principal),
    holdings,
    guards,
  };
}

export async function getAttestation(hash: string): Promise<Attestation & { note?: string }> {
  // The agent publishes each reasoning blob to amanah/audit/<hash>.json (attest.ts).
  // We read it back, recompute blake2b-256 over the exact bytes, and confirm it
  // matches the requested hash — proving the on-chain hash corresponds to THIS
  // reasoning. `verified` = local hash integrity; cross-check it's attested
  // on-chain at AttestationLog (365913a7…) on testnet.cspr.live.
  const clean = hash.replace(/^0x/, "").toLowerCase();
  try {
    const path = resolve(import.meta.dirname, "../../audit", `${clean}.json`);
    const json = readFileSync(path, "utf8");
    const recomputed = Buffer.from(blake2b(new TextEncoder().encode(json), undefined, 32)).toString("hex");
    const blob = JSON.parse(json) as { decision?: any; pubkey?: string; signer?: string; at?: string };
    const d = blob.decision ?? {};
    const decision =
      d.action === "rebalance"
        ? `rebalance ${d.amount} ${d.fromAsset}->${d.toAsset} (conf ${d.confidence})`
        : d.action
          ? `${d.action} (conf ${d.confidence})`
          : "(decision field absent in blob)";
    return {
      reasoningHash: clean,
      decision,
      signer: blob.pubkey ?? blob.signer ?? "(agent key)",
      blockTime: blob.at ? Date.parse(blob.at) : 0,
      verified: recomputed === clean,
      note:
        recomputed === clean
          ? "Hash matches the published reasoning blob (integrity confirmed). Cross-check it's attested on-chain at AttestationLog (365913a7…) via testnet.cspr.live."
          : `Integrity MISMATCH: blob hashes to ${recomputed}, not ${clean}.`,
    };
  } catch {
    return {
      reasoningHash: clean,
      decision: "(no published reasoning blob for this hash)",
      signer: "(unknown)",
      blockTime: 0,
      verified: false,
      note: "No amanah/audit/<hash>.json found (this attestation predates blob publishing, or the agent ran elsewhere). The attestation may still be on-chain — look up the hash at AttestationLog (365913a7…) on testnet.cspr.live.",
    };
  }
}

export async function getReputation(address: string): Promise<Reputation & { note?: string }> {
  // ReputationRegistry.score: Mapping<Address, i64>, field index 1.
  // Key::Account(hash) bytesrepr = [0x00] + 32 account-hash bytes.
  // Requires REPUTATION_STATE_SEED (the reputation contract's "state" dict seed uref addr).
  // Extract it: query the Casper node for the reputation contract entity named keys,
  // then read the "state" URef address and set it in mcp/.env as REPUTATION_STATE_SEED.
  if (!REP_STATE_SEED) {
    return {
      address,
      score: -1,
      note: "Set REPUTATION_STATE_SEED in mcp/.env to enable live reads. Find it by querying the Casper node for the ReputationRegistry contract entity named keys (look for the 'state' URef). Agent account-hash: 27e5e2b0c3840da2cf061c0cb4d7469c96764d5761b969b3f8314149d796358f",
    };
  }
  // Parse "account-hash-<hex>" or raw 64-char hex → 32 bytes.
  const raw = address.replace(/^account-hash-/i, "").replace(/^0x/, "").toLowerCase();
  if (raw.length !== 64) {
    return {
      address,
      score: -1,
      note: `Pass 'account-hash-<64-hex>'. Got ${raw.length} chars. Agent account-hash: 27e5e2b0c3840da2cf061c0cb4d7469c96764d5761b969b3f8314149d796358f`,
    };
  }
  try {
    // Key::Account bytesrepr = [0x00] + 32 account hash bytes (tag 0 = Account)
    const mappingKey = [0x00, ...Array.from(Buffer.from(raw, "hex"))];
    const score = await readI64(1, mappingKey);
    return {
      address,
      score,
      note: score > 0
        ? `Live score: ${score} payment proof${score === 1 ? "" : "s"} recorded on-chain in ReputationRegistry.`
        : "Score 0: address not yet credited via record_payment.",
    };
  } catch (e) {
    return { address, score: -1, note: `Chain read error: ${(e as Error).message}` };
  }
}

// --- audit trail: live CSPR.cloud deploys for our contracts ----------------
type RawDeploy = {
  deploy_hash?: string;
  timestamp?: string;
  status?: string;
  error_message?: string | null;
  contract_package_hash?: string;
};

function label(d: RawDeploy): string {
  const h = (d.contract_package_hash || "").toLowerCase();
  if (h === PKG.vault) return "Reallocate · vault";
  if (h === PKG.attestation) return "Attestation · reasoning signed";
  if (h === PKG.payment) return "x402 settlement · premium signal";
  return "Contract call";
}

function relTime(ts?: string): string {
  if (!ts) return "";
  const diff = Date.now() - new Date(ts).getTime();
  if (Number.isNaN(diff)) return "";
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const hh = Math.round(m / 60);
  if (hh < 24) return `${hh}h ago`;
  return `${Math.round(hh / 24)}d ago`;
}

async function cloudDeploys(pkg: string, limit: number): Promise<RawDeploy[]> {
  const res = await fetch(`${CLOUD_BASE}/deploys?contract_package_hash=${pkg}&page=1&page_size=${limit}`, {
    headers: { accept: "application/json", authorization: CLOUD_KEY },
  });
  if (!res.ok) return [];
  const d = (await res.json()) as { data?: RawDeploy[] };
  return d.data ?? [];
}

export async function getAuditTrail(): Promise<AuditRow[]> {
  if (!CLOUD_KEY) {
    return [
      { kind: "Set CSPR_CLOUD_API_KEY for live audit trail", hash: "—", status: "—", time: "" },
    ];
  }
  try {
    const lists = await Promise.all(Object.values(PKG).map((h) => cloudDeploys(h, 4)));
    const rows = lists
      .flat()
      .sort((a, b) => (b.timestamp ?? "").localeCompare(a.timestamp ?? ""))
      .slice(0, 6)
      .map((d) => ({
        kind: label(d),
        hash: d.deploy_hash ?? "—",
        status: d.error_message ? "Failed" : d.status === "processed" || !d.status ? "Confirmed" : d.status,
        time: relTime(d.timestamp),
      }));
    return rows.length ? rows : [{ kind: "No deploys yet", hash: "—", status: "—", time: "" }];
  } catch {
    return [{ kind: "audit read failed", hash: "—", status: "—", time: "" }];
  }
}
