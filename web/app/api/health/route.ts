import { NextResponse } from "next/server";
import { getVaultState, getReservesSolvent, getQuorumVote, getPolicyParams, accountHashOf } from "@/lib/cspr";

// Real health check: exercises the live on-chain reads the product depends on, so uptime
// monitoring reflects whether the CHAIN-backed features actually work — not just that the
// web server is up. Returns 200 only when the core reads succeed.
export const dynamic = "force-dynamic";

const PENDING_HASH = process.env.QUORUM_V4_PENDING_HASH || "7c409e7bfce729cea460c03d3557277ad14e12da2b5d1a82c35860b60fba2df4";
const CUSTODIAN_PK = "0109cd12284a8fe4cde3be32b28bd1c6f71ca80f7455571fd127f55573b74bb197";

export async function GET() {
  const started = Date.now();
  const acct = accountHashOf(CUSTODIAN_PK) ?? "";
  const [vault, solvent, quorum, policy] = await Promise.all([
    getVaultState().catch(() => null),
    getReservesSolvent().catch(() => null),
    getQuorumVote(PENDING_HASH, acct).catch(() => null),
    getPolicyParams().catch(() => null),
  ]);

  const checks = {
    vault: vault != null && vault.total > 0n,
    reservesSolvent: solvent === true,
    quorum: quorum != null && quorum.threshold > 0,
    policyEngine: policy != null,
  };
  const ok = Object.values(checks).every(Boolean);
  const body = {
    status: ok ? "ok" : "degraded",
    checks,
    treasuryUsd: vault ? Number(vault.total) / 1e6 : null,
    quorum: quorum ? `${quorum.approvals}/${quorum.threshold}` : null,
    ms: Date.now() - started,
    at: new Date().toISOString(),
  };
  return NextResponse.json(body, { status: ok ? 200 : 503 });
}
