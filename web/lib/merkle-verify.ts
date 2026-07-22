// Browser-side proof-of-liabilities verifier. Re-derives a client's Merkle path to the
// published root — the same check the agent's liabilities.ts does — so a visitor can
// confirm a client's balance is counted in the liabilities total without trusting us, and
// without seeing any other client's balance.
import { blake2b } from "blakejs";

const hx = (b: Uint8Array) => Buffer.from(b).toString("hex");
const H = (b: Uint8Array) => Buffer.from(blake2b(b, undefined, 32));
const le64 = (n: bigint) => {
  const b = Buffer.alloc(8);
  for (let i = 0; i < 8; i++) b[i] = Number((n >> BigInt(8 * i)) & 0xffn);
  return b;
};

/** Recompute a leaf from its (id, balance, nonce) — must match the agent's leaf(). */
export function computeLeaf(id: string, balance: bigint, nonceHex: string): string {
  const idHash = H(Buffer.from(new TextEncoder().encode(id)));
  const nonce = Buffer.from(nonceHex, "hex");
  return hx(H(Buffer.concat([idHash, le64(balance), nonce])));
}

/** Fold a leaf up its path; true iff it re-derives the root. */
export function verifyInclusion(leafHex: string, path: { hash: string; right: boolean }[], rootHex: string): boolean {
  let cur = Buffer.from(leafHex, "hex");
  for (const step of path) {
    const sib = Buffer.from(step.hash, "hex");
    cur = step.right ? H(Buffer.concat([cur, sib])) : H(Buffer.concat([sib, cur]));
  }
  return hx(cur) === rootHex.toLowerCase();
}
