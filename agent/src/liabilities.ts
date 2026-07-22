// Proof-of-liabilities (Merkle) — the missing half of a real solvency proof.
//
// A proof-of-RESERVES on its own is worthless: an operator can prove it holds $1M while
// owing $10M. Solvency is reserves >= LIABILITIES. This builds a Merkle tree over what the
// treasury owes each client, publishes the root + total, and gives every client an
// inclusion proof so they can check their balance is counted — WITHOUT seeing anyone
// else's. Combined with the ZK proof-of-reserves (a proven reserves total T), the full
// claim becomes: T (reserves) >= L (sum of liabilities), and every client is in L.
//
// Leaf = blake2b256( blake2b256(clientId) ‖ balance_le64 ‖ nonce ). Hashing the clientId
// and mixing a per-leaf nonce keeps a client's identity/balance from leaking to others who
// hold the root and their own leaf. Writes web/public/liabilities.json.
import { blake2b } from "blakejs";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const OUT = resolve(import.meta.dirname, "../../web/public/liabilities.json");

// Buffer (not bare Uint8Array) throughout — TS 5.7 made Uint8Array generic over its
// backing buffer, and mixing the variants trips the type checker; Buffer is uniform.
const hex = (b: Uint8Array): string => Buffer.from(b).toString("hex");
const h = (b: Uint8Array): Buffer => Buffer.from(blake2b(b, undefined, 32));
const le64 = (n: bigint): Buffer => {
  const b = Buffer.alloc(8);
  for (let i = 0; i < 8; i++) b[i] = Number((n >> BigInt(8 * i)) & 0xffn);
  return b;
};

export interface Client {
  id: string;      // opaque client identifier (an account label, not PII)
  balance: bigint; // what the treasury owes this client, atomic 6-dp USD
  nonce: string;   // 32-byte hex, unique per leaf (privacy salt)
}

function leaf(c: Client): Buffer {
  const idHash = h(Buffer.from(new TextEncoder().encode(c.id)));
  const nonce = Buffer.from(c.nonce, "hex");
  return h(Buffer.concat([idHash, le64(c.balance), nonce]));
}

// Parent = H(left ‖ right).
function parent(a: Uint8Array, b: Uint8Array): Buffer {
  return h(Buffer.concat([a, b]));
}

/** Build the tree; return the root and, per client, a Merkle inclusion path. */
export function buildLiabilities(clients: Client[]): {
  root: string;
  total: bigint;
  proofs: { id: string; balance: string; nonce: string; leaf: string; path: { hash: string; right: boolean }[] }[];
} {
  if (clients.length === 0) throw new Error("no clients");
  let level: Buffer[] = clients.map(leaf);
  const perLeafPath: { hash: string; right: boolean }[][] = clients.map(() => []);
  const idxAtLevel = clients.map((_, i) => i);

  while (level.length > 1) {
    const next: Buffer[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const L = level[i];
      const R = i + 1 < level.length ? level[i + 1] : level[i]; // duplicate a lone tail
      // Record the sibling for every original leaf sitting under i / i+1.
      for (let k = 0; k < idxAtLevel.length; k++) {
        if (idxAtLevel[k] === i) perLeafPath[k].push({ hash: hex(R), right: true });
        else if (idxAtLevel[k] === i + 1) perLeafPath[k].push({ hash: hex(L), right: false });
      }
      next.push(parent(L, R));
    }
    for (let k = 0; k < idxAtLevel.length; k++) idxAtLevel[k] = Math.floor(idxAtLevel[k] / 2);
    level = next;
  }

  const total = clients.reduce((s, c) => s + c.balance, 0n);
  return {
    root: hex(level[0]),
    total,
    proofs: clients.map((c, i) => ({
      id: c.id, balance: c.balance.toString(), nonce: c.nonce, leaf: hex(leaf(c)), path: perLeafPath[i],
    })),
  };
}

/** Verify an inclusion proof re-derives the root — the check a client runs. */
export function verifyInclusion(leafHex: string, path: { hash: string; right: boolean }[], rootHex: string): boolean {
  let cur: Buffer = Buffer.from(leafHex, "hex");
  for (const step of path) {
    const sib = Buffer.from(step.hash, "hex");
    cur = step.right ? parent(cur, sib) : parent(sib, cur);
  }
  return hex(cur) === rootHex;
}

// Demo client book. In production these are real client sub-ledgers; here they sum to the
// $800k locked principal so the published claim is: reserves $1.00M >= liabilities $0.80M.
const DEMO_CLIENTS: Client[] = [
  { id: "client:orion-dao", balance: 320_000_000_000n, nonce: "11".repeat(32) },
  { id: "client:meridian-fund", balance: 210_000_000_000n, nonce: "22".repeat(32) },
  { id: "client:atlas-treasury", balance: 150_000_000_000n, nonce: "33".repeat(32) },
  { id: "client:vega-capital", balance: 80_000_000_000n, nonce: "44".repeat(32) },
  { id: "client:nimbus-collective", balance: 40_000_000_000n, nonce: "55".repeat(32) },
];

/** Build + publish the demo liabilities tree to web/public/liabilities.json. */
export function publishLiabilities(clients: Client[] = DEMO_CLIENTS): { root: string; total: bigint } {
  const t = buildLiabilities(clients);
  const out = {
    builtAt: new Date().toISOString(),
    root: t.root,
    total: t.total.toString(),
    clientCount: clients.length,
    // Each client keeps ONLY their own row + path; publishing all here is a demo convenience
    // so /verify can let a visitor pick any client and check inclusion.
    proofs: t.proofs,
    note: "Solvency = reserves (ZK proof-of-reserves) >= this liabilities total. Each client verifies their own inclusion without seeing others' balances.",
  };
  try {
    mkdirSync(resolve(OUT, ".."), { recursive: true });
    writeFileSync(OUT, JSON.stringify(out, null, 2));
  } catch { /* non-fatal */ }
  return { root: t.root, total: t.total };
}
