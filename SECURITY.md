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

## Known design limitations (documented, not defects)

- `ReputationRegistry.record_payment` proves uniqueness of a deploy hash but cannot
  validate on-chain that the hash settled a real payment.
- On-chain `reallocate` is gated by the honest agent loop reading the auditor verdict;
  binding the auditor quorum directly into the vault is a roadmap item.
