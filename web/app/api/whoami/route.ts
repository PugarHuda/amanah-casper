import { NextResponse } from "next/server";
import { getKeyIdentity } from "@/lib/cspr";

// The state-dict seeds are server-only env, so the connected key is resolved here
// rather than in the browser. Read-only: it proves nothing to the chain, it only
// reports what the chain already says about this key.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const pk = new URL(req.url).searchParams.get("pk") ?? "";
  const id = await getKeyIdentity(pk);
  if (!id) return NextResponse.json({ error: "unreadable or malformed public key" }, { status: 400 });
  return NextResponse.json(id);
}
