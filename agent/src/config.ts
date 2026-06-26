// Typed environment config. Read once at startup; throws early on missing
// required values so the agent never half-runs.
import "dotenv/config";

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name} (see .env.example)`);
  return v;
}
function opt(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}
function num(name: string, fallback: number): number {
  const v = process.env[name];
  return v ? Number(v) : fallback;
}

export const config = {
  // Casper
  // Keyless public testnet RPC (verified). CSPR.cloud node needs a token.
  rpcUrl: opt("CASPER_RPC_URL", "https://node.testnet.casper.network/rpc"),
  chainName: opt("CASPER_CHAIN_NAME", "casper-test"),
  agentKeyPath: req("AGENT_KEY_PEM"), // PEM-encoded Ed25519 private key
  // ponytail: verify each hash is the 64-char contract hash (no "hash-" prefix).
  attestationLogHash: req("ATTESTATION_LOG_HASH"),
  rwaVaultHash: req("RWA_VAULT_HASH"),
  reputationRegistryHash: req("REPUTATION_REGISTRY_HASH"),
  paymentMotes: num("CASPER_PAYMENT_MOTES", 5_000_000_000),

  // x402 premium signal
  signalUrl: opt("SIGNAL_URL", "http://localhost:8402/alpha"),

  // Venice (OpenAI-compatible reasoning API)
  veniceKey: process.env.VENICE_API_KEY ?? "",
  veniceBaseUrl: opt("VENICE_BASE_URL", "https://api.venice.ai/api/v1"),
  // Any chat model id from the Venice model list. Default = strong reasoning +
  // structured-output model; override with VENICE_MODEL.
  model: opt("VENICE_MODEL", "qwen-3-7-max"),

  // Data source keys (optional — missing keys degrade gracefully)
  eiaKey: process.env.EIA_API_KEY ?? "",
  metalsKey: process.env.METALS_API_KEY ?? "",
  csprCloudKey: process.env.CSPR_CLOUD_KEY ?? "",

  // Loop / thresholds
  cycleMs: num("CYCLE_MS", 60_000),
  confidenceThreshold: num("CONFIDENCE_THRESHOLD", 0.7),

  // Optional IPFS pin (web3.storage). Empty => skipped.
  web3StorageToken: process.env.WEB3_STORAGE_TOKEN ?? "",

  // Optional Telegram escalation
  telegramToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  telegramChatId: process.env.TELEGRAM_CHAT_ID ?? "",
} as const;
