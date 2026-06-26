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
// ponytail: verify CSPR.cloud endpoint — filtering deploys by contract. Using
// GET /deploys with a page limit; field names below (deploy_hash, timestamp,
// entry_point, error_message) are the common CSPR.cloud shape but unconfirmed.
type RawDeploy = {
  deploy_hash?: string;
  timestamp?: string;
  entry_point?: string;
  error_message?: string | null;
  status?: string;
};

export async function getRecentDeploys(limit = 6): Promise<RawDeploy[]> {
  try {
    const d = await cloudGet<{ data?: RawDeploy[] }>(`/deploys?page=1&page_size=${limit}`);
    return d.data ?? [];
  } catch {
    return [];
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
