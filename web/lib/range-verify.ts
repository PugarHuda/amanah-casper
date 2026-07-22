// Browser-side range-proof verifier — confirms each hidden allocation is a real
// non-negative number in [0, 2^N), bound to the reserves-proof commitments. Mirrors
// agent/src/range-proof.ts exactly. Same H (nums generator) as the reserves proof.
import { ed25519 } from "@noble/curves/ed25519";
import { blake2b } from "@noble/hashes/blake2b";

type Pt = InstanceType<typeof ed25519.Point>;
const G = ed25519.Point.BASE;
const L = ed25519.CURVE.n;
const Z = ed25519.Point.ZERO;
const DOMAIN = new TextEncoder().encode("amanah-range-proof-v1");
const mod = (a: bigint, m: bigint) => ((a % m) + m) % m;
const mul = (P: Pt, k: bigint): Pt => { const m = mod(k, L); return m === 0n ? Z : P.multiply(m); };
const hx = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const ptHex = (p: Pt) => hx(p.toRawBytes());
const ptOf = (h: string) => ed25519.Point.fromHex(h);
const scOf = (h: string) => { let n = 0n; for (let i = h.length - 2; i >= 0; i -= 2) n = (n << 8n) | BigInt(parseInt(h.substr(i, 2), 16)); return mod(n, L); };

// H must be derived identically to the agent/contract (try-and-increment + cofactor clear).
function deriveH(): Pt {
  const seed = new TextEncoder().encode("amanah-pedersen-H-v1");
  for (let i = 0; i < 256; i++) {
    try { return ed25519.Point.fromHex(hx(blake2b(new Uint8Array([...seed, i]), { dkLen: 32 }))).multiply(8n); } catch { /* next */ }
  }
  throw new Error("H");
}
const H = deriveH();

function challenge(P0: Pt, P1: Pt, A0: Pt, A1: Pt): bigint {
  const msg = new Uint8Array([...DOMAIN, ...P0.toRawBytes(), ...P1.toRawBytes(), ...A0.toRawBytes(), ...A1.toRawBytes()]);
  return mod(BigInt("0x" + hx(blake2b(msg, { dkLen: 32 }))), L);
}

type BitProof = { C: string; A0: string; A1: string; c0: string; c1: string; z0: string; z1: string };

/** True iff `proof` proves the value behind `commitmentHex` is in [0, 2^bits). */
export function verifyRange(commitmentHex: string, proof: { bits: BitProof[] }): boolean {
  try {
    const bits = proof.bits;
    if (!bits?.length) return false;
    let sum: Pt | null = null;
    for (let j = 0; j < bits.length; j++) {
      const Cj = mul(ptOf(bits[j].C), 1n << BigInt(j));
      sum = sum ? sum.add(Cj) : Cj;
    }
    if (!sum || ptHex(sum) !== commitmentHex.toLowerCase()) return false;
    for (const bp of bits) {
      const C = ptOf(bp.C), P0 = C, P1 = C.subtract(G);
      const A0 = ptOf(bp.A0), A1 = ptOf(bp.A1);
      const c0 = scOf(bp.c0), c1 = scOf(bp.c1), z0 = scOf(bp.z0), z1 = scOf(bp.z1);
      if (mod(c0 + c1, L) !== challenge(P0, P1, A0, A1)) return false;
      if (ptHex(mul(H, z0)) !== ptHex(A0.add(mul(P0, c0)))) return false;
      if (ptHex(mul(H, z1)) !== ptHex(A1.add(mul(P1, c1)))) return false;
    }
    return true;
  } catch {
    return false;
  }
}
