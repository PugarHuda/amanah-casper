# Handoff: Amanah — Autonomous RWA Treasury Agent (Marketing site + App)

## Overview
Amanah is an autonomous, compliant Real-World-Asset (RWA) treasury agent on Casper. The agent
ingests live RWA prices, reasons with Claude, signs its reasoning (Ed25519), attests it on-chain,
checks guardrails + compliance, and only then reallocates **yield** (principal stays locked).
The differentiator is **proof-of-reasoning**: decisions are cryptographically bound on-chain and
publicly verifiable, not logged to a private database.

This bundle is the **front-end** for that product: a marketing landing page plus four app screens.

## About the Design Files
The files in this bundle are **design references created in HTML** — prototypes showing the intended
look and behavior. They are **not** production code to copy directly. They are authored as
"Design Components" (`.dc.html` + a small runtime in `support.js`); that runtime is a prototyping
convenience and should **not** be ported.

Your task: **recreate these designs in the target codebase's environment** using its established
patterns and libraries (the obvious fit here is **Next.js + React + CSPR.click**, as named in the
product spec). If no front-end exists yet, scaffold a Next.js app and implement the screens there.
The page bodies are fixed-width (1480px content card) absolute layouts for fidelity — when you
rebuild, convert them to **responsive flow** (max-width container, fl/grid sections), keeping the
exact visual tokens below.

## Fidelity
**High-fidelity (hifi).** Final colors, typography, spacing, copy, and interactions are all
intentional. Recreate pixel-faithfully, then make responsive. The only generated raster assets are
the gradient images (see Assets) — in production you may keep them as images or reproduce them with
CSS/WebGL gradients.

---

## Design Tokens

### Colors
| Token | Hex | Use |
|---|---|---|
| Page background | `#ecebe3` | warm gray behind the card |
| Card / surface | `#ffffff` | main content card |
| Surface subtle | `#fcfbf7` | metric cards, list rows |
| Surface warm tint | `#faf8f3` | hover fill |
| Ink / primary text | `#14110d` | headlines |
| Ink 2 | `#1c1814` / `#16130f` | nav, strong labels |
| Body text | `#5b564e` | subtitles |
| Muted text | `#6b665c` | secondary |
| Faint label | `#8a857a` / `#a59f93` / `#a59f93` | eyebrows, mono captions |
| Border | `#e7e3d9` / `#ece8de` / `#f1ede4` | inputs, dividers |
| Gold (accent) | `#e7a83c` / `#c8902f` | gold asset, warm CTA |
| Gold deep | `#9a8a63` | banner eyebrow |
| Blue (accent) | `#3f86e6` / `#2f7fe0` | T-bond, links, hashes |
| Green (success) | `#3fae6a` / `#2c7a4d` | verified / compliant |
| Red (down) | `#c0392b` | negative change |
| Dark surface | `#14110d` | newsletter block |
| CTA black | `#15120e` (bg) / `#ffffff` (text) | primary button |

Gradient pills used on hero/banner: `linear-gradient(100deg,#fbf4e6,#eef4fc)`.

### Typography
- **Display / serif:** `'Newsreader', serif` (Google Fonts), weights 400/500/600.
  - Hero H1: 92px / line-height 1.03 / letter-spacing -1.6px / weight 400
  - Page H1 (app): 42–54px / -0.8 to -1.2px / 400
  - Section serif: 23–40px / 400–500
- **UI / sans:** `'Manrope', sans-serif`, weights 400/500/600/700.
  - Body 16–19px, labels 13–14px (600/700), eyebrow 11–12px letter-spacing 2.4px.
- **Mono:** `'JetBrains Mono', monospace` — hashes, deploy IDs, status captions (11–14px).

