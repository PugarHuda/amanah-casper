import { test } from "node:test";
import assert from "node:assert/strict";
import { receiptUrl, parseReceipt } from "../attested-inference.js";

test("receiptUrl builds the /aci/receipts/{id} path, trimming a trailing slash", () => {
  assert.equal(receiptUrl("https://inference.phala.com/v1", "r_123"), "https://inference.phala.com/v1/aci/receipts/r_123");
  assert.equal(receiptUrl("https://api.redpill.ai/v1/", "r_9"), "https://api.redpill.ai/v1/aci/receipts/r_9");
});

test("parseReceipt binds the provider's request/response hashes + workload identity", () => {
  const r = parseReceipt({
    data: {
      provider_request_hash: "aa", provider_response_hash: "bb",
      workload_id: "wl-1", workload_keyset_digest: "kd-1",
    },
  });
  assert.deepEqual(r, { requestHash: "aa", responseHash: "bb", workloadId: "wl-1", workloadKeysetDigest: "kd-1" });
});

test("parseReceipt tolerates flat + camelCase + response_wire_hash shapes", () => {
  const flat = parseReceipt({ request_hash: "x", response_wire_hash: "y", workloadId: "w" });
  assert.equal(flat.requestHash, "x");
  assert.equal(flat.responseHash, "y");
  assert.equal(flat.workloadId, "w");
});

test("parseReceipt returns undefined fields (never throws) on an empty/garbage body", () => {
  assert.deepEqual(parseReceipt(null), { requestHash: undefined, responseHash: undefined, workloadId: undefined, workloadKeysetDigest: undefined });
  assert.deepEqual(parseReceipt({ nonsense: 1 }), { requestHash: undefined, responseHash: undefined, workloadId: undefined, workloadKeysetDigest: undefined });
});
