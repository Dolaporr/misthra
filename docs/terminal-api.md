# Terminal, Launch and Alerts API contract

Shared contract between the backend (Claude) and the frontend (Codex). Base path `/api`, JSON, cookie session as today (`credentials: 'include'`). Amounts are **decimal strings** in HYPE (18 decimals) unless named `*Usd`. Times are Unix milliseconds. Addresses are lowercase hex.

Liquidity is the WHYPE side of the pool counted twice, a common convention. Holder counts are exact only for tokens created inside the indexed range.

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
type Pool = { address: string; venue: 'uniswap-v3' | 'uniswap-v2'; fee: number | null; quote: 'WHYPE' };
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
  links: { explorer: string; pad: string | null; pool: string };
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
- `GET /api/router/:address`: **not built yet** (`TODO(api)`). Until it exists, show the router's buckets from `launch.router` and link to the explorer.
- Protocol fee is fixed at 1% in the contract.

### Existing (Agents section, unchanged)
Missions, agents, inbox, account: see `docs/api-contract.md`.
