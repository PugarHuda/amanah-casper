// One-off: deposit a few asset allocations into the live RwaVault so the
// dashboard has real on-chain treasury data to read. deposit() is open (the
// hackathon funding path). Amounts are atomic vault units (6 dp).
// Run: npx tsx src/seed-vault.ts
import { loadPrivateKey, makeRpcClient, callEntryPoint, Args } from "./casper.js";
import { CLValue } from "./sdk.js";
import { config } from "./config.js";
import { ASSET_INDEX, type AssetId } from "./types.js";

const key = loadPrivateKey(config.agentKeyPath);
const rpc = makeRpcClient(config.rpcUrl);

// Allocation per asset (6 dp): a plausible diversified RWA treasury.
const SEED: Record<AssetId, number> = {
  Gold: 250_000_000_000, // 250,000
  TBond: 400_000_000_000, // 400,000
  WTI: 150_000_000_000, // 150,000
  CSPR: 200_000_000_000, // 200,000
};

for (const [asset, amount] of Object.entries(SEED) as [AssetId, number][]) {
  const args = Args.fromMap({
    asset: CLValue.newCLUint8(ASSET_INDEX[asset]),
    amount: CLValue.newCLUInt256(amount),
  });
  const { deployHash } = await callEntryPoint({
    rpc,
    key,
    contractHash: config.rwaVaultHash,
    entryPoint: "deposit",
    args,
    chainName: config.chainName,
    paymentMotes: config.paymentMotes,
  });
  console.log(`deposited ${amount} ${asset} -> ${deployHash}`);
}
console.log("done seeding vault");
