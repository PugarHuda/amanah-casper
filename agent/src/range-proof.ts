// Range proof for the ZK proof-of-reserves (closes the "negative value" gap).
//
// The sum-proof shows ΣC_i = T·G + R·H — the committed values sum to T. But a malicious
// prover could use values that are negative mod the curve order (wrap-around) so garbage
// "sums" to T. A range proof fixes this: for each commitment C = a·G + r·H it proves
// a ∈ [0, 2^N) — the value is a real non-negative number, not a wrap.
//
// Construction (standard, sound, no trusted setup):
//   - Bit-decompose a = Σ b_j·2^j, b_j ∈ {0,1}.
//   - Commit each bit: C_j = b_j·G + s_j·H, with the blindings chosen so Σ 2^j·s_j = r,
//     which makes Σ 2^j·C_j == C exactly (the verifier checks this linear relation).
//   - For each bit, a Chaum–Pedersen OR-proof shows C_j ∈ ⟨H⟩ (bit 0) OR C_j−G ∈ ⟨H⟩
//     (bit 1) — i.e. the committed bit is 0 or 1 — without revealing which.
//
// Verified in the browser (web/lib/range-verify.ts) against the same H the reserves proof
// uses. Published alongside reserves.json.
import { ed25519 } from "@noble/curves/ed25519";
import { blake2b } from "@noble/hashes/blake2b";
import { deriveH } from "./zk-reserves.js";

type Pt = InstanceType<typeof ed25519.Point>;
const G = ed25519.Point.BASE;
const L = ed25519.CURVE.n;
const H: Pt = deriveH();
const DOMAIN = new TextEncoder().encode("amanah-range-proof-v1");
export const RANGE_BITS = 48; // values up to 2^48 ≈ $281M at 6-dp — ample headroom

const mod = (a: bigint, m: bigint) => ((a % m) + m) % m;
// @noble's Point.multiply throws on a 0 scalar; a bit of 0 (and occasional 0 challenges)
// are legitimate here, so route every scalar-mul through this identity-safe wrapper.
const Z = ed25519.Point.ZERO;
const mul = (P: Pt, k: bigint): Pt => { const m = mod(k, L); return m === 0n ? Z : P.multiply(m); };
const hx = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const ptHex = (p: Pt) => hx(p.toRawBytes());
const ptOf = (h: string) => ed25519.Point.fromHex(h);
const scHex = (n: bigint) => {
  const b = new Uint8Array(32);
  let x = mod(n, L);
  for (let i = 0; i < 32; i++) { b[i] = Number(x & 0xffn); x >>= 8n; }
  return hx(b);
};
const scOf = (h: string) => {
  let n = 0n;
  for (let i = h.length - 2; i >= 0; i -= 2) n = (n << 8n) | BigInt(parseInt(h.substr(i, 2), 16));
  return mod(n, L);
};
function rand(): bigint {
  return mod(BigInt("0x" + hx(ed25519.utils.randomPrivateKey())), L);
}
// Fiat–Shamir challenge for one OR-proof, bound to the two statements + both nonces.
function challenge(P0: Pt, P1: Pt, A0: Pt, A1: Pt): bigint {
  const msg = new Uint8Array([...DOMAIN, ...P0.toRawBytes(), ...P1.toRawBytes(), ...A0.toRawBytes(), ...A1.toRawBytes()]);
  return mod(BigInt("0x" + hx(blake2b(msg, { dkLen: 32 }))), L);
}

export interface BitProof {
  C: string;                 // bit commitment
  A0: string; A1: string;
  c0: string; c1: string; z0: string; z1: string;
}
export interface RangeProof {
  bits: BitProof[]; // one OR-proof per bit; Σ 2^j C_j must equal the value commitment
}

// One Chaum–Pedersen OR-proof that `C` commits to bit `b` with blinding `s`.
function proveBit(C: Pt, b: number, s: bigint): BitProof {
  const P0 = C;               // statement 0: C = s·H
  const P1 = C.subtract(G);   // statement 1: C − G = s·H
  let A0: Pt, A1: Pt, c0: bigint, c1: bigint, z0: bigint, z1: bigint;
  if (b === 0) {
    const k0 = rand(); A0 = mul(H, k0);
    c1 = rand(); z1 = rand(); A1 = mul(H, z1).subtract(mul(P1, c1)); // simulated
    const c = challenge(P0, P1, A0, A1);
    c0 = mod(c - c1, L); z0 = mod(k0 + c0 * s, L);
  } else {
    const k1 = rand(); A1 = mul(H, k1);
    c0 = rand(); z0 = rand(); A0 = mul(H, z0).subtract(mul(P0, c0)); // simulated
    const c = challenge(P0, P1, A0, A1);
    c1 = mod(c - c0, L); z1 = mod(k1 + c1 * s, L);
  }
  return { C: ptHex(C), A0: ptHex(A0), A1: ptHex(A1), c0: scHex(c0), c1: scHex(c1), z0: scHex(z0), z1: scHex(z1) };
}

/** Prove value `a` (with commitment blinding `r`, so C = a·G + r·H) is in [0, 2^RANGE_BITS). */
export function proveRange(a: bigint, r: bigint): RangeProof {
  if (a < 0n || a >= (1n << BigInt(RANGE_BITS))) throw new Error(`value ${a} out of [0, 2^${RANGE_BITS})`);
  // Bit blindings s_j chosen so Σ 2^j·s_j = r. Pick s_0..s_{N-2} random; solve the last.
  const s: bigint[] = [];
  let acc = 0n;
  for (let j = 0; j < RANGE_BITS - 1; j++) { const sj = rand(); s.push(sj); acc = mod(acc + (1n << BigInt(j)) * sj, L); }
  const inv2Nm1 = modPow(modPow(2n, BigInt(RANGE_BITS - 1), L), L - 2n, L); // (2^{N-1})^{-1} mod L
  s.push(mod((r - acc) * inv2Nm1, L)); // s_{N-1} = (r − acc) / 2^{N-1}

  const bits: BitProof[] = [];
  for (let j = 0; j < RANGE_BITS; j++) {
    const bj = Number((a >> BigInt(j)) & 1n);
    const Cj = mul(G, BigInt(bj)).add(mul(H, s[j]));
    bits.push(proveBit(Cj, bj, s[j]));
  }
  return { bits };
}

function modPow(base: bigint, exp: bigint, m: bigint): bigint {
  let r = 1n, b = mod(base, m), e = exp;
  while (e > 0n) { if (e & 1n) r = mod(r * b, m); b = mod(b * b, m); e >>= 1n; }
  return r;
}

/** Verify a range proof binds to commitment `Chex` and every bit is 0/1. */
export function verifyRange(Chex: string, proof: RangeProof): boolean {
  try {
    if (proof.bits.length !== RANGE_BITS) return false;
    // 1. Σ 2^j C_j == C (the bit commitments reconstruct the value commitment).
    let sum: Pt | null = null;
    for (let j = 0; j < proof.bits.length; j++) {
      const Cj = mul(ptOf(proof.bits[j].C), 1n << BigInt(j));
      sum = sum ? sum.add(Cj) : Cj;
    }
    if (!sum || ptHex(sum) !== Chex.toLowerCase()) return false;
    // 2. Each OR-proof is valid: c0+c1 = H(...) and both Schnorr checks hold.
    for (const bp of proof.bits) {
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
