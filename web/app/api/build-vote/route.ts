import { NextResponse } from "next/server";
import { ContractCallBuilder, Args, CLValue, CLTypeByteArray, PublicKey } from "@/lib/casper-sdk";

// Build the UNSIGNED transaction for an auditor's on-chain action against the interactive
// AuditorQuorum (v4), and hand it to the browser to sign with the connected wallet. We
// build it here (Node) rather than in the client so casper-js-sdk never enters the browser
// bundle — the client only calls window.csprclick.send(tx, publicKey). No key is touched
// here: `from(publicKey)` just names the account that will sign; the wallet does the rest.
export const dynamic = "force-dynamic";

const QUORUM_V4_PKG = process.env.QUORUM_V4_HASH || "6e9ba8517d6541b2556698f4450d555d3ce02a53402b247f48291144471f241c";
// The decision a connecting auditor is asked to vote on (matches deploy-quorum-v4.ts).
const PENDING_HASH = process.env.QUORUM_V4_PENDING_HASH || "7c409e7bfce729cea460c03d3557277ad14e12da2b5d1a82c35860b60fba2df4";
const CHAIN = "casper-test";

export async function POST(req: Request) {
  let body: { action?: string; pk?: string; approve?: boolean; hash?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const { action, pk } = body;
  if (!pk || !/^0[12][0-9a-f]{64,128}$/i.test(pk)) {
    return NextResponse.json({ error: "malformed public key" }, { status: 400 });
  }
  if (action !== "register" && action !== "vote") {
    return NextResponse.json({ error: "action must be 'register' or 'vote'" }, { status: 400 });
  }
  // A vote can target any decision hash (the human-approval inbox votes on escalated
  // decisions); defaults to the seeded demo decision. Must be a 32-byte hex hash.
  const hash = (body.hash && /^[0-9a-f]{64}$/i.test(body.hash) ? body.hash : PENDING_HASH).toLowerCase();

  try {
    const from = PublicKey.fromHex(pk);
    const b = new ContractCallBuilder().byPackageHash(QUORUM_V4_PKG).from(from).chainName(CHAIN);

    if (action === "register") {
      b.entryPoint("open_register").runtimeArgs(Args.fromMap({})).payment(2_500_000_000);
    } else {
      const hashBytes = Uint8Array.from(Buffer.from(hash, "hex"));
      b.entryPoint("vote_as_caller")
        .runtimeArgs(
          Args.fromMap({
            reasoning_hash: CLValue.newCLByteArray(hashBytes),
            approve: CLValue.newCLValueBool(body.approve !== false), // default APPROVE
          }),
        )
        .payment(3_000_000_000);
    }

    // buildFor1_5 = the legacy deploy format current testnet nodes accept; CSPR.click
    // signs and submits it. toJSON() is the exact shape send() expects.
    const tx = b.buildFor1_5();
    return NextResponse.json({ transaction: tx.toJSON(), pendingHash: hash });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
