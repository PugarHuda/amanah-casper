// Discover the "state" dict seed uref addresses for deployed Odra contracts.
// These seeds are stable per-deploy and needed for direct dict reads (no entrypoint).
// Run: npx tsx src/find-state-seeds.ts
//
// Method: query_global_state("hash-<pkg_hash>") → ContractPackage → active contract_hash
//         → query_global_state("hash-<contract_hash>") → Contract.named_keys["state"]
//         → extract URef address (strip "uref-" prefix and "-007" suffix)

import "dotenv/config";

const RPC = process.env.CASPER_RPC_URL ?? "https://node.testnet.casper.network/rpc";

const PACKAGES = {
  RwaVault: process.env.RWA_VAULT_HASH ?? "438118a13b5cdcaed1f3cd72bbdcbb3347cd38d2a0d98d2beaa2993a16233347",
  ReputationRegistry: process.env.REPUTATION_REGISTRY_HASH ?? "c2650647e7ddba168e52d0a57f6670b2953b821b8d3c36827cf675f3e548ca0b",
  AttestationLog: process.env.ATTESTATION_LOG_HASH ?? "365913a7a26d3e50798c2c0ce31d0850b8b24b2e1a641f990e41f7ad219a6532",
  SpendGate: process.env.SPEND_GATE_HASH ?? "ae3f3d876c905f3d691133e244dcaa842aff56b540696d843db43030e0e9d92e",
  ComplianceRegistry: process.env.COMPLIANCE_HASH ?? "f4a43bd6671e92a085b5598cad396e71279cf18a7271fac0f6d7ef5cb7b8e572",
};

async function rpc(method: string, params: unknown): Promise<any> {
  const r = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return r.json();
}

async function getStateSeed(pkgHash: string): Promise<string | null> {
  // Step 1: get the ContractPackage to find the active contract hash.
  const pkgResult = await rpc("query_global_state", {
    state_identifier: null,
    key: `hash-${pkgHash}`,
    path: [],
  });
  const pkg = pkgResult.result?.stored_value?.ContractPackage;
  if (!pkg) {
    console.log("  Not a ContractPackage:", JSON.stringify(pkgResult.error ?? pkgResult.result?.stored_value).slice(0, 80));
    return null;
  }
  // Take the latest version.
  const versions: { contract_hash: string }[] = pkg.versions ?? [];
  const latest = versions[versions.length - 1];
  if (!latest) { console.log("  No contract versions found."); return null; }
  // contract_hash is like "contract-<hex>" — strip prefix for hash-<hex> key.
  const contractHash = latest.contract_hash.replace(/^contract-/, "");
  console.log(`  Active contract hash: ${contractHash.slice(0, 12)}…`);

  // Step 2: get the Contract entity to find named_keys["state"].
  const ctResult = await rpc("query_global_state", {
    state_identifier: null,
    key: `hash-${contractHash}`,
    path: [],
  });
  const ct = ctResult.result?.stored_value?.Contract;
  if (!ct) {
    console.log("  Not a Contract:", JSON.stringify(ctResult.error ?? ctResult.result?.stored_value).slice(0, 80));
    return null;
  }
  const namedKeys: { name: string; key: string }[] = ct.named_keys ?? [];
  const stateKey = namedKeys.find((k) => k.name === "state");
  if (!stateKey) {
    console.log("  No 'state' named key found. Named keys:", namedKeys.map((k) => k.name).join(", "));
    return null;
  }
  // URef looks like "uref-<64hex>-007"; extract just the 64-hex part.
  const seed = stateKey.key.replace(/^uref-/, "").replace(/-007$/, "");
  return seed;
}

async function main() {
  console.log("Discovering Odra contract state dict seeds via Casper RPC...\n");
  console.log("Known (vault): VAULT_STATE_SEED=f92ae6151d9599cebe4ad86e02d39141a1179c9a9e2e3c447ee1b8da77c4f4bb");
  console.log("Known (rep):   REPUTATION_STATE_SEED=65a90d00ef950ce780370b0b2bb054f93c7b8431534b1fc30808222d7b1e5bb7\n");

  for (const [name, pkgHash] of Object.entries(PACKAGES)) {
    console.log(`=== ${name} (${pkgHash.slice(0, 8)}…) ===`);
    const seed = await getStateSeed(pkgHash);
    if (seed) {
      console.log(`  STATE_SEED: ${seed}`);
      console.log(`  → Set ${name.toUpperCase().replace(/([A-Z])/g, "_$1").replace(/^_/, "")}_STATE_SEED=${seed} in mcp/.env`);
    }
    console.log();
  }
}

main().catch(console.error);
