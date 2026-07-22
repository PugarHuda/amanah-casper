# Going to Casper MAINNET — push-button

The buildathon requires a **testnet** deployment (Amanah has 12 contracts + dozens of proofs
live on `casper-test`). Mainnet is a differentiator the closest rivals have and is worth a
touch. The blocker was never cost or code — it's that a mainnet deploy needs real CSPR, which
a faucet can't give. This makes it a two-step, ~$1 operation.

## The cheap, genuine mainnet touch (~$1)

Deploy the **AttestationLog** (the proof-of-reasoning heart) and attest one real decision on
mainnet. That produces a real deploy on **cspr.live's mainnet explorer** — a verifiable
"live on Casper mainnet" claim — for ~500 CSPR (≈ $1 at ~$0.0016/CSPR).

### Step 1 — get the funding address (already done)

```
cd agent && npx tsx src/deploy-mainnet.ts
```

On first run it generates a mainnet key at `agent/secret/mainnet_key.pem` (gitignored, never
shared) and prints the **public key** to fund. For this checkout that address is:

```
013e8b8f9f375a9c1eb1371ea49156c28c2abb2088f998ea3d958e83eca140b86a
```

### Step 2 — fund it with ~500 CSPR

Buy CSPR on any exchange that lists it (Coinbase, Gate, KuCoin, Huobi…), then **withdraw ~500
CSPR to the public key above on the Casper mainnet network**. 500 CSPR ≈ $1. (The buildathon
team has also topped up participants' balances on request — ask them for a mainnet top-up to
that address if you'd rather not buy.)

### Step 3 — deploy (one command)

```
cd agent && npx tsx src/deploy-mainnet.ts
```

Now that it's funded, the same command installs AttestationLog on mainnet and attests a
decision. It prints two `https://cspr.live/deploy/<hash>` links — the install and the attest —
which are your live-on-mainnet proof. State is saved to `.env.mainnet`.

## The full suite on mainnet (~$8–16)

To put the entire stack on mainnet (vault, gates, quorum, ZkReserves, PolicyEngine…), the same
testnet deploy scripts target mainnet by overriding two env vars — no code changes:

```
CASPER_RPC_URL=https://node.mainnet.casper.network/rpc
CASPER_CHAIN_NAME=casper
```

Fund the agent + custodian keys with ~5,000 CSPR total (~$8–16), then run the deploy/migrate
scripts as documented in the README. Re-wire `web/.env.local` (VAULT/quorum/reserves hashes +
seeds) and redeploy the web app. Because this changes every published proof hash, do it only
when you're ready to re-verify — the ~$1 AttestationLog touch above is the low-risk way to be
"on mainnet" without disturbing the proven testnet demo.

## Notes

- Mainnet RPC verified live: `https://node.mainnet.casper.network/rpc` (chainspec `casper`,
  Casper 2.0).
- `agent/secret/mainnet_key.pem` is gitignored. Only the **public** key/address is ever shared.
- Same wasm, same contracts — only the chain name (`casper`) and RPC differ from testnet.
