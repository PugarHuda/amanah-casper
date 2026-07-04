// Real zero-knowledge KYC proof — a Schnorr NIZK (Fiat–Shamir) over the ed25519
// group. The agent proves it KNOWS the secret scalar x behind its registered KYC
// credential Y = x·B, WITHOUT revealing x. Zero-knowledge, non-interactive, and
// verified INSIDE the Odra contract (curve25519-dalek) — not a toy: 256-bit EC.
//
// Statement: "I know x such that Y = x·B."  (B = ed25519 basepoint, L = group order)
//   prove:  r ← random scalar;  T = r·B;  c = H(DOMAIN‖Y‖T‖ctx) mod L;  s = r + c·x mod L
//   verify: c = H(…);  check  s·B == T + c·Y
// The verifier learns only that some registered credential's holder is present —
// nothing about x. Encodings are RFC-8032 (32-byte compressed points, 32-byte LE
// scalars) and the challenge hash is blake2b-256, so TS(noble) and Rust(dalek) agree.
import { ed25519 } from "@noble/curves/ed25519";
import { blake2b } from "@noble/hashes/blake2b";

const B = ed25519.Point.BASE;
const L = ed25519.CURVE.n; // ed25519 group order
const DOMAIN = new TextEncoder().encode("amanah-zk-kyc-v1");

function leToBig(b: Uint8Array): bigint {
  let n = 0n;
  for (let i = b.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(b[i]);
  return n;
}
function bigToLe32(n: bigint): Uint8Array {
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) { out[i] = Number(n & 0xffn); n >>= 8n; }
  return out;
}
const mod = (a: bigint, m: bigint) => ((a % m) + m) % m;

/** Fiat–Shamir challenge c = blake2b256(DOMAIN‖Y‖T‖ctx) reduced mod L (bytes LE). */
function challenge(Yenc: Uint8Array, Tenc: Uint8Array, ctx: Uint8Array): bigint {
  const msg = new Uint8Array(DOMAIN.length + 32 + 32 + ctx.length);
  msg.set(DOMAIN, 0);
  msg.set(Yenc, DOMAIN.length);
  msg.set(Tenc, DOMAIN.length + 32);
  msg.set(ctx, DOMAIN.length + 64);
  return mod(leToBig(blake2b(msg, { dkLen: 32 })), L);
}

export interface ZkProof { T: string; s: string } // hex (compressed point, LE scalar)

/** Public credential Y = x·B for a secret scalar x (hex, 32-byte LE). */
export function credential(xHex: string): string {
  const x = mod(leToBig(hexToBytes(xHex)), L);
  return bytesToHex(B.multiply(x).toRawBytes());
}

/** Prove knowledge of x (Y = x·B) bound to `ctx`, without revealing x.
 *  `rHex` is optional deterministic randomness (for golden vectors); random otherwise. */
export function prove(xHex: string, ctx: Uint8Array, rHex?: string): ZkProof {
  const x = mod(leToBig(hexToBytes(xHex)), L);
  const r = rHex ? mod(leToBig(hexToBytes(rHex)), L) : mod(leToBig(ed25519.utils.randomPrivateKey()), L);
  const Tp = B.multiply(r);
  const Yenc = B.multiply(x).toRawBytes();
  const Tenc = Tp.toRawBytes();
  const c = challenge(Yenc, Tenc, ctx);
  const s = mod(r + c * x, L);
  return { T: bytesToHex(Tenc), s: bytesToHex(bigToLe32(s)) };
}

/** Verify the NIZK (reference impl; the CONTRACT is the real verifier on-chain). */
export function verify(Yhex: string, proof: ZkProof, ctx: Uint8Array): boolean {
  try {
    const Y = ed25519.Point.fromHex(Yhex);
    const T = ed25519.Point.fromHex(proof.T);
    const s = mod(leToBig(hexToBytes(proof.s)), L);
    const c = challenge(Y.toRawBytes(), T.toRawBytes(), ctx);
    // s·B == T + c·Y
    return B.multiply(s).equals(T.add(Y.multiply(c)));
  } catch {
    return false;
  }
}

export function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
  return out;
}
export function bytesToHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

// Self-check + golden-vector generator: `npx tsx src/zk.ts`
if (/zk\.(ts|js|mts)$/.test(process.argv[1] ?? "")) {
  const x = "a1".padEnd(64, "0");           // fixed secret (LE) for a reproducible vector
  const r = "b2".padEnd(64, "0");           // fixed nonce for a reproducible vector
  const ctx = hexToBytes("9d1a3c5e7f0b2d4a6c8e0f1a3b5d7f9012345678abcdef00fedcba9876543210"); // 32-byte context (e.g. agent account hash)
  const Y = credential(x);
  const proof = prove(x, ctx, r);
  const ok = verify(Y, proof, ctx);
  const tampered = verify(Y, { T: proof.T, s: proof.s.replace(/^../, "00") }, ctx);
  console.log("Y (credential):", Y);
  console.log("proof.T:", proof.T);
  console.log("proof.s:", proof.s);
  console.log("ctx:", bytesToHex(ctx));
  console.log("verify(valid):", ok, "| verify(tampered):", tampered);
  if (!ok || tampered) { console.error("SELF-CHECK FAILED"); process.exit(1); }
  console.log("OK — golden vector above (feed into the Rust verifier test).");
}
