import { NextResponse } from "next/server";
import { getVaultState, getReservesSolvent, getQuorumVote, getPolicyParams, getTimelock, getTreasuries, accountHashOf } from "@/lib/cspr";

// NEW: an agent-consumable TRUST MANIFEST. Everything verifiable about Amanah in one
// structured document — contract addresses, the proof artifacts a client re-runs, and the
// current live on-chain state — so ANOTHER agent (or an auditor's tooling) can verify the
// whole system programmatically, not by reading a web page. This is the machine-readable
// half of "don't trust us, verify": the agent economy needs claims other agents can check.
export const dynamic = "force-dynamic";

const SITE = "https://amanah-casper-rwa.vercel.app";
const EXPLORER = "https://testnet.cspr.live";
const PENDING_HASH = process.env.QUORUM_V4_PENDING_HASH || "7c409e7bfce729cea460c03d3557277ad14e12da2b5d1a82c35860b60fba2df4";
const CUSTODIAN_PK = "0109cd12284a8fe4cde3be32b28bd1c6f71ca80f7455571fd127f55573b74bb197";

// The deployed contract packages (testnet). Kept here so the manifest is self-describing.
const CONTRACTS: Record<string, string> = {
  RwaVault: process.env.NEXT_PUBLIC_VAULT_HASH || "",
  RwaVaultB: "d435e47c4c7ce00d6e9bf6801d20a4c2ed264d482b5645521455511ee0e5d4de",
  AttestationLog: process.env.NEXT_PUBLIC_ATTESTATION_HASH || "",
  AuditorQuorumV3_enforced: "2663d7ce209f999670be56dc2732512cd500f1cd4423f1623383fff68ff3dfeb",
  AuditorQuorumV5_interactive: process.env.QUORUM_V4_HASH || "100d2433789f46243253615e6fe909412b7794c2d8cd47e4677adaabc98d9f72",
  ZkReservesV2: "5f57375f6187920b15f833d702121f591c9e4559fbd674a6704dd22c09b8f520",
  ZkKycVerifier: "e9394a31557d33a6f5f26e4d5d996f7cbd7e98138cef60cc5921eee2617dfd0f",
  ReputationRegistry: process.env.NEXT_PUBLIC_REPUTATION_HASH || "",
  SpendGate: "f19ed0e9b235e8422aef7d8fbbcaa9cbc34ef4864efd81bbeb7c82d2b77d0cf3",
  ComplianceRegistry: "93bc5e1389517acfb57b659ec1427c2979d6d931f1c1d587537427d5595f9ea5",
  PolicyEngineV2: "3ec02e03cccf3ea0c5fac410ab49d7bd0fc03d06e364b5af4a46dda5af783af4",
  GovernanceTimelock: "81c091bbe8d781ba3ebdd527373e4f0417eb3376ab66a05955b6f59455150abc",
};

export async function GET() {
  const acct = accountHashOf(CUSTODIAN_PK) ?? "";
  const [vault, solvent, quorum, policy, timelock, treasuries] = await Promise.all([
    getVaultState().catch(() => null),
    getReservesSolvent().catch(() => null),
    getQuorumVote(PENDING_HASH, acct).catch(() => null),
    getPolicyParams().catch(() => null),
    getTimelock().catch(() => null),
    getTreasuries().catch(() => []),
  ]);

  return NextResponse.json({
    name: "Amanah",
    description: "Autonomous, compliant RWA-treasury agent on Casper — every claim below is independently verifiable on-chain.",
    chain: "casper-test",
    updatedAt: new Date().toISOString(),
    // Contracts: open any on cspr.live.
    contracts: Object.fromEntries(Object.entries(CONTRACTS).filter(([, h]) => h).map(([k, h]) => [k, { package: h, explorer: `${EXPLORER}/contract-package/${h}` }])),
    // Proof artifacts: fetch + re-verify client-side (see /verify for the verifiers).
    proofs: {
      zkProofOfReserves: `${SITE}/proofs/reserves.json`,
      rangeProofs: `${SITE}/proofs/rangeproof.json`,
      proofOfLiabilities: `${SITE}/liabilities.json`,
      auditorAssignment: `${SITE}/auditor-assignment.json`,
      redTeam: `${SITE}/redteam.json`,
      simulation: `${SITE}/simulation.json`,
      verifyInBrowser: `${SITE}/verify`,
    },
    // Live on-chain state, read at request time.
    live: {
      treasuries: treasuries.map((t) => ({ label: t.label, totalUsd: Number(t.total) / 1e6, principalUsd: Number(t.principal) / 1e6 })),
      reservesSolvent: solvent,
      interactiveQuorum: quorum ? { approvals: quorum.approvals, threshold: quorum.threshold, approved: quorum.approved } : null,
      policy: policy ? { escalateBelowConfidencePct: policy.confidencePct, maxRebalancePct: policy.maxRebalancePct, minReputation: policy.minReputation } : null,
      governance: timelock ? { model: "timelock", delaySeconds: timelock.delaySec, changeQueued: timelock.queued } : null,
    },
    health: `${SITE}/api/health`,
    heartbeat: `${SITE}/api/heartbeat`,
    alerts: `${SITE}/api/alerts`,
    repo: "https://github.com/PugarHuda/amanah-casper",
  });
}
