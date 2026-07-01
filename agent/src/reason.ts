// Call the reasoning LLM via Venice (OpenAI-compatible API) and return a
// strictly-typed Decision. Venice's /chat/completions is OpenAI-shaped, so a
// plain fetch is enough — no SDK. Venice rejects response_format on our models, so
// we constrain output with a schema hint + a tolerant extract + one retry.
import { config } from "./config.js";
import type { Decision, PriceSnapshot } from "./types.js";
import {
  SYSTEM_PROMPT,
  buildUserPrompt,
  DECISION_SCHEMA,
  type MarketContext,
} from "./prompts/decide.js";

const SCHEMA_HINT = `Return ONLY a single JSON object matching this schema — no \
prose, no markdown fences:\n${JSON.stringify(DECISION_SCHEMA)}`;

export async function reason(
  cycle: number,
  prices: PriceSnapshot,
  premiumSignal: unknown,
  marketContext?: MarketContext,
): Promise<Decision> {
  if (!config.veniceKey) throw new Error("Missing VENICE_API_KEY (see .env.example)");
  const user = buildUserPrompt(cycle, prices, premiumSignal, marketContext);

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${config.veniceBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.veniceKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        max_tokens: 4000,
        messages: [
          { role: "system", content: `${SYSTEM_PROMPT}\n\n${SCHEMA_HINT}` },
          { role: "user", content: user },
        ],
        // ponytail: no response_format — Venice rejects it ("response_format is not
        // supported by this model") on the models we use (observed on qwen-3-7-max),
        // despite the catalog's supportsResponseSchema flag. We constrain via
        // SCHEMA_HINT + tolerant extractJson, which handles <think> preambles too.
        // Keep our system prompt authoritative — don't prepend Venice's persona.
        venice_parameters: { include_venice_system_prompt: false },
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Venice API ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content;
    const parsed = content ? extractJson(content) : null;
    if (parsed) return normalize(parsed as Decision);
    // else fall through to one retry
  }
  throw new Error("reason(): Venice model did not return parseable decision JSON");
}

// Tolerant parse: direct JSON, else the first {...} block (reasoning models
// sometimes emit a <think> preamble despite response_format). Exported for tests.
export function extractJson(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    /* try block-extract */
  }
  const m = text.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      return JSON.parse(m[0]);
    } catch {
      /* give up this attempt */
    }
  }
  return null;
}

// Exported for tests. Coerces model output back into the typed invariants.
export function normalize(d: Decision): Decision {
  // Guardrail: a non-rebalance action never moves funds.
  if (d.action !== "rebalance") d.amount = 0;
  // Models sometimes return risk/confidence on a 0..100 scale despite the 0..1
  // schema (observed: deepseek returned riskScore 20). Coerce back to 0..1 so
  // every downstream consumer (web badge, escalation threshold) reads it right.
  if (d.riskScore > 1) d.riskScore = d.riskScore / 100;
  if (d.confidence > 1) d.confidence = d.confidence / 100;
  return d;
}
