// Verifiable auditor selection (B7).
//
// In an open registry, any registered auditor can vote on any decision — which lets a
// captured agent route a borderline decision to friendly auditors. This fixes the routing:
// which auditors are ASSIGNED to review a decision is a deterministic function of the
// decision's own hash, so the agent can't choose them, and anyone can recompute the
// assignment to check it wasn't rigged.
//
//   ticket_i = blake2b256( DOMAIN ‖ decisionHash ‖ auditorId_i )
//   assigned = the K auditors with the smallest tickets
//
// The decision hash is fixed by the attested reasoning, so biasing selection would mean
// grinding the reasoning content — which changes the on-chain attestation. Honest framing:
// this is a VERIFIABLE deterministic assignment (a lightweight VRF); a full ECVRF beacon
// with a secret key + on-chain enforcement is roadmap. Published to
// web/public/auditor-assignment.json and re-checkable in the browser.
import { blake2b } from "blakejs";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const OUT = resolve(import.meta.dirname, "../../web/public/auditor-assignment.json");
const DOMAIN = new TextEncoder().encode("amanah-auditor-select-v1");
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");

export interface Auditor { id: string; account: string } // id = label, account = account-hash hex

/** ticket = blake2b256(DOMAIN ‖ decisionHash ‖ account) — the auditor's lottery number. */
export function ticket(decisionHashHex: string, account: string): string {
  const msg = new Uint8Array([...DOMAIN, ...Buffer.from(decisionHashHex, "hex"), ...Buffer.from(account, "hex")]);
  return hex(blake2b(msg, undefined, 32));
}

/** Deterministically select K reviewers for a decision. Verifiable: recompute + sort. */
export function selectAuditors(decisionHashHex: string, auditors: Auditor[], k: number): {
  decisionHash: string; k: number; auditors: { id: string; account: string; ticket: string }[]; assigned: string[];
} {
  const withTickets = auditors.map((a) => ({ ...a, ticket: ticket(decisionHashHex, a.account) }));
  const sorted = [...withTickets].sort((a, b) => (a.ticket < b.ticket ? -1 : a.ticket > b.ticket ? 1 : 0));
  return {
    decisionHash: decisionHashHex,
    k,
    auditors: withTickets,
    assigned: sorted.slice(0, Math.min(k, sorted.length)).map((a) => a.id),
  };
}

// The demo auditor set (the same keys the quorum uses). In production this is read from the
// on-chain open registry.
const DEMO_AUDITORS: Auditor[] = [
  { id: "custodian", account: "4fd664f4779d6d0a4894f84f1ddbb60bcd9c7b9681066f915d084518b678925f" },
  { id: "auditor-2", account: "520d1b936cabc9b18c64c9f075c11df9a48beadb9fde4fc3d83b4a10b362b3d7" },
  { id: "auditor-3", account: "6c9e2267bda464b6dcb0fa1070fb77c342d8c40699f3ee6d12f4edf650bde9e9" },
];

/** Publish the assignment for the pending demo decision. */
export function publishAssignment(
  decisionHashHex = process.env.QUORUM_V4_PENDING_HASH || "7c409e7bfce729cea460c03d3557277ad14e12da2b5d1a82c35860b60fba2df4",
  auditors: Auditor[] = DEMO_AUDITORS,
  k = 2,
): { assigned: string[] } {
  const sel = selectAuditors(decisionHashHex, auditors, k);
  try {
    mkdirSync(resolve(OUT, ".."), { recursive: true });
    writeFileSync(OUT, JSON.stringify({
      note: "Which auditors are assigned to review this decision is derived from the decision's own hash, so the agent can't pick friendly reviewers. Recompute ticket = blake2b(DOMAIN ‖ decisionHash ‖ account) and take the K smallest.",
      domain: "amanah-auditor-select-v1",
      ...sel,
      builtAt: new Date().toISOString(),
    }, null, 2) + "\n");
  } catch { /* non-fatal */ }
  return { assigned: sel.assigned };
}
