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
  // current deployed package hashes (see .env.deployed) — v3 vault + owner-gated compliance
  RwaVault: process.env.RWA_VAULT_HASH ?? "8ff5d18815e66eb50b9dfdf287cc622a48b29c93c4c58b51ad79e2e020815c87",
  ReputationRegistry: process.env.REPUTATION_REGISTRY_HASH ?? "265ebc7dc27997529587517c8a6cc502fd187f163fefe4d3e0946ba10438669c",
  AttestationLog: process.env.ATTESTATION_LOG_HASH ?? "365913a7a26d3e50798c2c0ce31d0850b8b24b2e1a641f990e41f7ad219a6532",
  SpendGate: process.env.SPEND_GATE_HASH ?? "f19ed0e9b235e8422aef7d8fbbcaa9cbc34ef4864efd81bbeb7c82d2b77d0cf3",
  ComplianceRegistry: process.env.COMPLIANCE_HASH ?? "93bc5e1389517acfb57b659ec1427c2979d6d931f1c1d587537427d5595f9ea5",
  ZkKycVerifier: process.env.ZK_KYC_HASH ?? "e9394a31557d33a6f5f26e4d5d996f7cbd7e98138cef60cc5921eee2617dfd0f",
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
