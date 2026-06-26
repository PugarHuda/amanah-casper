// Data access seam. Env-gated: when CSPR.cloud + the deployed contract hashes are
// present, read live; otherwise return the static mock so the UI never breaks
// before contracts ship. Return shapes are identical in both paths.
//
// Flip to live by setting CSPR_CLOUD_API_KEY + NEXT_PUBLIC_VAULT_HASH (see .env.example).
import * as mock from "./mock";
import type { TrailRow } from "./mock";
import { cloudConfigured, getRecentDeploys, shortHash, relTime } from "./cspr";

const live = () => cloudConfigured() && !!process.env.NEXT_PUBLIC_VAULT_HASH;

// Map a raw CSPR.cloud deploy to an audit-trail row.
// ponytail: verify CSPR.cloud endpoint — exact deploy field names + entry_point
// taxonomy. Heuristic kind/icon/status below; refine once the real shape is seen.
function deployToTrail(d: {
  deploy_hash?: string;
  timestamp?: string;
  entry_point?: string;
  error_message?: string | null;
}): TrailRow {
  const ep = (d.entry_point || "").toLowerCase();
  const ok = !d.error_message;
  let icon = "⇄";
  let kind = d.entry_point || "Deploy";
  let bg = "#e6eefc";
  if (ep.includes("attest")) { icon = "✓"; kind = "Attestation · reasoning signed"; bg = "#e6f6ec"; }
  else if (ep.includes("settle") || ep.includes("pay")) { icon = "$"; kind = "x402 settlement"; bg = "#fbf1dc"; }
  else if (ep.includes("realloc") || ep.includes("rebalance")) { icon = "⇄"; kind = "Reallocate"; bg = "#e6eefc"; }
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

// Dashboard: audit trail goes live from real deploys when configured; treasury
// totals/holdings/banner stay mock until RwaVault state decode is wired.
// ponytail: live -> derive totalTreasury/holdings/banner from vault contract state.
export async function getDashboard() {
  let trail = mock.trail;
  if (live()) {
    const deploys = await getRecentDeploys(6);
    if (deploys.length) trail = deploys.map(deployToTrail);
  }
  return {
    treasuryId: mock.treasuryId,
    totalTreasury: mock.totalTreasury,
    banner: mock.banner,
    holdings: mock.holdings,
    trail,
  };
}

// ponytail: live -> CMS / markdown index for the engineering blog.
export async function getPosts() {
  return mock.posts;
}
