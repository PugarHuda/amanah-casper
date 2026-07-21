# Amanah — Launch Kit (ready to post)

Everything below is copy-paste ready. Set up the accounts (15 min), paste, done.
This directly satisfies the **Long-Term Launch Plans** judging criterion.

---

## 1. Accounts

- [x] **X / Twitter** — [@BangDropID](https://x.com/BangDropID). Bio + pinned post below.
- [x] **Discord** — hajilamet. **Telegram** — [@lynx129](https://t.me/lynx129).
- [x] All three wired into the verified `account-info` profile → they show on cspr.live.
- [ ] **Linktree / bio link** → point to the live app + repo + roadmap (optional).

---

## 2. X / Twitter bio (160 chars)

> Autonomous, compliant RWA treasury agent on @Casper_Network. Proof, not a diary — every
> AI decision verified on-chain, KYC in zero-knowledge. 🔗 amanah-casper-rwa.vercel.app

## 3. One-liner (for DoraHacks / CSPR.fans / pitch)

> Amanah is the on-chain fiduciary-controls layer for autonomous RWA treasuries on Casper:
> a second agent must approve every move, KYC and reserves are proven in zero-knowledge,
> and the vault benches the agent on-chain when it's wrong.

---

## 4. Launch thread (X) — paste as a thread

**1/**
Most "AI agents" that manage money ask you to trust a log file.

Amanah proves every decision on-chain — and a second, independent agent has to approve
it before a single token moves.

Live on @Casper_Network testnet 👇 amanah-casper-rwa.vercel.app

**2/** Proof, not a diary.
The agent signs its reasoning and the contract verifies that signature *inside the
contract* before recording it. Forge the hash → it reverts. Publicly checkable on cspr.live.

**3/** Separation of duties for AI.
An independent auditor agent (its own key) grades every decision on-chain — APPROVE/VETO.
A veto blocks the trade AND slashes the agent's reputation. We even run a K-of-N auditor
quorum: multiple independent signers must agree.

**4/** Real zero-knowledge — twice.
• ZK KYC: the agent proves it holds its credential without revealing it (Schnorr NIZK, in-VM).
• ZK proof-of-reserves: proves the treasury is solvent from commitments that never reveal an individual amount.

**5/** Circuit breakers that close the loop.
Too many vetoed decisions → the vault auto-benches the agent on-chain. Agent goes silent →
anyone can freeze the vault (dead-man's switch). Only the custodian can unfreeze.

**6/** All of it is real: 10 Odra contracts live on casper-test, every claim a public tx
hash, 79 automated tests, deployed dashboard.

Repo: github.com/PugarHuda/amanah-casper
Roadmap: mainnet + real RWA + an open auditor network. #Casper #RWA #x402

---

## 5. CSPR.fans / DoraHacks project blurb

**Amanah — Autonomous Compliant RWA Treasury Agent**

The on-chain fiduciary-controls layer for AI-run RWA treasuries on Casper. Every decision
is signed and verified by the contract itself (proof, not a diary); an independent auditor
quorum must approve each move; KYC and proof-of-reserves are zero-knowledge; reputation
slashing + on-chain circuit breakers bench a misbehaving agent automatically. 10 contracts
live on testnet, every step a public tx hash. Roadmap: security audit → mainnet → real
tokenized RWA + an open, staked auditor network.

Live: amanah-casper-rwa.vercel.app · Repo: github.com/PugarHuda/amanah-casper · Roadmap: ROADMAP.md

---

## 6. Pinned post (X)

> Amanah: an AI that manages an RWA treasury on @Casper_Network — where the AI can't move a
> token until a second agent approves it on-chain, KYC & reserves are zero-knowledge, and
> the vault benches it automatically when it's wrong. Live 👇 amanah-casper-rwa.vercel.app
