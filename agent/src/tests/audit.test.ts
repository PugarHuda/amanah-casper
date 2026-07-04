// The auditor's verdict parser is a safety gate: a malformed/empty response must
// NEVER become a silent approve. These lock that fail-closed behaviour.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseVerdict } from "../audit.js";

test("unparseable / empty output defaults to VETO (fail closed)", () => {
  assert.equal(parseVerdict("").approved, false);
  assert.equal(parseVerdict("the model rambled with no json").approved, false);
  assert.equal(parseVerdict("{}").approved, false, "missing approved => veto");
});

test("a valid approve/veto passes through", () => {
  assert.equal(parseVerdict('{"approved":true,"grade":0.9,"concerns":[]}').approved, true);
  const v = parseVerdict('{"approved":false,"grade":0.2,"concerns":["weak reasoning"]}');
  assert.equal(v.approved, false);
  assert.deepEqual(v.concerns, ["weak reasoning"]);
});

test("grade on a 0..100 scale is normalized to 0..1", () => {
  assert.equal(parseVerdict('{"approved":true,"grade":90}').grade, 0.9);
  assert.equal(parseVerdict('{"approved":true,"grade":0.9}').grade, 0.9);
});
