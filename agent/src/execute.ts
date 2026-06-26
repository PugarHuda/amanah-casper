// Execute the reallocation via RwaVault.reallocate (gated on-chain by SpendGate
// + ComplianceRegistry + the principal invariant), and escalate to a human when
// confidence is below threshold.
import { CLValue, Args } from "./sdk.js";
import type { PrivateKey, RpcClient, CLValue as CLValueT } from "casper-js-sdk";
import { config } from "./config.js";
import { callEntryPoint } from "./casper.js";
import { ASSET_INDEX, type Decision } from "./types.js";

function assetIdCl(asset: keyof typeof ASSET_INDEX): CLValueT {
  // ponytail: odra enum AssetId serializes as a single u8 variant index. If the
  // contract expects a different encoding, adjust here.
  return CLValue.newCLUint8(ASSET_INDEX[asset]);
}

function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
  return out;
}

export async function executeReallocation(
  rpc: RpcClient,
  key: PrivateKey,
  decision: Decision,
  attestationHashHex: string,
): Promise<string> {
  const args = Args.fromMap({
    from_asset: assetIdCl(decision.fromAsset),
    to_asset: assetIdCl(decision.toAsset),
    amount: CLValue.newCLUInt256(decision.amount),
    attestation_hash: CLValue.newCLByteArray(hexToBytes(attestationHashHex)),
  });

  const { deployHash } = await callEntryPoint({
    rpc,
    key,
    contractHash: config.rwaVaultHash,
    entryPoint: "reallocate",
    args,
    chainName: config.chainName,
    paymentMotes: config.paymentMotes,
  });
  return deployHash;
}

/** Confidence gate. Returns true if the agent should NOT execute autonomously. */
export function shouldEscalate(decision: Decision): boolean {
  return (
    decision.action === "escalate" ||
    decision.confidence < config.confidenceThreshold
  );
}

export async function escalateToHuman(
  decision: Decision,
  reasoningHashHex: string,
): Promise<void> {
  const msg =
    `[ESCALATION] confidence ${decision.confidence} < ${config.confidenceThreshold}. ` +
    `Proposed: ${decision.action} ${decision.amount} ${decision.fromAsset}->${decision.toAsset}. ` +
    `Reasoning hash 0x${reasoningHashHex}. Awaiting human approval.`;
  console.warn(msg);

  if (config.telegramToken && config.telegramChatId) {
    try {
      await fetch(
        `https://api.telegram.org/bot${config.telegramToken}/sendMessage`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ chat_id: config.telegramChatId, text: msg }),
        },
      );
    } catch (e) {
      console.warn("[escalate] telegram notify failed:", (e as Error).message);
    }
  }
}
