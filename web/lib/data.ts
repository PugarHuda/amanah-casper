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
  shortHash,
  relTime,
  type RawDeploy,
} from "./cspr";

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

// Dashboard: audit trail goes live from real deploys when configured; treasury
// totals/holdings/banner stay mock until RwaVault state decode is wired.
// ponytail: live -> derive totalTreasury/holdings/banner from vault contract state.
export async function getDashboard() {
  let trail = mock.trail;
  if (live()) {
    const deploys = await getContractDeploys(
      [VAULT(), ATTESTATION(), REPUTATION()],
      6,
    );
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
