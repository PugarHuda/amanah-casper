// Watch Amanah's on-chain contract events stream in LIVE via the CSPR.cloud
// Streaming API (WebSocket). No polling — events arrive the instant they're
// emitted. Great for the demo: run this in one terminal, run a cycle in another,
// and watch "Attested" / "Reallocated" / payment events appear in real time.
//
// Run: npx tsx src/stream.ts
import "dotenv/config";
import WebSocket from "ws";

const KEY = process.env.CSPR_CLOUD_KEY ?? "";
const BASE = process.env.CSPR_CLOUD_STREAM_BASE ?? "wss://streaming.testnet.cspr.cloud";

// Contract HASHES (not package hashes) — the stream filters by contract_hash.
const CONTRACTS: Record<string, string> = {
  "vault       ": process.env.VAULT_CONTRACT_HASH ?? "15785924492b910a8e42d759ff4c684631fe367858d5bde14f13ecf71ec63a50",
  "attestation ": process.env.ATTESTATION_CONTRACT_HASH ?? "c214ac3fe6c8f832eefd8ff6d7ed6afe9fb7a11b6048fa0a77ffc04fd874f003",
  "reputation  ": process.env.REPUTATION_CONTRACT_HASH ?? "fb503979069fec873bcde40182bbe14578f159c18e4513606bb48de9ad15069e",
};

if (!KEY) {
  console.error("Missing CSPR_CLOUD_KEY (see agent/.env). Cannot open the stream.");
  process.exit(1);
}

console.log("Amanah live event stream (CSPR.cloud Streaming API)\n");
for (const [label, hash] of Object.entries(CONTRACTS)) {
  const ws = new WebSocket(`${BASE}/contract-events?contract_hash=${hash}`, {
    headers: { authorization: KEY },
  });
  ws.on("open", () => console.log(`  ▸ subscribed: ${label.trim()} (${hash.slice(0, 8)}…)`));
  ws.on("message", (raw: Buffer) => {
    const txt = raw.toString();
    if (txt === "Ping") return; // keepalive
    try {
      const evt = JSON.parse(txt);
      if (evt?.action === "emitted") {
        console.log(
          `\n⛓  [${label}] ${evt.data?.name ?? "event"}` +
            `\n   deploy: https://testnet.cspr.live/deploy/${evt.extra?.deploy_hash}` +
            `\n   at:     ${evt.timestamp}`,
        );
      }
    } catch {
      /* non-JSON frame */
    }
  });
  ws.on("error", (e: Error) => console.warn(`  ! ${label.trim()} error:`, e.message));
}

console.log("\nWaiting for events… (Ctrl+C to stop)\n");
