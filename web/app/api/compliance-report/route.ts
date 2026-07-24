// Compliance evidence pack (JSON).
//
// SEC examination staff applying Advisers Act Rule 206(4)-7 expect an adviser using an
// automated platform to hold written policies assessing whether "algorithms were
// performing as intended", and endorse EXCEPTION REPORTS as evidence. The same risk alert
// flags advisers using white-label/B2B platforms that lacked policies addressing the
// platform provider's attention to these matters — which is exactly what a controls layer
// like Amanah must supply to its customer.
//
// This endpoint emits that artifact straight from chain: what the agent did, what the
// controls refused, and the hash/deploy for every claim so it can be independently
// checked on cspr.live. Nothing here is computed from a database we own.
//
// Sources for the obligation are documented in RESEARCH.md.
import { getExceptions, getActivity, getContractDeploys, getContinuity } from "@/lib/cspr";
import { VAULT, ATTESTATION, AUDITOR, ZK, X402, REPUTATION, live } from "@/lib/data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request): Promise<Response> {
  const days = Math.min(365, Math.max(1, Number(new URL(req.url).searchParams.get("days") ?? 30)));

  if (!live()) {
    return Response.json({ error: "chain indexer not configured — no evidence can be produced" }, { status: 503 });
  }

  const packages = [VAULT(), ATTESTATION(), AUDITOR(), ZK(), X402(), REPUTATION()].filter(Boolean);
  const [exceptions, vaultActivity, recent, continuity] = await Promise.all([
    getExceptions(packages),
    getActivity(VAULT(), days),
    getContractDeploys(packages, 50),
    getContinuity(days).catch(() => null),
  ]);

  const executed = recent.filter((d) => !d.error_message);

  return Response.json(
    {
      report: "Amanah — automated-system control evidence",
      basis:
        "Advisers Act Rule 206(4)-7 as applied in the SEC Division of Examinations risk alert on " +
        "electronic investment advice: written policies assessing whether algorithms performed as " +
        "intended, supported by exception reports. See RESEARCH.md for sources and scope limits.",
      generatedAt: new Date().toISOString(),
      windowDays: days,
      network: "casper-test",
      verifyEvery: "https://testnet.cspr.live/deploy/<deployHash>",

      // "Did the algorithm perform as intended?" — the controls that fired, and the moves
      // that passed every gate.
      summary: {
        vaultTransactionsInWindow: vaultActivity ? vaultActivity.executed + vaultActivity.refused : null,
        executedByAgent: vaultActivity?.executed ?? null,
        refusedByControls: vaultActivity?.refused ?? null,
        lastActivityAt: vaultActivity?.lastAt ?? null,
      },

      // Exception report — POLICY refusals are controls working as designed. Platform
      // faults are listed separately so the two are never conflated.
      exceptions: exceptions.filter((e) => e.kind === "policy").map((e) => ({
        deployHash: e.deployHash,
        at: e.timestamp,
        control: e.control,
        error: e.name,
        raw: e.error,
      })),
      platformFaults: exceptions.filter((e) => e.kind === "platform").map((e) => ({
        deployHash: e.deployHash,
        at: e.timestamp,
        note: e.control,
        error: e.name,
        raw: e.error,
      })),

      // Operating effectiveness OVER A PERIOD (SOC-2 Type II / DORA) — the solvency control
      // did not fire once; it ran every cycle. Derived from the ZkReserves deploy history.
      operatingEffectiveness: continuity && continuity.proofs > 0 ? {
        basis: "SOC 2 Type II / DORA — a control's effectiveness is judged over a period, not at a point in time.",
        onChainSolvencyProofs: continuity.proofs,
        inflatedClaimsRefused: continuity.refusals,
        firstProofAt: continuity.firstAt,
        lastProofAt: continuity.lastAt,
        spanHours: continuity.spanHours,
        typicalCadenceMinutes: continuity.medianGapMin,
        longestGapMinutes: continuity.maxGapMin,
      } : null,

      // Evidence that authorised activity is itself recorded on-chain.
      recentAuthorisedActivity: executed.slice(0, 25).map((d) => ({
        deployHash: d.deploy_hash,
        at: d.timestamp,
        contractPackage: d.contract_package_hash,
      })),

      controlsInForce: [
        "Separation of duties — a K-of-N quorum of independent auditors must approve a decision on-chain before the vault will move funds (reverts NotApproved).",
        "Capital preservation — a vault invariant rejects any move that would drop total backing below the locked principal (TouchesPrincipal).",
        "Value conservation — an asset cannot be reallocated to itself (SameAsset).",
        "Spend limits — per-transaction cap and rolling daily limit, enforced by a custodian-owned gate the agent cannot modify.",
        "KYC/AML — the counterparty must be Valid in a custodian-owned registry (NotCompliant).",
        "Circuit breaker — the agent is benched on-chain when its reputation falls below a floor (BelowReputationFloor).",
        "Dead-man's switch — anyone may freeze the vault if the agent goes silent; only the custodian may lift it.",
        "Proof-of-reasoning — every decision is hashed and Ed25519-signed, and the signature is verified inside the contract before the decision is recorded.",
      ],

      limitations: [
        "Testnet deployment. Figures are demonstration values, not client assets.",
        "This is a self-produced artifact. It evidences on-chain control behaviour; it is not an audit, an attestation engagement, or legal advice.",
        "The zero-knowledge circuit has not been independently audited, so the solvency proof is not auditor-grade evidence yet.",
        "Regulatory duties (MiCA/MiFID II conduct and custody, DORA ICT responsibility) attach to the authorised provider and are not transferred by these controls.",
      ],
    },
    { headers: { "cache-control": "no-store", "content-disposition": `inline; filename="amanah-control-evidence-${days}d.json"` } },
  );
}
