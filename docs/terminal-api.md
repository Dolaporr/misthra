# Terminal, Launch and Alerts API contract

Shared contract between the backend (Claude) and the frontend (Codex). Base path `/api`, JSON, cookie session as today (`credentials: 'include'`). Amounts are **decimal strings** in HYPE (18 decimals) unless named `*Usd`. Times are Unix milliseconds. Addresses are lowercase hex.

Liquidity is the HYPE side of the pool counted twice, a common convention. For Montra (Uniswap v4) pools, which start with tokens only, the HYPE side is the HYPE buyers paid in minus what sellers took out (LP fees included), counted twice. Holder counts are exact only for tokens created inside the indexed range.

Until the indexer is connected to an Elysium RPC, every endpoint serves the simulated feed with `source: "simulated"`. The sample shapes live in `fixtures/launches.sample.json`.

## Stages (Elysium definitions)

| `stage` | Column label | Meaning |
|---|---|---|
| `new` | New pools | HYPE-quoted pool created in the last 6 hours that has not met the stretch criteria |
| `stretch` | Final stretch | Real traction: ≥ 25 holders **and** ≥ 50 HYPE 24h volume **and** liquidity ≥ 20 HYPE |
| `migrated` | HyperCore | Has a HyperCore spot market. Set from a reviewed list until Kinetiq's hooks ship; never inferred |

Pools older than 6 hours that never reach `stretch` drop off the Pulse but stay searchable.

## Types

```ts
type Source = 'live' | 'simulated';
type Check = { id: string; label: string; result: 'pass' | 'warn' | 'fail' | 'unknown'; detail: string };
type Safety = { status: 'pass' | 'warn' | 'fail' | 'unchecked'; checks: Check[]; checkedAt: number | null };
type Traction = { score: number; up: string[]; down: string[] };          // 0–100, reasons in plain English
type AiRead = { grade: 'A'|'B'|'C'|'D'|'F'; verdict: 'buy'|'watch'|'avoid'; summary: string; thesis: string;
                risks: string[]; model: string; readAt: number } | null;   // null = not read / AI not configured
type Pad = { id: string; name: string; url: string | null } | null;          // null = pool not attributed to a known pad
type Pool = { address: string;                       // v4: the PoolManager (shared by every v4 pool)
              venue: 'uniswap-v3' | 'uniswap-v4' | 'uniswap-v2'; fee: number | null;
              poolId: string | null;                  // v4 pool id; null for v3
              quote: 'WHYPE' | 'HYPE' };              // v4 pools can be quoted in native HYPE
// Can Misthra's own buy/sell route trade it? If not, say why and link the pad.
type TradeAvailability = { misthra: boolean; reason: string | null; venueUrl: string | null };
type RouterRef = { address: string; buckets: { label: string; bps: number }[] } | null;

type Launch = {
  address: string; name: string; symbol: string; decimals: number;
  image: string | null;          // https URL from the launch transaction (see Artwork); null when absent or unsafe
  pad: Pad; stage: 'new' | 'stretch' | 'migrated';
  createdAt: number; createdBlock: number; creator: string;
  pool: Pool;
  priceHype: string; mcapHype: string; liquidityHype: string;
  mcapUsd: string | null;        // mcapHype × usd.hypeUsd; null when the rate is missing/stale or there is no price yet
  volume5mHype: string; volume24hHype: string; txCount24h: number; traders24h: number;
  holders: number; top10Pct: number | null;           // % of supply in the 10 largest non-pool, non-burn holders
  change5mPct: number | null; change1hPct: number | null;
  traction: Traction | null; safety: Safety; ai: AiRead; router: RouterRef;
  links: { explorer: string; pad: string | null; pool: string | null };   // pool is null for v4
  trade: TradeAvailability;
  feeRecipient: string | null;                        // creator-fee recipient when the pad's launch event names it (Montra)
};
```

## Endpoints

