import { NextResponse } from "next/server";
import { getHeartbeat } from "@/lib/cspr";

// C3 — public liveness for the hosted autonomous loop. The agent attests on-chain
// every cycle, so this reads the latest AttestationLog deploy and reports how long
// ago the last cycle ran. Green when the loop is alive; goes stale on its own if the
// hosted process dies. A monitor (or another agent) can poll this to alert on outage.
export const dynamic = "force-dynamic";

export async function GET() {
  const hb = await getHeartbeat();
  return NextResponse.json(hb, {
    status: hb.configured && !hb.alive ? 503 : 200,
    headers: { "cache-control": "no-store" },
  });
}
