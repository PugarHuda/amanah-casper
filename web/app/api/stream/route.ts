// SSE relay for the CSPR.cloud Streaming API (WebSocket). The browser can't open
// the CSPR.cloud socket itself — that would leak the access key and the WHATWG
// WebSocket can't set an Authorization header. So this server-side route holds the
// WS connections (key stays here) and re-emits contract-level events to the browser
// as Server-Sent Events. The /dashboard LiveFeed subscribes via EventSource.
//
// ponytail: one WS per contract (the endpoint filters by a single contract_hash).
// Fine for our 3 contracts. On a serverless host (Vercel) the stream is capped by
// the function max duration; on a normal Node host (npm run start) it stays open.
import type { NextRequest } from "next/server";
import WebSocket from "ws";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const KEY = process.env.CSPR_CLOUD_API_KEY || "";
const STREAM_BASE = process.env.CSPR_CLOUD_STREAM_BASE || "wss://streaming.testnet.cspr.cloud";

// Our deployed contract HASHES (not package hashes — the stream filters by contract_hash).
const CONTRACTS: Record<string, string> = {
  "Reallocate · vault": process.env.VAULT_CONTRACT_HASH || "15785924492b910a8e42d759ff4c684631fe367858d5bde14f13ecf71ec63a50",
  "Attestation · reasoning": process.env.ATTESTATION_CONTRACT_HASH || "c214ac3fe6c8f832eefd8ff6d7ed6afe9fb7a11b6048fa0a77ffc04fd874f003",
  "Reputation · payment": process.env.REPUTATION_CONTRACT_HASH || "fb503979069fec873bcde40182bbe14578f159c18e4513606bb48de9ad15069e",
};

export async function GET(req: NextRequest): Promise<Response> {
  if (!KEY) {
    return new Response("CSPR_CLOUD_API_KEY not set — live feed disabled", { status: 503 });
  }
  const encoder = new TextEncoder();
  const sockets: WebSocket[] = [];

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (obj: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {
          /* controller already closed */
        }
      };

      send({ type: "ready", contracts: Object.keys(CONTRACTS) });

      for (const [label, hash] of Object.entries(CONTRACTS)) {
        const ws = new WebSocket(`${STREAM_BASE}/contract-events?contract_hash=${hash}`, {
          headers: { authorization: KEY },
        });
        ws.on("message", (raw: Buffer) => {
          const txt = raw.toString();
          if (txt === "Ping") return; // keepalive from the server
          try {
            const evt = JSON.parse(txt);
            if (evt?.action === "emitted") {
              send({
                type: "event",
                label,
                name: evt.data?.name ?? "event",
                deploy_hash: evt.extra?.deploy_hash ?? null,
                timestamp: evt.timestamp ?? null,
              });
            }
          } catch {
            /* non-JSON frame */
          }
        });
        ws.on("error", (e: Error) => send({ type: "warn", label, message: e.message }));
        sockets.push(ws);
      }

      // SSE keepalive comment so proxies don't drop an idle connection.
      const ka = setInterval(() => {
        if (!closed) {
          try {
            controller.enqueue(encoder.encode(`: keepalive\n\n`));
          } catch {
            /* closed */
          }
        }
      }, 25_000);

      const shutdown = () => {
        if (closed) return;
        closed = true;
        clearInterval(ka);
        sockets.forEach((s) => s.close());
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      req.signal.addEventListener("abort", shutdown);
    },
    cancel() {
      sockets.forEach((s) => s.close());
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
