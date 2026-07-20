// SSE relay for the CSPR.cloud Streaming API (WebSocket). The browser can't open
// the CSPR.cloud socket itself — that would leak the access key and the WHATWG
// WebSocket can't set an Authorization header. So this server-side route holds the
// WS connections (key stays here) and re-emits contract-level events to the browser
// as Server-Sent Events. The /dashboard LiveFeed subscribes via EventSource.
//
// ponytail: one WS per contract (the endpoint filters by a single contract_hash).
// On a serverless host (Vercel) the stream is capped by
// the function max duration; on a normal Node host (npm run start) it stays open.
import type { NextRequest } from "next/server";
import WebSocket from "ws";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// trim(): a stray newline/space from an env-var pipe would be an "invalid header
// character" when set as the WebSocket authorization header (500s the endpoint).
const KEY = (process.env.CSPR_CLOUD_API_KEY || "").trim();
const STREAM_BASE = process.env.CSPR_CLOUD_STREAM_BASE || "wss://streaming.testnet.cspr.cloud";

// Our deployed contract HASHES (not package hashes — the stream filters by contract_hash).
const CONTRACTS: Record<string, string> = {
  // vault v3 contract hash (custodian-separated + owner-gated compliance)
  "Reallocate · vault": process.env.VAULT_CONTRACT_HASH || "3a6a434f14374e9b3f3a13b1aa9fc2391005abd1e2cd364cdd3716794c29d2ef",
  "Attestation · reasoning": process.env.ATTESTATION_CONTRACT_HASH || "c214ac3fe6c8f832eefd8ff6d7ed6afe9fb7a11b6048fa0a77ffc04fd874f003",
  // Reputation v3 contract hash (custodian-gated adjust). Old v2 was 7c887d21….
  "Reputation · payment": process.env.REPUTATION_CONTRACT_HASH || "c7b55a43217d17a44197dab44bb40762f1a179c085f456c772469e7643ae8dee",
  // AuditorLog — the independent auditor's APPROVE/VETO attestations.
  "Auditor · verdict": process.env.AUDITOR_CONTRACT_HASH || "439c39829d9093016167a83e6bcfcb5f7dcff908e854f35c9b2fec58b504d85a",
};

export async function GET(req: NextRequest): Promise<Response> {
  if (!KEY) {
    return new Response("CSPR_CLOUD_API_KEY not set — live feed disabled", { status: 503 });
  }
  const encoder = new TextEncoder();
  const sockets: WebSocket[] = [];
  // Hoisted so BOTH the abort listener and the stream's cancel() can tear down
  // (otherwise cancel() left the keepalive interval running forever).
  let shutdown = () => {};

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
        // Guard construction: a bad auth header (or serverless WS limit) must not
        // 500 the whole SSE endpoint — degrade that one contract to a warn instead.
        let ws: WebSocket;
        try {
          ws = new WebSocket(`${STREAM_BASE}/contract-events?contract_hash=${hash}`, {
            headers: { authorization: KEY },
          });
        } catch (e) {
          send({ type: "warn", label, message: (e as Error).message });
          continue;
        }
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
        // If an upstream socket drops, tell the client so its "LIVE" dot can go
        // amber instead of implying a feed that's actually dead.
        ws.on("close", () => send({ type: "warn", label, message: "stream closed" }));
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

      shutdown = () => {
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
      shutdown();
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
