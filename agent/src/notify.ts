// Operator notifications for every completed cycle — not just low-confidence
// escalations. Each message carries the auditor's verdict and every deploy hash as a
// cspr.live link, so whoever is on call can verify the cycle from their phone instead of
// taking the agent's word for it.
//
// No-op (and says so once) when TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID aren't set, so the
// loop never depends on it.
import { config } from "./config.js";

const EXPLORER = "https://testnet.cspr.live/deploy";
const DASHBOARD = "https://amanah-casper-rwa.vercel.app/dashboard";
let warned = false;

export interface CycleReport {
  cycle: number;
  action: string;
  summary: string;
  confidence: number | null;
  reasoningHash: string;
  attestDeploy?: string;
  x402Deploy?: string;
  auditDeploy?: string;
  reallocateDeploy?: string;
  quorumVotes?: string[];
  auditorApproved?: boolean;
  outcome: "executed" | "vetoed" | "held" | "escalated";
}

const link = (h?: string) => (h ? `${EXPLORER}/${h}` : "—");

/** Pure message builder — exported so it is unit-testable without a bot token. */
export function buildCycleMessage(r: CycleReport): string {
  const icon = { executed: "✅", vetoed: "⛔", held: "⏸", escalated: "⚠️" }[r.outcome];
  const lines = [
    `${icon} Amanah cycle ${r.cycle} — ${r.outcome.toUpperCase()}`,
    `${r.action}${r.confidence != null ? ` · confidence ${r.confidence}` : ""}`,
    r.summary,
    "",
    `Reasoning: 0x${r.reasoningHash}`,
    `Attest:     ${link(r.attestDeploy)}`,
    `x402:       ${link(r.x402Deploy)}`,
    `Auditor:    ${link(r.auditDeploy)}${r.auditorApproved === false ? "  (VETO)" : ""}`,
  ];
  if (r.quorumVotes?.length) lines.push(`Quorum:     ${r.quorumVotes.length} signed vote(s) · ${link(r.quorumVotes[0])}`);
  lines.push(`Reallocate: ${link(r.reallocateDeploy)}`, "", `Dashboard: ${DASHBOARD}`);
  return lines.join("\n");
}

/** Best-effort send; never throws into the cycle. */
export async function notifyCycle(r: CycleReport): Promise<boolean> {
  if (!config.telegramToken || !config.telegramChatId) {
    if (!warned) {
      console.log("  ⓘ operator notifications off (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID unset)");
      warned = true;
    }
    return false;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${config.telegramToken}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: config.telegramChatId,
        text: buildCycleMessage(r),
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return true;
  } catch (e) {
    console.warn("  ⚠ operator notify failed:", (e as Error).message);
    return false;
  }
}
