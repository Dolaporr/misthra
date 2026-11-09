# Codex brief: partner deep link (2026-11-09, launch day)

Pull `terminal-router`. Agora wants to offer "Route fees with Misthra" in its launch flow. Backend is done (`docs/terminal-api.md` § Partners, `docs/partners.md`). Your part is the Launch page and router page. Stay in `src/`/`public/`; PR into `terminal-router`.

Do this **before** the remaining items of `codex-mainnet-2026-11-08.md` only if those are already merged; otherwise finish task 3 there (trade panel driven by `launch.trade`) first, because the live site shows v4 coins now.

## Deep link

`https://misthra.com/#/launch?ref=agora&creator=0x…&pad=montra&returnUrl=https%3A%2F%2Fagoradex.app%2F…`

All parameters optional. Read them from the hash query (`#/launch?…`), not `window.location.search`.

## Tasks

1. **Read and pre-fill.** `creator` → pre-fill the creator wallet; `pad` → pre-select the launchpad if it is in `/api/router/pads`. Ignore invalid values quietly (bad address, unknown pad).
2. **Partner banner.** Resolve `ref` with `GET /api/partners`. Known: a small banner "Setting up for {name}" with the partner's link. Unknown `ref`: drop it (don't send it to the API, which would answer 400).
3. **Send attribution.** Include `ref` and `returnUrl` in `POST /api/router/plan`. Keep the response's `ref` and `returnUrl` in state.
4. **Creator must sign.** If a wallet is connected and differs from `creator`, say so before the deploy step ("This setup is for 0x12…ab. Connect that wallet to deploy.") and don't build the deploy with the wrong `from`. The plan's `deployTx.from` is the creator.
5. **Back to partner.** After the deploy transaction's receipt is confirmed, show a primary button **"Back to {name}"** that opens `plan.returnUrl` with `router=<predictedAddress>` appended via `URL.searchParams.set`. Use **only** `plan.returnUrl` (the server has checked it is https on the partner's own hosts), never the raw query value. Never redirect automatically; the creator clicks. Also show the router address with a copy button for creators who'll paste it by hand.
6. **"via {name}" on router pages.** `GET /api/router/:address` now has `referredBy: { id, name } | null`; show a quiet badge.
7. **Tests:** a deep link with all params pre-fills and sends `ref`/`returnUrl`; an unknown `ref` is dropped; a hostile `returnUrl` never becomes a link (the server returns null; assert the button is absent); a wallet mismatch blocks the deploy step.

## Not in scope

Revenue share or partner payouts: none exist. Copy must not promise any. "Compatible with {pad}" is fine; "official partner" is not, unless the owner says so.
