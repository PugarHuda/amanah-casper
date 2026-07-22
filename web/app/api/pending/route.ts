import { NextResponse } from "next/server";

// The human-approval inbox: decisions the agent ESCALATED instead of executing, now
// awaiting a human auditor's on-chain sign-off. This is the EU AI Act Art. 14 human-oversight
// path made real — the agent hands a decision to a person, and that person approves or
// rejects it with a real on-chain vote (via the interactive quorum). We surface escalated
// reasoning blobs from IPFS (where the agent pins every cycle) plus the seeded demo decision,
// so the inbox is never empty for a reviewer.
export const dynamic = "force-dynamic";

const PENDING_HASH = process.env.QUORUM_V4_PENDING_HASH || "7c409e7bfce729cea460c03d3557277ad14e12da2b5d1a82c35860b60fba2df4";

type Item = { hash: string; cycle: number | null; confidence: number | null; summary: string; at: string | null; reason: string };

// The demo decision that's seeded 1/2 in the quorum — always present so a reviewer can act.
const DEMO: Item = {
  hash: PENDING_HASH,
  cycle: null,
  confidence: 0.62,
  summary: "Rebalance flagged for human review: signal confidence sat below the escalation threshold, so the agent refused to act on its own and handed the decision up.",
  at: null,
  reason: "below confidence threshold",
};

// Fetch with a hard timeout so one slow IPFS gateway can't stall the whole inbox.
async function fetchT(url: string, opts: RequestInit & { next?: { revalidate: number } }, ms: number): Promise<Response | null> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ac.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function GET() {
  const items: Item[] = [DEMO];
  const jwt = process.env.PINATA_JWT;
  if (jwt) {
    const list = await fetchT(
      "https://api.pinata.cloud/data/pinList?status=pinned&metadata[name]=amanah-reasoning&pageLimit=6&sortBy=date_pinned&sortOrder=DESC",
      { headers: { authorization: `Bearer ${jwt}` }, next: { revalidate: 20 } },
      4000,
    );
    if (list?.ok) {
      const data = (await list.json().catch(() => ({}))) as { rows?: { ipfs_pin_hash: string; metadata?: { keyvalues?: { hash?: string } } }[] };
      const gw = process.env.PINATA_GATEWAY || "https://gateway.pinata.cloud";
      const rows = (data.rows ?? []).filter((r) => {
        const h = r.metadata?.keyvalues?.hash;
        return h && /^[0-9a-f]{64}$/i.test(h) && h.toLowerCase() !== DEMO.hash;
      });
      // Fetch blob bodies in PARALLEL (each timed out), not one-by-one — the sequential
      // version took ~7s and stalled the page.
      const blobs = await Promise.all(
        rows.map(async (r) => {
          const b = await fetchT(`${gw}/ipfs/${r.ipfs_pin_hash}`, { next: { revalidate: 20 } }, 3500);
          if (!b?.ok) return null;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const blob = await b.json().catch(() => null) as any;
          return blob ? { hash: r.metadata!.keyvalues!.hash!.toLowerCase(), blob } : null;
        }),
      );
      for (const x of blobs) {
        if (!x || items.some((i) => i.hash === x.hash)) continue;
        const escalated = x.blob?.decision?.action === "escalate" || x.blob?.guard?.forcedEscalate === true;
        if (!escalated) continue;
        items.push({
          hash: x.hash,
          cycle: typeof x.blob?.cycle === "number" ? x.blob.cycle : null,
          confidence: typeof x.blob?.decision?.confidence === "number" ? x.blob.decision.confidence : null,
          summary: x.blob?.decision?.reasoningSteps?.[0] ?? "(escalated decision — see the attested reasoning)",
          at: x.blob?.at ?? null,
          reason: x.blob?.guard?.forcedEscalate ? "guard forced escalate" : "below confidence threshold",
        });
        if (items.length >= 6) break;
      }
    }
  }
  return NextResponse.json({ items });
}
