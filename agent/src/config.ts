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
  // Second AttestationLog, registered to the custodian key — the independent
  // auditor agent attests its grade of the primary decision here (two keys, two logs).
  auditorLogHash: opt("AUDITOR_LOG_HASH", ""),
  auditorQuorumHash: opt("AUDITOR_QUORUM_HASH", ""),
  zkReservesHash: opt("ZK_RESERVES_HASH", ""),
  // Governance attribution (DORA Art. 5(2)(a) / 28(1)(a)): recorded in every attested
  // blob so a client's management body can EVIDENCE oversight. Unset = reported unset.
  policyVersion: opt("POLICY_VERSION", ""),
  policyApprovedBy: opt("POLICY_APPROVED_BY", ""),
  accountableOwner: opt("ACCOUNTABLE_OWNER", ""),
  custodianKeyPath: opt("CUSTODIAN_KEY_PEM", "./secret/custodian_key.pem"),
  paymentMotes: num("CASPER_PAYMENT_MOTES", 5_000_000_000),

  // x402 premium signal
  signalUrl: opt("SIGNAL_URL", "http://localhost:8402/alpha"),

  // Venice (OpenAI-compatible reasoning API)
  veniceKey: process.env.VENICE_API_KEY ?? "",
  veniceBaseUrl: opt("VENICE_BASE_URL", "https://api.venice.ai/api/v1"),
  // Any chat model id from the live Venice model list (GET /models). Default =
  // deepseek-v4-flash: strong reasoning + 1M ctx at ~$0.14/$0.28 per Mtok — the
  // best strength/price for the decision step. (qwen-3-7-max also works but is the
  // premium tier at $2.7/$8.05 per Mtok — ~30x dearer.) Override with VENICE_MODEL.
  model: opt("VENICE_MODEL", "deepseek-v4-flash"),
  // The INDEPENDENT auditor uses a DIFFERENT model family from the actor, so a blind
  // spot in one model isn't shared by its reviewer — real model diversity, not just a
  // different prompt. Defaults to a distinct model; override with AUDITOR_MODEL. Falls
  // back to the actor model only if you deliberately set them equal.
  auditorModel: opt("AUDITOR_MODEL", "llama-3.3-70b"),
  // C2 — the CONSENSUS PANEL. The decision to move funds is polled across several
  // DIFFERENT model families; funds only move when a majority independently agree on the
  // same action (and, for a rebalance, the same direction). A lone model's blind spot or
  // hallucinated trade can't reach the chain — a dissenting panel forces escalation. Set
  // PANEL_MODELS to a comma-separated list; default = three distinct families we've
  // verified serve on Venice. Empty/one model disables the panel (falls back to reason()).
  panelModels: (process.env.PANEL_MODELS ?? "deepseek-v4-flash,llama-3.3-70b,qwen-3-7-max")
    .split(",").map((m) => m.trim()).filter(Boolean),

  // Data source keys (optional — missing keys degrade gracefully)
  eiaKey: process.env.EIA_API_KEY ?? "",
  metalsKey: process.env.METALS_API_KEY ?? "",
  csprCloudKey: process.env.CSPR_CLOUD_KEY ?? "",

  // Loop / thresholds
  cycleMs: num("CYCLE_MS", 60_000),
  confidenceThreshold: num("CONFIDENCE_THRESHOLD", 0.7),
  // Simulation / paper-trading mode (C4): run the full real pipeline (ingest -> reason ->
  // audit -> guard) but replace on-chain execution with a paper fill, tracking a price-
  // exposed paper portfolio + equity curve. Nothing touches the chain. SIMULATE=true.
  simulate: (process.env.SIMULATE ?? "").toLowerCase() === "true",

  // Dry-run: still ingest + pay + reason + SIGN (real Ed25519), but log the
  // on-chain submissions instead of sending them. Explicit DRY_RUN=true/false
  // wins; otherwise auto-on whenever a contract hash is missing (pre-deploy demo).
  dryRun:
    (process.env.DRY_RUN ?? "").toLowerCase() === "true" ||
    ((process.env.DRY_RUN ?? "") === "" &&
      (!process.env.ATTESTATION_LOG_HASH ||
        !process.env.RWA_VAULT_HASH ||
        !process.env.REPUTATION_REGISTRY_HASH)),

  // Optional public IPFS pin of the reasoning blob (Pinata JWT). Empty => skipped
  // (the local audit/<hash>.json copy is always written). Makes the attested hash
  // verifiable by anyone, not just someone holding the repo.
  pinataJwt: process.env.PINATA_JWT ?? "",

  // Optional Telegram escalation (OPERATOR-facing)
  telegramToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  telegramChatId: process.env.TELEGRAM_CHAT_ID ?? "",
  // Optional USER/client-facing alert webhook — POSTed a structured escalation event so the
  // asset owner is notified when their agent escalates, not only the operator.
  userWebhookUrl: process.env.USER_WEBHOOK_URL ?? "",
} as const;
