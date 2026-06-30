// Mock data lifted from the design handoff. Realistic values used across screens.
// ponytail: single source for all screen data; swap each export in lib/data.ts
// for live CSPR.cloud / contract reads later.

export type Metric = { label: string; value: string; delta: string; deltaColor: string };
export type Asset = { name: string; price: string; weight: string; color: string };
export type Step = { n: string; text: string; tag: string; tagColor: string };
export type BannerStat = { label: string; value: string; note: string; color: string };
export type Holding = {
  name: string; sub: string; value: string; chg: string; chgColor: string; color: string; bg: string;
};
export type TrailRow = {
  icon: string; kind: string; hash: string; fullHash?: string; status: string; statusColor: string; time: string; bg: string;
};
export type Post = { date: string; title: string; excerpt: string; tag: string; tagColor: string };

export const metrics: Metric[] = [
  { label: "Treasury value", value: "$12.84M", delta: "+1.7% (24h)", deltaColor: "var(--green)" },
  { label: "Risk score", value: "0.34", delta: "Low · stable", deltaColor: "var(--faint)" },
  { label: "Reputation", value: "948", delta: "+12 this week", deltaColor: "var(--green)" },
  { label: "Attestations", value: "4,218", delta: "100% verified", deltaColor: "var(--blue)" },
];

export const assets: Asset[] = [
  { name: "Gold (tokenized)", price: "$2,381 / oz", weight: "42%", color: "#e7a83c" },
  { name: "US T-bond", price: "4.21% yield", weight: "33%", color: "#3f86e6" },
  { name: "WTI crude", price: "$78.40 / bbl", weight: "18%", color: "#2c2620" },
  { name: "CSPR reserve", price: "$0.0192", weight: "7%", color: "#cdbfa6" },
];

export const guards: string[] = [
  "Cap $500K / tx",
  "Daily limit $2M",
  "Allowlist · 3 targets",
  "Principal locked",
  "Compliance: Valid",
];

export const steps: Step[] = [
  { n: "01", text: "Pulled live RWA prices — Treasury yield curve steepened 6bps.", tag: "INGEST · fiscaldata.treasury.gov", tagColor: "var(--faint)" },
  { n: "02", text: "Paid for premium oil-volatility signal via x402.", tag: "SETTLE · deploy 0x91c4… · CEP-18", tagColor: "var(--blue)" },
  { n: "03", text: "Gold momentum cooling; T-bond real yield now attractive.", tag: "REASON · Venice · deepseek-v4-flash", tagColor: "var(--faint)" },
  { n: "04", text: "Decision: shift 4.2% of yield from gold into T-bond.", tag: "DECISION · confidence 0.91", tagColor: "var(--gold-deep)" },
  { n: "05", text: "Signed reasoning (Ed25519), attested & verified on-chain.", tag: "ATTEST · deploy 0x7af3… ✓", tagColor: "var(--green)" },
  { n: "06", text: "Passed SpendGate + ComplianceRegistry checks.", tag: "GUARDRAIL · all green", tagColor: "var(--green)" },
  { n: "07", text: "Executed reallocation in RwaVault.", tag: "EXECUTE · deploy 0x2db8… ✓", tagColor: "var(--green)" },
];

export const reasoningHash = "0x7af3·9c21·be08·4d6f·a1e2·77bc·0539·ee14";

export const decision = {
  caption: "LATEST DECISION · CONFIDENCE 0.91",
  title: "Reallocate 4.2% yield → US T-bond",
  sub: "Executed autonomously · attestation verified on-chain · principal untouched",
};

export const banner: BannerStat[] = [
  { label: "YIELD (30D)", value: "+$184K", note: "+1.45%", color: "var(--green)" },
  { label: "PRINCIPAL LOCKED", value: "$11.9M", note: "untouched", color: "var(--faint)" },
  { label: "REPUTATION", value: "948", note: "+12 this week", color: "var(--green)" },
];

export const totalTreasury = "$12,840,219";
export const treasuryId = "TREASURY 0x4f9a…c2e1 · CASPER-TEST";

export const holdings: Holding[] = [
  { name: "Gold (tokenized)", sub: "5,392 oz · $2,381/oz", value: "$5.39M", chg: "+0.8%", chgColor: "var(--green)", color: "#e7a83c", bg: "#fbf1dc" },
  { name: "US T-bond", sub: "4.21% yield · 10Y", value: "$4.24M", chg: "+1.9%", chgColor: "var(--green)", color: "#3f86e6", bg: "#e6eefc" },
  { name: "WTI crude", sub: "29,500 bbl · $78.40", value: "$2.31M", chg: "-0.6%", chgColor: "var(--red)", color: "#2c2620", bg: "#eceae6" },
  { name: "CSPR reserve", sub: "46.9M CSPR · $0.0192", value: "$0.90M", chg: "+2.4%", chgColor: "var(--green)", color: "#cdbfa6", bg: "#f3efe6" },
];

export const trail: TrailRow[] = [
  { icon: "⇄", kind: "Reallocate · yield → T-bond", hash: "0x2db8·77a1·…·e4c0", status: "Confirmed", statusColor: "var(--green)", time: "2m ago", bg: "#e6eefc" },
  { icon: "✓", kind: "Attestation · reasoning signed", hash: "0x7af3·9c21·…·ee14", status: "Verified", statusColor: "var(--green)", time: "2m ago", bg: "#e6f6ec" },
  { icon: "$", kind: "x402 settlement · premium signal", hash: "0x91c4·05fb·…·2a8d", status: "Settled", statusColor: "var(--blue)", time: "3m ago", bg: "#fbf1dc" },
  { icon: "⇄", kind: "Reallocate · oil → gold", hash: "0x18ec·b430·…·9f71", status: "Confirmed", statusColor: "var(--green)", time: "1h ago", bg: "#e6eefc" },
  { icon: "✓", kind: "Attestation · reasoning signed", hash: "0x44a0·d2e8·…·b6c3", status: "Verified", statusColor: "var(--green)", time: "1h ago", bg: "#e6f6ec" },
  { icon: "!", kind: "Escalated · confidence 0.62", hash: "human review · resolved", status: "Approved", statusColor: "var(--gold-deep)", time: "4h ago", bg: "#faf0d8" },
];

export const posts: Post[] = [
  { date: "Jun 2026", title: "Principal-locked: why the agent can only ever touch yield", excerpt: "A vault invariant that makes catastrophic loss structurally impossible.", tag: "ARCHITECTURE", tagColor: "var(--gold-deep)" },
  { date: "Jun 2026", title: "Agent-pays-agent: real x402 settlement on Casper testnet", excerpt: "Buying a premium signal and getting a deploy hash as the receipt.", tag: "PAYMENTS", tagColor: "var(--blue)" },
  { date: "May 2026", title: "ERC-3643, on Casper: compliance without doxxing on-chain", excerpt: "Status registries and identity hashes that freeze bad actors fast.", tag: "COMPLIANCE", tagColor: "var(--green)" },
  { date: "May 2026", title: "Reputation as a public good other protocols can read", excerpt: "Scoring an agent from payment proofs and decision outcomes.", tag: "INTEROP", tagColor: "var(--faint)" },
];
