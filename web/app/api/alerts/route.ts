import { NextResponse } from "next/server";
import { getExceptions, getReservesSolvent, getVaultFrozen } from "@/lib/cspr";
import { VAULT, ATTESTATION, AUDITOR, ZK, X402, REPUTATION } from "@/lib/data";

// User alerting — the material events a treasury owner should be told about, derived
// from the chain: every control that FIRED (a refused transaction), plus vault-frozen
// and reserves-insolvent. The web's AlertBell polls this and raises a browser
// notification on anything new, so a watching user is alerted without any server infra
// or push service. Each event carries its on-chain deploy so it's verifiable, not a toast.
export const dynamic = "force-dynamic";

export type Alert = {
  id: string; at: string | null; severity: "high" | "info";
  title: string; detail: string; deploy: string | null;
};

export async function GET() {
  const packages = [VAULT(), ATTESTATION(), AUDITOR(), ZK(), X402(), REPUTATION()].filter(Boolean);
  const [exceptions, solvent, frozen] = await Promise.all([
    getExceptions(packages, 40).catch(() => []),
    getReservesSolvent().catch(() => null),
    getVaultFrozen().catch(() => null),
  ]);

  const alerts: Alert[] = exceptions.map((e) => ({
    id: e.deployHash || `${e.name}-${e.timestamp}`,
    at: e.timestamp,
    severity: e.kind === "policy" ? "high" : "info",
    title: e.kind === "policy" ? `Control fired — ${e.name}` : `Platform fault — ${e.name}`,
    detail: e.control,
    deploy: e.deployHash || null,
  }));

  // Standing conditions (no deploy hash) — surfaced so an owner sees them even between refusals.
  if (solvent === false) alerts.unshift({ id: "insolvent", at: null, severity: "high", title: "Reserves NOT proven solvent", detail: "Latest ZK proof-of-reserves did not verify total ≥ principal.", deploy: null });
  if (frozen === true) alerts.unshift({ id: "frozen", at: null, severity: "high", title: "Vault FROZEN (kill switch active)", detail: "The vault is paused — no reallocation can execute.", deploy: null });

  return NextResponse.json({ count: alerts.length, alerts: alerts.slice(0, 25) }, { headers: { "cache-control": "no-store" } });
}