### Radius & Shadow
- Card radius: `30px`. Panels: `16–24px`. Inputs/buttons: `12–14px`. Pills: `999px`.
- Card shadow: `0 34px 90px -24px rgba(70,58,30,0.20), 0 2px 10px rgba(0,0,0,0.04)`.
- CTA shadow: `0 6px 18px rgba(20,17,13,0.18)`.

### Spacing
Content card inset 52px (horizontal). Section gaps 18–32px. List row padding 15–24px.

---

## Screens / Views

### 1. Landing (`Amanah.dc.html`)
- **Purpose:** marketing hero; route users to the app.
- **Layout:** centered card. Top bar: wordmark left (5-bar logo glyph + "amanah"), nav right
  (Protocol → Agent, Read the spec → Writing, Connect wallet → Connect, Dashboard → Dashboard).
- **Hero:** centered serif H1 "A verifiable guardian for every asset"; subtitle
  "Autonomous, compliant RWA treasury — every decision proven on-chain, 24/7".
- **CTAs (flex row, centered, gap 14px):**
  - Primary pill **"See it reason"** (black `#15120e`) → `Agent`.
  - Secondary outline pill **"Open dashboard"** (border `#d8d2c4`) → `Dashboard`.
- **Animated wave:** a `<canvas>` (1480×560) under the CTAs rendering a flowing 3D "silk ribbon"
  in gold↔blue with a white sheen — see Interactions for the algorithm.
- **Footer strip:** eyebrow "BUILT ON THE CASPER TRUST LAYER" + logo row
  (Casper, CSPR.cloud, Claude, x402, IPFS).

### 2. Connect (`Connect.dc.html`)
- **Purpose:** wallet / email sign-in.
- **Layout:** two columns. Left: heading "Connect to amanah", three wallet rows
  (CSPR.click, Casper Wallet, Ledger — each 62px, icon + label + chevron, hover `#faf8f3`),
  an "or" divider, email input + black "Continue with email" button, and a
  "Request testnet access" link. Right: rounded gradient panel (`blob-cool.png`) with a glass
  card (backdrop-blur 18px) reading "Proof, not promises."

### 3. Agent console (`Agent.dc.html`)
- **Purpose:** live view of the current decision cycle.
- **Header:** pulsing green dot + mono "CYCLE #4,218 · LIVE · CASPER-TEST", H1 "Agent console".
- **Metric cards (4, flex):** Treasury value $12.84M, Risk score 0.34, Reputation 948,
  Attestations 4,218.
- **Left:** Portfolio allocation stacked bar (42/33/18/7) + asset rows (Gold/T-bond/WTI/CSPR
  with price + weight); Guardrails chips (Cap $500K/tx, Daily limit $2M, Allowlist 3, Principal
  locked, Compliance Valid) each with a green check.
- **Right:** "PROOF-OF-REASONING" panel — numbered step stream (INGEST → SETTLE x402 → REASON →
  DECISION → ATTEST → GUARDRAIL → EXECUTE) with colored mono tags; footer shows the blake2b
  reasoning hash. "verify on cspr.live ↗" link top-right.
- **Bottom:** decision banner (gradient) "Reallocate 4.2% yield → US T-bond", confidence 0.91.

### 4. Audit dashboard (`Dashboard.dc.html`)
- **Purpose:** treasury overview + public audit trail.
- **Header:** mono "TREASURY 0x4f9a…c2e1 · CASPER-TEST", H1 "Audit dashboard",
  "Open on cspr.live ↗" button right.
- **Banner:** Total treasury value $12,840,219 + Yield(30d) +$184K, Principal locked $11.9M,
  Reputation 948.
- **Left:** Holdings list (Gold/T-bond/WTI/CSPR with sub-line, value, % change colored
  green/red); Compliance status trio (Vault Valid ✓, Allowlisted 3/3, Daily limit used $420K/$2M).
- **Right:** On-chain audit trail — rows for Reallocate / Attestation / x402 settlement /
  Escalated, each with icon tile, mono deploy hash (blue), colored status, time; each row links
  to `https://cspr.live`. Footer "View all 4,218 deploys on cspr.live ↗".

