// The premium "alpha" the agent pays for: a small momentum/volatility score
// derived from real public market data (CSPR price history via CoinGecko).
// ponytail: this is a deliberately simple computed signal; swap in your real
// model. It still makes a real network call so the demo isn't faked.

export interface PremiumSignal {
  asof: string;
  cspr: {
    momentum24hPct: number | null;
    volatilityPct: number | null;
    samples: number;
  };
  /** -1..1 composite tilt: positive => risk-on, negative => risk-off. */
  tilt: number;
  note: string;
}

export async function buildSignal(): Promise<PremiumSignal> {
  try {
    const url =
      "https://api.coingecko.com/api/v3/coins/casper-network/market_chart?vs_currency=usd&days=1";
    const r = await fetch(url, { headers: { accept: "application/json" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = (await r.json()) as { prices?: [number, number][] };
    const prices = (data.prices ?? []).map((p) => p[1]);
    if (prices.length < 2) throw new Error("not enough samples");

    const first = prices[0];
    const last = prices[prices.length - 1];
    const momentum24hPct = ((last - first) / first) * 100;

    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    const variance =
      prices.reduce((a, b) => a + (b - mean) ** 2, 0) / prices.length;
    const volatilityPct = (Math.sqrt(variance) / mean) * 100;

    // tilt: reward momentum, penalise volatility. Clamp to [-1, 1].
    const raw = momentum24hPct / 5 - volatilityPct / 10;
    const tilt = Math.max(-1, Math.min(1, raw));

    return {
      asof: new Date().toISOString(),
      cspr: { momentum24hPct, volatilityPct, samples: prices.length },
      tilt,
      note: "computed from CoinGecko casper-network 24h market_chart",
    };
  } catch (e) {
    return {
      asof: new Date().toISOString(),
      cspr: { momentum24hPct: null, volatilityPct: null, samples: 0 },
      tilt: 0,
      note: `signal source unavailable (${(e as Error).message})`,
    };
  }
}
