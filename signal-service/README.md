# amanah-signal-service

The x402-gated premium signal API — the counterparty the Amanah agent pays
(agent-pays-agent commerce). `GET /alpha` returns a small JSON RWA signal
(CSPR momentum/volatility + a risk tilt, computed from real CoinGecko data) only
after the caller settles a CEP-18 micropayment on Casper testnet.

Built on `@make-software/casper-x402` (exact scheme) + `@x402/core` with the
testnet facilitator at `x402-facilitator.testnet.cspr.cloud`, network
`casper:casper-test`.

## Run

```bash
cp .env.example .env   # set X402_ASSET_PACKAGE_HASH + X402_PAY_TO
npm install
npm run dev            # listens on :8402
npm run typecheck
```

## Flow

`GET /alpha` (no payment) → `402` with `PAYMENT-REQUIRED` → client signs → resends
with `PAYMENT-SIGNATURE` → server verifies + settles via the facilitator → `200`
with the signal and a `PAYMENT-RESPONSE` settlement header.

`@x402/core` is pinned to `2.15.0` to match casper-x402's exact dependency (avoids
a duplicate-package type clash).