### Artwork
`image` comes from the transaction that created the launch: pads like Montra pass name, symbol and image URL as arguments of the launch call. The indexer reads the ABI strings in that calldata and takes an image URL **only if the token's own name or symbol is among them**. Accepted: `https://` (no credentials), `ipfs://`, `ar://` (arweave.net), and an `image` field inside a JSON metadata string in the same call (ElysPump style). **IPFS images** (any `…/ipfs/<cid>` URL, whatever gateway the creator used) are served as `https://misthra.com/api/img/ipfs/<cid>`: the server fetches them once from several gateways at the same time (filebase, Pinata, ipfs.io, dweb.link), accepts only real PNG/JPEG/GIF/WebP/AVIF bytes (no SVG), caps size at 5 MB, caches on disk and serves with a one-year immutable cache. A missing image answers 404; use your fallback. Refused (→ null): `http://`, `data:`, `javascript:`, metadata JSON URIs (`…/metadata.json`, not resolved yet), malformed links. Non-IPFS images (pump.fun, Vercel, Irys…) are third-party URLs that Misthra does not fetch: render it with `referrerPolicy="no-referrer"`, a fixed box and a fallback for load errors. Launches indexed before artwork existed are backfilled in the background (20 per indexer step); when one gets an image the stream sends `update { address, image }`. A launch without artwork stays `image: null`; show a neutral placeholder, never another coin's image.

### Dollar values
Every feed response (`/api/launches`, `/api/launches/:address`) carries the rate it used:
`usd: { hypeUsd: string | null, source: string, fetchedAt: number | null, stale: boolean, maxAgeMs: number | null, reason: string | null }`.
- **Live:** `source` = `"Hyperliquid HYPE mid (api.hyperliquid.xyz allMids)"`, refreshed every 30 s. A rate older than 120 s is stale: `hypeUsd: null`, `stale: true`, `reason` says why, and every `mcapUsd` is null. There is no fixed or fallback rate.
- **Simulated preview:** `source: "simulated"`, a labelled simulated rate. Show the simulated label next to dollar figures.
- `mcapUsd` = `mcapHype` × `hypeUsd`, as a decimal string: cents (2 dp) for $1 and up, 3 significant digits below. It is `null` (never `"0"`) when the rate is unavailable or the launch has no trade price yet.
- **Market cap meaning (v3 and v4 alike):** last trade price × total supply (fully diluted; tokens in the pool included). It is not an estimate of liquidity; `liquidityHype` is separate (pool HYPE counted twice).
- When `mcapUsd` is null, show "—" with the reason on hover. Never put "$" on a HYPE number.
- `/api/capabilities` has `usdPrices: { available, reason, source, fetchedAt, maxAgeMs, simulated }`.

### Capabilities
- `GET /api/capabilities` (no session needed) → what is switched on right now. Every capability is `{ available: boolean, reason: string | null, ... }`; `reason` is user-ready text when `available` is false. **Unavailable** (shown here, endpoint answers 503) is different from **available with no records** (endpoint answers 200 with an empty list).
  Example (live, 2026-11-08):
  ```json
  { "source": "live", "chainId": 99901, "networkVerified": true,
    "wallet": { "external": { "available": true, "reason": null, "note": "Any injected EVM wallet…" },
                "tradingWallet": { "available": false, "reason": "Not available yet. A user-controlled trading wallet is being designed…" } },
    "venues": [ { "id": "uniswap-v3", "name": "Uniswap v3", "version": 3, "indexed": true, "trade": true, "reason": null, "fee": { "bps": 75, "to": "Misthra" } },
                { "id": "uniswap-v4", "name": "Uniswap v4", "version": 4, "indexed": true, "indexedPads": ["montra"], "trade": false, "reason": "Misthra cannot route Uniswap v4 trades yet…", "fee": null },
                { "id": "agora", "name": "Agora", "indexed": false, "trade": false, "reason": "Not connected…" } ],
    "feed": { "available": true, "windows": ["5m","1h","24h"], "candleTimeframes": ["15s","1m","5m","15m","1h"], "sorts": ["age","volume","holders","traction"], "filters": ["stage","pad","q"], "maxLimit": 200, "history": "…" },
    "stream": { "available": true, "transport": "sse", "path": "/api/stream", "events": ["hello","launch","update","alert","reset"] },
    "quotes": { "available": true, "venues": ["uniswap-v3"] }, "paperTrading": { "available": false, "reason": "…" },
    "router": { "available": true }, "alerts": { "available": true, "delivery": ["in-app"] },
    "walletTracking": { "available": true, "via": "alerts", "note": "…" },
    "portfolio": { "available": false, "reason": "Not built yet…" },
    "orders": { "available": false, "reason": "Limit and stop orders need an automated keeper and a scoped signing permission…" },
    "social": { "available": false, "reason": "No social data provider is connected." },
    "hypercore": { "available": false, "reason": "HyperCore execution is not available on Elysium yet." } }
  ```

