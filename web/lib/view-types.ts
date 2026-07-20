// View-model types for the dashboard and agent console.
//
// There is deliberately NO sample/mock data in this file. Every number the UI shows is
// read live from casper-test (or IPFS); when a read is unavailable the UI renders an
// honest empty state ("—", "no data yet") rather than a plausible-looking placeholder,
// so nothing on screen can ever be mistaken for real treasury state.
export type Metric = { label: string; value: string; delta: string; deltaColor: string };
export type Asset = { name: string; price: string; weight: string; color: string };
export type Step = { n: string; text: string; tag: string; tagColor: string };
export type BannerStat = { label: string; value: string; note: string; color: string };

export type Holding = {
  name: string; sub: string; value: string; chg: string; chgColor: string; color: string; bg: string;
};

export type TrailRow = {
  kind: string; hash: string; fullHash?: string; status: string; statusColor: string; time: string; icon: string; bg: string;
};
