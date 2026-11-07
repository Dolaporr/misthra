# Brief for Codex: Misthra three-in-one frontend

> **Status 2026-11-08:** the first version of everything in "Your scope" below is built on `terminal-router` (Pulse, coin sheet, Launch wizard, Alerts, three-in-one nav and Home hub), checked in a browser at desktop and phone widths. Use the scope as the description of what exists. New work is under **Next frontend tasks** at the end.

Date: 2026-11-08. Branch: cut `codex/terminal-ui` from `terminal-router`, PR back into `terminal-router`.
Read `AGENTS.md` first (product, honesty rules, file ownership), then `docs/terminal-api.md` (the API you build against) and `DESIGN.md` (visual system, which stays).

## Catch-up: what happened today

1. Misthra started as an Errand-style **agent work exchange** (missions, agents, pay on accept, simulated HYPE). It works locally and stays as the **Agents** section.
2. A plain port of Errand to Elysium was judged weak: Elysium has no idle agents. Elysium is built for trading and launchpads.
3. Decision: make Misthra a **three-in-one**: a **Terminal** (Axiom-style, design learned from Blix Trade), **Launch** (a fee router ported from Sinjoh), and **Agents** (the original exchange). They share one wallet session, one design system and one launches table.
4. Done on `terminal-router`: the Sinjoh fee router is ported to Elysium (`contracts/router/`, WHYPE instead of WETH, solc 0.8.28, 13 passing local-EVM tests). The lockfile now installs on Linux.
5. In progress (Claude): the Elysium launch indexer and the API in `docs/terminal-api.md`. Until it lands, build against `fixtures/launches.sample.json`.

## Your scope: `src/` only

### 1. Navigation and home
- Top-level nav: **Terminal** · **Launch** · **Agents** · **Alerts**. Existing mission/agent/inbox/account routes stay under Agents and keep working.
- Home becomes a short hub that sends people into the three sections. Keep the figure film and the dark chrome. Copy must not call Misthra only an "agent work exchange".
- The network strip shows `simulated` or `live` from the API's `source`.

### 2. Terminal: Pulse (`#/terminal`)
- Three columns: **New pools**, **Final stretch**, **HyperCore**. Use the stage definitions in `docs/terminal-api.md`, and show those definitions in a tooltip or help line. Do not use bonding-curve language.
- Card: symbol, name, pad badge (or "Unknown pad"), age, mcap, liquidity, 5m volume, holders, top-10 %, traction score, AI grade (or "Not read"), safety status, router badge when `router` is set, and a **Buy** button.
- Per-column filters: pad, minimum liquidity, minimum holders, maximum age, hide failed safety. Search across columns. Keyboard: `/` focuses search, `j`/`k` move, `Enter` opens.
- Desktop: three columns side by side. Phone: column tabs, one column at a time. That is a deliberate mobile design, not a squeezed desktop.
- Poll `GET /api/launches` every 3s now (SSE `/api/stream` later); pause polling while the tab is hidden.

### 3. Coin sheet (`#/t/:address`)
- Header with links (explorer, pool, pad), price and changes.
- Chart from `/candles`: a lightweight canvas or SVG candle chart. Don't add a heavy charting dependency without saying so in the PR.
- Safety checklist (each check with its result and detail), traction reasons (`up`/`down`), AI read panel (honest empty state), holders with tags, recent trades.
- **Trade panel:** amount presets in HYPE (0.1 / 0.5 / 1 / 5), slippage, quote from `POST /api/trade/quote`. If `tx` is present, send it with the injected wallet (`eth_sendTransaction`); otherwise show `reason` and offer a clearly labelled **paper** fill. No stop-loss.
- If the launch has a router, show its buckets.

### 4. Launch (`#/launch`): router wizard
Steps: what the router does (plain language) → choose buckets (creator wallets / native HYPE / buyback-and-burn) with bps that must total 100% → wallets inside a bucket, each with an "editable later" toggle → review: predicted router address from `POST /api/router/plan`, the 1% protocol fee stated, and `steps` → deploy (sign `deployTx`) → "Set this address as your fee recipient on your launchpad" with copy buttons → bind the token after launch.
A router status page `#/launch/:router` reads `GET /api/router/:address`, including what a keeper can run now.

### 5. Alerts (`#/alerts`)
Rules from `POST /api/alerts` (new launch matching a pad, volume, age or holders filter; stage change on a token; wallet activity). Events list. Requires the existing wallet session.

## Rules
- Follow `DESIGN.md`. Reuse `src/glass.css` materials and existing UI components (`src/components/ui.tsx`).
- Every view shows `simulated` when `source === 'simulated'`. No invented numbers, grades or holders. Empty and unavailable states are real states.
- Accessible: real buttons and links, labels, focus states, `prefers-reduced-motion`.
- Types: add the contract types to `src/types.ts` exactly as written in `docs/terminal-api.md`.
- Blix (github.com/blixvip/blixtrade, MIT) is a reference for layout and interaction. If you copy code from it, follow the licence rule in `AGENTS.md`.
- `npm run build` must pass. Keep commits small. In the PR, list anything you needed from the API that is missing (`TODO(api)`).

## Done when
Pulse, the coin sheet, the Launch wizard and Alerts render from the fixture or API at desktop and phone widths; Agents still works; the build passes; and the PR describes what you checked.

## Next frontend tasks (open)

1. **Live updates over SSE.** Replace Pulse polling with `/api/stream` (`launch`, `update` events), with polling as the fallback.
2. **Per-column filters.** Today one filter set applies to all three columns; Axiom-style P1/P2/P3 presets per column.
3. **Router status page** `#/launch/:router`, once the backend adds `GET /api/router/:address` (`TODO(api)`).
4. **Paper desk view.** `GET /api/paper/positions` exists; show positions and PnL on the coin sheet and a small desk page.
5. **Chart polish.** Crosshair with OHLC readout, price axis labels, and keyboard access to timeframes.
6. **Accessibility pass.** Screen-reader review of Pulse cards and the trade panel; focus order in the Launch wizard.
