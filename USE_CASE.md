# Amanah — the real-world case

## The problem

Real-world assets (RWA) are the fastest-growing segment of on-chain finance —
tokenized treasuries, gold, money-market funds, and credit are already tens of
billions of dollars on-chain and projected into the trillions. As that capital
moves on-chain, someone has to **manage** it: rebalance across instruments as
yields and prices move, stay within mandate, and stay compliant.

Today that management is either **manual** (slow, expensive, doesn't scale) or
**an opaque bot** (a black box you have to trust). For regulated capital — a
tokenized fund, a DAO treasury, a family office, a fintech's customer float —
neither is acceptable. A fiduciary cannot tell an auditor "trust the bot's log."

**Three things any real RWA treasury manager must guarantee, and that a normal
agent cannot prove:**

1. **Capital preservation** — never gamble the principal.
2. **Mandate + compliance** — only approved counterparties, within limits, KYC-clear.
3. **Auditability** — every decision explainable and independently verifiable, after
   the fact, by a regulator who doesn't trust you.

## What Amanah does

Amanah is an autonomous agent that manages a tokenized RWA treasury (gold, US
T-bonds, oil, CSPR) and makes those three guarantees **structural and on-chain**,
not promises:

| Requirement | How Amanah enforces it (on-chain) |
|---|---|
| Capital preservation | `RwaVault` invariant: any reallocation that would drop total below locked principal **reverts** (`TouchesPrincipal`). The agent can only ever move *yield*. |
| Mandate / limits | `SpendGate`: per-tx cap, rolling daily limit, target allowlist, instant kill-switch — checked in-contract on every move. |
| Compliance | `ComplianceRegistry`: an address must be `Valid` (KYC/AML) or the move reverts (`NotCompliant`). ERC-3643-style, without doxxing identity on-chain. |
| Auditability | **Proof, not a diary.** Every decision is Ed25519-signed, blake2b-hashed, and the signature is **verified inside `AttestationLog`** before it's recorded. The reasoning blob is published; anyone can recompute the hash and confirm it matches the on-chain attestation. A forged decision can't be attested — the contract rejects it. |

## Why this is real, not a toy

- **Real market data.** Prices come from real public sources, timestamped and
  attributed in every reasoning blob: gold from metalpriceapi (XAU), WTI from the
  **US EIA**, the 10Y yield from **US Treasury fiscaldata**, CSPR from CoinGecko.
  The agent console shows the provider on the ingest step — no invented numbers.
- **Real instruments.** The vault's four assets model live tokenized-RWA categories
  already on-chain elsewhere: tokenized gold (e.g. PAXG-style XAU), tokenized
  treasuries (e.g. short-duration T-bill funds), a commodity benchmark, and the
  native asset as a liquidity reserve.
- **Real money movement.** The agent pays for its premium market signal with a
  real **x402** micropayment (CEP-3009 `transfer_with_authorization`), settled
  on-chain — agent-to-agent commerce, not a mock.
- **Real proofs.** Every cycle produces verifiable testnet transactions (see the
  proof table in [README](README.md) / [DEMO](DEMO.md)) you can open on cspr.live.

## Who it's for

- **Tokenized funds / RWA issuers** that need 24/7 management with an audit trail a
  regulator will accept.
- **DAO treasuries** holding RWA who want autonomous rebalancing without handing a
  multisig to an opaque bot.
- **Fintechs / family offices** managing customer float under a capital-preservation
  mandate.

For all of them the pitch is the same: **automation you don't have to trust,
because every action proves itself on-chain — and the principal is structurally
untouchable.**

## Why Casper specifically

- Native, in-contract **Ed25519 signature verification** makes "proof, not a diary"
  cheap and first-class — the attestation is checked by the chain, not by us.
- **Odra** + the Casper Event Standard give clean upgradable contracts and a real
  event stream (the dashboard's live feed is CSPR.cloud Streaming over those events).
- The **CSPR.cloud / CSPR.click / x402** stack provides the indexer, wallet, and
  payment rails a production RWA product would actually need — all integrated here.

## Honest scope

This is a testnet demonstrator. The assets are synthetic test tokens modeling real
instruments; KYC is a status flag, not a full identity stack; the live vault is
seeded with principal = 0 so the invariant is proven by unit test rather than a
non-zero on-chain lock. The architecture and every guarantee above are real and
running on casper-test today — productionizing is wiring real tokenized-RWA
contracts and a real registrar behind the same gates.
