// One launches table shared by the Terminal, Launch (fee router) and Alerts.
// Static facts about a launch live in `t_launches.data`; every market number is
// computed from recorded trades and balances at read time, so nothing shown is a
// stored guess. The same store serves the live indexer and the simulated feed;
// `source` says which one wrote it.
import { randomBytes } from 'node:crypto';
import { traction, safetyStatus } from './scoring.mjs';

const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;
export const NEW_WINDOW = 6 * HOUR;
export const STRETCH = { holders: 25, volume24h: 50, liquidity: 20 };
const BURN = new Set(['0x0000000000000000000000000000000000000000', '0x000000000000000000000000000000000000dead']);

export function decimal(x) {
  if (x == null || !Number.isFinite(x)) return '0';
  if (x === 0) return '0';
  const digits = Math.min(18, Math.max(2, 3 - Math.floor(Math.log10(Math.abs(x)))));
  return x.toFixed(digits).replace(/\.?0+$/, '');
}

export function createTerminalStore(db, { now = () => Date.now() } = {}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS t_launches (address TEXT PRIMARY KEY, data TEXT NOT NULL, created_at INTEGER NOT NULL, source TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS t_trades (id INTEGER PRIMARY KEY AUTOINCREMENT, token TEXT NOT NULL, tx TEXT NOT NULL, log_index INTEGER NOT NULL, t INTEGER NOT NULL, side TEXT NOT NULL, trader TEXT NOT NULL, hype REAL NOT NULL, tokens REAL NOT NULL, price REAL NOT NULL, UNIQUE(tx, log_index));
    CREATE INDEX IF NOT EXISTS t_trades_token_t ON t_trades(token, t);
    CREATE TABLE IF NOT EXISTS t_balances (token TEXT NOT NULL, holder TEXT NOT NULL, wei TEXT NOT NULL, PRIMARY KEY(token, holder));
    CREATE TABLE IF NOT EXISTS t_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS t_alert_rules (id TEXT PRIMARY KEY, owner TEXT NOT NULL, rule TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS t_alert_events (id TEXT PRIMARY KEY, rule_id TEXT NOT NULL, owner TEXT NOT NULL, at INTEGER NOT NULL, title TEXT NOT NULL, detail TEXT NOT NULL, token TEXT, dedupe TEXT UNIQUE);
    CREATE TABLE IF NOT EXISTS t_paper (id TEXT PRIMARY KEY, owner TEXT NOT NULL, token TEXT NOT NULL, side TEXT NOT NULL, hype REAL NOT NULL, tokens REAL NOT NULL, price REAL NOT NULL, at INTEGER NOT NULL);
  `);
  const q = {
    getLaunch: db.prepare('SELECT data, source FROM t_launches WHERE address=?'),
    putLaunch: db.prepare('INSERT INTO t_launches(address,data,created_at,source) VALUES(?,?,?,?) ON CONFLICT(address) DO UPDATE SET data=excluded.data, source=excluded.source'),
    allLaunches: db.prepare('SELECT data, source FROM t_launches ORDER BY created_at DESC LIMIT 2000'),
    addTrade: db.prepare('INSERT OR IGNORE INTO t_trades(token,tx,log_index,t,side,trader,hype,tokens,price) VALUES(?,?,?,?,?,?,?,?,?)'),
    window: db.prepare('SELECT COALESCE(SUM(hype),0) vol, COUNT(*) n, COUNT(DISTINCT trader) traders FROM t_trades WHERE token=? AND t>=?'),
    lastPrice: db.prepare('SELECT price FROM t_trades WHERE token=? ORDER BY t DESC, id DESC LIMIT 1'),
    priceAt: db.prepare('SELECT price FROM t_trades WHERE token=? AND t<=? ORDER BY t DESC, id DESC LIMIT 1'),
    firstPrice: db.prepare('SELECT price FROM t_trades WHERE token=? ORDER BY t ASC, id ASC LIMIT 1'),
    trades: db.prepare('SELECT tx, t, side, trader, hype, tokens FROM t_trades WHERE token=? ORDER BY t DESC, id DESC LIMIT ?'),
    tradesSince: db.prepare('SELECT t, price, hype FROM t_trades WHERE token=? AND t>=? ORDER BY t ASC, id ASC'),
    prune: db.prepare('DELETE FROM t_trades WHERE t<?'),
    setBalance: db.prepare('INSERT INTO t_balances(token,holder,wei) VALUES(?,?,?) ON CONFLICT(token,holder) DO UPDATE SET wei=excluded.wei'),
    getBalance: db.prepare('SELECT wei FROM t_balances WHERE token=? AND holder=?'),
    balances: db.prepare("SELECT holder, wei FROM t_balances WHERE token=? AND wei!='0'"),
    getMeta: db.prepare('SELECT value FROM t_meta WHERE key=?'),
    setMeta: db.prepare('INSERT INTO t_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'),
    rules: db.prepare('SELECT id, owner, rule, created_at FROM t_alert_rules WHERE owner=? ORDER BY created_at DESC'),
    allRules: db.prepare('SELECT id, owner, rule FROM t_alert_rules'),
    addRule: db.prepare('INSERT INTO t_alert_rules(id,owner,rule,created_at) VALUES(?,?,?,?)'),
    deleteRule: db.prepare('DELETE FROM t_alert_rules WHERE id=? AND owner=?'),
    events: db.prepare('SELECT id, rule_id ruleId, at, title, detail, token FROM t_alert_events WHERE owner=? ORDER BY at DESC LIMIT 100'),
    addEvent: db.prepare('INSERT OR IGNORE INTO t_alert_events(id,rule_id,owner,at,title,detail,token,dedupe) VALUES(?,?,?,?,?,?,?,?)'),
    addPaper: db.prepare('INSERT INTO t_paper(id,owner,token,side,hype,tokens,price,at) VALUES(?,?,?,?,?,?,?,?)'),
    paper: db.prepare('SELECT token, side, hype, tokens, price, at FROM t_paper WHERE owner=? ORDER BY at ASC'),
  };
  const id = () => randomBytes(12).toString('hex');
  const parse = (row) => (row ? { ...JSON.parse(row.data), source: row.source } : null);

  const store = {
    meta: (key) => q.getMeta.get(key)?.value ?? null,
    setMeta: (key, value) => q.setMeta.run(key, String(value)),
    getRaw: (address) => parse(q.getLaunch.get(address.toLowerCase())),
    allRaw: () => q.allLaunches.all().map(parse),
    putLaunch(data, source) {
      const address = data.address.toLowerCase();
      const previous = parse(q.getLaunch.get(address));
      const merged = { ...previous, ...data, address };
      delete merged.source;
      q.putLaunch.run(address, JSON.stringify(merged), merged.createdAt, source);
      return { created: !previous, launch: merged };
    },
    addTrade: (t) => q.addTrade.run(t.token.toLowerCase(), t.tx, t.logIndex ?? 0, t.t, t.side, t.trader.toLowerCase(), t.hype, t.tokens, t.price).changes > 0,
    setBalance: (token, holder, wei) => q.setBalance.run(token.toLowerCase(), holder.toLowerCase(), wei.toString()),
    balanceOf: (token, holder) => BigInt(q.getBalance.get(token.toLowerCase(), holder.toLowerCase())?.wei ?? '0'),
    prune: (before) => q.prune.run(before),

    metrics(raw, at = now()) {
      const a = raw.address;
      const w5 = q.window.get(a, at - 5 * MIN), w24 = q.window.get(a, at - DAY);
      const price = q.lastPrice.get(a)?.price ?? null;
      const ref5 = q.priceAt.get(a, at - 5 * MIN)?.price ?? q.firstPrice.get(a)?.price ?? null;
      const ref1h = q.priceAt.get(a, at - HOUR)?.price ?? q.firstPrice.get(a)?.price ?? null;
      const change = (ref) => (price != null && ref ? +(((price - ref) / ref) * 100).toFixed(1) : null);
      const holders = store.holders(raw);
      return {
        price, mcap: price != null && raw.totalSupply ? price * raw.totalSupply : null,
        volume5m: w5.vol, volume24h: w24.vol, txCount24h: w24.n, traders24h: w24.traders,
        change5m: change(ref5), change1h: change(ref1h), holders: holders.count, top10Pct: holders.top10Pct, hasTrades: price != null,
      };
    },

    // Holders from indexed Transfer balances. Pools, burn and router addresses are
    // excluded from the count and from the top-10 share. A simulated launch has no
    // balances and carries its own labelled figures instead.
    holders(raw) {
      const rows = q.balances.all(raw.address);
      if (!rows.length) return { count: raw.simHolders ?? 0, top10Pct: raw.simTop10Pct ?? null, list: [] };
      const excluded = new Set([raw.pool?.address, raw.router?.address, ...BURN].filter(Boolean));
      const supply = rows.reduce((s, r) => s + BigInt(r.wei), 0n) || 1n;
      const people = rows.filter((r) => !excluded.has(r.holder)).map((r) => ({ address: r.holder, wei: BigInt(r.wei) })).sort((x, y) => (y.wei > x.wei ? 1 : -1));
      const top10 = people.slice(0, 10).reduce((s, r) => s + r.wei, 0n);
      const tag = (h) => [h === raw.creator ? 'creator' : null, h === raw.pool?.address ? 'pool' : null, BURN.has(h) ? 'burn' : null, h === raw.router?.address ? 'router' : null].filter(Boolean);
      const list = rows.map((r) => ({ address: r.holder, pct: Number((BigInt(r.wei) * 1_000_000n) / supply) / 10_000, tags: tag(r.holder) })).sort((x, y) => y.pct - x.pct).slice(0, 50);
      return { count: people.length, top10Pct: Number((top10 * 10_000n) / supply) / 100, list };
    },

    stage(raw, m, config, at = now()) {
      if (config.hypercoreListed?.has(raw.address)) return 'migrated';
      if (raw.simStage === 'migrated') return 'migrated';
      if (m.holders >= STRETCH.holders && m.volume24h >= STRETCH.volume24h && (raw.liquidityHype ?? 0) >= STRETCH.liquidity) return 'stretch';
      if (at - raw.createdAt <= NEW_WINDOW) return 'new';
      return null;
    },

    toApi(raw, config, at = now()) {
      const m = store.metrics(raw, at);
      const pad = raw.padId ? config.pads.find((p) => p.id === raw.padId) ?? raw.pad ?? null : null;
      const safety = raw.safety ?? { status: 'unchecked', checks: [], checkedAt: null };
      return {
        address: raw.address, name: raw.name, symbol: raw.symbol, decimals: raw.decimals ?? 18, image: raw.image ?? null,
        pad: pad ? { id: pad.id, name: pad.name, url: pad.url ?? null } : null,
        stage: store.stage(raw, m, config, at), createdAt: raw.createdAt, createdBlock: raw.createdBlock ?? 0, creator: raw.creator,
        pool: { address: raw.pool.address, venue: raw.pool.venue, fee: raw.pool.fee ?? null, quote: 'WHYPE' },
        priceHype: decimal(m.price ?? 0), mcapHype: decimal(m.mcap ?? 0), liquidityHype: decimal(raw.liquidityHype ?? 0),
        volume5mHype: decimal(m.volume5m), volume24hHype: decimal(m.volume24h), txCount24h: m.txCount24h, traders24h: m.traders24h,
        holders: m.holders, top10Pct: m.top10Pct, change5mPct: m.change5m, change1hPct: m.change1h,
        traction: m.hasTrades ? traction({ volume5m: m.volume5m, traders: m.traders24h, change5m: m.change5m, change1h: m.change1h, holders: m.holders, liquidity: raw.liquidityHype }) : null,
        safety: { ...safety, status: safetyStatus(safety) }, ai: raw.ai ?? null, router: raw.router ?? null,
        links: { explorer: raw.links?.explorer ?? null, pad: pad?.url ?? null, pool: raw.links?.pool ?? null },
      };
    },

    list(config, { stage, pad, q: text, sort = 'age', limit = 60 } = {}, at = now()) {
      const needle = text?.trim().toLowerCase();
      let rows = q.allLaunches.all().map(parse).map((raw) => ({ raw, api: store.toApi(raw, config, at) }));
      rows = rows.filter(({ api }) => (needle ? true : api.stage !== null));
      if (stage) rows = rows.filter(({ api }) => api.stage === stage);
      if (pad) rows = rows.filter(({ api }) => api.pad?.id === pad);
      if (needle) rows = rows.filter(({ api }) => [api.name, api.symbol, api.address].some((v) => v.toLowerCase().includes(needle)));
      const key = { age: (x) => -x.api.createdAt, volume: (x) => -Number(x.api.volume24hHype), holders: (x) => -x.api.holders, traction: (x) => -(x.api.traction?.score ?? -1) }[sort] ?? ((x) => -x.api.createdAt);
      rows.sort((x, y) => key(x) - key(y));
      return rows.slice(0, Math.min(200, Math.max(1, limit))).map((r) => r.api);
    },

    trades: (address, limit = 50) => q.trades.all(address.toLowerCase(), limit).map((r) => ({ tx: r.tx, t: r.t, side: r.side, trader: r.trader, amountHype: decimal(r.hype), amountToken: decimal(r.tokens) })),

    candles(address, tf, at = now()) {
      const size = { '15s': 15_000, '1m': MIN, '5m': 5 * MIN, '15m': 15 * MIN, '1h': HOUR }[tf] ?? MIN;
      const bars = [];
      for (const r of q.tradesSince.all(address.toLowerCase(), at - Math.min(DAY, size * 300))) {
        const t = Math.floor(r.t / size) * size, last = bars.at(-1);
        if (last && last.t === t) { last.h = Math.max(last.h, r.price); last.l = Math.min(last.l, r.price); last.c = r.price; last.v += r.hype; }
        else bars.push({ t, o: last ? last.c : r.price, h: Math.max(r.price, last ? last.c : r.price), l: Math.min(r.price, last ? last.c : r.price), c: r.price, v: r.hype });
      }
      return bars.map((b) => ({ t: b.t, o: decimal(b.o), h: decimal(b.h), l: decimal(b.l), c: decimal(b.c), v: decimal(b.v) }));
    },

    rules: (owner) => q.rules.all(owner).map((r) => ({ id: r.id, ...JSON.parse(r.rule), createdAt: r.created_at })),
    allRules: () => q.allRules.all().map((r) => ({ id: r.id, owner: r.owner, ...JSON.parse(r.rule) })),
    addRule(owner, rule) { const ruleId = id(); q.addRule.run(ruleId, owner, JSON.stringify(rule), now()); return { id: ruleId, ...rule }; },
    deleteRule: (owner, ruleId) => q.deleteRule.run(ruleId, owner).changes > 0,
    events: (owner) => q.events.all(owner),
    addEvent: (e) => q.addEvent.run(id(), e.ruleId, e.owner, e.at ?? now(), e.title, e.detail, e.token ?? null, e.dedupe).changes > 0,
    addPaper(owner, fill) { q.addPaper.run(id(), owner, fill.token, fill.side, fill.hype, fill.tokens, fill.price, now()); },
    paper: (owner) => q.paper.all(owner),
  };
  return store;
}