### Feed
- `GET /api/launches?stage=new|stretch|migrated&pad=<id>&q=<text>&sort=age|volume|holders|traction&limit=60&cursor=<nextCursor>`
  → `{ source, networkVerified: boolean | null, tradeFeeBps: number, indexedBlock, updatedAt, sort, nextCursor: string | null, pads: Pad[], launches: Launch[] }`
  **Pagination:** pass `nextCursor` back as `cursor` with the same `sort` and filters; `nextCursor: null` means the last page. Rows are ordered by the sort key, then by `address`, so pages never repeat or skip a row for `sort=age`. For `volume`, `holders` and `traction` a row whose number changes between requests can move across the page boundary; refetch page 1 when that matters. A cursor from another sort is a `400`. `limit` is 1–200.
  **Identity:** a launch is identified by its token `address`; its pool by `pool.address` (v3) or `pool.poolId` (v4, with `pool.address` = the shared PoolManager). `createdAt` is the block time in ms, `createdBlock` its block.
  **Windows that exist:** volume and price change for `5m`, `1h`, `24h` only (see `/api/capabilities`). There is no 1m or 30m figure; do not derive one. Candles are a separate series (`15s`…`1h`).
  `networkVerified` is false in live mode until the operator confirms every network address; show a warning when it is false.
