# Security Policy

## Reporting a vulnerability

Amanah handles on-chain value on Casper testnet. If you find a vulnerability:

- **Preferred:** open a private [GitHub security advisory](https://github.com/PugarHuda/amanah-casper/security/advisories/new).
- Or reach the maintainer on X [@BangDropID](https://x.com/BangDropID) or Telegram [@lynx129](https://t.me/lynx129).

Please do **not** open a public issue for undisclosed vulnerabilities. We aim to
acknowledge reports within a few days.

## Scope

- Odra smart contracts in `contracts/` (the vault invariant, custody gates, the ZK
  verifiers, the auditor quorum, and the circuit breakers).
- The off-chain agent and deploy scripts in `agent/`.

## Notes

- This is a **testnet** project. Do not send mainnet funds to any address here.
- All secrets (`agent/secret/*`, `.env*`) are gitignored and never committed.
- Automated scanning is enabled: **CodeQL** code scanning and **Dependabot** alerts.
  High-severity or greater alerts are triaged and fixed.

## Previously-known limitations — now CLOSED

Both items flagged in the earlier audit have been fixed on-chain and proven:

- **Reputation self-farming** — `ReputationRegistry.record_payment` is now
  **authority-only**, so the agent cannot mint reputation to walk past the vault's
  circuit breaker. (ReputationRegistry v4.)
- **Auditor enforcement was off-chain** — `RwaVault.reallocate` now calls
  `AuditorQuorum.approved(attestation_hash)` and reverts `NotApproved`. A decision the
  independent auditors never approved is refused **by the contract**, even when signed
  with the agent's own key. Proof:
  [`ba368de3…`](https://testnet.cspr.live/deploy/ba368de335840645486c7692cf1fdee8b0ca3f7f61514091515a32052ac2d7b7)
  (refused) vs
  [`e68d4218…`](https://testnet.cspr.live/deploy/e68d42184b6f7fac2e226bea10c6a3e0942a276da6d6065618ac0f2d6c533c8e)
  (approved, executed). (RwaVault v6.)

A contract still cannot verify that an off-chain payment settled, so the custodian
attests settlements — the trust boundary is explicit and key-separated.
