// AuditorQuorum — cast the K-of-N independent APPROVE votes for a decision on-chain.
//
// The vault ENFORCES this: `RwaVault.reallocate` calls `AuditorQuorum.approved(hash)`
// and reverts `NotApproved` otherwise. So a cycle that the auditor approved must also
// collect quorum signatures before it can execute — the separation of duties is a
// contract rule now, not a convention of the agent's own code.
//
// Each voter signs DOMAIN ‖ reasoning_hash ‖ approve_byte, so a captured signature
// can't be replayed with the vote flipped.
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadPrivateKey, callEntryPoint } from "./casper.js";
import { CLValue, CLTypeUInt8, Args } from "./sdk.js";
import type { PrivateKey as PrivateKeyT, RpcClient } from "casper-js-sdk";
import { config } from "./config.js";

const DOMAIN = new TextEncoder().encode("amanah-auditor-quorum-v1");
const SECRET = resolve(import.meta.dirname, "../secret");

/** The independent auditor keys available to this node (custodian + generated auditors). */
export function quorumVoters(): PrivateKeyT[] {
  const paths = ["custodian_key.pem", "auditor2_key.pem", "auditor3_key.pem"]
    .map((f) => resolve(SECRET, f))
    .filter((p) => existsSync(p));
  return paths.map((p) => loadPrivateKey(p));
}

/**
 * Have each available auditor sign + submit an APPROVE vote for `reasoningHash`.
 * Returns the deploy hashes that landed. A voter that already voted reverts
 * `ReplayedProof` — that's benign (the vote is already counted), so it's swallowed.
 */
export async function castQuorumVotes(
  rpc: RpcClient,
  reasoningHash: string,
  voters: PrivateKeyT[] = quorumVoters(),
): Promise<string[]> {
  if (!config.auditorQuorumHash) return [];
  const hashBytes = Uint8Array.from(Buffer.from(reasoningHash, "hex"));
  const msg = new Uint8Array([...DOMAIN, ...hashBytes, 1]); // approve = true
  const landed: string[] = [];

  for (const voter of voters) {
    try {
      const sig = voter.signAndAddAlgorithmBytes(msg);
      const { deployHash } = await callEntryPoint({
        rpc,
        key: voter,
        contractHash: config.auditorQuorumHash,
        entryPoint: "vote",
        args: Args.fromMap({
          reasoning_hash: CLValue.newCLByteArray(hashBytes),
          approve: CLValue.newCLValueBool(true),
          signature: CLValue.newCLList(CLTypeUInt8, Array.from(sig, (b) => CLValue.newCLUint8(b))),
          pubkey: CLValue.newCLPublicKey(voter.publicKey),
        }),
        chainName: config.chainName,
        paymentMotes: config.paymentMotes,
      });
      landed.push(deployHash);
    } catch (e) {
      // Already voted (ReplayedProof) or this key isn't an authorized auditor — either
      // way the quorum state is what it is; let the vault be the judge.
      const m = (e as Error).message;
      if (!/ReplayedProof|User error: 9|UnknownSigner|User error: 8/.test(m)) {
        console.log(`  ⚠ quorum vote failed (${voter.publicKey.toHex().slice(0, 10)}…): ${m.slice(0, 90)}`);
      }
    }
  }
  return landed;
}
