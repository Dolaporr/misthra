# Elysium landscape (as of 2026-11-08)

Working notes on projects that affect Misthra. "Verified" means read on the project's own docs page; everything else is from third-party write-ups and must be checked before use.

## Agora: two different projects share the name

| | agoradex.app (@agora_elysium) | agora.cx (@AgoraElysium) |
|---|---|---|
| What | Launchpad aggregator: 14 pads plus any Uniswap v2/v3/v4 pool, limit orders, LP, bridging, launching | Terminal routing through one `AgoraRouter` with per-pad adapters |
| Fee | Not on the overview page (separate Fees page) | 0.75% per routed trade in HYPE, capped at 1% on-chain, paid in the same transaction (verified) |
| Builder program | Live: claim a code, pass `ref` on `/quote`, earn 30% of Agora's fee in HYPE, users get 10% off (verified, developers.agoradex.app) | Planned only, tied to an unlaunched token (verified) |
| API | `https://api.agoradex.app/api/v1`: tokens, candles, trades, holders, bubbles, wallets, `/quote` with ready-to-sign tx; free keys, 300 req/min (verified) | `/api/contracts`, `/api/status` only (verified) |
| Chain ID used | 99901 (their docs) | Testnet 99801 only |

Misthra uses agoradex.app as a second trade route (`chain/agora.mjs`), off by default.

## Ascend

Kinetiq's partner launchpad. Launches into locked liquidity via a Uniswap v4 hook; creator fee share rises with market-cap bands; buybacks and a path toward HyperCore listing. Contract addresses circulating (Launchpad hook, EscrowFactory, SeatFactoryV5, TokenFactory, v4 PoolManager) are **not verified** here. Misthra's indexer does not read Uniswap v4 yet; Ascend coins are reachable through the Agora route.

## Kalos

Swaps, concentrated liquidity, NFT marketplace, social and points in one app; $KALOS after a points season. No verified contract addresses. Not an integration target for now.

## Fees on Elysium

Agora (agora.cx) charges 0.75%. Misthra's gateway launches at 0.75% to match.
