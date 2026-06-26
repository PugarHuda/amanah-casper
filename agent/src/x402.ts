// x402 client: GET a premium-signal endpoint, handle 402, sign the payment with
// the agent's Casper key, resubmit, and capture the on-chain settlement deploy
// hash. Built on @make-software/casper-x402 (exact scheme) + @x402/core.
import type { PrivateKey } from "casper-js-sdk";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import { ExactCasperScheme } from "@make-software/casper-x402/exact/client";
import {
  toClientCasperSigner,
  NETWORK_CASPER_TESTNET,
} from "@make-software/casper-x402";

export interface PaidResult {
  data: unknown;
  /** Settlement deploy hash from the facilitator, or null if the resource was
   *  free / settlement header was absent. Print this — it's verifiable on cspr.live. */
  deployHash: string | null;
}

function getHeader(res: Response): (name: string) => string | null {
  return (name: string) => res.headers.get(name);
}

/** Pay for and fetch an x402-gated resource. */
export async function payForSignal(
  url: string,
  agentKey: PrivateKey,
): Promise<PaidResult> {
  const signer = toClientCasperSigner(agentKey);
  const scheme = new ExactCasperScheme(signer);
  const core = new x402Client().register(NETWORK_CASPER_TESTNET, scheme);
  const http = new x402HTTPClient(core);

  const first = await fetch(url, { headers: { accept: "application/json" } });
  if (first.status !== 402) {
    return { data: await safeJson(first), deployHash: null };
  }

  // 402 -> decode PaymentRequired (PAYMENT-REQUIRED header in x402 v2).
  const paymentRequired = http.getPaymentRequiredResponse(
    getHeader(first),
    await safeJson(first),
  );

  // Build + sign the EIP-712 payment authorization, encode as PAYMENT-SIGNATURE.
  const payload = await http.createPaymentPayload(paymentRequired);
  const payHeaders = http.encodePaymentSignatureHeader(payload);

  // Replay the request with the signed payment.
  const paid = await fetch(url, {
    headers: { accept: "application/json", ...payHeaders },
  });

  // Capture the settlement (PAYMENT-RESPONSE header -> SettleResponse.transaction).
  let deployHash: string | null = null;
  try {
    const settle = http.getPaymentSettleResponse(getHeader(paid));
    deployHash = settle?.transaction ?? null;
  } catch {
    // ponytail: server may omit PAYMENT-RESPONSE; deploy hash then unavailable.
  }

  return { data: await safeJson(paid), deployHash };
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}
