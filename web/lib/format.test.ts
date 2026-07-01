// Unit tests for the web formatters (run: npm run test:unit). Kept out of ./tests
// so Playwright (testDir ./tests) never picks them up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { shortHash, relTime } from "./cspr";
import { fmtUsd, dataSources } from "./data";

test("fmtUsd formats atomic 6-dp amounts as USD", () => {
  assert.equal(fmtUsd(1_000_000_000_000n), "$1.00M"); // $1M
  assert.equal(fmtUsd(800_000_000_000n), "$800,000");
  assert.equal(fmtUsd(50_000_000_000n), "$50,000");
  assert.equal(fmtUsd(0n), "$0");
  assert.equal(fmtUsd(2_500_000_000_000n), "$2.50M");
});

test("shortHash abbreviates a hash and strips 0x", () => {
  const h = "9e266b0554d2930cd5716da9493e4ab7991d834d4a688fee20e02b6283b26d1a";
  const s = shortHash(h);
  assert.ok(s.startsWith("0x9e26"), s);
  assert.ok(s.endsWith("6d1a"), s);
  assert.equal(shortHash(undefined), "—");
});

test("relTime renders relative times", () => {
  const now = Date.now();
  assert.equal(relTime(new Date(now - 10_000).toISOString()), "just now"); // <30s rounds to 0m
  assert.equal(relTime(new Date(now - 5 * 60_000).toISOString()), "5m ago");
  assert.equal(relTime(new Date(now - 3 * 3_600_000).toISOString()), "3h ago");
  assert.equal(relTime(new Date(now - 2 * 86_400_000).toISOString()), "2d ago");
  assert.equal(relTime(undefined), "");
});

test("dataSources extracts real provider names from blob notes", () => {
  const notes = ["cspr: coingecko casper-network", "gold: metalpriceapi XAU", "wti: EIA RWTC 2026-06-22"];
  const out = dataSources(notes);
  assert.ok(out.includes("coingecko"));
  assert.ok(out.includes("metalpriceapi"));
  assert.ok(out.includes("EIA"));
  assert.equal(dataSources([]), "live public APIs");
  assert.equal(dataSources(undefined), "live public APIs");
});
