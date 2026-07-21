// Real ZK proof-of-reserves — "hide the split, prove the sum". The agent publishes a
// Pedersen commitment per asset allocation C_i = a_i·G + r_i·H (perfectly hiding a_i),
// and proves in zero-knowledge that the hidden allocations sum to a PUBLIC total T —
// without revealing any individual a_i. Combined with the vault's public principal
// invariant (T ≥ principal, enforced on-chain), this proves SOLVENCY while hiding the
// individual amounts. (The vault's allocations are public today, so this hides the split
// inside the proof, not yet in the system.) No range proof needed: the
// sum is a linear relation, proved with a Schnorr PoK of the aggregate blinding.
//
//   Pedersen:  C_i = a_i·G + r_i·H            (G = ed25519 basepoint; H = nums generator)
//   Aggregate: P = ΣC_i − T·G = R·H           (R = Σr_i)   iff Σa_i = T
//   Prove:     Schnorr PoK of R for base H     (so P really is R·H → the sum is T)
import { ed25519 } from "@noble/curves/ed25519";
import { blake2b } from "@noble/hashes/blake2b";

const G = ed25519.Point.BASE;
const L = ed25519.CURVE.n;
const DOMAIN = new TextEncoder().encode("amanah-zk-reserves-v1");
const mod = (a: bigint, m: bigint) => ((a % m) + m) % m;

function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
  return out;
}
function bytesToHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}
function leToBig(b: Uint8Array): bigint {
  let n = 0n;
  for (let i = b.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(b[i]);
  return n;
}
function bigToLe(n: bigint, len: number): Uint8Array {
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) { out[i] = Number(n & 0xffn); n >>= 8n; }
  return out;
}

// H: a "nothing-up-my-sleeve" second generator with unknown discrete log wrt G.
// Try-and-increment a hash to a valid curve point, then clear the cofactor (·8) into
// the prime-order subgroup. Deterministic — both TS and the contract hardcode the same H.
export function deriveH(): InstanceType<typeof ed25519.Point> {
  const seed = new TextEncoder().encode("amanah-pedersen-H-v1");
  for (let i = 0; i < 256; i++) {
    const h = blake2b(new Uint8Array([...seed, i]), { dkLen: 32 });
    try {
      const P = ed25519.Point.fromHex(bytesToHex(h));
      return P.multiply(8n); // cofactor-clear
    } catch {
      /* not a valid compressed point — try next counter */
    }
  }
  throw new Error("could not derive H");
}
const H = deriveH();

const commit = (a: bigint, r: bigint) => G.multiply(mod(a, L)).add(H.multiply(mod(r, L)));

function challenge(sumCenc: Uint8Array, T: bigint, TptEnc: Uint8Array): bigint {
  const Tb = bigToLe(T, 8); // public total as u64 LE
  const msg = new Uint8Array([...DOMAIN, ...sumCenc, ...Tb, ...TptEnc]);
  return mod(leToBig(blake2b(msg, { dkLen: 32 })), L);
}

export interface ReservesProof {
  commitments: string[]; // hex compressed points
  total: string;         // decimal string (the public sum, u64)
  proofT: string;        // hex compressed point
  s: string;             // hex 32-byte LE scalar
}

/** Prove the hidden `values` (with `blindings`) sum to their total, hiding each value. */
export function proveReserves(values: bigint[], blindings: bigint[], rHex?: string): ReservesProof {
  const commitments = values.map((a, i) => commit(a, blindings[i]));
  const T = values.reduce((acc, a) => acc + a, 0n);
  const R = mod(blindings.reduce((acc, r) => acc + r, 0n), L);
  const sumC = commitments.reduce((acc, c) => acc.add(c), ed25519.Point.ZERO);
  const sumCenc = sumC.toRawBytes();
  const k = rHex ? mod(leToBig(hexToBytes(rHex)), L) : mod(leToBig(ed25519.utils.randomPrivateKey()), L);
  const Tpt = H.multiply(k);
  const c = challenge(sumCenc, T, Tpt.toRawBytes());
  const s = mod(k + c * R, L);
  return {
    commitments: commitments.map((p) => bytesToHex(p.toRawBytes())),
    total: T.toString(),
    proofT: bytesToHex(Tpt.toRawBytes()),
    s: bytesToHex(bigToLe(s, 32)),
  };
}

/** Reference verifier (the CONTRACT is the real on-chain one). s·H == T_pt + c·(ΣC − T·G). */
export function verifyReserves(p: ReservesProof): boolean {
  try {
    const comms = p.commitments.map((h) => ed25519.Point.fromHex(h));
    const T = BigInt(p.total);
    const sumC = comms.reduce((acc, c) => acc.add(c), ed25519.Point.ZERO);
    const P = sumC.add(G.multiply(mod(-T, L))); // ΣC − T·G  (= R·H iff the sum is T)
    const Tpt = ed25519.Point.fromHex(p.proofT);
    const s = mod(leToBig(hexToBytes(p.s)), L);
    const c = challenge(sumC.toRawBytes(), T, Tpt.toRawBytes());
    return H.multiply(s).equals(Tpt.add(P.multiply(c)));
  } catch {
    return false;
  }
}

export { hexToBytes, bytesToHex };

// Self-check + golden vector: `npx tsx src/zk-reserves.ts`
if (/zk-reserves\.(ts|js|mts)$/.test(process.argv[1] ?? "")) {
  console.log("H (nums generator):", bytesToHex(H.toRawBytes()));
  // Hidden per-asset allocations (6-dp atomic USD) summing to $1M; blindings fixed for a vector.
  const values = [250_000_000_000n, 400_000_000_000n, 150_000_000_000n, 200_000_000_000n];
  const blindings = [11n, 22n, 33n, 44n];
  const proof = proveReserves(values, blindings, "77".padEnd(64, "0"));
  const ok = verifyReserves(proof);
  // Tamper: claim a wrong total → must fail.
  const bad = verifyReserves({ ...proof, total: (BigInt(proof.total) + 1n).toString() });
  console.log("total (public):", proof.total, "(individual splits stay hidden in the commitments)");
  console.log("commitments[0]:", proof.commitments[0]);
  console.log("proofT:", proof.proofT, "\ns:", proof.s);
  console.log("verify(valid):", ok, "| verify(wrong total):", bad);
  if (!ok || bad) { console.error("SELF-CHECK FAILED"); process.exit(1); }
  console.log("OK — golden vector above (feed into the Rust verifier).");
}
