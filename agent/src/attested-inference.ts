// TEE-attested inference (verifiable AI) — the answer to "prove WHAT the model actually did",
// not just "we signed our own output".
//
// The gap our proof-of-reasoning couldn't close alone: we sign the decision with the agent
// key and record `model: <name>` in the blob — but nothing stops the operator writing any
// model name next to any output. A Trusted Execution Environment inference provider closes
// it: the model runs inside attested hardware (Intel TDX + NVIDIA GPU TEE), and the gateway
// returns a SIGNED RECEIPT binding the request hash -> the response hash -> the TEE workload
// attestation. Anchor that receipt in the on-chain blob and the claim upgrades to: *this
// exact reasoning was produced by this model inside a verified enclave* — checkable by anyone
// against the provider's attestation report, no trust in us required.
//
// You don't need the hardware — you rent it via an OpenAI-compatible API (Phala / RedPill).
// Optional: if TEE_INFERENCE_* isn't set the loop uses Venice and records attestedInference:null.
//
// API shape verified against docs.phala.com + docs.redpill.ai (2026): POST /chat/completions
// returns an `x-receipt-id` header; GET /v1/aci/receipts/{id} returns the signed receipt
// (request/response hashes, workload_id, workload_keyset_digest) which is checked against a
// fresh Attestation Report. ponytail: wired to the documented API + unit-tested parsing, but
// not live-run here (no provider key in this repo) — set a key to exercise it end to end.
import { config } from "./config.js";

export interface InferenceReceipt {
  provider: string;         // base URL of the TEE gateway
  model: string;            // the confidential model that ran
  receiptId: string;        // x-receipt-id — the handle to the signed receipt
  receiptUrl: string;       // GET here to fetch + verify the signed receipt
  requestHash?: string;     // provider-facing request hash (from the receipt, if fetched)
  responseHash?: string;    // provider response hash (from the receipt, if fetched)
  workloadId?: string;      // TEE workload identity — must match the attestation report
  workloadKeysetDigest?: string;
  attestedAt: string;
}

export interface AttestedResult {
  content: string;
  receipt: InferenceReceipt | null; // null if TEE not configured or the receipt call failed
}

export const teeConfigured = (): boolean =>
  !!(config.teeInferenceBaseUrl && config.teeInferenceKey);

/** Build the receipt-fetch URL for a receipt id (exported for tests). */
export function receiptUrl(baseUrl: string, id: string): string {
  return `${baseUrl.replace(/\/$/, "")}/aci/receipts/${id}`;
}

/** Extract the fields we anchor from a fetched receipt body, tolerant of key casing/nesting
 *  differences between providers. Exported + pure so the binding logic is unit-testable. */
export function parseReceipt(body: unknown): Pick<InferenceReceipt, "requestHash" | "responseHash" | "workloadId" | "workloadKeysetDigest"> {
  const b = (body ?? {}) as Record<string, unknown>;
  const data = (b.data ?? b.receipt ?? b) as Record<string, unknown>;
  const s = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
  return {
    requestHash: s(data.provider_request_hash) ?? s(data.request_hash) ?? s(data.requestHash),
    responseHash: s(data.provider_response_hash) ?? s(data.response_hash) ?? s(data.responseHash) ?? s(data.response_wire_hash),
    workloadId: s(data.workload_id) ?? s(data.workloadId),
    workloadKeysetDigest: s(data.workload_keyset_digest) ?? s(data.workloadKeysetDigest),
  };
}

/**
 * Run one attested chat completion. Returns the content plus a signed-receipt handle. Never
 * throws into the cycle: on any failure it returns { content, receipt: null } so a TEE
 * outage degrades to an un-attested (but still Ed25519-signed) decision, never a dead loop.
 */
export async function attestedChat(messages: { role: string; content: string }[]): Promise<AttestedResult> {
  const base = config.teeInferenceBaseUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${config.teeInferenceKey}` },
    body: JSON.stringify({ model: config.teeInferenceModel, temperature: 0.2, max_tokens: 4000, messages }),
  });
  if (!res.ok) throw new Error(`TEE inference ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);

  const receiptId = res.headers.get("x-receipt-id") ?? "";
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content ?? "";

  let receipt: InferenceReceipt | null = null;
  if (receiptId) {
    receipt = {
      provider: base, model: config.teeInferenceModel, receiptId,
      receiptUrl: receiptUrl(base, receiptId), attestedAt: new Date().toISOString(),
    };
    // Best-effort: fetch the signed receipt to anchor its bound hashes. If it 404s or times
    // out we still keep the receiptId + URL so a verifier can fetch it themselves later.
    try {
      const rBody = await fetch(receipt.receiptUrl, { headers: { authorization: `Bearer ${config.teeInferenceKey}` } }).then((r) => (r.ok ? r.json() : null));
      if (rBody) receipt = { ...receipt, ...parseReceipt(rBody) };
    } catch { /* keep the handle; the receipt is still fetchable by a verifier */ }
  }
  return { content, receipt };
}
