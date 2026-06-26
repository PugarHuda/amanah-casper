// Shared Casper helper: load key, RPC client, build+sign+submit a contract call,
// wait for execution. casper-js-sdk v5 (new HttpHandler/RpcClient/Args/builders).
import { readFileSync } from "node:fs";
import {
  HttpHandler,
  RpcClient,
  PrivateKey,
  KeyAlgorithm,
  ContractCallBuilder,
  Args,
} from "casper-js-sdk";

export function loadPrivateKey(pemPath: string): PrivateKey {
  // ponytail: assumes Ed25519. Use KeyAlgorithm.SECP256K1 if your key is secp256k1.
  return PrivateKey.fromPem(readFileSync(pemPath, "utf8"), KeyAlgorithm.ED25519);
}

export function makeRpcClient(rpcUrl: string): RpcClient {
  return new RpcClient(new HttpHandler(rpcUrl, "fetch"));
}

export interface CallResult {
  deployHash: string;
}

/** Build, sign and submit a stored-contract call; resolve once the network has
 *  the transaction. Returns the deploy/transaction hash (verifiable on cspr.live). */
export async function callEntryPoint(opts: {
  rpc: RpcClient;
  key: PrivateKey;
  contractHash: string; // 64-char hex, no prefix
  entryPoint: string;
  args: Args;
  chainName: string;
  paymentMotes: number;
}): Promise<CallResult> {
  // buildFor1_5() emits the legacy deploy format that current testnet nodes
  // accept via putTransaction. ponytail: switch to .build() once nodes take V1.
  const tx = new ContractCallBuilder()
    .byHash(opts.contractHash)
    .entryPoint(opts.entryPoint)
    .runtimeArgs(opts.args)
    .from(opts.key.publicKey)
    .chainName(opts.chainName)
    .payment(opts.paymentMotes)
    .buildFor1_5();

  tx.sign(opts.key);
  const res = await opts.rpc.putTransaction(tx);
  const deployHash = res.transactionHash.toHex();
  await waitForExecution(opts.rpc, deployHash);
  return { deployHash };
}

/** Poll until the node returns the transaction. ponytail: this confirms the tx
 *  is on-chain; inspect the execution_result for revert errors if you need to
 *  distinguish success from a contract revert (SpendGate/Compliance rejection). */
async function waitForExecution(
  rpc: RpcClient,
  hash: string,
  timeoutMs = 120_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await rpc.getTransactionByTransactionHash(hash);
      return;
    } catch {
      // not yet finalized
    }
    await new Promise((r) => setTimeout(r, 3_000));
  }
  throw new Error(`Timed out waiting for ${hash} (${timeoutMs}ms)`);
}

export { Args };
