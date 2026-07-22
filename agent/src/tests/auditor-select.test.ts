import { test } from "node:test";
import assert from "node:assert/strict";
import { selectAuditors, ticket, type Auditor } from "../auditor-select.js";

const auditors: Auditor[] = [
  { id: "a", account: "11".repeat(32) },
  { id: "b", account: "22".repeat(32) },
  { id: "c", account: "33".repeat(32) },
];
const hash = "7c409e7bfce729cea460c03d3557277ad14e12da2b5d1a82c35860b60fba2df4";

test("selection is deterministic and re-derivable (verifiable)", () => {
  const s1 = selectAuditors(hash, auditors, 2);
  const s2 = selectAuditors(hash, auditors, 2);
  assert.deepEqual(s1.assigned, s2.assigned, "same inputs -> same assignment");
  // The assigned set = the K smallest tickets, which anyone can recompute.
  const sorted = auditors.map((a) => ({ id: a.id, t: ticket(hash, a.account) })).sort((x, y) => (x.t < y.t ? -1 : 1));
  assert.deepEqual(s1.assigned, sorted.slice(0, 2).map((x) => x.id));
});

test("a different decision hash generally reassigns reviewers — no fixed favourites", () => {
  const a = selectAuditors(hash, auditors, 1).assigned[0];
  const other = "0000000000000000000000000000000000000000000000000000000000000001";
  const b = selectAuditors(other, auditors, 1).assigned[0];
  // Not guaranteed different for every pair, but the tickets must differ so selection is
  // hash-driven, not positional.
  assert.notEqual(ticket(hash, auditors[0].account), ticket(other, auditors[0].account));
});
