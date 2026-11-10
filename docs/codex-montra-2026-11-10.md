# Codex brief: Launch on Montra (2026-11-10)

Backend is on `terminal-router`. API: docs/terminal-api.md § Launch on Montra.
Not live until the adapter factory is deployed and Railway has `MISTHRA_MONTRA_ADAPTER_FACTORY`;
until then `capabilities.montraLaunch.available` is false with a reason — show that reason.

## 1. Launch screen (`/launch`, new tab "Launch on Montra")
- Form: name, ticker, description, logo URL (or upload → IPFS if you already have it), socials,
  config picker from `GET /api/montra/options` (show total fee and Montra's/LP's share in plain
  words), optional first buy in HYPE (native configs only), and the router buckets editor you
  already have.
- Show the launch fee from `options.launchFee` and the total the wallet will send.
- "Review" calls `POST /api/montra/launch/plan`, shows router/adapter/token addresses and the
  three steps. "Launch" sends `steps[i].tx` in order with the connected wallet, waiting for each
  receipt, with a stepper (Create router → Launch → Connect fees). Keep the plan in state; don't
  re-plan mid-way. If a step fails, offer "Retry this step" with the same tx.
- After step 3: link to the coin on the terminal and to the router page.
- Footer note: "Launched through Misthra on Montra. Montra's fees apply. Contracts are
  unaudited; start small."

## 2. Switch an existing Montra coin
- On the router page / coin page, if the coin's pad is Montra and the signed-in wallet is its
  creator: "Route this coin's fees through Misthra" → `POST /api/montra/switch/plan` → 3 steps.
- Before step 2 show: "Claim any fees Montra already owes you first; after this they go to your
  router."

## 3. Collect button
- Router page, for routers whose `launchpadAdapter` is non-zero: "Collect Montra fees" sends
  `collectAndForward()` (selector from the ABI, `0x` + keccak of `collectAndForward()`) to the
  adapter, then the normal sync. Anyone can press it.

Don't: hold keys, auto-sign, hide the Montra fee, or call it a partnership.
