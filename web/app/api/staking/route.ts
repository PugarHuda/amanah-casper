import { NextResponse } from "next/server";
import { getStakedPosition } from "@/lib/cspr";

// Live native-staking position — the treasury's delegated CSPR, its accrued rewards (real
// yield), read from the chain's auction state. Memoized 60s in-process because the auction
// read is a large payload and rewards only change per era (~2h); a client card polls this so
// the dashboard render stays instant.
export const dynamic = "force-dynamic";

let memo: { at: number; data: unknown } | null = null;
let inflight: Promise<unknown> | null = null;

async function load() {
  if (memo && Date.now() - memo.at < 60_000) return memo.data;
  if (!inflight) {
    inflight = getStakedPosition({ live: true })
      .then((data) => { memo = { at: Date.now(), data }; return data; })
      .finally(() => { inflight = null; });
  }
  return inflight;
}

export async function GET() {
  return NextResponse.json((await load()) ?? { delegated: false });
}
