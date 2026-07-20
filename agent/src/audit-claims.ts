// Audit every 64-hex identifier we publish (docs, llms.txt, .env.deployed, the web app)
// against the live chain: is it a real deploy? did it SUCCEED or REVERT? is it a real
// contract package? Judges click these — a dead or mis-described hash is a credibility hit.
// Run: npx tsx src/audit-claims.ts
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const RPC = process.env.CASPER_RPC_URL ?? "https://node.testnet.casper.network/rpc";
const ROOT = resolve(import.meta.dirname, "../..");
const FILES = [
  "README.md", "SUBMISSION.md", "DEMO.md", "USE_CASE.md", "TESTING.md", "SECURITY.md",
  ".env.deployed", "skill/references/llms.txt",
  "web/app/verify/page.tsx", "web/app/api/stream/route.ts", "web/public/proofs/reserves.json",
];

async function rpc(method: string, params: unknown): Promise<any> {
  const r = await fetch(RPC, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return r.json();
}

type Kind = "deploy-success" | "deploy-reverted" | "package" | "contract" | "unknown";

async function classify(hash: string): Promise<{ kind: Kind; detail: string }> {
  const d = await rpc("info_get_deploy", { deploy_hash: hash });
  const info = d?.result?.execution_info;
  if (info?.execution_result) {
    const v2 = info.execution_result.Version2 ?? info.execution_result;
    return v2?.error_message
      ? { kind: "deploy-reverted", detail: v2.error_message }
      : { kind: "deploy-success", detail: "" };
  }
  const pkg = await rpc("query_global_state", { state_identifier: null, key: `hash-${hash}`, path: [] });
  const sv = pkg?.result?.stored_value;
  if (sv?.ContractPackage) {
    const versions = sv.ContractPackage.versions ?? [];
    return { kind: "package", detail: `${versions.length} version(s)` };
  }
  if (sv?.Contract) return { kind: "contract", detail: "contract" };
  return { kind: "unknown", detail: "not a deploy, package, or contract on casper-test" };
}

async function main() {
  // hash -> the files/lines that mention it
  const seen = new Map<string, { file: string; line: string }[]>();
  for (const f of FILES) {
    const p = resolve(ROOT, f);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      // Skip cryptographic material (curve points, scalars, commitments). Those are
      // 64-hex too, but they are proof data — not chain identifiers.
      if (/"(proofT|s|H|commitments|domain)"\s*:/.test(line)) continue;
      if (/^\s*"[0-9a-f]{64}",?\s*$/.test(line)) continue;
      for (const m of line.matchAll(/\b[0-9a-f]{64}\b/g)) {
        const arr = seen.get(m[0]) ?? [];
        arr.push({ file: f, line: line.trim().slice(0, 130) });
        seen.set(m[0], arr);
      }
    }
  }
  console.log(`checking ${seen.size} distinct 64-hex identifiers against ${RPC}\n`);

  const bad: string[] = [];
  const revertedOk: string[] = [];
  let ok = 0;
  for (const [hash, refs] of seen) {
    const { kind, detail } = await classify(hash);
    const where = [...new Set(refs.map((r) => r.file))].join(", ");
    if (kind === "unknown") {
      // Could be a reasoning hash / account hash / state seed — flag only if a doc calls
      // it a deploy or contract.
      const claimsChain = refs.some((r) => /deploy|proof|tx|hash-|contract|package/i.test(r.line));
      const msg = `UNKNOWN  ${hash.slice(0, 12)}…  (${where})`;
      if (claimsChain) bad.push(msg + `\n           ↳ ${refs[0].line}`);
      continue;
    }
    if (kind === "deploy-reverted") {
      // Reverts we cite ON PURPOSE (the guard rails) are fine — check the surrounding text.
      const intentional = refs.some((r) =>
        /refus|revert|block|reject|NotApproved|BelowReputationFloor|not approved|breaker|benched|unapproved/i.test(r.line));
      const line = `${hash.slice(0, 12)}…  reverted "${detail}"  (${where})`;
      if (intentional) revertedOk.push(line);
      else bad.push(`MISDESCRIBED  ${line}\n           ↳ ${refs[0].line}`);
      continue;
    }
    ok++;
  }

  console.log(`✓ ${ok} verified live (successful deploys / real packages / contracts)`);
  if (revertedOk.length) {
    console.log(`\n✓ ${revertedOk.length} intentional reverts, correctly described as refusals:`);
    revertedOk.forEach((l) => console.log("   " + l));
  }
  if (bad.length) {
    console.log(`\n✗ ${bad.length} PROBLEM(S):`);
    bad.forEach((l) => console.log("   " + l));
    process.exitCode = 1;
  } else {
    console.log("\nNo dead or mis-described identifiers.");
  }
}

main().catch((e) => { console.error("FAILED:", e); process.exit(1); });
