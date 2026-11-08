# Trading wallet: proposal (not built)

Status: **proposal for agreement between the owner, Claude (backend) and Codex (frontend).** Nothing here ships until all three agree. `/api/capabilities` reports `wallet.tradingWallet.available: false` until then.

## Goal

Some users want a separate "trading wallet" for fast terminal trades, so their main wallet isn't exposed to every quick buy. Ordinary external wallets (MetaMask, Rabby…) must keep working exactly as now, and Misthra must never silently create a second wallet.

## Hard rules

1. **No server ever touches a key.** No Misthra endpoint generates, receives, stores, logs or returns a private key, seed phrase, keystore or encrypted key blob. The backend only ever sees public addresses and signatures.
2. **No custodial key service**, including "encrypted at rest on our server" variants.
3. **No plaintext keys in browser storage** (localStorage, IndexedDB, cookies, URL, logs).
4. **Opt-in only.** The user explicitly chooses "Create a trading wallet"; it is never created as a side effect of connecting.
5. **Every transaction is shown and approved** by the user. A quick-buy preset changes the amount, never the authorization.

## Recommended architecture: a vetted embedded wallet SDK

Use an established embedded-wallet provider whose keys are generated and held inside its own isolated boundary (an iframe on the provider's origin and/or MPC/secure enclave), and which exposes a standard EIP-1193 provider to our page. Misthra integrates it like any other wallet.

- **Key generation and export** happen inside the provider's UI and origin. Misthra code never sees the key material, so a bug or compromise of misthra.com cannot read it.
- **Backup/export:** the provider's own "export private key / recovery phrase" screen, behind its own re-authentication. We link to it; we do not render the key.
- **Recovery and device loss:** the provider's recovery (email/passkey/social factor) restores access on a new device. The onboarding must state plainly what recovers the wallet and that losing every factor loses the funds.
- **Session locking:** the provider's session timeout and re-auth for signing. Our UI shows locked/unlocked from the provider's state.
- **Chain:** the provider must support custom EVM chains (Elysium 99901, HYPE gas). This is the first thing to verify for any candidate.

Rejected alternative: generating a key in our own page JavaScript and encrypting it with a user password in IndexedDB. It is possible but puts the whole security burden on our code and any script that ever runs on misthra.com; we should not build that.

## Signer selection

- The session tracks **which signer** is active: `external` or `trading`. Both are just EIP-1193 providers to the frontend.
- The identity session (cookie) is tied to an address that has signed in. If the user switches signer, they sign in with that address; the server never assumes two addresses belong to the same person.
- Quotes are built for `wallet` = the active signer's address; the UI refuses to sign if the connected account is not `tx.from` (see quick-buy flow in `docs/terminal-api.md`).

## Funding

"Fund your trading wallet" shows the trading wallet's **public address** with a copy button and QR, and offers a transfer **from the external wallet** as a normal transaction the user signs. No bridging or on-ramp claims until one is actually integrated.

## Backend contract (only public data)

- `GET /api/capabilities` → `wallet.tradingWallet: { available, reason, provider?: { id, name } }`.
- No new endpoints are needed for keys. If we later store a user's chosen label for their trading address, it is public metadata keyed by the signed-in address.

## Open questions for the owner

1. Which embedded-wallet provider (cost, Elysium support, export UX)? Claude can shortlist and check custom-chain support.
2. Do we want this before or after the first public launch? Recommendation: after; launch with external wallets only.
