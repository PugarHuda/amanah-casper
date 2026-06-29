// Build the reasoning blob, blake2b-256 hash it, Ed25519-sign the hash with the
// agent key, and call AttestationLog.attest on Casper. Optionally pin the full
// blob to IPFS.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { blake2b } from "blakejs";
import { CLValue, CLTypeUInt8, Args } from "./sdk.js";
import type { PrivateKey, RpcClient } from "casper-js-sdk";
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
  const hashHex = bytesToHex(hash);

  // Publish the reasoning so the on-chain hash is verifiable end-to-end (not a
  // diary): write the exact blob to amanah/audit/<hash>.json. The MCP server reads
  // it back, recomputes blake2b, and confirms it matches what was attested.
  persistBlob(hashHex, json);

  // Sign the raw 32-byte hash WITH the algorithm tag byte — the on-chain
  // verify_signature expects [algo | 64-byte sig] and the registered agent key.
  const signature = key.signAndAddAlgorithmBytes(hash);

  const decisionStr = decisionLabel(blob.decision);

  const args = Args.fromMap({
    // [u8;32] -> fixed ByteArray(32), no length prefix.
    reasoning_hash: CLValue.newCLByteArray(hash),
    decision: CLValue.newCLString(decisionStr),
    // odra `Bytes` == Vec<u8>: CLType List(U8), length-prefixed. Sending a fixed
    // ByteArray here makes the contract read the first 4 bytes as a length and
    // overrun -> EarlyEndOfStream (verified live, user error 64647).
    signature: CLValue.newCLList(
      CLTypeUInt8,
      Array.from(signature, (b) => CLValue.newCLUint8(b)),
    ),
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

  return { reasoningHash: hashHex, deployHash, ipfsCid };
}

function persistBlob(hashHex: string, json: string): void {
  try {
    const dir = resolve(import.meta.dirname, "../../audit");
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, `${hashHex}.json`), json);
  } catch (e) {
    console.warn("[attest] could not persist reasoning blob:", (e as Error).message);
  }
}

function decisionLabel(d: Decision): string {
  return d.action === "rebalance"
    ? `rebalance ${d.amount} ${d.fromAsset}->${d.toAsset} (conf ${d.confidence})`
    : `${d.action} (conf ${d.confidence})`;
}

// Pin the reasoning blob to public IPFS via Pinata (pinJSONToIPFS, bearer JWT) so
// anyone — not just someone with the repo — can fetch the exact blob whose hash
// was attested. Skipped (returns null) unless PINATA_JWT is set; the local
// audit/<hash>.json copy is always written regardless.
async function pinToIpfs(json: string): Promise<string | null> {
  if (!config.pinataJwt) return null;
  try {
    const res = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${config.pinataJwt}` },
      body: JSON.stringify({ pinataContent: JSON.parse(json) }),
    });
    if (!res.ok) {
      console.warn(`[attest] IPFS pin failed: ${res.status} ${(await res.text().catch(() => "")).slice(0, 120)}`);
      return null;
    }
    const d = (await res.json()) as { IpfsHash?: string };
    return d.IpfsHash ?? null;
  } catch (e) {
    console.warn("[attest] IPFS pin error:", (e as Error).message);
    return null;
  }
}

function bytesToHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}
