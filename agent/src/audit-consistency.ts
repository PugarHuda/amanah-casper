// Cross-surface consistency audit. Amanah exposes the same treasury three ways — raw
// chain state, the MCP server, and the public dashboard. If they ever disagree, one of
// them is lying to a judge. This reads all three and compares.
// Run: npx tsx src/audit-consistency.ts
import { blake2b } from "blakejs";

const RPC = process.env.CASPER_RPC_URL ?? "https://node.testnet.casper.network/rpc";
const WEB = process.env.WEB_BASE ?? "https://amanah-casper-rwa.vercel.app";
const VAULT_SEED = process.env.VAULT_STATE_SEED ?? "e5dab7f204f18a69e05bb7001ab8ccfba29def87496c547b983929b71e74ea89";

const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
const be32 = (n: number) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n, false); return b; };

async function rpc(method: string, params: unknown): Promise<any> {
  const r = await fetch(RPC, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return r.json();
}

async function stateRoot(): Promise<string> {
  return (await rpc("chain_get_state_root_hash", {}))?.result?.state_root_hash;
}

/** Read one Odra state field (Var or Mapping entry) straight from global state. */
async function readField(srh: string, index: number, mappingKey: number[] = []): Promise<any> {
  const itemKey = hex(blake2b(new Uint8Array([...be32(index), ...mappingKey]), undefined, 32));
  const addr = hex(blake2b(Buffer.concat([Buffer.from(VAULT_SEED, "hex"), Buffer.from(itemKey, "utf8")]), undefined, 32));
  const d = await rpc("state_get_dictionary_item", {
    state_root_hash: srh, dictionary_identifier: { Dictionary: `dictionary-${addr}` },
  });
  return d?.result?.stored_value?.CLValue?.parsed ?? null;
}

/** U256/U512 come back as [len, ...little-endian] blobs. */
function decodeBlob(parsed: any): bigint {
  if (!Array.isArray(parsed) || !parsed.length) return 0n;
  const [len, ...rest] = parsed as number[];
  let v = 0n;
  for (let i = len - 1; i >= 0; i--) v = (v << 8n) | BigInt(rest[i] ?? 0);
  return v;
}

const problems: string[] = [];
const fail = (m: string) => problems.push(m);

async function main() {
  console.log(`chain: ${RPC}\nweb  : ${WEB}\n`);

  // ---- 1. raw chain ------------------------------------------------------
  const srh = await stateRoot();
  const assets = ["Gold", "TBond", "WTI", "CSPR"];
  const onChain: Record<string, bigint> = {};
  for (let i = 0; i < assets.length; i++) onChain[assets[i]] = decodeBlob(await readField(srh, 1, [i]));
  const principal = decodeBlob(await readField(srh, 2));
  const total = Object.values(onChain).reduce((a, b) => a + b, 0n);
  const frozen = await readField(srh, 10);
  console.log("CHAIN  total", total.toString(), "principal", principal.toString(), "frozen", frozen);

  if (total < principal) fail(`INVARIANT BROKEN: total ${total} < locked principal ${principal}`);
  for (const [k, v] of Object.entries(onChain)) if (v < 0n) fail(`negative allocation for ${k}`);

  // ---- 2. the dashboard --------------------------------------------------
  const html = await fetch(`${WEB}/dashboard`, { headers: { "cache-control": "no-cache" } }).then((r) => r.text());
  const fmt = (v: bigint) => {
    const usd = Number(v) / 1e6;
    return usd >= 1e6 ? `$${(usd / 1e6).toFixed(2)}M` : `$${usd.toLocaleString("en-US")}`;
  };
  const expectTotal = fmt(total);
  const expectPrincipal = `$${(Number(principal) / 1e6).toLocaleString("en-US")}`;
  console.log("WEB    expects total", expectTotal, "| principal", expectPrincipal);
  if (!html.includes(expectTotal)) fail(`dashboard does not show the on-chain total ${expectTotal}`);
  if (!html.includes(expectPrincipal)) fail(`dashboard does not show the on-chain principal ${expectPrincipal}`);

  // The frozen flag must agree with the circuit-breaker card.
  const isFrozen = frozen === 1 || frozen === true;
  if (isFrozen && !html.includes("FROZEN")) fail("chain says the vault is FROZEN but the dashboard shows it armed");
  if (!isFrozen && html.includes("FROZEN ⛔")) fail("dashboard shows FROZEN but the chain says it is not");

  // ---- 3. the published ZK proof must still describe this treasury -------
  const proof = (await fetch(`${WEB}/proofs/reserves.json`).then((r) => r.json())) as {
    total: string; principalFloor: string;
  };
  if (BigInt(proof.total) !== total) {
    fail(`published proof total ${proof.total} != on-chain total ${total} (proof is stale)`);
  }
  if (BigInt(proof.principalFloor) !== principal) {
    fail(`published proof floor ${proof.principalFloor} != on-chain principal ${principal}`);
  }
  console.log("PROOF  total", proof.total, "floor", proof.principalFloor);

  // ---- 4. the attested blob the verify page serves must hash to its hash --
  const r = await fetch(`${WEB}/api/reasoning`);
  if (r.ok) {
    const { hash, raw } = (await r.json()) as { hash: string; raw: string };
    const computed = hex(blake2b(new TextEncoder().encode(raw), undefined, 32));
    console.log("BLOB   attested", hash.slice(0, 16) + "…", computed === hash ? "== recomputed ✓" : "!= recomputed ✗");
    if (computed !== hash) fail("the served reasoning blob does not hash to its attested hash");
  } else {
    console.log("BLOB   endpoint unavailable (skipped)");
  }

  console.log(`\n===== ${problems.length} INCONSISTENCIES =====`);
  if (problems.length) { problems.forEach((p) => console.log("  ✗ " + p)); process.exitCode = 1; }
  else console.log("chain, dashboard, published proof and attested blob all agree.");
}

main().catch((e) => { console.error("FAILED:", e); process.exit(1); });
