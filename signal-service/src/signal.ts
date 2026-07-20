// The premium "alpha" the agent pays for over x402.
//
// A REAL multi-asset signal computed from live public market data covering the treasury's
// actual holdings — not a single-asset toy. Every source is named in `sources`, and any
// leg that can't be fetched returns null rather than a made-up number, so the agent (and
// its independent auditor) can see exactly what the signal did and did not know.
//
//   CSPR      CoinGecko casper-network 24h series  (key-free)
//   Gold      CoinGecko pax-gold 24h series        (key-free, tokenized-gold proxy)
//   US T-bond US Treasury fiscaldata avg rates     (key-free)
//   WTI       US EIA RWTC spot                     (only when EIA_API_KEY is set)

export interface Leg {
  momentum24hPct: number | null;
  volatilityPct: number | null;
  samples: number;
  level: number | null;
}

export interface PremiumSignal {
  asof: string;
  cspr: Leg;
  gold: Leg;
  tbond: { yieldPct: number | null; changeBpVsPrior: number | null; asOf: string | null };
  wti: { usd: number | null; asOf: string | null };
  /** -1..1 composite tilt: positive => risk-on, negative => risk-off. */
  tilt: number;
  /** Which risk leg looks strongest on 24h momentum (null when nothing is readable). */
  strongest: "cspr" | "gold" | null;
  sources: string[];
  note: string;
}

const EMPTY: Leg = { momentum24hPct: null, volatilityPct: null, samples: 0, level: null };

async function getJson(url: string): Promise<any> {
  const r = await fetch(url, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/** 24h momentum + volatility for a CoinGecko id. */
async function coingeckoLeg(id: string, sources: string[]): Promise<Leg> {
  try {
    const data = await getJson(
      `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=1`,
    );
    const prices: number[] = (data.prices ?? []).map((p: [number, number]) => p[1]);
    if (prices.length < 2) throw new Error("not enough samples");
    const first = prices[0];
    const last = prices[prices.length - 1];
    const momentum24hPct = ((last - first) / first) * 100;
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    const variance = prices.reduce((a, b) => a + (b - mean) ** 2, 0) / prices.length;
    const volatilityPct = (Math.sqrt(variance) / mean) * 100;
    sources.push(`${id}: coingecko market_chart 24h (${prices.length} samples)`);
    return { momentum24hPct, volatilityPct, samples: prices.length, level: last };
  } catch (e) {
    sources.push(`${id}: unavailable (${(e as Error).message})`);
    return { ...EMPTY };
  }
}

/** Latest Treasury-Notes average rate plus the change vs the prior record, in bp. */
async function tbondLeg(sources: string[]): Promise<PremiumSignal["tbond"]> {
  try {
    const data = await getJson(
      "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/avg_interest_rates" +
        "?filter=security_desc:eq:Treasury%20Notes" +
        "&sort=-record_date&page[size]=2&fields=record_date,avg_interest_rate_amt",
    );
    const rows = data?.data ?? [];
    if (!rows.length) throw new Error("no rows");
    const latest = Number(rows[0].avg_interest_rate_amt);
    const prior = rows[1] ? Number(rows[1].avg_interest_rate_amt) : null;
    sources.push(`tbond: fiscaldata avg_interest_rates ${rows[0].record_date}`);
    return {
      yieldPct: latest,
      changeBpVsPrior: prior == null ? null : Math.round((latest - prior) * 100),
      asOf: rows[0].record_date ?? null,
    };
  } catch (e) {
    sources.push(`tbond: unavailable (${(e as Error).message})`);
    return { yieldPct: null, changeBpVsPrior: null, asOf: null };
  }
}

/** WTI spot — only when an EIA key is configured; never invented. */
async function wtiLeg(sources: string[]): Promise<PremiumSignal["wti"]> {
  const key = process.env.EIA_API_KEY;
  if (!key) {
    sources.push("wti: skipped (no EIA_API_KEY configured)");
    return { usd: null, asOf: null };
  }
  try {
    const data = await getJson(
      "https://api.eia.gov/v2/petroleum/pri/spt/data/" +
        `?api_key=${key}&frequency=daily&data[0]=value&facets[series][]=RWTC` +
        "&sort[0][column]=period&sort[0][direction]=desc&length=1",
    );
    const row = data?.response?.data?.[0];
    if (!row) throw new Error("no rows");
    sources.push(`wti: EIA RWTC ${row.period}`);
    return { usd: Number(row.value), asOf: row.period ?? null };
  } catch (e) {
    sources.push(`wti: unavailable (${(e as Error).message})`);
    return { usd: null, asOf: null };
  }
}

export async function buildSignal(): Promise<PremiumSignal> {
  const sources: string[] = [];
  const [cspr, gold, tbond, wti] = await Promise.all([
    coingeckoLeg("casper-network", sources),
    coingeckoLeg("pax-gold", sources),
    tbondLeg(sources),
    wtiLeg(sources),
  ]);

  // Composite tilt: reward risk-asset momentum, penalise its volatility, and lean
  // risk-off when yields are rising (rate rises pressure both risk assets and gold).
  const legTilt = (l: Leg) =>
    l.momentum24hPct == null ? 0 : l.momentum24hPct / 5 - (l.volatilityPct ?? 0) / 10;
  const yieldDrag = tbond.changeBpVsPrior == null ? 0 : -tbond.changeBpVsPrior / 50;
  const tilt = Math.max(-1, Math.min(1, legTilt(cspr) + legTilt(gold) * 0.5 + yieldDrag));

  const strongest =
    cspr.momentum24hPct == null && gold.momentum24hPct == null
      ? null
      : (cspr.momentum24hPct ?? -Infinity) >= (gold.momentum24hPct ?? -Infinity)
        ? "cspr"
        : "gold";

  const legsLive = [cspr.samples > 0, gold.samples > 0, tbond.yieldPct != null, wti.usd != null]
    .filter(Boolean).length;

  return {
    asof: new Date().toISOString(),
    cspr,
    gold,
    tbond,
    wti,
    tilt,
    strongest,
    sources,
    note: `multi-asset RWA signal · ${legsLive}/4 legs live · nulls are genuine gaps, never estimated`,
  };
}
