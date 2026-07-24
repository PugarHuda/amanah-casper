import { NextResponse } from "next/server";
import { describeRevert } from "@/lib/cspr";

// NEW: verify ANY deploy hash. Paste one, and this confirms whether it touched an Amanah
// contract and what it did — executed, or refused by which control. So a reviewer doesn't
// take OUR list of proof hashes on faith: they can check any hash, ours or not, against the
// chain. This is "don't trust us, verify" taken to its limit.
export const dynamic = "force-dynamic";

// Our deployed contract packages, labelled. If a deploy's package matches one of these, it's
// Amanah's; otherwise it isn't (and we say so plainly, rather than pretending).
const KNOWN: Record<string, string> = {
  [process.env.NEXT_PUBLIC_VAULT_HASH || ""]: "RwaVault (Treasury A)",
  d435e47c4c7ce00d6e9bf6801d20a4c2ed264d482b5645521455511ee0e5d4de: "RwaVault (Treasury B)",
  [process.env.NEXT_PUBLIC_ATTESTATION_HASH || ""]: "AttestationLog (proof-of-reasoning)",
  "2663d7ce209f999670be56dc2732512cd500f1cd4423f1623383fff68ff3dfeb": "AuditorQuorum (vault-enforced)",
  [process.env.QUORUM_V4_HASH || "100d2433789f46243253615e6fe909412b7794c2d8cd47e4677adaabc98d9f72"]: "AuditorQuorum (interactive)",
  "5f57375f6187920b15f833d702121f591c9e4559fbd674a6704dd22c09b8f520": "ZkReserves",
  e9394a31557d33a6f5f26e4d5d996f7cbd7e98138cef60cc5921eee2617dfd0f: "ZkKycVerifier",
  [process.env.NEXT_PUBLIC_REPUTATION_HASH || ""]: "ReputationRegistry",
  f19ed0e9b235e8422aef7d8fbbcaa9cbc34ef4864efd81bbeb7c82d2b77d0cf3: "SpendGate",
  "93bc5e1389517acfb57b659ec1427c2979d6d931f1c1d587537427d5595f9ea5": "ComplianceRegistry",
  "3ec02e03cccf3ea0c5fac410ab49d7bd0fc03d06e364b5af4a46dda5af783af4": "PolicyEngine v2",
  "81c091bbe8d781ba3ebdd527373e4f0417eb3376ab66a05955b6f59455150abc": "GovernanceTimelock",
  "8ff5d18815e66eb50b9dfdf287cc622a48b29c93c4c58b51ad79e2e020815c87": "RwaVault (quorum-enforced, prior version)",
};

const BASE = (process.env.CSPR_CLOUD_BASE || "https://api.testnet.cspr.cloud").trim();
const KEY = (process.env.CSPR_CLOUD_API_KEY || "").trim();

export async function GET(req: Request) {
  const hash = (new URL(req.url).searchParams.get("hash") ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hash)) return NextResponse.json({ error: "paste a 64-hex deploy hash" }, { status: 400 });
  if (!KEY) return NextResponse.json({ error: "indexer not configured" }, { status: 503 });

  try {
    const r = await fetch(`${BASE}/deploys/${hash}`, { headers: { accept: "application/json", authorization: KEY }, next: { revalidate: 30 } });
    if (r.status === 404) return NextResponse.json({ found: false, hash });
    if (!r.ok) return NextResponse.json({ error: `indexer ${r.status}` }, { status: 502 });
    const json = (await r.json()) as { data?: { timestamp?: string; error_message?: string | null; contract_package_hash?: string } };
    const d = json.data ?? {};
    const pkg = (d.contract_package_hash || "").toLowerCase();
    const contract = KNOWN[pkg];
    const desc = describeRevert(d.error_message ?? null);
    return NextResponse.json({
      found: true,
      hash,
      isAmanah: !!contract,
      contract: contract ?? null,
      package: pkg || null,
      at: d.timestamp ?? null,
      outcome: d.error_message ? "refused" : "executed",
      // If refused, name the control (or platform fault) — a refusal is a control working.
      control: desc ? { name: desc.name, control: desc.control, kind: desc.kind } : null,
      explorer: `https://testnet.cspr.live/deploy/${hash}`,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
