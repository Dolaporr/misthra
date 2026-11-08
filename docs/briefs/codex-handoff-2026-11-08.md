# Codex handoff: current state and your tasks (2026-11-08)

Read `AGENTS.md` first, then this file. It replaces the "Your scope" section of `docs/briefs/codex-frontend.md`; that file's descriptions of the existing screens are still accurate.

## Where things stand

Branch `terminal-router` has everything. All of it works locally on a labelled simulated feed (`npm run dev`); nothing is deployed and no contract is on Elysium yet.

| Piece | State |
|---|---|
| Fee router (`contracts/router/`) | Ported from Sinjoh (Apache-2.0), WHYPE instead of WETH, shared TWAP guard for buyback-and-burn. Tested on a local EVM. Unaudited. |
| Trade gateway (`contracts/trade/MisthraTradeGateway.sol`) | Buys/sells through Uniswap SwapRouter02 and takes a fixed **0.75%** fee in HYPE in the same transaction (capped at 1% in the contract). Tested, including server-built transactions executed on-chain. |
| Indexer (`indexer/elysium.mjs`) | Uniswap v3 pools quoted in WHYPE, several factories and WHYPE addresses, swaps, transfers (holders), router bindings, safety probes. |
| API (`server/terminal/`) | Contract in `docs/terminal-api.md`. Quotes go: Misthra gateway (our fee) → Agora route (builder code) → labelled simulation. |
| Agora route (`chain/agora.mjs`) | Uses agoradex.app's public API with a builder code (30% of Agora's fee to us). Every transaction target and approval spender must be on an allowlist. **Off** until the amount fields are checked against Agora's OpenAPI spec. |
| Frontend | Terminal (Pulse), coin sheet with trade panel, Launch wizard, Alerts, three-in-one nav. Checked at desktop and phone widths. |
| Deploy | `Dockerfile`, `railway.json`, `docs/deploy-railway.md`; contracts via `npm run deploy:contracts` (dry run by default). |

## Positioning change (decided)

Misthra leads with **fee control for Elysium launches**: the Launch section (fee router) is the headline product. The Terminal stays as the companion that finds coins and trades them. Agora (agoradex.app) is a partner, not a rival: it owns "one feed, best price across pads"; we add the layer that controls where a launch's fees go. Do not describe Misthra as "the best aggregator" or compare it against Agora in copy.

The product name may still change. Keep the brand name in as few places as possible (one constant or the existing brand component) so a rename is cheap.

## Your tasks (frontend: `src/`, `public/`)

Work on a branch `codex/<task>` cut from `terminal-router`, one PR per task back into `terminal-router`.

1. **Launch-first navigation and home.** Nav order: Launch · Terminal · Agents · Inbox · Alerts. Home hero leads with fee control for launches (what a router does in one sentence, a primary "Set up a fee router" action, secondary "Open the terminal"). Keep the figure film and dark chrome. Keep copy plain; no hype words.
2. **Agora route in the trade panel.** Quotes now carry `via: 'misthra' | 'agora' | 'simulated'` and `approvals: Tx[]` (`docs/terminal-api.md`). Show which route a quote uses ("Misthra" vs "Agora best price"), show each approval as its own step with progress (step 1 of 2…), and keep the fee row honest when `feeHype` is null ("Included in the quote").
3. **Launch wizard polish.** Add a "Which launchpads support this?" panel from `GET /api/router/pads` (see `docs/terminal-api.md`): usable pads first, each with its note; say plainly that the list comes from the pads' docs and is not yet confirmed on-chain. If the user only picks pads where `buyback` is `no`, hide or disable the buyback-and-burn bucket with the reason. Add a preview line per bucket showing what 1 HYPE of fees becomes (after the 1% protocol fee).
4. The open tasks in `docs/briefs/codex-frontend.md` → "Next frontend tasks" (SSE live updates, per-column filters, paper desk view, chart crosshair, accessibility pass), in that order, as time allows.

Claude is doing in parallel (do not touch these files): a partner API for embedding the router planner on other sites (CORS, attribution), `GET /api/router/:address` for the router status page, and verifying the Agora field mapping. When the router status endpoint lands, task "Router status page" in the old brief becomes yours.

## Rules that still apply

- Every number is live or visibly labelled simulated. No invented grades, prices or holders.
- Misthra never holds keys. Every trade or deployment is signed in the user's own wallet.
- No stop-loss or anything that needs someone to act while the user is away.
- `npm run build` and `npm test` must pass. Check every change at a phone width.
- Do not put partner names, people or deal terms in code comments or docs beyond what is already public.