### 5. Writing (`Writing.dc.html`)
- **Purpose:** engineering blog / spec index.
- **Layout:** hero ("Notes on building trust you can verify"); left featured card over
  `blob-warm.png` with gradient scrim; right article list (date / title / excerpt / colored tag).
  Bottom: dark newsletter block with email capture + circular gradient (`blob-cool.png`).

---

## Interactions & Behavior
- **Nav + CTAs** are anchor links between the five pages (and external `cspr.live`). In React use
  router links.
- **Hero wave animation** (canvas, ~60fps via `requestAnimationFrame`, with a `setInterval(~90ms)`
  fallback so it keeps drawing when the tab throttles rAF; draw once immediately on mount):
  - A horizontal ribbon sampled at N=150 points across width. For each point at `u=i/N`:
    `ang = u·2π·2.15 + phase`; centerline
    `cy = H·0.50 + H·0.205·sin(ang+0.4) + H·0.065·sin(2·ang+1.1+phase·1.25)`;
    thickness `th = H·(0.155 + 0.105·(0.5+0.5·cos(ang+0.9)))`, tapered to 0 at both ends via
    smoothstep over the first/last 4%.
  - Fill the band with a horizontal gradient whose color is gold `rgb(247,200,96)` blended toward
    blue `rgb(86,158,244)` via two travelling gaussian hotspots centered near u=0.30 and u=0.62
    (centers drift with `phase`). Add a blurred white sheen band in the upper third and a blurred
    gold under-shadow band at the bottom for the 3D look. `phase = elapsedMs·0.00020`.
  - In production this can also be a WebGL shader; the look = luminous silk, gold with two blue
    twists and a white highlight ridge.
- **Pulse dot:** `@keyframes` opacity 1→.25→1 over 1.8s (live indicators).
- **Hover:** wallet rows + buttons darken/tint slightly; keep transitions ~150ms.

## State Management
The prototypes are mostly static. Real implementation needs:
- **Auth/wallet:** connection state (provider, address, status) via CSPR.click.
- **Treasury data:** holdings, total value, yield, risk score, reputation — fetched from
  CSPR.cloud / contract reads (poll or SSE per cycle).
- **Reasoning cycle:** current cycle steps + hash, decision, confidence (live feed).
- **Audit trail:** paginated deploy list with statuses, each linking to cspr.live.
- **Compliance/guardrails:** vault status, allowlist count, daily-limit usage.

## Tweakable props (from the prototype, optional to keep)
Landing exposes: `waveHue` (hue-rotate the wave), `showStack` (toggle logo strip),
`ctaColor` (Black/Gold/Blue). Treat as theme options, not required.

## Assets
Generated gradient rasters (in `assets/`), all decorative — reproduce as images or CSS gradients:
- `wave2.png` — static fallback of the hero silk wave (the live version is the canvas above).
- `blob-cool.png` — gold/blue soft mesh (Connect panel, newsletter circle).
- `blob-warm.png` — gold/amber soft mesh (Writing featured card).
Icons are inline SVG (logo glyph, chevrons, asset swatches, check marks). No icon font required.
Fonts: Newsreader, Manrope, JetBrains Mono (Google Fonts).

## Files
- `Amanah.dc.html` — Landing (animated hero). Canvas algorithm lives in its logic class.
- `Connect.dc.html` — Sign-in / wallet connect.
- `Agent.dc.html` — Live agent console (proof-of-reasoning stream).
- `Dashboard.dc.html` — Audit dashboard (holdings + on-chain trail).
- `Writing.dc.html` — Blog / spec index.
- `support.js` — prototype runtime ONLY; do not port.
- `assets/` — gradient images.

> Note: `Amanah (ASCII hand).dc.html` (an earlier ASCII-art direction) is **not** included — it was
> superseded by the current landing page.
