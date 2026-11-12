# Misthra for builders

Misthra (https://misthra.com) runs on Elysium mainnet (chain 99901). It has two parts:

1. **A launch terminal.** One live feed of new coins across Elysium launchpads, with charts, holders, alerts and trading.
2. **Fee routers.** A creator points their launch fees at a contract that pays their team and treasury and can fund buyback and burn. It works on any pad that can send fees to an address.

Misthra never holds keys. Every transaction is built by the server and signed by the user in their own wallet.

## Is it built on Uniswap?

Yes. Misthra does not run its own AMM or pools.

- **Trading** goes through Elysium's canonical Uniswap v3 deployment (SwapRouter02 and QuoterV2), wrapped by `MisthraTradeGateway`, which takes a 0.75% fee in HYPE in the same transaction (hard cap 1%).
- **Fee routers** use Uniswap v3 when they need to swap: the launched token into WHYPE, or WHYPE into the token for buyback and burn. A shared TWAP price guard prices those swaps.
- **The feed** reads Uniswap v3 `PoolCreated` and Uniswap v4 PoolManager `Initialize` and `Swap` events. v4 launchpads (Montra, Ascend, Volta, ElysPump) are recognised by their hook address.
- **v4 coins** show in the feed but are not traded through Misthra yet. Each one links to its launchpad.

## Contracts (Elysium mainnet, deployed 2026-11-08)

No owner or admin functions. The deployer keeps no control. **Unaudited: start with small amounts.**

| Contract | Address |
|---|---|
| MisthraTradeGateway | `0x0f8a2Ef4e008B4b72FC4a18019e746b69072F678` |
| MisthraFeeRouterFactory | `0xB282b39a0b168d7409Fba1F0B149da6eEE08FFfd` |
| MisthraFeeRouter (implementation) | `0x8ab909257af7c5efb118e1dc1944684b4c144811` |
| MisthraV3SwapAdapter | `0x0c288F86cB06DbD1f85578f9fFf1D7e1F05eAC7d` |
| MisthraSharedV3TwapPriceGuard | `0x3DDD50BebCe1ff866055A0D7F2F82433b24C7DE1` |
| Treasury (fee recipient) | `0xC43eB4113BFb7267D54e1592743f24f53a774128` |

Uniswap on Elysium as used by Misthra: WHYPE `0xbA876237B0F021A6c6D852d6c26E107997cC5E81`, V3 Factory `0x1707327F626496A7b5b3872e7E4d2879Df7d7a9f`, SwapRouter02 `0x2d01411773c8C24805306E89A41F7855C3c4Fe65`, QuoterV2 `0x204FAca1764B154221e35c0d20aBb3c525710498`, V4 PoolManager `0xE2e105d3F7209A9DA11f83cCf3E7398a753823F1`.

## How a fee router works

- Each router is a minimal clone made by the factory. Its address is known before it is deployed, so a creator can paste it into a launchpad's fee field first.
- A creator sets buckets that add up to 100%: wallets paid in HYPE (up to 16 per bucket), wallets paid in WHYPE, and buyback and burn.
- The router accepts fees in native HYPE, WHYPE, or the launched token (on Uniswap v3).
- Anyone can call `sync` and process buckets. Payouts are pulled by each wallet or pushed by anyone, so nobody has to trust a keeper.
- The router binds to one token, once. A launchpad adapter named at creation can do that binding for the creator.
- Misthra takes a fixed 1% protocol fee on what the router receives.
- Everything shown on a router page comes from confirmed chain state, never from summed events.

## Launchpad integrations

| Pad | How fees reach a router | Status |
|---|---|---|
| Montra (v4 hook) | Fees are held by the hook and claimed by the recipient. A small Misthra adapter is the recipient: anyone can call `collectAndForward()` to claim and send to the router. | Built and tested. Adapter factory deploying soon. |
| Any pad with a fee address field | Paste the router address. | Works today. |
| Others | Depends on the pad: push or claim, set at launch or later. | Send us your launcher address and fee flow. |

**Launch on Montra** (once the adapter is live): the creator signs three transactions from Misthra: create the router, launch on Montra with the adapter as fee recipient, then activate. A coin already on Montra can move its fees to a router the same way. Launches carry Misthra's Montra builder code once it is registered.

## Public API (base `https://misthra.com/api`)

Full reference: `docs/terminal-api.md` in the repo.

- `GET /capabilities`: what is live right now and why anything is off, plus the deployed commit.
- `GET /launches`: the feed. Filters by stage, pad and search. Cursor paging, up to 200 per page.
- `GET /launches/:address`: one coin with candles, trades and holders.
- `GET /stream`: server-sent events (`launch`, `update`, `alert`), replayable with `Last-Event-ID`.
- `POST /trade/quote`: an unsigned trade with exact amounts, a minimum out, a 20 s expiry and a 120 s deadline. Sells come with an approval for the exact amount, never unlimited.
- `POST /router/plan`: a predicted router address and its unsigned deploy transaction.
- `GET /router/:address`: a router's full state from chain.
- `POST /router/:address/prepare`: an unsigned, simulated transaction for any router action.
- `GET /montra/options`, `POST /montra/launch/plan`, `POST /montra/switch/plan`: Launch on Montra.
- Images: IPFS artwork is served from `/api/img/ipfs/<cid>` through several gateways with caching.
- Dollar values use Hyperliquid's HYPE mid price, refreshed every 30 s. When the price is stale, dollar figures are null instead of a guess.

## For launchpads and aggregators

- **Partner links:** send creators to `https://misthra.com/#/launch?ref=<your-id>&creator=<0x…>&pad=<pad>&returnUrl=<your https url>`. Routers planned this way are attributed to you, and your site can call the public endpoints directly.
- **Getting indexed:** send your launcher address, the event or hook your launches emit, and how token name, symbol and image are passed.
- Attribution is a record. There is no revenue share unless agreed separately.

## Safety notes

- Contracts are unaudited. Use small amounts until they are.
- Misthra never asks for or stores private keys.
- Every trade and router action is simulated before it is offered for signing.
- The server never exposes its RPC URL to browsers.

## Contact

- Site: https://misthra.com
- X: [@misthraxyz](https://x.com/misthraxyz)
