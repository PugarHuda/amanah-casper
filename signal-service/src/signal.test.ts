// Test the premium-signal builder returns a well-formed, clamped signal (it hits
// CoinGecko but always resolves to the typed shape, even on failure). Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSignal } from "./signal.js";

test("buildSignal returns a valid, clamped PremiumSignal", async () => {
  const s = await buildSignal();
  assert.ok(typeof s.asof === "string");
  assert.ok("momentum24hPct" in s.cspr && "volatilityPct" in s.cspr);
  assert.ok(typeof s.tilt === "number");
  assert.ok(s.tilt >= -1 && s.tilt <= 1, `tilt clamped to [-1,1], got ${s.tilt}`);
  assert.ok(typeof s.note === "string" && s.note.length > 0);
});
