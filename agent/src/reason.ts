// Call the reasoning LLM via Venice (OpenAI-compatible API) and return a
// strictly-typed Decision. Venice's /chat/completions is OpenAI-shaped, so a
// plain fetch is enough — no SDK. We force JSON output (response_format) and
// keep a tolerant extract + one retry for reasoning models that wrap prose.
import { config } from "./config.js";
import type { Decision, PriceSnapshot } from "./types.js";
import {
  SYSTEM_PROMPT,
  buildUserPrompt,
  DECISION_SCHEMA,
} from "./prompts/decide.js";

const SCHEMA_HINT = `Return ONLY a single JSON object matching this schema — no \
prose, no markdown fences:\n${JSON.stringify(DECISION_SCHEMA)}`;

export async function reason(
  cycle: number,
  prices: PriceSnapshot,
  premiumSignal: unknown,
): Promise<Decision> {
  if (!config.veniceKey) throw new Error("Missing VENICE_API_KEY (see .env.example)");
  const user = buildUserPrompt(cycle, prices, premiumSignal);

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
// sometimes emit a <think> preamble despite response_format).
function extractJson(text: string): unknown | null {
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

function normalize(d: Decision): Decision {
  // Guardrail: a non-rebalance action never moves funds.
  if (d.action !== "rebalance") d.amount = 0;
  return d;
}
