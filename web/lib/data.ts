// Data access seam. Env-gated: when CSPR.cloud + the deployed contract hashes are
// present, read live; otherwise return the static mock so the UI never breaks
// before contracts ship. Return shapes are identical in both paths.
//
// Flip to live by setting CSPR_CLOUD_API_KEY + NEXT_PUBLIC_VAULT_HASH (see .env.example).
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

// ponytail: live -> CSPR.cloud account/contract reads, poll or SSE per cycle.
// Metrics/allocation/guardrails + the step stream stay mock: they decode from
// RwaVault / Attestation / Reputation contract state whose ABI isn't wired yet.
// ponytail: step-stream should become an SSE/poll feed off the live reasoning cycle.
export async function getAgentConsole() {
  return {
    metrics: mock.metrics,
    assets: mock.assets,
    guards: mock.guards,
    steps: mock.steps,
    reasoningHash: mock.reasoningHash,
    decision: mock.decision,
    cycleId: "CYCLE #4,218 · LIVE · CASPER-TEST",
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
