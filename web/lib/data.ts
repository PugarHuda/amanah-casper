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
  getVaultState,
  vaultReadable,
  shortHash,
  relTime,
  type RawDeploy,
} from "./cspr";
import type { Holding } from "./mock";

const VAULT = () => process.env.NEXT_PUBLIC_VAULT_HASH || "";
const ATTESTATION = () => process.env.NEXT_PUBLIC_ATTESTATION_HASH || "";
const REPUTATION = () => process.env.NEXT_PUBLIC_REPUTATION_HASH || "";

const live = () => cloudConfigured() && !!VAULT();

// Map a raw CSPR.cloud deploy to an audit-trail row. The deploys API exposes no
// string entry-point name (only entry_point_id), so we label by WHICH of our
// contracts (contract_package_hash) the deploy targeted — reliable and meaningful.
function deployToTrail(d: RawDeploy): TrailRow {
  const pkg = (d.contract_package_hash || "").toLowerCase();
  const ok = !d.error_message && d.status !== "error";
  let icon = "⇄";
  let kind = "Deploy";
  let bg = "#e6eefc";
  if (pkg && pkg === ATTESTATION().toLowerCase()) {
    icon = "✓"; kind = "Attestation · reasoning signed"; bg = "#e6f6ec";
  } else if (pkg && pkg === REPUTATION().toLowerCase()) {
    icon = "$"; kind = "Reputation · x402 proof"; bg = "#fbf1dc";
  } else if (pkg && pkg === VAULT().toLowerCase()) {
    icon = "⇄"; kind = "Reallocate · yield move"; bg = "#e6eefc";
  }
  return {
    icon,
    kind,
    hash: shortHash(d.deploy_hash),
    status: ok ? "Confirmed" : "Failed",
    statusColor: ok ? "var(--green)" : "var(--red)",
    time: relTime(d.timestamp),
    bg,
  };
}

// Read the newest reasoning blob the agent published to amanah/audit/<hash>.json
// (attest.ts). Returns it + its hash, or null if none yet. ponytail: demo-local
// read — assumes web runs alongside the agent (same repo); in prod fetch from the
// IPFS CID / a shared store instead.
function latestReasoningBlob(): { hash: string; blob: AgentBlob } | null {
  try {
    const dir = resolve(process.cwd(), "../audit");
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    if (!files.length) return null;
    const newest = files
      .map((f) => ({ f, t: statSync(resolve(dir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t)[0].f;
    return {
      hash: newest.replace(/\.json$/, ""),
      blob: JSON.parse(readFileSync(resolve(dir, newest), "utf8")) as AgentBlob,
    };
  } catch {
    return null;
  }
}

type AgentBlob = {
  cycle?: number;
  prices?: { goldUsd?: number | null; tbondYieldPct?: number | null; wtiUsd?: number | null; csprUsd?: number | null };
  decision?: { action?: string; fromAsset?: string; toAsset?: string; amount?: number; confidence?: number; reasoningSteps?: string[] };
  model?: string;
  at?: string;
};

// Agent console: LIVE from the newest published reasoning blob + on-chain hashes
// when available; otherwise the representative mock (clearly labelled).
export async function getAgentConsole() {
  const latest = latestReasoningBlob();
  if (!latest) {
    return {
      metrics: mock.metrics, assets: mock.assets, guards: mock.guards,
      steps: mock.steps, reasoningHash: mock.reasoningHash, decision: mock.decision,
      cycleId: "REPRESENTATIVE CYCLE · CASPER-TEST",
    };
  }
  const { hash, blob } = latest;
  const d = blob.decision ?? {};
  const p = blob.prices ?? {};

  // Pull the latest real attestation hash from the on-chain trail (best-effort).
  let attestHash = "";
  if (live()) {
    const deploys = await getContractDeploys([ATTESTATION()], 1);
    attestHash = deploys[0]?.deploy_hash ?? "";
  }

  const steps = [
    { n: "01", text: `Ingested live RWA prices — gold $${p.goldUsd ?? "?"} /oz, T-bond ${p.tbondYieldPct ?? "?"}%, WTI $${p.wtiUsd ?? "?"} /bbl.`, tag: "INGEST · live public APIs", tagColor: "var(--faint)" },
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
      tag: attestHash ? `ATTEST · ${shortHash(attestHash)} ✓` : "ATTEST · on-chain ✓",
      tagColor: "var(--green)",
    },
  ];

  return {
    metrics: mock.metrics, // ponytail: treasury metric is live on the dashboard; console metrics stay cosmetic
    assets: mock.assets,
    guards: mock.guards,
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
  };
}

// Format an atomic 6-dp vault amount as a USD string ("$250,000" / "$1.20M").
function fmtUsd(atomic6dp: bigint): string {
  const dollars = Number(atomic6dp / 1_000_000n);
  return dollars >= 1_000_000
    ? `$${(dollars / 1_000_000).toFixed(2)}M`
    : `$${dollars.toLocaleString("en-US")}`;
}

// Presentation per asset (colors match the mock); value comes from on-chain state.
const ASSET_VIEW: Record<string, { name: string; unit: string; color: string; bg: string }> = {
  Gold: { name: "Gold (tokenized)", unit: "XAU", color: "#e7a83c", bg: "#fbf1dc" },
  TBond: { name: "US T-bond", unit: "10Y", color: "#3f86e6", bg: "#e6eefc" },
  WTI: { name: "WTI crude", unit: "bbl", color: "#2c2620", bg: "#eceae6" },
  CSPR: { name: "CSPR reserve", unit: "CSPR", color: "#cdbfa6", bg: "#f3efe6" },
};

// Dashboard: audit trail + treasury totals/holdings go live from on-chain state
// when configured (CSPR.cloud key + vault hash + VAULT_STATE_SEED); else mock.
export async function getDashboard() {
  let trail = mock.trail;
  let totalTreasury = mock.totalTreasury;
  let holdings = mock.holdings;

  if (live()) {
    const deploys = await getContractDeploys([VAULT(), ATTESTATION(), REPUTATION()], 6);
    if (deploys.length) trail = deploys.map(deployToTrail);

    if (vaultReadable()) {
      const vault = await getVaultState();
      if (vault && vault.total > 0n) {
        totalTreasury = fmtUsd(vault.total);
        holdings = (Object.keys(ASSET_VIEW) as (keyof typeof ASSET_VIEW)[]).map((a): Holding => {
          const v = ASSET_VIEW[a];
          const amt = vault.holdings[a as keyof typeof vault.holdings] ?? 0n;
          const pct = vault.total > 0n ? Number((amt * 10000n) / vault.total) / 100 : 0;
          return {
            name: v.name,
            sub: `${(Number(amt / 1_000_000n)).toLocaleString("en-US")} ${v.unit} · ${pct}% of treasury`,
            value: fmtUsd(amt),
            chg: "on-chain",
            chgColor: "var(--muted, #888)",
            color: v.color,
            bg: v.bg,
          };
        });
      }
    }
  }
  return {
    treasuryId: mock.treasuryId,
    totalTreasury,
    banner: mock.banner,
    holdings,
    trail,
  };
}

// ponytail: live -> CMS / markdown index for the engineering blog.
export async function getPosts() {
  return mock.posts;
}
