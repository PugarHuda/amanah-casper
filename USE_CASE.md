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
| Independent approval | **The agent that decides is not the agent that approves.** An independent auditor grades every move APPROVE/VETO on-chain; a `AuditorQuorum` contract can require **K-of-N** independent signed votes before a reallocate executes (proven 2-of-3). A VETO also **slashes the agent's reputation**. |
| Runtime safety | **On-chain circuit breakers.** The vault refuses to reallocate when the agent's reputation drops below a floor (`BelowReputationFloor`) — repeated vetoes auto-bench it — and a **dead-man's switch** lets anyone freeze the vault if the agent goes silent (only the custodian unfreezes). |
| Identity & solvency privacy | **Zero-knowledge, twice.** KYC is proven with a Schnorr NIZK (`ZkKycVerifier`) — the credential is never revealed. Solvency is proven with a Pedersen+Schnorr **proof-of-reserves** (`ZkReserves`): the treasury is shown to be backed ≥ principal and **no individual amount appears in the proof**. Caveat stated plainly: this vault still stores `allocations` as public plaintext, so today the hiding is a property of the proof, not of the system — a confidential vault (commitments in place of balances) is a roadmap item. |

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

## Separation of powers (the fiduciary crux — implemented, not claimed)

A treasury story only holds if the party that *manages* funds is not the party that
*authorizes* itself. Amanah enforces this on-chain: a **custodian** (a separate
Casper key, `0109cd12…`) deploys and **owns** the SpendGate, allowlists the agent,
and sets the agent's compliance status. The **agent** (`0147ebe7…`) can only
reallocate yield *through the custodian's gates* — it cannot raise its own limits,
allowlist itself, or clear its own KYC. Revoking the agent is the custodian calling
`SpendGate.revoke()`; the agent cannot stop it. That's real custody separation, live
on casper-test.

There is a second, stronger control on top of custody: **segregation of duties
(maker–checker)**. The agent that *decides* is not the agent that *approves*. An
**independent auditor agent** — its own key — reviews every decision and attests an
APPROVE/VETO verdict **on-chain**; a veto blocks the reallocate *and* slashes the
agent's on-chain reputation. So a fiduciary can point to two independent cryptographic
signatures per decision, and a reputation that visibly bleeds when the agent is wrong —
the exact controls an auditor or regulator expects, made structural rather than promised.

## Honest scope

This is a testnet demonstrator. The assets are synthetic test tokens modeling real
instruments. But the core guarantees are now genuinely live, not just tested:
**custody is separated** (custodian-owned gates, above), an **independent auditor**
grades every move on-chain, **KYC is proven in zero-knowledge** (a real Schnorr NIZK
verified inside a contract — not a bare status flag), and the vault **locks $800K of
its $1M as principal** on-chain (the agent moves only the $200K yield). Productionizing
is wiring real tokenized-RWA contracts and a real KYC issuer behind these same gates.
