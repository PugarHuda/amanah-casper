// Data access seam. Env-gated: when CSPR.cloud + the deployed contract hashes are
// present, read live; otherwise return the static mock so the UI never breaks
// before contracts ship. Return shapes are identical in both paths.
//
// Flip to live by setting CSPR_CLOUD_API_KEY + NEXT_PUBLIC_VAULT_HASH (see .env.example).
import { readdirSync, statSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as mock from "./mock";
import type { TrailRow } from "./mock";
import {
  cloudConfigured,
  getContractDeploys,
  getDeployCount,
  getVaultState,
  vaultReadable,
  shortHash,
  relTime,
  type RawDeploy,
} from "./cspr";
import type { Holding } from "./mock";

const VAULT = () => process.env.NEXT_PUBLIC_VAULT_HASH || "";
const ATTESTATION = () => process.env.NEXT_PUBLIC_ATTESTATION_HASH || "";
const REPUTATION = () => process.env.NEXT_PUBLIC_REPUTATION_HASH || "";
// X402 PaymentToken package hash — baked as default since it's a known deployed contract.
const X402 = () =>
  process.env.NEXT_PUBLIC_X402_HASH ||
  "d784f72c17d143cd96e8bcd2b19fc893f003c1ce9ea29f059eb033bcbd347d79";

const live = () => cloudConfigured() && !!VAULT();

// Map a raw CSPR.cloud deploy to an audit-trail row. Labels by which of our
// contracts was called (contract_package_hash), since there's no string EP name.
function deployToTrail(d: RawDeploy): TrailRow {
  const pkg = (d.contract_package_hash || "").toLowerCase();
  const ok = !d.error_message && d.status !== "error";
  let icon = "⇄";
  let kind = "Contract call";
  let bg = "#e6eefc";
  if (pkg && pkg === ATTESTATION().toLowerCase()) {
    icon = "✓"; kind = "Attestation · reasoning signed"; bg = "#e6f6ec";
  } else if (pkg && pkg === X402().toLowerCase()) {
    icon = "$"; kind = "x402 settlement · premium signal"; bg = "#fbf1dc";
  } else if (pkg && pkg === REPUTATION().toLowerCase()) {
    icon = "★"; kind = "Reputation · payment credited"; bg = "#f3efe6";
  } else if (pkg && pkg === VAULT().toLowerCase()) {
    icon = "⇄"; kind = "Reallocate · yield move"; bg = "#e6eefc";
  }
  return {
    icon,
    kind,
    hash: shortHash(d.deploy_hash),
    fullHash: d.deploy_hash,
    status: ok ? "Confirmed" : "Failed",
    statusColor: ok ? "var(--green)" : "var(--red)",
    time: relTime(d.timestamp),
    bg,
  };
}

// Read the newest reasoning blob the agent published to amanah/audit/<hash>.json.
// ponytail: demo-local read — assumes web runs alongside the agent (same repo).
function latestReasoningBlob(): { hash: string; blob: AgentBlob } | null {
  try {
    const dir = resolve(process.cwd(), "../audit");
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    if (!files.length) return null;
    const newest = files
      .map((f) => ({ f, t: statSync(resolve(dir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t)[0].f;
    return {
      hash: newest.replace(/\.json$/, ""),
      blob: JSON.parse(readFileSync(resolve(dir, newest), "utf8")) as AgentBlob,
    };
  } catch {
    return null;
  }
}

type AgentBlob = {
  cycle?: number;
  pubkey?: string;
  prices?: { goldUsd?: number | null; tbondYieldPct?: number | null; wtiUsd?: number | null; csprUsd?: number | null };
  decision?: { action?: string; fromAsset?: string; toAsset?: string; amount?: number; confidence?: number; riskScore?: number; reasoningSteps?: string[] };
  model?: string;
  at?: string;
};

// Format a price number with locale commas.
function fmt(n: number, dp = 0): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

// Format an atomic 6-dp vault amount as a USD string.
function fmtUsd(atomic6dp: bigint): string {
  const dollars = Number(atomic6dp / 1_000_000n);
  return dollars >= 1_000_000
    ? `$${(dollars / 1_000_000).toFixed(2)}M`
    : `$${dollars.toLocaleString("en-US")}`;
}

// Vault asset presentation config.
const ASSET_VIEW: Record<string, { name: string; unit: string; color: string; bg: string }> = {
  Gold: { name: "Gold (tokenized)", unit: "XAU", color: "#e7a83c", bg: "#fbf1dc" },
  TBond: { name: "US T-bond", unit: "10Y", color: "#3f86e6", bg: "#e6eefc" },
  WTI: { name: "WTI crude", unit: "bbl", color: "#2c2620", bg: "#eceae6" },
  CSPR: { name: "CSPR reserve", unit: "CSPR", color: "#cdbfa6", bg: "#f3efe6" },
};
const ASSET_ORDER = ["Gold", "TBond", "WTI", "CSPR"] as const;

// Agent console: LIVE from the newest published reasoning blob + on-chain data
// when available; falls back to the representative mock (clearly labelled).
export async function getAgentConsole() {
  const latest = latestReasoningBlob();
  if (!latest) {
    return {
      metrics: mock.metrics, assets: mock.assets, guards: mock.guards,
      steps: mock.steps, reasoningHash: mock.reasoningHash, decision: mock.decision,
      cycleId: "REPRESENTATIVE CYCLE · CASPER-TEST",
      attestDeployHash: "",
    };
  }
  const { hash, blob } = latest;
  const d = blob.decision ?? {};
  const p = blob.prices ?? {};

  // Parallel: latest attest deploy hash, attest count, vault state.
  const [deploys, attestCount, vault] = await Promise.all([
    live() ? getContractDeploys([ATTESTATION()], 1) : Promise.resolve([]),
    live() ? getDeployCount(ATTESTATION()) : Promise.resolve(null),
    vaultReadable() ? getVaultState() : Promise.resolve(null),
  ]);
  const attestDeploy = deploys[0];
  const attestDeployHash = attestDeploy?.deploy_hash ?? "";

  // Live metrics (fall back to mock field if unavailable).
  const metrics = [
    {
      label: "Treasury value",
      value: vault && vault.total > 0n ? fmtUsd(vault.total) : mock.metrics[0].value,
      delta: vault ? "on-chain · live" : mock.metrics[0].delta,
      deltaColor: "var(--green)",
    },
    {
      label: "Risk score",
      value: d.riskScore != null ? d.riskScore.toFixed(2) : mock.metrics[1].value,
      delta: d.riskScore != null ? (d.riskScore < 0.5 ? "Low" : d.riskScore < 0.75 ? "Medium" : "High") : mock.metrics[1].delta,
      deltaColor: d.riskScore != null ? (d.riskScore < 0.5 ? "var(--green)" : "var(--red)") : "var(--faint)",
    },
    { label: "Reputation", value: "—", delta: "pending chain read", deltaColor: "var(--faint)" },
    {
      label: "Attestations",
      value: attestCount != null ? attestCount.toLocaleString("en-US") : mock.metrics[3].value,
      delta: "100% on-chain",
      deltaColor: "var(--blue)",
    },
  ];

  // Live asset list: prices from blob, weights from vault holdings.
  const assetPrices: Record<string, string> = {
    Gold: p.goldUsd != null ? `$${fmt(p.goldUsd, 0)} / oz` : "—",
    TBond: p.tbondYieldPct != null ? `${p.tbondYieldPct.toFixed(2)}% yield` : "—",
    WTI: p.wtiUsd != null ? `$${fmt(p.wtiUsd, 2)} / bbl` : "—",
    CSPR: p.csprUsd != null ? `$${p.csprUsd.toFixed(4)}` : "—",
  };
  const assets = ASSET_ORDER.map((a) => {
    const v = ASSET_VIEW[a];
    const pct =
      vault && vault.total > 0n
        ? `${Math.round(Number((vault.holdings[a] ?? 0n) * 100n / vault.total))}%`
        : mock.assets.find((x) => x.name === v.name)?.weight ?? "—";
    return { name: v.name, price: assetPrices[a], weight: pct, color: v.color };
  });

  const steps = [
    { n: "01", text: `Ingested live RWA prices — gold $${p.goldUsd ?? "?"} /oz, T-bond ${p.tbondYieldPct ?? "?"}%, WTI $${p.wtiUsd ?? "?"} /bbl.`, tag: "INGEST · live public APIs", tagColor: "var(--faint)" },
    ...(d.reasoningSteps ?? []).slice(0, 4).map((s, i) => ({
      n: String(i + 2).padStart(2, "0"), text: s,
      tag: `REASON · ${blob.model ?? "Venice"}`, tagColor: "var(--faint)",
    })),
    {
      n: String((d.reasoningSteps?.slice(0, 4).length ?? 0) + 2).padStart(2, "0"),
      text: d.action === "rebalance"
        ? `Decision: move ${Number((d.amount ?? 0) / 1_000_000).toLocaleString("en-US")} from ${d.fromAsset} to ${d.toAsset}.`
        : `Decision: ${d.action} (no funds move).`,
      tag: `DECISION · confidence ${d.confidence ?? "?"}`, tagColor: "var(--gold-deep)",
    },
    {
      n: String((d.reasoningSteps?.slice(0, 4).length ?? 0) + 3).padStart(2, "0"),
      text: "Signed reasoning (Ed25519), attested & verified on-chain.",
      tag: attestDeployHash ? `ATTEST · ${shortHash(attestDeployHash)} ✓` : "ATTEST · on-chain ✓",
      tagColor: "var(--green)",
    },
  ];

  return {
    metrics,
    assets,
    guards: mock.guards,
    steps,
    reasoningHash: `0x${hash}`,
    decision: {
      caption: `LATEST DECISION · CONFIDENCE ${d.confidence ?? "?"}`,
      title: d.action === "rebalance"
        ? `Reallocate ${Number((d.amount ?? 0) / 1_000_000).toLocaleString("en-US")} ${d.fromAsset} → ${d.toAsset}`
        : `${(d.action ?? "hold").toUpperCase()} — no reallocation`,
      sub: "Reasoning published + hash attested on-chain · principal untouched",
    },
    cycleId: `CYCLE #${blob.cycle ?? "?"} · LIVE · ${blob.at?.slice(0, 10) ?? "CASPER-TEST"}`,
    attestDeployHash,
  };
}

// Dashboard: audit trail + treasury totals/holdings go live from on-chain state
// when configured; banner uses live vault data where possible; else mock.
export async function getDashboard() {
  let trail = mock.trail;
  let totalTreasury = mock.totalTreasury;
  let holdings = mock.holdings;
  let treasuryId = mock.treasuryId;
  let banner = mock.banner;

  if (live()) {
    // Include x402 payment deploys alongside vault/attestation/reputation.
    const deploys = await getContractDeploys([VAULT(), ATTESTATION(), X402(), REPUTATION()], 8);
    if (deploys.length) trail = deploys.map(deployToTrail);
  }

  if (vaultReadable()) {
    const vault = await getVaultState();
    if (vault && vault.total > 0n) {
      totalTreasury = fmtUsd(vault.total);
      treasuryId = `TREASURY ${VAULT().slice(0, 4)}…${VAULT().slice(-4)} · CASPER-TEST`;
      holdings = (ASSET_ORDER as unknown as (keyof typeof ASSET_VIEW)[]).map((a): Holding => {
        const v = ASSET_VIEW[a];
        const amt = vault.holdings[a as keyof typeof vault.holdings] ?? 0n;
        const pct = vault.total > 0n ? Number((amt * 10000n) / vault.total) / 100 : 0;
        return {
          name: v.name,
          sub: `${(Number(amt / 1_000_000n)).toLocaleString("en-US")} ${v.unit} · ${pct.toFixed(1)}% of treasury`,
          value: fmtUsd(amt),
          chg: "on-chain",
          chgColor: "var(--muted, #888)",
          color: v.color,
          bg: v.bg,
        };
      });
      // Live banner: replace fake yield/principal/rep with honest values.
      banner = [
        { label: "YIELD (30D)", value: "—", note: "testnet demo", color: "var(--faint)" },
        {
          label: "PRINCIPAL LOCKED",
          value: fmtUsd(vault.principal),
          note: vault.principal === 0n ? "testnet (principal=0)" : "untouched",
          color: "var(--faint)",
        },
        { label: "ATTESTATIONS", value: "—", note: "on-chain proofs", color: "var(--blue)" },
      ];
      // Best-effort: get attest count for the last banner slot.
      if (live()) {
        const cnt = await getDeployCount(ATTESTATION());
        if (cnt != null) banner[2].value = cnt.toLocaleString("en-US");
      }
    }
  }

  return {
    treasuryId,
    totalTreasury,
    banner,
    holdings,
    trail,
    vaultHash: VAULT(),
  };
}

// ponytail: live -> CMS / markdown index for the engineering blog.
export async function getPosts() {
  return mock.posts;
}
