// The AUDITOR agent — a second, independent LLM (with its own custodian key) that
// reviews the primary agent's decision and grades it, then signs + attests its
// verdict ON-CHAIN to a separate AuditorLog. The reallocate only proceeds if the
// auditor approves. So every autonomous move carries TWO independent on-chain
// attestations from TWO different keys: the actor's reasoning + the auditor's grade.
//
// This is separation of duties for AI: the agent that decides is not the agent
// that approves, and neither can forge the other's on-chain signature.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { blake2b } from "blakejs";
import { CLValue, CLTypeUInt8, Args } from "./sdk.js";
import type { PrivateKey, RpcClient } from "casper-js-sdk";
import { config } from "./config.js";
import { callEntryPoint } from "./casper.js";
import { extractJson } from "./reason.js";
import type { Decision, PriceSnapshot } from "./types.js";

export interface AuditVerdict {
  approved: boolean;
  grade: number; // 0..1 confidence that the decision is sound + within policy
  concerns: string[];
  /** The model that produced this verdict — a DIFFERENT family from the actor, so the
   *  review isn't blind to the same failure modes. Recorded so the diversity is provable. */
  model?: string;
}

const AUDIT_SYSTEM = `You are an INDEPENDENT risk auditor for an autonomous RWA \
treasury agent. You did NOT make this decision — you review it, skeptically, like a \
second signer who is accountable for approving it.

POLICY YOU ARE ENFORCING (read carefully):
- The vault holds $1M: an $800K PRINCIPAL floor plus a ~$200K movable buffer. The \
on-chain contract ENFORCES the principal floor — a reallocate that would touch \
principal REVERTS automatically. So principal safety is already guaranteed by the \
contract; do NOT veto on "this touches principal" — it structurally cannot. \
Rotating a slice of one asset's allocation into another draws from the movable \
buffer, and IS within policy.
- Your job is to judge the QUALITY of the reasoning, not to re-check principal: is \
the move evidence-backed, proportionate (a slice, not a whole position), and is the \
stated confidence earned by the actual data?

SHARED CONTEXT you may rely on (the same the actor has):
- Amounts are 6-decimal atomic USD: an "amount" of 100000000 = $100, i.e. a tiny \
slice of the ~$200K buffer. Judge proportionality with this unit in mind.
- Accepted long-run reference ranges (domain knowledge, not a live feed): gold \
~$1,800-2,600/oz, WTI ~$60-95, US 10Y ~3-5%, CSPR ~$0.01-0.05. A move that cites a \
current price sitting far outside these ranges is using legitimate context, not an \
unsupported assumption — weigh it on the merits.

Approve if the reasoning is sound and the evidence genuinely supports a proportionate \
move. VETO (approved=false) only if the reasoning is weak or hand-wavy, the move is \
oversized, the data is missing/contradictory, or the confidence is not earned by the \
evidence. Be strict but fair — veto real flaws, not lawful moves.

Return ONLY a JSON object: {"approved": boolean, "grade": number 0..1, "concerns": \
[string, ...]}. No prose, no markdown.`;

/** Independent LLM review of the primary decision. Never throws — a failed audit
 *  defaults to a veto (the safe outcome). */
