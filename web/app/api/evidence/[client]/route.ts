import { NextResponse } from "next/server";
import { getReservesSolvent } from "@/lib/cspr";

// D3 — per-client evidence pack. A treasury client asks one question: "is MY money
// accounted for and covered?" This assembles the self-contained artifact that answers it
// and can be verified OFFLINE by their own auditor: that client's liability row + Merkle
// inclusion path + the published root (they see nobody else's balance), plus the ZK-proven
// reserves total and the on-chain anchors. Only the requested client's row is included —
// the pack leaks nothing about the rest of the book.
export const dynamic = "force-dynamic";

type LiabProof = { id: string; balance: string; nonce: string; leaf: string; path: { hash: string; right: boolean }[] };
type Liabilities = { builtAt?: string; root: string; total: string; clientCount: number; proofs: LiabProof[] };
type Reserves = { total?: string; principalFloor?: string; deployHash?: string; contractPackage?: string; H?: string };

export async function GET(req: Request, ctx: { params: Promise<{ client: string }> }) {
  const { client } = await ctx.params;
  const id = decodeURIComponent(client);
  const origin = new URL(req.url).origin;

  const [liab, reserves, solvent] = await Promise.all([
    fetch(`${origin}/liabilities.json`, { cache: "no-store" }).then((r) => (r.ok ? (r.json() as Promise<Liabilities>) : null)).catch(() => null),
    fetch(`${origin}/proofs/reserves.json`, { cache: "no-store" }).then((r) => (r.ok ? (r.json() as Promise<Reserves>) : null)).catch(() => null),
    getReservesSolvent().catch(() => null),
  ]);

  if (!liab) return NextResponse.json({ error: "liabilities not published" }, { status: 503 });
  const row = liab.proofs.find((p) => p.id === id);
  if (!row) return NextResponse.json({ error: `no client '${id}' in the liabilities book` }, { status: 404 });

  const reservesTotal = reserves?.total ?? null;
  const covers = reservesTotal != null ? BigInt(reservesTotal) >= BigInt(liab.total) : null;

  const pack = {
    kind: "amanah-client-evidence-pack",
    version: 1,
    issuedFor: id,
    issuedAt: liab.builtAt ?? null,
    // 1. YOUR liability — the treasury's committed record of what it owes you.
    yourLiability: {
      client: row.id,
      balanceAtomicUsd6dp: row.balance,
      balanceUsd: Number(row.balance) / 1e6,
      nonce: row.nonce,
      leaf: row.leaf,
      inclusionProof: row.path, // sibling hashes bottom→top
    },
    // 2. The published liabilities commitment your leaf must reach.
    liabilities: {
      merkleRoot: liab.root,
      totalAtomicUsd6dp: liab.total,
      totalUsd: Number(liab.total) / 1e6,
      clientCount: liab.clientCount,
    },
    // 3. The reserves that must cover those liabilities (ZK-proven, anchored on-chain).
    reserves: {
      zkProvenTotalAtomicUsd6dp: reservesTotal,
      zkProvenTotalUsd: reservesTotal != null ? Number(reservesTotal) / 1e6 : null,
      solventOnChain: solvent, // ZkReserves.prove_reserves verdict, read live
      anchorDeploy: reserves?.deployHash ?? null,
      anchorExplorer: reserves?.deployHash ? `https://testnet.cspr.live/deploy/${reserves.deployHash}` : null,
      zkReservesContract: reserves?.contractPackage ?? null,
    },
    // 4. The end-to-end claim this pack lets you check yourself.
    claim: covers == null ? "reserves total unavailable" : covers
      ? "reserves ≥ total liabilities, and your balance is included in that total"
      : "WARNING: published reserves do NOT cover total liabilities",
    howToVerify: [
      "1. Recompute your leaf: blake2b256( blake2b256(utf8(client)) ‖ balance_le64 ‖ nonce ). It must equal yourLiability.leaf.",
      "2. Fold the inclusionProof into the leaf: for each step, parent = right ? H(cur‖sibling) : H(sibling‖cur). The result must equal liabilities.merkleRoot.",
      "3. Confirm reserves.zkProvenTotal ≥ liabilities.total (re-run the Pedersen+Schnorr proof at /verify, or trust the on-chain anchor).",
      "4. Open reserves.anchorExplorer — the same proof the ZkReserves contract accepted on-chain.",
      "Reference verifier: https://github.com/PugarHuda/amanah-casper/blob/master/web/lib/merkle-verify.ts",
    ],
  };

  return NextResponse.json(pack, {
    headers: {
      "cache-control": "no-store",
      "content-disposition": `attachment; filename="amanah-evidence-${id.replace(/[^a-z0-9-]/gi, "_")}.json"`,
    },
  });
}
