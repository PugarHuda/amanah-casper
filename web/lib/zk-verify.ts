// Browser-side verifier for Amanah's ZK proof-of-reserves.
//
// This is the SAME check the Casper contract runs in-VM (curve25519-dalek); here it runs
// in the visitor's own browser on the exact bytes the contract accepted. Nothing is
// trusted from the served JSON — H is re-derived locally and the challenge is recomputed.
//
//   Pedersen: C_i = a_i·G + r_i·H     (a_i = a hidden per-asset amount)
//   P = ΣC_i − T·G                    (equals R·H only if Σa_i = T)
//   accept iff  s·H == proof_T + c·P,  c = blake2b256(DOMAIN ‖ ΣC ‖ T_le ‖ proof_T) mod L
import { ed25519 } from "@noble/curves/ed25519";
import { blake2b } from "blakejs";

const G = ed25519.Point.BASE;
const L = ed25519.CURVE.n;
const DOMAIN = new TextEncoder().encode("amanah-zk-reserves-v1");
const mod = (a: bigint, m: bigint) => ((a % m) + m) % m;

export function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}
export function bytesToHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}
const leToBig = (b: Uint8Array) => {
  let n = 0n;
  for (let i = b.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(b[i]);
  return n;
};
const bigToLe = (n: bigint, len: number) => {
  const out = new Uint8Array(len);
  let v = n;
  for (let i = 0; i < len; i++) { out[i] = Number(v & 0xffn); v >>= 8n; }
  return out;
};

/** Re-derive the nothing-up-my-sleeve second generator H (unknown dlog wrt G). */
export function deriveH() {
  const seed = new TextEncoder().encode("amanah-pedersen-H-v1");
  for (let i = 0; i < 256; i++) {
    const h = blake2b(new Uint8Array([...seed, i]), undefined, 32);
    try {
      return ed25519.Point.fromHex(bytesToHex(h)).multiply(8n); // clear cofactor
    } catch {
      /* not a valid point — next counter */
    }
  }
  throw new Error("could not derive H");
}

export interface ReservesProof {
  commitments: string[];
  total: string;
  proofT: string;
  s: string;
}

/** Returns the verification result plus the intermediate values, so the UI can show its work. */
export function verifyReserves(p: ReservesProof): {
  ok: boolean;
  H: string;
  sumC: string;
  challenge: string;
  lhs: string;
  rhs: string;
  error?: string;
} {
  const H = deriveH();
  const blank = { H: bytesToHex(H.toRawBytes()), sumC: "", challenge: "", lhs: "", rhs: "" };
  try {
    const comms = p.commitments.map((h) => ed25519.Point.fromHex(h));
    const T = BigInt(p.total);
    const sumC = comms.reduce((acc, c) => acc.add(c), ed25519.Point.ZERO);
    const P = sumC.add(G.multiply(mod(-T, L))); // ΣC − T·G
    const Tpt = ed25519.Point.fromHex(p.proofT);
    const s = mod(leToBig(hexToBytes(p.s)), L);

    const msg = new Uint8Array([...DOMAIN, ...sumC.toRawBytes(), ...bigToLe(T, 8), ...Tpt.toRawBytes()]);
    const c = mod(leToBig(blake2b(msg, undefined, 32)), L);

    const lhs = H.multiply(s);                 // s·H
    const rhs = Tpt.add(P.multiply(c));        // proof_T + c·P
    return {
      ...blank,
      ok: lhs.equals(rhs),
      sumC: bytesToHex(sumC.toRawBytes()),
      challenge: c.toString(16).padStart(64, "0"),
      lhs: bytesToHex(lhs.toRawBytes()),
      rhs: bytesToHex(rhs.toRawBytes()),
    };
  } catch (e) {
    return { ...blank, ok: false, error: (e as Error).message };
  }
}
