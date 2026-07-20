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
  payerAccountHashPrefixed?: string,
): Promise<string> {
  // `key` must be the registry AUTHORITY (the custodian): crediting is authority-only
  // so the agent can't mint its own reputation and walk past the vault's circuit
  // breaker. `payerAccountHashPrefixed` is who gets the credit (the agent), defaulting
  // to the signer for standalone/legacy use.
  const accountHashPrefixed =
    payerAccountHashPrefixed ?? key.publicKey.accountHash().toPrefixedString();
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

/** Slash the agent's reputation. Called by the CUSTODIAN (the registry authority)
 *  when the auditor VETOes a decision — "skin in the game": a bad move visibly costs
 *  the agent on-chain. `outcomeRef` links to the on-chain veto that justified it. */
export async function slashAgent(
  rpc: RpcClient,
  custodianKey: PrivateKey,
  agentAccountHashPrefixed: string,
  points: number,
  outcomeRefHex: string,
): Promise<string> {
  const args = Args.fromMap({
    addr: CLValue.newCLKey(Key.newKey(agentAccountHashPrefixed)),
    delta: CLValue.newCLInt64(-Math.abs(points)),
    _outcome_ref: CLValue.newCLByteArray(hexToBytes(outcomeRefHex)),
  });
  const { deployHash } = await callEntryPoint({
    rpc, key: custodianKey, contractHash: config.reputationRegistryHash,
    entryPoint: "adjust", args, chainName: config.chainName, paymentMotes: config.paymentMotes,
  });
  return deployHash;
}
