// Amanah Telegram bot — a thin notifier. Posts decision notifications and
// answers /audit with links to the latest attestation + deploys on cspr.live.
import "dotenv/config";
import { Bot } from "grammy";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error("Missing TELEGRAM_BOT_TOKEN (see .env.example)");

const EXPLORER =
  process.env.CSPR_EXPLORER ?? "https://testnet.cspr.live/deploy";
const DASHBOARD = process.env.DASHBOARD_URL ?? "https://amanah.example/dashboard";

export const bot = new Bot(token);

/** Last decision the agent pushed, surfaced by /audit. Updated via notifyDecision. */
let latest: {
  summary: string;
  reasoningHash: string;
  attestDeploy: string;
  reallocateDeploy?: string;
  x402Deploy?: string;
} | null = null;

export function notifyDecision(d: NonNullable<typeof latest>): void {
  latest = d;
}

function deployLink(hash?: string): string {
  return hash ? `${EXPLORER}/${hash}` : "(none)";
}

bot.command("start", (ctx) =>
  ctx.reply(
    "Amanah treasury agent bot. /audit for the latest attested decision and deploy links.",
  ),
);

bot.command("audit", (ctx) => {
  if (!latest) {
    return ctx.reply(
      `No decision recorded yet this session.\nDashboard: ${DASHBOARD}`,
    );
  }
  return ctx.reply(
    [
      `🧠 ${latest.summary}`,
      `Reasoning hash: 0x${latest.reasoningHash}`,
      `Attest: ${deployLink(latest.attestDeploy)}`,
      `Reallocate: ${deployLink(latest.reallocateDeploy)}`,
      `x402 settle: ${deployLink(latest.x402Deploy)}`,
      `Dashboard: ${DASHBOARD}`,
    ].join("\n"),
    { link_preview_options: { is_disabled: true } },
  );
});

// Thin notifier: start long polling. ponytail: if you import this module just to
// call notifyDecision from another process, guard this start() behind a flag.
bot.start();
console.error("amanah bot started (long polling)");
