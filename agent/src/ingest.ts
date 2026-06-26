// Fetch REAL RWA prices. Each source is independent; a failure (or a missing
// API key) degrades that one field to null with a clear note — we never
// fabricate a price.
import { config } from "./config.js";
import type { PriceSnapshot } from "./types.js";

async function getJson(url: string): Promise<any> {
  const r = await fetch(url, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return r.json();
}

// US Treasury — no key. fiscaldata.treasury.gov.
// ponytail: this hits the Average Interest Rates dataset (real, key-free) and
// returns the latest Treasury-Notes rate as a yield proxy. Swap to the Daily
// Treasury Par Yield Curve dataset for the exact 10Y par yield.
async function treasuryYield(notes: string[]): Promise<number | null> {
  try {
    const url =
      "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/avg_interest_rates" +
      "?filter=security_desc:eq:Treasury%20Notes" +
      "&sort=-record_date&page[size]=1&fields=record_date,avg_interest_rate_amt";
    const data = await getJson(url);
    const row = data?.data?.[0];
    if (!row) throw new Error("no rows");
    notes.push(`treasury: avg_interest_rates ${row.record_date}`);
    return Number(row.avg_interest_rate_amt);
  } catch (e) {
    notes.push(`treasury: FAILED (${(e as Error).message})`);
    return null;
  }
}

// WTI crude — EIA, needs EIA_API_KEY.
async function wtiSpot(notes: string[]): Promise<number | null> {
  if (!config.eiaKey) {
    notes.push("wti: needs EIA_API_KEY (set it to fetch real WTI spot)");
    return null;
  }
  try {
    const url =
      "https://api.eia.gov/v2/petroleum/pri/spt/data/" +
      `?api_key=${config.eiaKey}` +
      "&frequency=daily&data[0]=value&facets[series][]=RWTC" +
      "&sort[0][column]=period&sort[0][direction]=desc&length=1";
    const data = await getJson(url);
    const row = data?.response?.data?.[0];
    if (!row) throw new Error("no rows");
    notes.push(`wti: EIA RWTC ${row.period}`);
    return Number(row.value);
  } catch (e) {
    notes.push(`wti: FAILED (${(e as Error).message})`);
    return null;
  }
}

// Gold — metalpriceapi.com (or metals.dev), needs METALS_API_KEY.
async function goldSpot(notes: string[]): Promise<number | null> {
  if (!config.metalsKey) {
    notes.push("gold: needs METALS_API_KEY (metalpriceapi/metals.dev)");
    return null;
  }
  try {
    // ponytail: metalpriceapi returns rates as USD->XAU; invert for USD/oz.
    const url = `https://api.metalpriceapi.com/v1/latest?api_key=${config.metalsKey}&base=USD&currencies=XAU`;
    const data = await getJson(url);
    const xau = data?.rates?.XAU;
    if (!xau) throw new Error("no XAU rate");
    notes.push("gold: metalpriceapi XAU");
    return 1 / Number(xau);
  } catch (e) {
    notes.push(`gold: FAILED (${(e as Error).message})`);
    return null;
  }
}

// CSPR — CoinGecko, no key.
async function csprSpot(notes: string[]): Promise<number | null> {
  try {
    const url =
      "https://api.coingecko.com/api/v3/simple/price?ids=casper-network&vs_currencies=usd";
    const data = await getJson(url);
    const usd = data?.["casper-network"]?.usd;
    if (usd == null) throw new Error("no price");
    notes.push("cspr: coingecko casper-network");
    return Number(usd);
  } catch (e) {
    notes.push(`cspr: FAILED (${(e as Error).message})`);
    return null;
  }
}

export async function ingest(): Promise<PriceSnapshot> {
  const notes: string[] = [];
  const [tbondYieldPct, wtiUsd, goldUsd, csprUsd] = await Promise.all([
    treasuryYield(notes),
    wtiSpot(notes),
    goldSpot(notes),
    csprSpot(notes),
  ]);
  return {
    tbondYieldPct,
    wtiUsd,
    goldUsd,
    csprUsd,
    notes,
    at: new Date().toISOString(),
  };
}
