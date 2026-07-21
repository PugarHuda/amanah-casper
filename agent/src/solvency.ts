// Per-cycle zero-knowledge proof of SOLVENCY.
//
// Publishing one proof once is exactly the weakness critics level at exchange-style
// proof-of-reserves: a point-in-time snapshot says nothing about the periods either side
// of it, and the AICPA's Part II criteria (Jan 2026) are explicitly about controls that
// operate OVER A PERIOD. So the agent proves solvency every cycle, from the vault's real
// allocations, and the proof is verified on-chain each time.
//
// It proves BOTH halves without revealing the split:
//   assets      — the hidden per-asset allocations sum to a public total
//   liabilities — that total is at least the locked principal
//
// The freshest proof is written to web/public/proofs/reserves.json so /verify always shows
// a current one rather than a stale artifact.
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { callEntryPoint } from "./casper.js";
import { CLValue, CLTypeByteArray, Args } from "./sdk.js";
import { proveReserves, verifyReserves, deriveH, hexToBytes, bytesToHex } from "./zk-reserves.js";
import { config } from "./config.js";
import { ed25519 } from "@noble/curves/ed25519";
import type { PrivateKey, RpcClient } from "casper-js-sdk";

const OUT = resolve(import.meta.dirname, "../../web/public/proofs/reserves.json");
const LABELS = ["Gold", "US T-bond", "WTI crude", "CSPR reserve"];

export interface SolvencyResult {
  deployHash: string;
  total: bigint;
  principal: bigint;
}

/**
 * Prove solvency for the CURRENT vault state and verify it on-chain.
 * `allocations` and `principal` must come from the live vault, not from a constant —
 * a proof of numbers we made up would be worthless.
 */
export async function proveSolvency(
  rpc: RpcClient,
  key: PrivateKey,
  allocations: bigint[],
  principal: bigint,
): Promise<SolvencyResult | null> {
  if (!config.zkReservesHash) return null;
  const total = allocations.reduce((a, b) => a + b, 0n);
  if (total < principal) {
    // Refuse to publish a proof we know asserts insolvency — the contract would revert
    // anyway, and emitting it would be misleading.
    console.warn(`  ⚠ solvency: total ${total} < principal ${principal} — not publishing`);
    return null;
  }

  // Fresh random blindings each cycle: the per-asset amounts stay hidden, and successive
  // proofs cannot be correlated by reusing commitments.
  const blindings = allocations.map(() =>
    BigInt("0x" + Buffer.from(ed25519.utils.randomPrivateKey()).toString("hex")),
  );
  const proof = proveReserves(allocations, blindings);
  if (!verifyReserves(proof)) throw new Error("locally generated solvency proof failed to verify");

  const byteArray32 = new CLTypeByteArray(32);
  const { deployHash } = await callEntryPoint({
    rpc, key, contractHash: config.zkReservesHash, entryPoint: "prove_reserves",
    args: Args.fromMap({
      commitments: CLValue.newCLList(byteArray32, proof.commitments.map((c) => CLValue.newCLByteArray(hexToBytes(c)))),
      total: CLValue.newCLUint64(Number(proof.total)),
      proof_t: CLValue.newCLByteArray(hexToBytes(proof.proofT)),
      s: CLValue.newCLByteArray(hexToBytes(proof.s)),
      principal_floor: CLValue.newCLUint64(Number(principal)),
    }),
    chainName: config.chainName, paymentMotes: 60_000_000_000,
  });

  // Publish the exact bytes the contract just accepted, so /verify re-checks the same proof.
  try {
    mkdirSync(resolve(OUT, ".."), { recursive: true });
    writeFileSync(OUT, JSON.stringify({
      note: "Verified ON-CHAIN by ZkReserves (curve25519-dalek) in the deploy below. The /verify page re-runs the same Pedersen+Schnorr check in your browser. Regenerated every cycle — solvency is proven over a period, not as a one-off snapshot.",
      domain: "amanah-zk-reserves-v1",
      H: bytesToHex(deriveH().toRawBytes()),
      labels: LABELS,
      commitments: proof.commitments,
      total: proof.total,
      principalFloor: principal.toString(),
      proofT: proof.proofT,
      s: proof.s,
      contractPackage: config.zkReservesHash,
      deployHash,
      chain: "casper-test",
      provenAt: new Date().toISOString(),
    }, null, 2) + "\n");
  } catch (e) {
    // Publishing is a convenience for the web app; the on-chain proof already stands.
    console.warn("  ⚠ could not write reserves.json:", (e as Error).message);
  }

  return { deployHash, total, principal };
}
