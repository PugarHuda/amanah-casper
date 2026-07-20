// Serves the newest published reasoning blob as the EXACT bytes the agent hashed, plus
// the attested hash and its IPFS CID. The /verify page recomputes blake2b over these
// bytes in the visitor's browser and compares — the same check AttestationLog did
// on-chain. The CID is returned so anyone can pull the identical bytes from IPFS
// instead of trusting this endpoint.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function fromDisk(): { hash: string; raw: string; cid: string | null } | null {
  try {
    const dir = resolve(process.cwd(), "../audit");
    const files = readdirSync(dir).filter((f) => f.endsWith(".json") && !f.endsWith(".audit.json"));
    if (!files.length) return null;
    const newest = files
      .map((f) => ({ f, t: statSync(resolve(dir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t)[0].f;
    const hash = newest.replace(/\.json$/, "");
    let cid: string | null = null;
    try { cid = readFileSync(resolve(dir, `${hash}.cid`), "utf8").trim() || null; } catch { /* no sidecar */ }
    // Raw text, byte-for-byte as written by the agent — do NOT re-serialise.
    return { hash, raw: readFileSync(resolve(dir, newest), "utf8"), cid };
  } catch {
    return null;
  }
}

async function fromPinata(): Promise<{ hash: string; raw: string; cid: string } | null> {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) return null;
  try {
    const list = await fetch(
      "https://api.pinata.cloud/data/pinList?status=pinned&pageLimit=20&metadata[name]=amanah-reasoning",
      { headers: { authorization: `Bearer ${jwt}` }, next: { revalidate: 15 } },
    );
    if (!list.ok) return null;
    const data = (await list.json()) as { rows?: { ipfs_pin_hash: string; metadata?: { keyvalues?: { hash?: string } } }[] };
    const row = data.rows?.[0];
    if (!row) return null;
    const gw = process.env.PINATA_GATEWAY || "https://gateway.pinata.cloud";
    const res = await fetch(`${gw}/ipfs/${row.ipfs_pin_hash}`, { next: { revalidate: 15 } });
    if (!res.ok) return null;
    return { hash: row.metadata?.keyvalues?.hash ?? "", raw: await res.text(), cid: row.ipfs_pin_hash };
  } catch {
    return null;
  }
}

export async function GET(): Promise<Response> {
  const found = fromDisk() ?? (await fromPinata());
  if (!found) return Response.json({ error: "no published reasoning blob available" }, { status: 404 });
  return Response.json(found, { headers: { "cache-control": "no-store" } });
}
