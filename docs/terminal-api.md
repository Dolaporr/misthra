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
  address: string; name: string; symbol: string; decimals: number; image: string | null;
  pad: Pad; stage: 'new' | 'stretch' | 'migrated';
  createdAt: number; createdBlock: number; creator: string;
  pool: Pool;
  priceHype: string; mcapHype: string; liquidityHype: string;
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

### Feed
- `GET /api/launches?stage=new|stretch|migrated&pad=<id>&q=<text>&sort=age|volume|holders|traction&limit=60`
  → `{ source, networkVerified: boolean | null, tradeFeeBps: number, indexedBlock, updatedAt, pads: Pad[], launches: Launch[] }`
  `networkVerified` is false in live mode until the operator confirms every network address; show a warning when it is false.
- `GET /api/launches/:address` → `{ source, launch: Launch }`
- `GET /api/launches/:address/candles?tf=15s|1m|5m|15m|1h` → `{ source, bars: { t, o, h, l, c, v }[] }` (price in HYPE, volume in HYPE)
- `GET /api/launches/:address/trades?limit=50` → `{ source, trades: { tx, t, side: 'buy'|'sell', trader, amountHype, amountToken }[] }`
- `GET /api/launches/:address/holders` → `{ source, holders: { address, pct, tags: ('creator'|'pool'|'burn'|'router'|'early')[] }[] }`
- `GET /api/stream` (Server-Sent Events): `launch` (new Launch), `update` (partial Launch with `address`), `alert` (AlertEvent)

### Trade
- `POST /api/trade/quote` body `{ token, side: 'buy'|'sell', amount, slippageBps, wallet? }` (amount in HYPE for buys, tokens for sells; `wallet` defaults to the session's)
  → `{ source, via: 'misthra' | 'agora' | 'simulated', approvals: Tx[], amountOut, minOut, feeHype: string | null, feeBps: number | null, priceImpactBps: number | null, route: string, tx: { to, data, value, chainId } | null, approveTx: { to, data, value, chainId } | null, reason: string | null }`
  `tx` is null in simulated mode, without a wallet, or when swaps are not configured; `reason` says why. For a sell, send `approveTx` first when it is present. Buys use a 2-minute deadline.
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

### Existing (Agents section, unchanged)
Missions, agents, inbox, account: see `docs/api-contract.md`.
