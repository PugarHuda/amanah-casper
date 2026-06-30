// Smoke-test all four MCP tools against live chain state. Run: npx tsx src/smoke.ts
import "dotenv/config";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { getReputation, getVaultState, getAttestation, getAuditTrail } from "./chain.js";

const agent = "account-hash-27e5e2b0c3840da2cf061c0cb4d7469c96764d5761b969b3f8314149d796358f";

console.log("=== get_reputation (agent) ===");
console.log(JSON.stringify(await getReputation(agent), null, 1));

console.log("\n=== get_vault_state ===");
const v = await getVaultState();
console.log("total:", v.totalTreasury, "| principal:", v.principalLocked, "| holdings:", v.holdings.length);

console.log("\n=== get_attestation (latest published blob) ===");
let latest = "";
try {
  const dir = resolve(import.meta.dirname, "../../audit");
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  latest = files[0]?.replace(/\.json$/, "") ?? "";
} catch { /* no audit dir */ }
console.log(latest ? JSON.stringify(await getAttestation(latest), null, 1) : "(no published blob — run a cycle first)");

console.log("\n=== get_audit_trail (first 2) ===");
console.log(JSON.stringify((await getAuditTrail()).slice(0, 2), null, 1));
