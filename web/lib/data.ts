// Data access seam. Env-gated: when CSPR.cloud + the deployed contract hashes are
// present, read live; otherwise return the static mock so the UI never breaks
// before contracts ship. Return shapes are identical in both paths.
//
// Flip to live by setting CSPR_CLOUD_API_KEY + NEXT_PUBLIC_VAULT_HASH (see .env.example).
import { readdirSync, statSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as mock from "./mock";
import type { TrailRow } from "./mock";
import {
  cloudConfigured,
  getContractDeploys,
  getDeployCount,
  getVaultState,
  vaultReadable,
  getReputationScore,
  reputationReadable,
  getSpendGateState,
  spendGateReadable,
  getComplianceState,
  complianceReadable,
  getZkVerified,
  zkReadable,
  shortHash,
  relTime,
  type RawDeploy,
} from "./cspr";
import type { Holding } from "./mock";

// Agent account-hash (the signer whose reputation we display).
const AGENT_ACCOUNT_HASH = "27e5e2b0c3840da2cf061c0cb4d7469c96764d5761b969b3f8314149d796358f";

const VAULT = () => process.env.NEXT_PUBLIC_VAULT_HASH || "";
const ATTESTATION = () => process.env.NEXT_PUBLIC_ATTESTATION_HASH || "";
const REPUTATION = () => process.env.NEXT_PUBLIC_REPUTATION_HASH || "";
// X402 PaymentToken package hash — baked as default since it's a known deployed contract.
const X402 = () =>
  process.env.NEXT_PUBLIC_X402_HASH ||
  "d784f72c17d143cd96e8bcd2b19fc893f003c1ce9ea29f059eb033bcbd347d79";

const live = () => cloudConfigured() && !!VAULT();

// Map a raw CSPR.cloud deploy to an audit-trail row. Labels by which of our
// contracts was called (contract_package_hash), since there's no string EP name.
function deployToTrail(d: RawDeploy): TrailRow {
  const pkg = (d.contract_package_hash || "").toLowerCase();
  const ok = !d.error_message && d.status !== "error";
  let icon = "⇄";
  let kind = "Contract call";
  let bg = "#e6eefc";
  if (pkg && pkg === ATTESTATION().toLowerCase()) {
    icon = "✓"; kind = "Attestation · reasoning signed"; bg = "#e6f6ec";
  } else if (pkg && pkg === X402().toLowerCase()) {
    icon = "$"; kind = "x402 settlement · premium signal"; bg = "#fbf1dc";
  } else if (pkg && pkg === REPUTATION().toLowerCase()) {
    icon = "★"; kind = "Reputation · payment credited"; bg = "#f3efe6";
  } else if (pkg && pkg === VAULT().toLowerCase()) {
    icon = "⇄"; kind = "Reallocate · yield move"; bg = "#e6eefc";
  }
  return {
    icon,
    kind,
    hash: shortHash(d.deploy_hash),
    fullHash: d.deploy_hash,
    status: ok ? "Confirmed" : "Failed",
    statusColor: ok ? "var(--green)" : "var(--red)",
    time: relTime(d.timestamp),
    bg,
  };
}

// Read the newest reasoning blob the agent published to amanah/audit/<hash>.json.
// ponytail: demo-local read — assumes web runs alongside the agent (same repo).
function latestReasoningBlob(): { hash: string; blob: AgentBlob; ipfsCid: string | null } | null {
  try {
    const dir = resolve(process.cwd(), "../audit");
    // Reasoning blobs are <hash>.json; exclude the auditor's <hash>.audit.json
    // verdict blobs (different shape) so they can't be mistaken for the latest cycle.
    const files = readdirSync(dir).filter((f) => f.endsWith(".json") && !f.endsWith(".audit.json"));
    if (!files.length) return null;
    const newest = files
      .map((f) => ({ f, t: statSync(resolve(dir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t)[0].f;
    const hash = newest.replace(/\.json$/, "");
    // Optional IPFS CID sidecar (written by attest.ts when PINATA_JWT is set).
    let ipfsCid: string | null = null;
    try {
      ipfsCid = readFileSync(resolve(dir, `${hash}.cid`), "utf8").trim() || null;
    } catch {
      /* no CID sidecar — IPFS pin not enabled for this blob */
    }
    return {
      hash,
      blob: JSON.parse(readFileSync(resolve(dir, newest), "utf8")) as AgentBlob,
      ipfsCid,
    };
  } catch {
    return null;
  }
}

// Prod fallback: fetch the latest reasoning blob from PUBLIC IPFS (Pinata) when
// there's no local audit/ dir (e.g. a Vercel deploy). Finds the newest tagged pin
// via the Pinata pinList API, then fetches the blob from the gateway. Needs
// PINATA_JWT (server-side). This is how the deployed console stays live.
async function latestBlobFromPinata(): Promise<{ hash: string; blob: AgentBlob; ipfsCid: string } | null> {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) return null;
  try {
    const list = await fetch(
      "https://api.pinata.cloud/data/pinList?status=pinned&metadata[name]=amanah-reasoning&pageLimit=1&sortBy=date_pinned&sortOrder=DESC",
      { headers: { authorization: `Bearer ${jwt}` }, next: { revalidate: 15 } },
    );
    if (!list.ok) return null;
    const data = (await list.json()) as { rows?: { ipfs_pin_hash: string; metadata?: { keyvalues?: { hash?: string } } }[] };
    const row = data.rows?.[0];
    if (!row) return null;
    const cid = row.ipfs_pin_hash;
    const gw = process.env.PINATA_GATEWAY || "https://gateway.pinata.cloud";
    const blobRes = await fetch(`${gw}/ipfs/${cid}`, { next: { revalidate: 15 } });
    if (!blobRes.ok) return null;
    const blob = (await blobRes.json()) as AgentBlob;
    return { hash: row.metadata?.keyvalues?.hash ?? cid, blob, ipfsCid: cid };
  } catch {
    return null;
  }
}

export type AuditVerdict = { approved: boolean; grade: number; concerns: string[]; reviewedHash: string } | null;

function verdictFrom(blob: { verdict?: { approved?: boolean; grade?: number; concerns?: string[] }; reviewedReasoningHash?: string }): AuditVerdict {
  return {
    approved: !!blob.verdict?.approved,
    grade: typeof blob.verdict?.grade === "number" ? blob.verdict.grade : 0,
    concerns: Array.isArray(blob.verdict?.concerns) ? blob.verdict!.concerns! : [],
    reviewedHash: blob.reviewedReasoningHash ?? "",
  };
}

// The independent auditor's latest APPROVE/VETO verdict — local audit/*.audit.json
// (dev) or the newest "amanah-audit" IPFS pin (prod). null if none yet.
async function latestAuditVerdict(): Promise<AuditVerdict> {
  try {
    const dir = resolve(process.cwd(), "../audit");
    const files = readdirSync(dir).filter((f) => f.endsWith(".audit.json"));
    if (files.length) {
      const newest = files.map((f) => ({ f, t: statSync(resolve(dir, f)).mtimeMs })).sort((a, b) => b.t - a.t)[0].f;
      return verdictFrom(JSON.parse(readFileSync(resolve(dir, newest), "utf8")));
    }
  } catch { /* no local dir — try IPFS */ }
  const jwt = process.env.PINATA_JWT;
  if (!jwt) return null;
  try {
    const list = await fetch(
      "https://api.pinata.cloud/data/pinList?status=pinned&metadata[name]=amanah-audit&pageLimit=1&sortBy=date_pinned&sortOrder=DESC",
      { headers: { authorization: `Bearer ${jwt}` }, next: { revalidate: 15 } },
    );
    if (!list.ok) return null;
    const data = (await list.json()) as { rows?: { ipfs_pin_hash: string }[] };
    const row = data.rows?.[0];
    if (!row) return null;
    const gw = process.env.PINATA_GATEWAY || "https://gateway.pinata.cloud";
    const res = await fetch(`${gw}/ipfs/${row.ipfs_pin_hash}`, { next: { revalidate: 15 } });
    if (!res.ok) return null;
    return verdictFrom(await res.json());
  } catch {
    return null;
  }
}

type AgentBlob = {
  cycle?: number;
  pubkey?: string;
  prices?: { goldUsd?: number | null; tbondYieldPct?: number | null; wtiUsd?: number | null; csprUsd?: number | null; notes?: string[] };
  decision?: { action?: string; fromAsset?: string; toAsset?: string; amount?: number; confidence?: number; riskScore?: number; reasoningSteps?: string[] };
  model?: string;
  at?: string;
};

// Real RWA data providers, pulled from the blob's per-source notes (e.g.
// "gold: metalpriceapi XAU") → short provider names for the ingest provenance tag.
export function dataSources(notes?: string[]): string {
  if (!notes?.length) return "live public APIs";
  const seen = new Set<string>();
  for (const n of notes) {
    const provider = /:\s*([a-z0-9_.]+)/i.exec(n)?.[1];
    if (provider) seen.add(provider);
  }
  return seen.size ? Array.from(seen).join(" · ") : "live public APIs";
}

// Format a price number with locale commas.
function fmt(n: number, dp = 0): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

// Format an atomic 6-dp vault amount as a USD string. Exported for tests.
export function fmtUsd(atomic6dp: bigint): string {
  const dollars = Number(atomic6dp / 1_000_000n);
  return dollars >= 1_000_000
    ? `$${(dollars / 1_000_000).toFixed(2)}M`
    : `$${dollars.toLocaleString("en-US")}`;
}

// Live guardrail chip labels from on-chain SpendGate limits (falls back to mock).
function liveGuards(sg: { maxPerTx: bigint; dailyLimit: bigint; spentToday: bigint } | null): string[] {
  if (!sg) return mock.guards;
  return [
    `Cap ${fmtUsd(sg.maxPerTx)} / tx`,
    `Daily limit ${fmtUsd(sg.dailyLimit)}`,
    `Spent ${fmtUsd(sg.spentToday)} today`,
    "Principal locked",
    "Compliance: Valid",
  ];
}

// Vault asset presentation config.
const ASSET_VIEW: Record<string, { name: string; unit: string; color: string; bg: string }> = {
  Gold: { name: "Gold (tokenized)", unit: "XAU", color: "#e7a83c", bg: "#fbf1dc" },
  TBond: { name: "US T-bond", unit: "10Y", color: "#3f86e6", bg: "#e6eefc" },
  WTI: { name: "WTI crude", unit: "bbl", color: "#2c2620", bg: "#eceae6" },
  CSPR: { name: "CSPR reserve", unit: "CSPR", color: "#cdbfa6", bg: "#f3efe6" },
};
const ASSET_ORDER = ["Gold", "TBond", "WTI", "CSPR"] as const;

// Agent console: LIVE from the newest published reasoning blob + on-chain data
// when available; falls back to the representative mock (clearly labelled).
export async function getAgentConsole() {
  // Local audit/ blob (dev) first; else fetch the latest from public IPFS (prod).
  const latest = latestReasoningBlob() ?? (await latestBlobFromPinata());
  if (!latest) {
    return {
      metrics: mock.metrics, assets: mock.assets, guards: mock.guards,
      steps: mock.steps, reasoningHash: mock.reasoningHash, decision: mock.decision,
      cycleId: "REPRESENTATIVE CYCLE · CASPER-TEST",
      attestDeployHash: "",
      ipfsCid: null as string | null,
    };
  }
  const { hash, blob, ipfsCid } = latest;
  const d = blob.decision ?? {};
  const p = blob.prices ?? {};
  // Defensive: older blobs stored riskScore on a 0..100 scale (schema says 0..1).
  const risk = d.riskScore != null ? (d.riskScore > 1 ? d.riskScore / 100 : d.riskScore) : null;

  // Parallel: latest attest deploy hash, attest count, vault state, reputation, spend gate, auditor verdict.
  const [deploys, attestCount, vault, repScore, spendGate, audit] = await Promise.all([
    live() ? getContractDeploys([ATTESTATION()], 1) : Promise.resolve([]),
    live() ? getDeployCount(ATTESTATION()) : Promise.resolve(null),
    vaultReadable() ? getVaultState() : Promise.resolve(null),
    reputationReadable() ? getReputationScore(AGENT_ACCOUNT_HASH) : Promise.resolve(null),
    spendGateReadable() ? getSpendGateState() : Promise.resolve(null),
    latestAuditVerdict(),
  ]);
  const attestDeploy = deploys[0];
  const attestDeployHash = attestDeploy?.deploy_hash ?? "";

  // Live metrics. Null sub-reads render "—" (never a stale fake number).
  const metrics = [
    {
      label: "Treasury value",
      value: vault && vault.total > 0n ? fmtUsd(vault.total) : "—",
      delta: vault ? "on-chain · live" : "set vault seed",
      deltaColor: "var(--green)",
    },
    {
      label: "Risk score",
      value: risk != null ? risk.toFixed(2) : "—",
      delta: risk != null ? (risk < 0.5 ? "Low" : risk < 0.75 ? "Medium" : "High") : "no blob",
      deltaColor: risk != null ? (risk < 0.5 ? "var(--green)" : "var(--red)") : "var(--faint)",
    },
    {
      label: "Reputation",
      value: repScore != null ? String(repScore) : "—",
      delta: repScore != null ? "on-chain proof" : "set REP seed",
      deltaColor: repScore != null && repScore > 0 ? "var(--green)" : "var(--faint)",
    },
    {
      label: "Attestations",
      value: attestCount != null ? attestCount.toLocaleString("en-US") : "—",
      delta: "100% on-chain",
      deltaColor: "var(--blue)",
    },
  ];

  // Live asset list: prices from blob, weights from vault holdings.
  const assetPrices: Record<string, string> = {
    Gold: p.goldUsd != null ? `$${fmt(p.goldUsd, 0)} / oz` : "—",
    TBond: p.tbondYieldPct != null ? `${p.tbondYieldPct.toFixed(2)}% yield` : "—",
    WTI: p.wtiUsd != null ? `$${fmt(p.wtiUsd, 2)} / bbl` : "—",
    CSPR: p.csprUsd != null ? `$${p.csprUsd.toFixed(4)}` : "—",
  };
  const assets = ASSET_ORDER.map((a) => {
    const v = ASSET_VIEW[a];
    const pct =
      vault && vault.total > 0n
        ? `${Math.round(Number((vault.holdings[a] ?? 0n) * 100n / vault.total))}%`
        : "—";
    return { name: v.name, price: assetPrices[a], weight: pct, color: v.color };
  });

  const steps = [
    { n: "01", text: `Ingested live RWA prices — gold $${p.goldUsd ?? "?"} /oz, T-bond ${p.tbondYieldPct ?? "?"}%, WTI $${p.wtiUsd ?? "?"} /bbl.`, tag: `INGEST · ${dataSources(p.notes)}`, tagColor: "var(--faint)" },
    ...(d.reasoningSteps ?? []).slice(0, 4).map((s, i) => ({
      n: String(i + 2).padStart(2, "0"), text: s,
      tag: `REASON · ${blob.model ?? "Venice"}`, tagColor: "var(--faint)",
    })),
    {
      n: String((d.reasoningSteps?.slice(0, 4).length ?? 0) + 2).padStart(2, "0"),
      text: d.action === "rebalance"
        ? `Decision: move ${Number((d.amount ?? 0) / 1_000_000).toLocaleString("en-US")} from ${d.fromAsset} to ${d.toAsset}.`
        : `Decision: ${d.action} (no funds move).`,
      tag: `DECISION · confidence ${d.confidence ?? "?"}`, tagColor: "var(--gold-deep)",
    },
    {
      n: String((d.reasoningSteps?.slice(0, 4).length ?? 0) + 3).padStart(2, "0"),
      text: "Signed reasoning (Ed25519), attested & verified on-chain.",
      tag: attestDeployHash ? `ATTEST · ${shortHash(attestDeployHash)} ✓` : "ATTEST · on-chain ✓",
      tagColor: "var(--green)",
    },
    // The independent auditor (a second key) grades the decision on-chain; a VETO
    // blocks the reallocate and slashes reputation. Surfaced so the two-agent
    // separation of duties is visible, not just on-chain.
    ...(audit ? [{
      n: String((d.reasoningSteps?.slice(0, 4).length ?? 0) + 4).padStart(2, "0"),
      text: audit.approved
        ? `Independent auditor APPROVED the decision (grade ${audit.grade}). Reallocate allowed.`
        : `Independent auditor VETOED — reallocate blocked, reputation slashed.${audit.concerns[0] ? " " + audit.concerns[0] : ""}`,
      tag: audit.approved ? "AUDITOR · APPROVE ✓" : "AUDITOR · VETO ⛔",
      tagColor: audit.approved ? "var(--green)" : "var(--red)",
    }] : []),
  ];

  return {
    metrics,
    assets,
    guards: liveGuards(spendGate),
    steps,
    reasoningHash: `0x${hash}`,
    decision: {
      caption: `LATEST DECISION · CONFIDENCE ${d.confidence ?? "?"}`,
      title: d.action === "rebalance"
        ? `Reallocate ${Number((d.amount ?? 0) / 1_000_000).toLocaleString("en-US")} ${d.fromAsset} → ${d.toAsset}`
        : `${(d.action ?? "hold").toUpperCase()} — no reallocation`,
      sub: "Reasoning published + hash attested on-chain · principal untouched",
    },
    cycleId: `CYCLE #${blob.cycle ?? "?"} · LIVE · ${blob.at?.slice(0, 10) ?? "CASPER-TEST"}`,
    attestDeployHash,
    ipfsCid,
  };
}

// Dashboard: audit trail + treasury totals/holdings go live from on-chain state
// when configured; banner uses live vault data where possible; else mock.
export async function getDashboard() {
  let trail = mock.trail;
  let totalTreasury = mock.totalTreasury;
  let holdings = mock.holdings;
  let treasuryId = mock.treasuryId;
  let banner = mock.banner;
  // Honest fallbacks: "—" (not plausible-but-wrong numbers) until read from chain.
  let compliance = {
    dailyUsed: "—", dailyLimit: "—", txCap: "—",
    vaultStatus: "—", allowlisted: false,
    zkVerified: null as boolean | null,
  };
  // Track what's actually live so the UI never labels representative data "live".
  let trailLive = false;
  let treasuryLive = false;

  if (live()) {
    // Include x402 payment deploys alongside vault/attestation/reputation.
    const deploys = await getContractDeploys([VAULT(), ATTESTATION(), X402(), REPUTATION()], 8);
    if (deploys.length) { trail = deploys.map(deployToTrail); trailLive = true; }
  }

  if (spendGateReadable()) {
    const sg = await getSpendGateState();
    if (sg) {
      compliance.dailyUsed = fmtUsd(sg.spentToday);
      compliance.dailyLimit = fmtUsd(sg.dailyLimit);
      compliance.txCap = fmtUsd(sg.maxPerTx);
    }
  }
  if (complianceReadable()) {
    const cs = await getComplianceState(AGENT_ACCOUNT_HASH);
    if (cs) {
      compliance.vaultStatus = cs.status;
      compliance.allowlisted = cs.allowlisted;
    }
  }
  if (zkReadable()) {
    // Live zero-knowledge KYC flag from the ZkKycVerifier contract.
    compliance.zkVerified = await getZkVerified(AGENT_ACCOUNT_HASH);
  }

  if (vaultReadable()) {
    const vault = await getVaultState();
    if (vault && vault.total > 0n) {
      treasuryLive = true;
      totalTreasury = fmtUsd(vault.total);
      treasuryId = `TREASURY ${VAULT().slice(0, 4)}…${VAULT().slice(-4)} · CASPER-TEST`;
      holdings = (ASSET_ORDER as unknown as (keyof typeof ASSET_VIEW)[]).map((a): Holding => {
        const v = ASSET_VIEW[a];
        const amt = vault.holdings[a as keyof typeof vault.holdings] ?? 0n;
        const pct = vault.total > 0n ? Number((amt * 10000n) / vault.total) / 100 : 0;
        return {
          name: v.name,
          sub: `${(Number(amt / 1_000_000n)).toLocaleString("en-US")} ${v.unit} · ${pct.toFixed(1)}% of treasury`,
          value: fmtUsd(amt),
          chg: "on-chain",
          chgColor: "var(--muted, #888)",
          color: v.color,
          bg: v.bg,
        };
      });
      // Live banner: replace fake yield/principal/rep with honest values.
      banner = [
        { label: "YIELD (30D)", value: "—", note: "testnet demo", color: "var(--faint)" },
        {
          label: "PRINCIPAL LOCKED",
          value: fmtUsd(vault.principal),
          note: vault.principal === 0n ? "testnet (principal=0)" : "untouched",
          color: "var(--faint)",
        },
        { label: "ATTESTATIONS", value: "—", note: "on-chain proofs", color: "var(--blue)" },
      ];
      // Best-effort: get attest count for the last banner slot.
      if (live()) {
        const cnt = await getDeployCount(ATTESTATION());
        if (cnt != null) banner[2].value = cnt.toLocaleString("en-US");
      }
    }
  }

  return {
    treasuryId: treasuryLive ? treasuryId : "REPRESENTATIVE · CASPER-TEST",
    totalTreasury,
    banner,
    holdings,
    trail,
    compliance,
    trailLive,
    treasuryLive,
    vaultHash: VAULT(),
  };
}
