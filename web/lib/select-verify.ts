// Browser verifier for the auditor assignment (B7). Recomputes each auditor's ticket and
// confirms the published `assigned` set is exactly the K smallest — so a visitor can check
// the agent didn't hand-pick friendly reviewers.
import { blake2b } from "blakejs";

const DOMAIN = new TextEncoder().encode("amanah-auditor-select-v1");
const hx = (b: Uint8Array) => Buffer.from(b).toString("hex");

export function ticket(decisionHashHex: string, account: string): string {
  const msg = new Uint8Array([...DOMAIN, ...Buffer.from(decisionHashHex, "hex"), ...Buffer.from(account, "hex")]);
  return hx(blake2b(msg, undefined, 32));
}

type Assignment = {
  decisionHash: string; k: number;
  auditors: { id: string; account: string; ticket: string }[]; assigned: string[];
};

/** True iff every published ticket recomputes AND `assigned` is the K smallest. */
export function verifyAssignment(a: Assignment): boolean {
  try {
    const recomputed = a.auditors.map((x) => ({ id: x.id, t: ticket(a.decisionHash, x.account), claimed: x.ticket }));
    if (recomputed.some((x) => x.t !== x.claimed.toLowerCase())) return false;
    const shouldBe = [...recomputed].sort((x, y) => (x.t < y.t ? -1 : 1)).slice(0, a.k).map((x) => x.id);
    return JSON.stringify(shouldBe) === JSON.stringify(a.assigned);
  } catch {
    return false;
  }
}
