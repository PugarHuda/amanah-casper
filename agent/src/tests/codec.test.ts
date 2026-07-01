// Unit tests for the on-chain state codec (the cryptographic decode logic that
// backs every treasury/guardrail/reputation read). Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hexToBytes, bytesToHex, be32, dictAddr, keyAccountBytes,
  decodeBlob, decodeI64, decodeEnumByte,
} from "../lib/codec.js";

test("hexToBytes / bytesToHex round-trip", () => {
  const h = "0147ebe715f3fb6d";
  assert.equal(bytesToHex(hexToBytes(h)), h);
  assert.deepEqual(Array.from(hexToBytes("ff00a5")), [255, 0, 165]);
  assert.equal(bytesToHex(new Uint8Array([1, 15, 255])), "010fff");
  assert.deepEqual(Array.from(hexToBytes("0xabcd")), [0xab, 0xcd]); // 0x prefix
});

test("be32 encodes a big-endian u32", () => {
  assert.deepEqual(Array.from(be32(0)), [0, 0, 0, 0]);
  assert.deepEqual(Array.from(be32(1)), [0, 0, 0, 1]);
  assert.deepEqual(Array.from(be32(258)), [0, 0, 1, 2]);
});

test("decodeBlob decodes [len, ...little-endian] U256/U512", () => {
  assert.equal(decodeBlob([0]), 0n); // empty => 0
  assert.equal(decodeBlob([1, 5]), 5n);
  assert.equal(decodeBlob([2, 0x40, 0x42]), 0x4240n); // 16960
  // $1,000,000 at 6dp = 1_000_000_000_000 atomic
  assert.equal(decodeBlob([5, 0x00, 0x10, 0xa5, 0xd4, 0xe8]), 1_000_000_000_000n);
  assert.equal(decodeBlob(null), 0n);
  assert.equal(decodeBlob(undefined), 0n);
});

test("decodeI64 handles number AND 8-byte little-endian array (Casper 2.0)", () => {
  // Regression: the reputation-score bug — parsed comes back as a byte array.
  assert.equal(decodeI64([1, 0, 0, 0, 0, 0, 0, 0]), 1);
  assert.equal(decodeI64([0, 0, 0, 0, 0, 0, 0, 0]), 0);
  assert.equal(decodeI64([5, 0, 0, 0, 0, 0, 0, 0]), 5);
  assert.equal(decodeI64(7), 7); // JSON-number form
  // two's-complement negative
  assert.equal(decodeI64([255, 255, 255, 255, 255, 255, 255, 255]), -1);
  assert.equal(decodeI64("nope"), 0);
});

test("decodeEnumByte reads a variant index (Status/AssetId)", () => {
  assert.equal(decodeEnumByte([1]), 1); // Status::Valid
  assert.equal(decodeEnumByte([0]), 0); // Pending
  assert.equal(decodeEnumByte([2]), 2); // Revoked
  assert.equal(decodeEnumByte(1), 1);
  assert.equal(decodeEnumByte(true), 1); // allowlist bool
  assert.equal(decodeEnumByte(false), 0);
});

test("keyAccountBytes prefixes the Account tag (0x00)", () => {
  const k = keyAccountBytes("27e5e2b0c3840da2cf061c0cb4d7469c96764d5761b969b3f8314149d796358f");
  assert.equal(k.length, 33);
  assert.equal(k[0], 0x00);
  assert.equal(k[1], 0x27);
});

test("dictAddr is deterministic and 32-byte hex (golden vector)", () => {
  const seed = "468adcc6a52351bacd555b9b78756fae31397609fefe4327fbfaa0b564f83848"; // vault v2
  const a1 = dictAddr(seed, 1, [0]); // allocations[Gold]
  const a2 = dictAddr(seed, 1, [0]);
  assert.equal(a1, a2, "same inputs => same address");
  assert.equal(a1.length, 64, "32-byte hex");
  assert.notEqual(dictAddr(seed, 1, [0]), dictAddr(seed, 1, [1]), "different key => different addr");
  assert.notEqual(dictAddr(seed, 1, [0]), dictAddr(seed, 2), "different field => different addr");
});

test("dictAddr golden vector (locks the verified-correct derivation)", () => {
  // These addresses are what the live vault v2 principal/Gold slots actually
  // resolve to on-chain (verified: principal=$800K, Gold=$199K). A change here
  // means the derivation drifted and every read would silently corrupt.
  const seed = "468adcc6a52351bacd555b9b78756fae31397609fefe4327fbfaa0b564f83848";
  assert.equal(dictAddr(seed, 2), GOLDEN_PRINCIPAL_ADDR);
  assert.equal(dictAddr(seed, 1, [0]), GOLDEN_GOLD_ADDR);
});
const GOLDEN_PRINCIPAL_ADDR = "f0585611b2723452100b70b2aea3f50439a81a8f52be6add544cd7825658a77b";
const GOLDEN_GOLD_ADDR = "dfd0ded9eb0121f1798e11e8850c79e056fb3a865821e89093931efff10cb228";
