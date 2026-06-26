// Record the x402 settlement on-chain: ReputationRegistry.record_payment(payer,
// deploy_hash). Each deploy hash is single-use (anti-replay), so this both
// scores the agent and proves the payment happened.
import { CLValue, Key, Args } from "./sdk.js";
import type { PrivateKey, RpcClient } from "casper-js-sdk";
import { config } from "./config.js";
import { callEntryPoint } from "./casper.js";

function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
  return out;
}

export async function recordPayment(
  rpc: RpcClient,
  key: PrivateKey,
  x402DeployHash: string,
): Promise<string> {
  // payer = the agent's own account (Address = Key::Account).
  const accountHashPrefixed = key.publicKey.accountHash().toPrefixedString();
  const payer = CLValue.newCLKey(Key.newKey(accountHashPrefixed));

  const args = Args.fromMap({
    payer,
    deploy_hash: CLValue.newCLByteArray(hexToBytes(x402DeployHash)),
  });

  const { deployHash } = await callEntryPoint({
    rpc,
    key,
    contractHash: config.reputationRegistryHash,
    entryPoint: "record_payment",
    args,
    chainName: config.chainName,
    paymentMotes: config.paymentMotes,
  });
  return deployHash;
}
