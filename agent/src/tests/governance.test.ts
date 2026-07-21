// Governance attribution is compliance-adjacent, so the failure mode that matters is
// claiming oversight that was never configured. Unset fields must read as unset.
import { test } from "node:test";
import assert from "node:assert/strict";
import { governanceContext, governanceConfigured } from "../governance.js";

test("always states that liability is not transferred", () => {
  const g = governanceContext();
  assert.match(g.note, /not transferred/i);
  assert.match(g.note, /DORA/);
});

test("exposes the approved risk tolerance in machine-readable form", () => {
  const g = governanceContext();
  assert.ok(g.riskTolerance, "risk tolerance must be present");
  assert.equal(typeof g.riskTolerance!.escalateBelowConfidence, "number");
  assert.ok(
    g.riskTolerance!.escalateBelowConfidence > 0 && g.riskTolerance!.escalateBelowConfidence <= 1,
    "confidence threshold must be a 0..1 probability",
  );
});

test("unset attribution is reported as null, never invented", () => {
  const g = governanceContext();
  for (const k of ["policyVersion", "policyApprovedBy", "accountableOwner"] as const) {
    const v = g[k];
    assert.ok(v === null || (typeof v === "string" && v.length > 0), `${k} must be null or a real value`);
  }
  // governanceConfigured must agree with the fields rather than always claiming true.
  assert.equal(governanceConfigured(), !!(g.policyVersion && g.accountableOwner));
});
