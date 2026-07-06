// Amanah Telegram bot — a thin notifier. Posts decision notifications and
// answers /audit with links to the latest attestation + deploys on cspr.live.
// Importing this module is side-effect-free (no throw, no polling); the bot only
// starts when this file is run directly, so `notifyDecision` is safely importable.
import "dotenv/config";
import { Bot } from "grammy";

const EXPLORER = process.env.CSPR_EXPLORER ?? "https://testnet.cspr.live/deploy";
const DASHBOARD = process.env.DASHBOARD_URL ?? "https://amanah-casper-rwa.vercel.app/dashboard";

export interface Decision {
  summary: string;
  reasoningHash: string;
  attestDeploy: string;
  reallocateDeploy?: string;
  x402Deploy?: string;
}

/** Last decision the agent pushed, surfaced by /audit. Updated via notifyDecision. */
let latest: Decision | null = null;
export function notifyDecision(d: Decision): void {
  latest = d;
}

export function deployLink(hash: string | undefined, explorer = EXPLORER): string {
  return hash ? `${explorer}/${hash}` : "(none)";
}

/** Pure — builds the /audit reply. Exported so it's unit-testable without a bot token. */
export function buildAuditMessage(d: Decision | null, dashboard = DASHBOARD, explorer = EXPLORER): string {
  if (!d) return `No decision recorded yet this session.\nDashboard: ${dashboard}`;
  return [
    `🧠 ${d.summary}`,
    `Reasoning hash: 0x${d.reasoningHash}`,
    `Attest: ${deployLink(d.attestDeploy, explorer)}`,
    `Reallocate: ${deployLink(d.reallocateDeploy, explorer)}`,
    `x402 settle: ${deployLink(d.x402Deploy, explorer)}`,
    `Dashboard: ${dashboard}`,
  ].join("\n");
}

export function createBot(token: string): Bot {
  const bot = new Bot(token);
  bot.command("start", (ctx) =>
    ctx.reply("Amanah treasury agent bot. /audit for the latest attested decision and deploy links."),
  );
  bot.command("audit", (ctx) =>
    ctx.reply(buildAuditMessage(latest), { link_preview_options: { is_disabled: true } }),
  );
  return bot;
}

// Only start long polling when run directly (not when imported for notifyDecision/tests).
if (/bot\.(ts|js|mts)$/.test(process.argv[1] ?? "")) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Missing TELEGRAM_BOT_TOKEN (see .env.example)");
  const bot = createBot(token);
  bot.start();
  console.error("amanah bot started (long polling)");
}
