# Codex brief: Elysium mainnet reality (2026-11-08, evening)

Pull `terminal-router` first. Read `AGENTS.md` (updated) and `docs/elysium-mainnet.md` (new). This brief says what changed today on the backend and what the frontend should do about it. Stay in `src/` and `public/`; ask for API fields with `TODO(api)`.

## What we learned today

1. **Mainnet is chain 99901.** Uniswap and WHYPE addresses are in `docs/elysium-mainnet.md` (community-verified; the deploy dry run re-checks them).
2. **Most coins are on Uniswap v4, not v3.** Montra and Boxa are ~78% of all coins, both v4; ElysPump and Volta are v4 too. Supercolony, Citadel, ArkhamPad and BunnyPad use locked v3 pools. Kleos is curve → v3. Ascend is curve → Pancake Infinity with USDC pairs.
3. **Creator fees arrive as native HYPE**, pushed to the recipient, and the recipient can be a contract (one pad dev confirmed; Montra's docs say the same). So **native HYPE is the normal case**, WHYPE the exception.
4. **Misthra's buy/sell gateway only trades canonical v3 pools.** v4 coins (Montra etc.) can be shown and researched, but not bought through Misthra yet. A Universal Router (v4) route is the next backend job.
5. **The fee router works on v4 pads** for wallet splits. **Buyback-and-burn does not** (it swaps on v3 only). `GET /api/router/pads` now says `buyback: 'no'` for Montra, Boxa, ElysPump, Volta and Ascend.

## API changes (all in `docs/terminal-api.md`)

On every `Launch`:
- `pool.venue` can now be `'uniswap-v4'`; `pool.poolId` (v4 id, null for v3); `pool.quote` is `'HYPE'` or `'WHYPE'` (was always `'WHYPE'`); `links.pool` is null for v4.
- **New `trade: { misthra: boolean, reason: string | null, venueUrl: string | null }`.** Use it to decide the Buy/Sell panel before any quote:
  - `misthra: true` → current flow (quote → approvals → sign).
  - `misthra: false` → don't show a working Buy button. Show `reason` (already user-ready, e.g. "This coin trades on Uniswap v4, which Misthra cannot route yet. Trade it on Montra.") and, if `venueUrl` is set, a "Trade on {pad.name}" link that opens in a new tab.
  - Simulated launches return `misthra: false` with "Simulated launch: paper trading only." Keep paper trading as it is for those.
- **New `feeRecipient: string | null`**: the creator-fee recipient named in the launch event (Montra only for now). On the coin sheet, if it equals a known Misthra router, say "Fees routed by Misthra"; otherwise you may show "Creator fees go to 0x12…ab" with an explorer link.
- `pad` is now set for simulated launches too, and for Montra launches on mainnet. Real v3 launches from pads whose launcher address we don't know yet still come back with `pad: null`.
- Liquidity on v4 pools is an estimate (active liquidity at the last swap). Label it "Liquidity (est.)" when `pool.venue === 'uniswap-v4'`.

## Frontend tasks, in order

1. **Native HYPE default on Launch.** Make "HYPE wallets" (native) the default enabled bucket. Rename the other "Wrapped HYPE (WHYPE) wallets" with a one-line note that most people want native HYPE. Use the same names in the summary card.
2. **Buyback availability per pad.** You already disable buyback when the selected pad's `buyback` is `'no'`; Montra is now in that list, so check the message reads well for the biggest pad. Suggested: "Buyback-and-burn isn't available on {pad} yet (Uniswap v4). Wallet splits work."
3. **Trade panel uses `trade`** as above. Never show a live Buy for `misthra: false`.
4. **"Pad not detected"** instead of "Unknown pad" when `pad` is null.
5. **v4 badge.** A small "v4" chip next to the venue on the coin sheet and Pulse card helps users understand why Buy is off.
6. **Live vs simulated stays loud.** When Railway switches to live (env vars after the contract deploy), the feed source becomes `live`. Keep the banner logic driven by `source`, not by environment guesses.

## Done on the backend today (don't redo)

- `index.html` now has the fee-control title, description, Open Graph and Twitter tags, and `public/og.png` (1200×630). If you change the home hero, regenerate `og.png` to match.
- The simulated feed always assigns a pad.
- Origin check allows the site's own host, so misthra.com and the Railway URL both load.
- Montra indexing (TokenLaunched + v4 Swap), the mainnet pad file `chain/pads.mainnet.json`, and deploy-time Uniswap address checks.

## Not decided / don't promise in the UI

- No partnership or revenue-share terms with any pad. Say "compatible", not "partner".
- Agora route: still off until its API fields are verified.
- HyperCore execution: not before Kinetiq ships the hooks (~4 weeks after mainnet).
