// What the terminal can do right now, and why not when it can't.
// Contract: docs/terminal-api.md § Capabilities. Every capability has `available` and,
// when false, a user-readable `reason`. "Available with no records" is a different
// thing from "unavailable": an available portfolio with no positions returns [] from
// its own endpoint; an unavailable one is reported here and its endpoint answers 503.

const off = (reason, extra = {}) => ({ available: false, reason, ...extra });
const on = (extra = {}) => ({ available: true, reason: null, ...extra });

export const FEED_WINDOWS = ['5m', '1h', '24h'];      // windows we actually compute
export const CANDLE_TIMEFRAMES = ['15s', '1m', '5m', '15m', '1h'];

export function capabilities(config, { agoraOn = false, usd = null } = {}) {
  const live = Boolean(config.live);
  const v3Trade = live && Boolean(config.tradeReady);
  const venues = [
    {
      id: 'uniswap-v3', name: 'Uniswap v3', version: 3,
      indexed: live, trade: v3Trade,
      reason: !live ? 'Simulated preview: no chain connected.' : v3Trade ? null : 'The Misthra trade gateway or quoter is not configured.',
      fee: v3Trade ? { bps: config.tradeFeeBps, to: 'Misthra' } : null,
    },
    {
      id: 'uniswap-v4', name: 'Uniswap v4', version: 4,
      indexed: live && Boolean(config.montra || config.v4PoolManager), indexedPads: live ? [...new Set([...(config.montra ? ['montra'] : []), ...(config.v4PoolManager ? config.pads.filter((p) => p.v4Hooks?.length).map((p) => p.id) : [])])] : [],
      trade: false, reason: 'Misthra cannot route Uniswap v4 trades yet. Each coin links to its launchpad.',
      fee: null,
    },
    {
      id: 'agora', name: 'Agora', version: null,
      indexed: false, trade: Boolean(agoraOn),
      reason: agoraOn ? null : 'Not connected: Agora\'s API fields are not verified yet.',
      fee: null,
    },
  ];
  return {
    // Deployed commit (Railway sets RAILWAY_GIT_COMMIT_SHA), so anyone can see which build is live.
    build: (process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_COMMIT || '').slice(0, 7) || null,
    source: live ? 'live' : 'simulated',
    chainId: live ? config.chainId : null,
    networkVerified: live ? Boolean(config.networkVerified) : null,
    wallet: {
      external: on({ note: 'Any injected EVM wallet (MetaMask, Rabby…). Misthra never holds keys.' }),
      // See docs/trading-wallet.md: proposal only, nothing ships until agreed.
      tradingWallet: off('Not available yet. A user-controlled trading wallet is being designed; Misthra will never create, store or see private keys.'),
    },
    venues,
    feed: on({
      windows: FEED_WINDOWS, candleTimeframes: CANDLE_TIMEFRAMES,
      sorts: ['age', 'volume', 'holders', 'traction'], filters: ['stage', 'pad', 'q'], stages: ['new', 'stretch', 'migrated'],
      maxLimit: 200,
      history: live ? 'Launches created in the indexed range (about the last 10,000 blocks at first start, then continuous).' : 'Simulated launches.',
    }),
    stream: on({ transport: 'sse', path: '/api/stream', events: ['hello', 'launch', 'update', 'alert', 'reset'], replay: 'Send Last-Event-ID (browsers do this on reconnect) to receive missed events; a reset event means refetch.' }),
    quotes: v3Trade ? on({ venues: ['uniswap-v3'] }) : off(live ? 'Live trading is not configured.' : 'Simulated preview: quotes are simulated.', { simulated: !live }),
    paperTrading: live ? off('Paper trading is only offered on the simulated preview.') : on(),
    router: config.routerReady ? on() : off(live ? 'Fee router contracts are not configured.' : 'Simulated preview: router setup is illustrative.'),
    alerts: on({ delivery: ['in-app'] }),
    walletTracking: on({ via: 'alerts', note: 'Watch a wallet with an alert of kind "wallet": you are notified when it buys or sells an indexed launch. No balances or P&L view yet.' }),
    portfolio: off('Not built yet. Use your wallet or the explorer for balances.'),
    orders: off('Limit and stop orders need an automated keeper and a scoped signing permission. Neither exists, so only instant trades you sign yourself are offered.'),
    usdPrices: usd?.hypeUsd ? on({ source: usd.source, fetchedAt: usd.fetchedAt, maxAgeMs: usd.maxAgeMs, simulated: usd.source === 'simulated' }) : off(usd?.reason ?? 'No HYPE/USD price feed.'),
    social: off('No social data provider is connected.'),
    hypercore: off('HyperCore execution is not available on Elysium yet.'),
  };
}
