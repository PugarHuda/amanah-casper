// Build the reasoning blob, blake2b-256 hash it, Ed25519-sign the hash with the
// agent key, and call AttestationLog.attest on Casper. Optionally pin the full
// blob to IPFS.
import { blake2b } from "blakejs";
import { CLValue, Args, type PrivateKey, type RpcClient } from "casper-js-sdk";
import { config } from "./config.js";
import { callEntryPoint } from "./casper.js";
import type { Decision, ReasoningBlob } from "./types.js";

export interface AttestResult {
  reasoningHash: string; // hex
  deployHash: string;
  ipfsCid: string | null;
}

export async function attest(
  rpc: RpcClient,
  key: PrivateKey,
  blob: ReasoningBlob,
): Promise<AttestResult> {
  const json = JSON.stringify(blob);
  const bytes = new TextEncoder().encode(json);
  const hash = blake2b(bytes, undefined, 32); // Uint8Array(32)

  // Sign the raw 32-byte hash WITH the algorithm tag byte — the on-chain
  // verify_signature expects [algo | 64-byte sig] and the registered agent key.
  const signature = key.signAndAddAlgorithmBytes(hash);

  const decisionStr = decisionLabel(blob.decision);

  const args = Args.fromMap({
    // ponytail: verify odra encodings — [u8;32] -> ByteArray(32),
    // odra Bytes -> CL ByteArray. Adjust to newCLList(U8) if the contract's
    // Bytes arg deserializes as List<U8>.
    reasoning_hash: CLValue.newCLByteArray(hash),
    decision: CLValue.newCLString(decisionStr),
    signature: CLValue.newCLByteArray(signature),
    pubkey: CLValue.newCLPublicKey(key.publicKey),
  });

  const { deployHash } = await callEntryPoint({
    rpc,
    key,
    contractHash: config.attestationLogHash,
    entryPoint: "attest",
    args,
    chainName: config.chainName,
    paymentMotes: config.paymentMotes,
  });

  const ipfsCid = await pinToIpfs(json);

  return { reasoningHash: bytesToHex(hash), deployHash, ipfsCid };
}

function decisionLabel(d: Decision): string {
  return d.action === "rebalance"
    ? `rebalance ${d.amount} ${d.fromAsset}->${d.toAsset} (conf ${d.confidence})`
    : `${d.action} (conf ${d.confidence})`;
}

async function pinToIpfs(_json: string): Promise<string | null> {
  if (!config.web3StorageToken) return null;
  // ponytail: wire web3.storage upload here (POST to https://api.web3.storage/upload
  // with Authorization: Bearer <token>) and return the CID. Stubbed: returns null
  // unless a token is set, then logs that the upload path is not yet implemented.
  console.warn("[attest] WEB3_STORAGE_TOKEN set but IPFS pin not implemented");
  return null;
}

function bytesToHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}
