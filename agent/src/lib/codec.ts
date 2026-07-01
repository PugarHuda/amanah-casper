// Canonical, pure codec for Amanah's on-chain state decoding. Extracted so it can
// be unit-tested in isolation (the derivation is cryptographic — a silent change
// would corrupt every treasury/guardrail read). Pure functions only, no I/O.
import { blake2b } from "blakejs";

export const hex = (b: Uint8Array): string => Buffer.from(b).toString("hex");

export function hexToBytes(h: string): Uint8Array {
  const s = h.startsWith("0x") ? h.slice(2) : h;
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16);
  return out;
}

export function bytesToHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export const be32 = (n: number): Uint8Array =>
  new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);

/** Odra "state" dict item address for field `index` (1-indexed) + optional
 *  mapping key: blake2b256( seed ++ ascii( blake2b256( be32(index) ++ key ) ) ). */
export function dictAddr(seedHex: string, index: number, mappingKey: number[] = []): string {
  const itemKey = hex(blake2b(new Uint8Array([...be32(index), ...mappingKey]), undefined, 32));
  const seed = Buffer.from(seedHex, "hex");
  return hex(blake2b(Buffer.concat([seed, Buffer.from(itemKey, "utf8")]), undefined, 32));
}

/** Key::Account bytesrepr = [0x00] + 32 account-hash bytes (a Mapping<Address,_> key). */
export function keyAccountBytes(accountHashHex: string): number[] {
  return [0x00, ...Array.from(hexToBytes(accountHashHex))];
}

/** Decode a U256/U512 stored as a List<U8> blob = [significant_byte_count, ...LE]. */
export function decodeBlob(parsed: number[] | null | undefined): bigint {
  const arr = parsed ?? [];
  const len = arr[0] ?? 0;
  let v = 0n;
  for (let i = 0; i < len; i++) v += BigInt(arr[1 + i] ?? 0) << BigInt(8 * i);
  return v;
}

/** Decode an i64 CLValue.parsed: a JSON number OR an 8-byte little-endian array
 *  (Casper 2.0), sign-extended as two's-complement. */
export function decodeI64(parsed: unknown): number {
  if (typeof parsed === "number") return Math.round(parsed);
  if (Array.isArray(parsed)) {
    let n = 0n;
    for (let i = 0; i < parsed.length; i++) n |= BigInt((parsed[i] as number) & 0xff) << BigInt(8 * i);
    if (n >= 1n << 63n) n -= 1n << 64n;
    return Number(n);
  }
  return 0;
}

/** Decode an enum variant byte (Status/AssetId): parsed is [variant] or a number. */
export function decodeEnumByte(parsed: unknown): number {
  if (Array.isArray(parsed)) return (parsed[0] as number) ?? 0;
  if (typeof parsed === "number") return parsed;
  if (typeof parsed === "boolean") return parsed ? 1 : 0;
  return 0;
}
