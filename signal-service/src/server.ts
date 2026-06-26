// x402-gated premium signal API. GET /alpha returns a small JSON RWA signal only
// after the caller settles a CEP-18 micropayment on Casper testnet. This is the
// counterparty the Amanah agent pays — agent-pays-agent commerce.
import "dotenv/config";
import express, { type Request, type Response } from "express";
import {
  x402ResourceServer,
  x402HTTPResourceServer,
  HTTPFacilitatorClient,
  type RoutesConfig,
  type HTTPAdapter,
  type HTTPRequestContext,
  type HTTPResponseInstructions,
} from "@x402/core/server";
import {
  registerExactCasperScheme,
  type CasperResourceServerConfig,
} from "@make-software/casper-x402/exact/server";
import { NETWORK_CASPER_TESTNET } from "@make-software/casper-x402";
import { buildSignal } from "./signal.js";

const PORT = Number(process.env.PORT ?? 8402);
const FACILITATOR_URL =
  process.env.FACILITATOR_URL ?? "https://x402-facilitator.testnet.cspr.cloud";
// CEP-18 token contract package hash (64 hex) used as the payment asset.
const ASSET = process.env.X402_ASSET_PACKAGE_HASH ?? "";
// Recipient account-hash address, "00"-prefixed (66 hex), per the exact scheme.
const PAY_TO = process.env.X402_PAY_TO ?? "";
const PRICE_ATOMIC = process.env.X402_PRICE_ATOMIC ?? "1000000";

const routes: RoutesConfig = {
  "GET /alpha": {
    description: "Premium RWA momentum/volatility signal",
    accepts: {
      scheme: "exact",
      network: NETWORK_CASPER_TESTNET,
      payTo: PAY_TO,
      // AssetAmount price => no decimals lookup needed (amount is atomic).
      price: { asset: ASSET, amount: PRICE_ATOMIC },
      maxTimeoutSeconds: 120,
    },
  },
};

function adapterFor(req: Request): HTTPAdapter {
  return {
    getHeader: (name) => req.header(name) ?? undefined,
    getMethod: () => req.method,
    getPath: () => req.path,
    getUrl: () => req.originalUrl,
    getAcceptHeader: () => req.header("accept") ?? "",
    getUserAgent: () => req.header("user-agent") ?? "",
    getQueryParams: () => req.query as Record<string, string | string[]>,
    getBody: () => req.body,
  };
}

function contextFor(req: Request): HTTPRequestContext {
  return {
    adapter: adapterFor(req),
    path: req.path,
    method: req.method,
    paymentHeader:
      req.header("PAYMENT-SIGNATURE") ?? req.header("X-PAYMENT") ?? undefined,
  };
}

function writeInstructions(res: Response, instr: HTTPResponseInstructions): void {
  for (const [k, v] of Object.entries(instr.headers)) res.setHeader(k, v);
  res.status(instr.status);
  if (instr.isHtml) res.type("html").send(instr.body ?? "");
  else res.json(instr.body ?? {});
}

async function main(): Promise<void> {
  const facilitator = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
  const resourceServer = new x402ResourceServer(facilitator);
  const casperConfig: CasperResourceServerConfig = {
    networks: [NETWORK_CASPER_TESTNET],
  };
  registerExactCasperScheme(resourceServer, casperConfig);

  const httpServer = new x402HTTPResourceServer(resourceServer, routes);
  await httpServer.initialize(); // validates routes against facilitator support

  const app = express();
  app.use(express.json());

  app.get("/alpha", async (req: Request, res: Response) => {
    try {
      const ctx = contextFor(req);
      const result = await httpServer.processHTTPRequest(ctx);

      if (result.type === "payment-error") {
        return writeInstructions(res, result.response);
      }

      const signal = await buildSignal();

      if (result.type === "payment-verified") {
        const settle = await httpServer.processSettlement(
          result.paymentPayload,
          result.paymentRequirements,
          result.declaredExtensions,
          { request: ctx },
        );
        if (settle.success) {
          for (const [k, v] of Object.entries(settle.headers))
            res.setHeader(k, v);
          return res.json(signal);
        }
        return writeInstructions(res, settle.response);
      }

      // no-payment-required (shouldn't happen for a gated route, but safe).
      return res.json(signal);
    } catch (e) {
      return res.status(500).json({ error: (e as Error).message });
    }
  });

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.listen(PORT, () => {
    console.log(`signal-service on :${PORT} — GET /alpha (x402-gated)`);
    if (!ASSET || !PAY_TO)
      console.warn(
        "  WARN: set X402_ASSET_PACKAGE_HASH and X402_PAY_TO for real payments",
      );
  });
}

main().catch((e) => {
  console.error("fatal:", e);
  process.exit(1);
});