export async function auditDecision(
  cycle: number,
  prices: PriceSnapshot,
  premiumSignal: unknown,
  marketContext: unknown,
  decision: Decision,
): Promise<AuditVerdict> {
  if (!config.veniceKey) return { approved: false, grade: 0, concerns: ["auditor offline (no VENICE_API_KEY)"] };
  const user = `Cycle #${cycle}. Review this proposed decision by the treasury agent.

Prices: ${JSON.stringify(prices)}
Premium signal: ${JSON.stringify(premiumSignal)}
On-chain market context: ${JSON.stringify(marketContext)}

PROPOSED DECISION: ${JSON.stringify(decision)}

Grade it and decide whether to approve or veto.`;
  // A DIFFERENT model family from the actor (see config.auditorModel): if the actor's
  // model has a blind spot, an independent family is less likely to share it. This is
  // real model diversity, not just a stricter prompt on the same model.
  const auditModel = config.auditorModel || config.model;
  try {
    const res = await fetch(`${config.veniceBaseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${config.veniceKey}` },
      body: JSON.stringify({
        model: auditModel,
        temperature: 0.1, // the auditor is stricter / less creative than the actor
        max_tokens: 1500,
        messages: [{ role: "system", content: AUDIT_SYSTEM }, { role: "user", content: user }],
        venice_parameters: { include_venice_system_prompt: false },
      }),
    });
    if (!res.ok) return { approved: false, grade: 0, concerns: [`auditor API ${res.status}`], model: auditModel };
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return { ...parseVerdict(data.choices?.[0]?.message?.content ?? ""), model: auditModel };
  } catch (e) {
    return { approved: false, grade: 0, concerns: [`auditor error: ${(e as Error).message}`], model: auditModel };
  }
}

/** Parse + normalize the auditor's raw output. Anything unparseable or missing a
 *  boolean verdict defaults to a VETO — the safe outcome (never a silent approve). */
export function parseVerdict(raw: string): AuditVerdict {
  const parsed = extractJson(raw) as Partial<AuditVerdict> | null;
  if (!parsed || typeof parsed.approved !== "boolean") return { approved: false, grade: 0, concerns: ["auditor returned unparseable verdict"] };
  return {
    approved: parsed.approved,
    grade: typeof parsed.grade === "number" ? (parsed.grade > 1 ? parsed.grade / 100 : parsed.grade) : 0,
    concerns: Array.isArray(parsed.concerns) ? parsed.concerns : [],
  };
}

export interface AuditAttestResult { verdictHash: string; deployHash: string }

/** The auditor signs its verdict with the CUSTODIAN key and attests it on-chain to
 *  the AuditorLog (registered to that key). Publishes the verdict blob for verification. */
export async function attestAudit(
  rpc: RpcClient,
  custodianKey: PrivateKey,
  reviewedHash: string,
  verdict: AuditVerdict,
): Promise<AuditAttestResult> {
  const blob = {
    role: "auditor",
    auditorPubkey: custodianKey.publicKey.toHex(),
    reviewedReasoningHash: reviewedHash,
    verdict,
    at: new Date().toISOString(),
  };
  const json = JSON.stringify(blob);
  const hash = blake2b(new TextEncoder().encode(json), undefined, 32);
  const hashHex = Array.from(hash, (x) => x.toString(16).padStart(2, "0")).join("");

  // Publish the verdict blob so anyone can recompute the hash + verify the signature.
  try {
    const dir = resolve(import.meta.dirname, "../../audit");
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, `${hashHex}.audit.json`), json);
  } catch { /* non-fatal */ }
  // Pin to public IPFS (tag "amanah-audit") so the deployed dashboard can show the
  // auditor's verdict without the local repo — same pattern as the reasoning blob.
  if (config.pinataJwt) {
    try {
      await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${config.pinataJwt}` },
        body: JSON.stringify({ pinataContent: blob, pinataMetadata: { name: "amanah-audit", keyvalues: { hash: hashHex } } }),
      });
    } catch { /* non-fatal */ }
  }

  const signature = custodianKey.signAndAddAlgorithmBytes(hash);
  const decisionStr = `${verdict.approved ? "APPROVE" : "VETO"} grade ${verdict.grade}`;
  const args = Args.fromMap({
    reasoning_hash: CLValue.newCLByteArray(hash),
    decision: CLValue.newCLString(decisionStr),
    signature: CLValue.newCLList(CLTypeUInt8, Array.from(signature, (b) => CLValue.newCLUint8(b))),
    pubkey: CLValue.newCLPublicKey(custodianKey.publicKey),
  });
  const { deployHash } = await callEntryPoint({
    rpc, key: custodianKey, contractHash: config.auditorLogHash,
    entryPoint: "attest", args, chainName: config.chainName, paymentMotes: config.paymentMotes,
  });
  return { verdictHash: hashHex, deployHash };
}
