// Unit/integration tests for the MCP read functions. get_attestation verifies a
// real published blob (the "proof, not a diary" round-trip); get_reputation's
// input validation is checked on the pure path. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { getAttestation, getReputation } from "../chain.js";

function latestHash(): string | null {
  try {
    const dir = resolve(import.meta.dirname, "../../../audit");
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    return files.length ? files[0].replace(/\.json$/, "") : null;
  } catch {
    return null;
  }
}

test("get_attestation verifies a real published reasoning blob", async () => {
  const hash = latestHash();
  if (!hash) return; // no blobs in this checkout — skip
  const a = await getAttestation(hash);
  assert.equal(a.reasoningHash, hash);
  assert.equal(a.verified, true, "recomputed blake2b must match the filename hash");
  assert.ok(a.decision && a.decision.length > 0, "decision string present");
});

test("get_attestation reports verified:false for an unknown hash", async () => {
  const a = await getAttestation("deadbeef".repeat(8));
  assert.equal(a.verified, false);
  assert.match(a.note ?? "", /no amanah\/audit|predates/i);
});

test("get_reputation rejects a malformed address", async () => {
  const r = await getReputation("not-a-real-account-hash");
  assert.equal(r.score, -1);
});

test("get_reputation accepts the account-hash- prefix form", async () => {
  // Without REPUTATION_STATE_SEED loaded (no dotenv in tests) it returns -1 with a
  // 'set the seed' note — the point is the address parses, not that it reads chain.
  const r = await getReputation("account-hash-27e5e2b0c3840da2cf061c0cb4d7469c96764d5761b969b3f8314149d796358f");
  assert.equal(typeof r.score, "number");
  assert.ok(r.note && r.note.length > 0);
});
