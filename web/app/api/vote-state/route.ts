import { NextResponse } from "next/server";
import { getQuorumVote, accountHashOf } from "@/lib/cspr";

// Live state of the interactive auditor quorum for the connected key: how many approvals
// the pending decision has, the threshold, and whether this key has joined the registry.
// Read-only; refetched after each vote so the UI shows the tally move on-chain.
export const dynamic = "force-dynamic";

const PENDING_HASH = process.env.QUORUM_V4_PENDING_HASH || "7c409e7bfce729cea460c03d3557277ad14e12da2b5d1a82c35860b60fba2df4";

export async function GET(req: Request) {
  const pk = new URL(req.url).searchParams.get("pk") ?? "";
  const acct = accountHashOf(pk);
  if (!acct) return NextResponse.json({ error: "malformed public key" }, { status: 400 });
  const state = await getQuorumVote(PENDING_HASH, acct);
  if (!state) return NextResponse.json({ error: "quorum state unreadable" }, { status: 503 });
  return NextResponse.json({ ...state, pendingHash: PENDING_HASH });
}
