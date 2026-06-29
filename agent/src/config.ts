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
  agentKeyPath: opt("AGENT_KEY_PEM", "./secret/agent_key.pem"), // Ed25519 PEM
  // ponytail: verify each hash is the 64-char contract hash (no "hash-" prefix).
  // Empty until contracts are deployed -> agent auto-runs in DRY_RUN (see below).
  attestationLogHash: opt("ATTESTATION_LOG_HASH", ""),
  rwaVaultHash: opt("RWA_VAULT_HASH", ""),
  reputationRegistryHash: opt("REPUTATION_REGISTRY_HASH", ""),
  paymentMotes: num("CASPER_PAYMENT_MOTES", 5_000_000_000),

  // x402 premium signal
  signalUrl: opt("SIGNAL_URL", "http://localhost:8402/alpha"),

  // Venice (OpenAI-compatible reasoning API)
  veniceKey: process.env.VENICE_API_KEY ?? "",
  veniceBaseUrl: opt("VENICE_BASE_URL", "https://api.venice.ai/api/v1"),
  // Any chat model id from the live Venice model list (GET /models). Default =
  // deepseek-v4-flash: strong reasoning + JSON-schema support + 1M ctx at
  // ~$0.14/$0.28 per Mtok — the best strength/price for the decision step.
  // (The old "qwen-3-7-max" default was NOT a real Venice id → every call 4xx'd.)
  // Override with VENICE_MODEL.
  model: opt("VENICE_MODEL", "deepseek-v4-flash"),

  // Data source keys (optional — missing keys degrade gracefully)
  eiaKey: process.env.EIA_API_KEY ?? "",
  metalsKey: process.env.METALS_API_KEY ?? "",
  csprCloudKey: process.env.CSPR_CLOUD_KEY ?? "",

  // Loop / thresholds
  cycleMs: num("CYCLE_MS", 60_000),
  confidenceThreshold: num("CONFIDENCE_THRESHOLD", 0.7),

  // Dry-run: still ingest + pay + reason + SIGN (real Ed25519), but log the
  // on-chain submissions instead of sending them. Explicit DRY_RUN=true/false
  // wins; otherwise auto-on whenever a contract hash is missing (pre-deploy demo).
  dryRun:
    (process.env.DRY_RUN ?? "").toLowerCase() === "true" ||
    ((process.env.DRY_RUN ?? "") === "" &&
      (!process.env.ATTESTATION_LOG_HASH ||
        !process.env.RWA_VAULT_HASH ||
        !process.env.REPUTATION_REGISTRY_HASH)),

  // Optional IPFS pin (web3.storage). Empty => skipped.
  web3StorageToken: process.env.WEB3_STORAGE_TOKEN ?? "",

  // Optional Telegram escalation
  telegramToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  telegramChatId: process.env.TELEGRAM_CHAT_ID ?? "",
} as const;