- `GET /api/launches/:address` → `{ source, launch: Launch }`
- `GET /api/launches/:address/candles?tf=15s|1m|5m|15m|1h` → `{ source, bars: { t, o, h, l, c, v }[] }` (price in HYPE, volume in HYPE)
- `GET /api/launches/:address/trades?limit=50` → `{ source, trades: { tx, t, side: 'buy'|'sell', trader, amountHype, amountToken }[] }`
- `GET /api/launches/:address/holders` → `{ source, holders: { address, pct, tags: ('creator'|'pool'|'burn'|'router'|'early')[] }[] }`
- `GET /api/stream` (Server-Sent Events): `hello` `{ source, streamId, lastId }`, then `launch` (new Launch), `update` (partial Launch with `address`), `alert` (AlertEvent, owner's session only), `reset` `{ reason }`.
  Every event after `hello` has an increasing `id:`. On reconnect the browser's EventSource sends `Last-Event-ID` and the server replays what was missed (the last 1,000 events); if it fell further behind it sends `reset`: refetch the feed. If `hello.streamId` differs from the one you had, the server restarted: refetch. The server pushes as events happen; **the frontend owns display cadence**: buffer events while a row is hovered or focused, and apply them when released.

### Trade
- `POST /api/trade/quote` body `{ token, side: 'buy'|'sell', amount, slippageBps, wallet? }` (amount in HYPE for buys, tokens for sells; `wallet` defaults to the session's)
  → `{ source, via: 'misthra' | 'agora' | 'simulated', approvals: Tx[], amountOut, minOut, feeHype: string | null, feeBps: number | null, priceImpactBps: number | null, route: string, tx: { to, data, value, chainId } | null, approveTx: { to, data, value, chainId } | null, reason: string | null }`
  `tx` is null in simulated mode, without a wallet, or when swaps are not configured; `reason` says why. For a sell, send `approveTx` first when it is present: it approves **exactly** this sale's amount, never an unlimited allowance.
  Live Misthra quotes also carry exact integers and timing:
  `units: { amountIn, amountInDecimals, amountOut, minOut, amountOutDecimals, fee, feeDecimals }` (base-unit strings; `amountIn` for a buy is wei of HYPE), `slippageBps`, `quotedAt` (ms), `expiresAt` (ms, quotedAt + 20 s: re-quote after this), `deadline` (ms, quotedAt + 120 s: the transaction reverts after this), `blockNumber` (block the quote was priced at, or null), and `tx.from` / `approveTx.from` = the signer the transaction was built for.
  **Quick buy flow:** a preset only changes the amount in the request. Always request a fresh quote immediately before opening the wallet, show the reviewed numbers, and refuse to sign if `expiresAt` has passed, `tx.from` is not the connected account, or the wallet's chain is not `tx.chainId`. Disable the button from send until the receipt (or a clear failure) so one click cannot submit twice; on reload, recover a pending hash from the receipt rather than resending.
  **Unsupported pools:** when `launch.trade.misthra` is false (e.g. Uniswap v4), the quote never routes through the v3 gateway: it returns `tx: null` and `reason` (the same text as `launch.trade.reason`). Show that and `launch.trade.venueUrl` without requesting a quote at all.
  Live trades go through `MisthraTradeGateway`, which takes `feeBps` (0.75% at launch, at most 1%) in HYPE in the same transaction; `amountOut` and `minOut` are what the trader receives after it. Pools on another factory or quoted in another WHYPE are shown but not traded (`tx` null, `reason` explains), unless Agora routing is enabled: then `via: 'agora'` and the trade goes through Agora's best price with Misthra's builder code. Send every entry of `approvals` in order before `tx`.
- Paper desk (simulated only): `POST /api/paper/fill` `{ token, side, amount, slippageBps }` → `{ fill }`; `GET /api/paper/positions` → `{ positions }`

### Alerts (session required)
The stream sends each `alert` event only to the session that owns the rule.
- `GET /api/alerts` → `{ rules: AlertRule[], events: AlertEvent[] }`
- `POST /api/alerts` `{ kind: 'launch'|'stage'|'wallet', pad?, minVolumeHype?, maxAgeMin?, minHolders?, token?, wallet? }` → `{ rule }`
- `DELETE /api/alerts/:id`
- `AlertEvent = { id, ruleId, at, title, detail, token: string | null }`

### Launch with a fee router
- `POST /api/router/plan` `{ creator, label, buckets: [{ kind: 'wallets'|'native'|'buyback-burn', bps, wallets?: { address, bps, editable }[] }] }`
  → `{ predictedAddress: string | null, salt: string | null, config: object | null, buckets: { label, bps }[], deployTx: { to, data, value, chainId, from } | null, steps: string[], reason: string | null }`
  Invalid plans return `400 { error }` with a readable message. Without a deployed router factory, `predictedAddress` and `deployTx` are null and `reason` explains. A buyback-and-burn bucket also needs the shared price guard.
- `GET /api/router/:address` → router snapshot read from **confirmed** chain state (getters at `asOf.block`, never summed events). Sample: `fixtures/router.sample.json` (served by the simulated preview for the sample router only; other routers return 503 with a reason until the server is live).
  - `status`: `ok` | `not_deployed` (no code yet; a deployment may be pending) | `not_misthra_router` (code is not a clone of the configured factory's implementation) | `uninitialized`. When not `ok`, `reason` explains and the money fields are absent.
  - Top level: `source`, `network { chainId, verified }`, `asOf { block, timestamp, confirmations }`, `router`, `verification { factory, implementation, codeMatchesClone, configHash }`, `creator`, `protocolFeeRecipient`, `protocolFeeBps` (100 = 1%), `whype`, `launchpadAdapter`, `bound`, `subject` (null until bound).
  - **Units:** every amount is an exact base-unit integer string. `assets[address] = { symbol, decimals, kind: 'native'|'whype'|'subject'|'erc20' }` says how to display it; native HYPE is `0x0000000000000000000000000000000000000000`. Anything that could not be read is `null`, never `"0"`.
  - `buckets[]`: `{ id, output { kind: 'native'|'fixed'|'subject', token }, resolvedOutput (null for the token until bound), bps, route { adapter, priceGuard, routeData, maxAmountInPerCall }, inputOwed (WHYPE waiting), allocations[] { id, key, destination, bps, isSink, creatorMayRepoint, owed } }`.
  - `money[]` per asset: `{ asset, balance, liability, unaccounted (new fees not yet synced), protocolOwed, insolvent }`. `wallets[]`: `{ recipient, asset, owed }` (a wallet in two buckets shares one balance). `sinks[]`: `{ bucket, allocation, destination, asset, owed }`.
  - `actions[]`: `{ action, who: 'anyone'|'creator', params, amount?, enabled, reason }`, what can be done now and why not.
  - Errors: 400 bad address; 503 `{ error, code: 'rpc_unavailable'|'wrong_chain' }` with a readable reason.
- `POST /api/router/:address/prepare` body `{ action, from, params }` → `{ ok, action, tx: { chainId, from, to, data, value } | null, amount, steps: string[], preconditions: { ok, detail }[], reason, code?, preparedAt, note }`.
  - Actions and params: `bind { token }` (creator), `sync { asset }`, `processBucket { bucket }`, `sendWallet { recipient, asset }`, `fundSink { bucket, allocation }`, `sendProtocolFee { asset }`, `repointWallet { bucket, allocation, destination }` (creator, editable destinations only).
  - Checks the sender, takes swap minimums from the router's own price guard at the latest block, then simulates. Any failure returns `ok: false`, `tx: null` and a readable `reason`. Prepare again right before signing if blocks have passed; a transaction hash is not a confirmation.
- Protocol fee is fixed at 1% in the contract.
- `GET /api/router/pads` → `{ checked: { at, by, onchain }, pads: { id, name, recipient: 'at-launch'|'after-launch'|'unconfirmed', delivery: 'push'|'claim'|'unknown', buyback: 'yes'|'no'|'unconfirmed', note, usable }[] }`
  Which launchpads can send creator fees to a router. Show `note` and say plainly that the list is from the pads' docs and not yet confirmed on-chain while `checked.onchain` is false.
- The router accepts creator fees in WHYPE, in native HYPE (`sync(address(0))` wraps what is not already owed), or in the launched token when it trades on the canonical Uniswap v3 deployment.

### Partners (launchpads and aggregators that send creators to Misthra)
Configured in `chain/partners.json` (`id`, `name`, `url`, `origins`, `returnHosts`). Attribution is a record, not a payout.
- `GET /api/partners` → `{ partners: { id, name, url, returnHosts }[] }`
- `POST /api/router/plan` accepts optional `ref` (partner id) and `returnUrl`. Response adds `ref: { id, name } | null` and `returnUrl: string | null`: the return URL is echoed back **only** if it is `https` on one of that partner's `returnHosts`, otherwise null. A plan with a predicted address is attributed to the partner (first plan wins). Unknown `ref` → `400 unknown_partner`.
- `GET /api/router/:address` adds `referredBy: { id, name } | null`.
- `GET /api/partners/:id/routers` → `{ source, partner, planned, deployed: number | null, routers: { router, creator, plannedAt, deployed: boolean | null }[] }` (`deployed` is null in simulated mode).
- **Cross-origin calls:** a partner's own site (its `origins`) may call, without cookies: `GET /api/capabilities`, `/api/launches…`, `/api/partners…`, `/api/router/pads`, `/api/router/:address`, and `POST /api/router/plan`, `/api/router/:address/prepare` (pass `from` explicitly). A call from the partner origin is attributed automatically. Everything else (sessions, alerts, quotes, paper) is `403` from other origins.
- **Deep link** (frontend): `https://misthra.com/#/launch?ref=<id>&creator=<0x…>&pad=<padId>&returnUrl=<https url>`. See `docs/partners.md`.

### Existing (Agents section, unchanged)
Missions, agents, inbox, account: see `docs/api-contract.md`.
