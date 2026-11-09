import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.mjs';
import fixtureData from '../fixtures/launches.sample.json' with { type: 'json' };

const LAUNCH_KEYS = ['address', 'name', 'symbol', 'decimals', 'image', 'pad', 'stage', 'createdAt', 'createdBlock', 'creator', 'pool', 'priceHype', 'mcapHype', 'liquidityHype', 'volume5mHype', 'volume24hHype', 'txCount24h', 'traders24h', 'holders', 'top10Pct', 'change5mPct', 'change1hPct', 'traction', 'safety', 'ai', 'router', 'links', 'trade', 'feeRecipient', 'mcapUsd'];

async function terminal(t) {
  const directory = await mkdtemp(join(tmpdir(), 'misthra-terminal-'));
  let clock = 1_800_000_000_000;
  const app = createApp({ dbPath: join(directory, 'test.sqlite'), seed: false, now: () => clock });
  const server = app.listen(0, '127.0.0.1'); await new Promise((r) => server.once('listening', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const req = async (path, body, token, method = body === undefined ? 'GET' : 'POST') => {
    const response = await fetch(origin + path, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  t.after(async () => { server.closeAllConnections(); await new Promise((r) => server.close(r)); app.locals.close(); await rm(directory, { recursive: true, force: true }); });
  const demo = async (role) => (await req('/api/auth/demo', { role })).body.token;
  return { app, req, demo, origin, sim: app.locals.terminal.source, advance: (ms) => (clock += ms), now: () => clock };
}

test('the launch feed follows the contract and says it is simulated', async (t) => {
  const f = await terminal(t);
  const { status, body } = await f.req('/api/launches?limit=200');
  assert.equal(status, 200);
  assert.equal(body.source, 'simulated');
  assert.ok(body.launches.length >= 8);
  for (const launch of body.launches) {
    assert.deepEqual(Object.keys(launch).sort(), [...LAUNCH_KEYS].sort());
    assert.ok(['new', 'stretch', 'migrated'].includes(launch.stage));
    assert.match(launch.priceHype, /^\d+(\.\d+)?$/);
  }
  assert.deepEqual(body.pads.map((p) => p.id).sort(), ['ascend', 'bunnypad', 'citadel', 'montra'], 'the simulated feed lists its sample pads for the filter');
  const stages = new Set(body.launches.map((l) => l.stage));
  assert.deepEqual([...stages].sort(), ['migrated', 'new', 'stretch']);
  const migrated = (await f.req('/api/launches?stage=migrated')).body.launches;
  assert.deepEqual(migrated.map((l) => l.symbol), ['NMB']);
  const search = (await f.req('/api/launches?q=halc')).body.launches;
  assert.deepEqual(search.map((l) => l.symbol), ['HLCN']);
  assert.ok(search[0].router?.buckets.length, 'router buckets travel with the launch');
  const montra = (await f.req('/api/launches?pad=montra')).body.launches;
  assert.ok(montra.length && montra.every((l) => l.pad?.id === 'montra'));
});

test('numbers come from recorded trades: an untraded launch shows no score', async (t) => {
  const f = await terminal(t);
  const address = f.sim.newLaunch(f.now());
  const { body } = await f.req(`/api/launches/${address}`);
  assert.equal(body.launch.stage, 'new');
  assert.equal(body.launch.traction, null);
  assert.equal(body.launch.priceHype, '0');
  assert.equal(body.launch.safety.status, 'unchecked');
  assert.equal(body.launch.ai, null);
  const rust = fixtureData.launches.find((l) => l.symbol === 'RUST');
  assert.equal((await f.req(`/api/launches/${rust.address}`)).body.launch.safety.status, 'fail');
  const hlcn = fixtureData.launches.find((l) => l.symbol === 'HLCN');
  const sheet = (await f.req(`/api/launches/${hlcn.address}`)).body.launch;
  assert.ok(sheet.traction.score >= 0 && sheet.traction.score <= 100);
  assert.equal(sheet.safety.status, 'warn', 'an unknown tax check is a warning, not a pass');
  assert.ok((await f.req(`/api/launches/${hlcn.address}/candles?tf=5m`)).body.bars.length > 0);
  assert.ok((await f.req(`/api/launches/${hlcn.address}/trades`)).body.trades.length > 0);
  assert.equal((await f.req('/api/launches/0x0000000000000000000000000000000000000001')).status, 404);
  assert.equal((await f.req('/api/launches/not-an-address')).status, 400);
});

test('quotes never build a transaction in simulated mode; paper fills are bounded by holdings', async (t) => {
  const f = await terminal(t);
  const token = fixtureData.launches.find((l) => l.symbol === 'PAPR' || l.symbol === 'MOTH').address;
  const quote = await f.req('/api/trade/quote', { token, side: 'buy', amount: '1', slippageBps: 100 });
  assert.equal(quote.status, 200);
  assert.equal(quote.body.source, 'simulated');
  assert.equal(quote.body.tx, null);
  assert.match(quote.body.reason, /Simulated/);
  assert.ok(Number(quote.body.minOut) < Number(quote.body.amountOut));
  assert.equal((await f.req('/api/trade/quote', { token, side: 'buy', amount: '-1', slippageBps: 100 })).status, 400);
  assert.equal((await f.req('/api/paper/fill', { token, side: 'buy', amount: '1', slippageBps: 100 })).status, 401);
  const user = await f.demo('poster');
  const buy = await f.req('/api/paper/fill', { token, side: 'buy', amount: '1', slippageBps: 100 }, user);
  assert.equal(buy.status, 200);
  const tooMuch = await f.req('/api/paper/fill', { token, side: 'sell', amount: String(Math.ceil(buy.body.fill.tokens * 2)), slippageBps: 100 }, user);
  assert.equal(tooMuch.status, 409);
  const positions = (await f.req('/api/paper/positions', undefined, user)).body.positions;
  assert.equal(positions.length, 1);
  assert.equal(positions[0].spentHype, 1);
});

test('alerts fire for their owner only', async (t) => {
  const f = await terminal(t);
  const alice = await f.demo('poster'), bob = await f.demo('agent');
  assert.equal((await f.req('/api/alerts', { kind: 'stage' }, alice)).status, 400);
  const rule = await f.req('/api/alerts', { kind: 'launch', maxAgeMin: 10 }, alice);
  assert.equal(rule.status, 200);
  f.sim.newLaunch(f.now());
  const mine = (await f.req('/api/alerts', undefined, alice)).body;
  assert.equal(mine.events.length, 1);
  assert.match(mine.events[0].title, /matches your launch alert/);
  assert.equal((await f.req('/api/alerts', undefined, bob)).body.events.length, 0);
  assert.equal((await f.req(`/api/alerts/${rule.body.rule.id}`, undefined, bob, 'DELETE')).status, 404);
  assert.equal((await f.req(`/api/alerts/${rule.body.rule.id}`, undefined, alice, 'DELETE')).status, 200);
});

test('router planning validates shares and refuses to predict without a deployment', async (t) => {
  const f = await terminal(t);
  const creator = '0x1111111111111111111111111111111111111111';
  const good = { creator, buckets: [{ kind: 'wallets', bps: 6000, wallets: [{ address: creator, bps: 10000, editable: true }] }, { kind: 'native', bps: 4000, wallets: [{ address: '0x2222222222222222222222222222222222222222', bps: 10000 }] }] };
  const plan = await f.req('/api/router/plan', good);
  assert.equal(plan.status, 200);
  assert.equal(plan.body.predictedAddress, null);
  assert.match(plan.body.reason, /not deployed/);
  const bad = await f.req('/api/router/plan', { ...good, buckets: [{ ...good.buckets[0], bps: 5000 }, good.buckets[1]] });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /total 100%/);
  const burnNative = await f.req('/api/router/plan', { creator, buckets: [{ kind: 'native', bps: 10000, wallets: [{ address: '0x000000000000000000000000000000000000dEaD', bps: 10000 }] }] });
  assert.equal(burnNative.status, 400);
});

test('the stream opens with its source', async (t) => {
  const f = await terminal(t);
  const controller = new AbortController();
  const response = await fetch(`${f.origin}/api/stream`, { signal: controller.signal });
  const reader = response.body.getReader();
  const { value } = await reader.read();
  assert.match(new TextDecoder().decode(value), /event: hello\ndata: \{"source":"simulated",/);
  controller.abort();
});

test('pad support is served with its confidence level', async (t) => {
  const f = await terminal(t);
  const { status, body } = await f.req('/api/router/pads');
  assert.equal(status, 200);
  assert.equal(body.checked.onchain, false);
  const byId = Object.fromEntries(body.pads.map((p) => [p.id, p]));
  assert.equal(byId.montra.usable, true);
  assert.equal(byId.ascend.buyback, 'no', 'Ascend pools are Uniswap v4');
  assert.equal(byId.kleos.usable, false);
});

test('router status: the sample router in preview, honest refusals otherwise', async (t) => {
  const f = await terminal(t);
  const sample = fixtureData.launches.find((l) => l.symbol === 'HLCN').router.address;
  const ok = await f.req(`/api/router/${sample}`);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.source, 'simulated');
  assert.equal(ok.body.status, 'ok');
  assert.ok(ok.body.buckets.length && ok.body.actions.length);
  for (const m of ok.body.money) assert.match(m.balance, /^\d+$/, 'amounts are exact base-unit integers');
  const other = await f.req('/api/router/0x0000000000000000000000000000000000000001');
  assert.equal(other.status, 503);
  assert.match(other.body.error, /needs a live Elysium connection/, 'the reason is shown, not hidden as a server error');
  assert.equal((await f.req('/api/router/not-an-address')).status, 400);
  const prep = await f.req(`/api/router/${sample}/prepare`, { action: 'sync', from: sample, params: {} });
  assert.equal(prep.status, 503);
  assert.match(prep.body.error, /live Elysium connection/);
});

test('simulated launches always carry a pad, including ones stored before pads were assigned', async () => {
  const { createTerminalStore } = await import('../server/terminal/store.mjs');
  const { createSimFeed } = await import('../server/terminal/simfeed.mjs');
  const { DatabaseSync } = await import('node:sqlite');
  const store = createTerminalStore(new DatabaseSync(':memory:'));
  const feed = createSimFeed(store, { fixturePath: new URL('../fixtures/launches.sample.json', import.meta.url).pathname });
  feed.seedFromFixture();
  const address = feed.newLaunch(Date.now());
  assert.ok(store.getRaw(address).pad?.name);
  const { source, ...raw } = store.getRaw(address); store.putLaunch({ ...raw, pad: null, padId: null }, 'simulated');
  assert.equal(store.getRaw(address).pad, null);
  assert.ok(feed.repairPads() >= 1);
  assert.ok(store.getRaw(address).pad?.name);
});

test('capabilities say what is available, and why not when it is not', async (t) => {
  const f = await terminal(t);
  const { status, body } = await f.req('/api/capabilities');
  assert.equal(status, 200);
  assert.equal(body.source, 'simulated');
  for (const key of ['walletTracking', 'portfolio', 'orders', 'social', 'hypercore', 'quotes', 'router', 'paperTrading', 'alerts', 'feed', 'stream']) {
    assert.equal(typeof body[key].available, 'boolean', key);
    if (!body[key].available) assert.ok(body[key].reason?.length > 10, `${key} explains why`);
  }
  assert.equal(body.wallet.external.available, true);
  assert.equal(body.wallet.tradingWallet.available, false);
  assert.equal(body.orders.available, false, 'no orders without a keeper');
  assert.equal(body.portfolio.available, false);
  assert.equal(body.paperTrading.available, true, 'simulated preview offers paper trading');
  const v4 = body.venues.find((v) => v.id === 'uniswap-v4');
  assert.equal(v4.trade, false); assert.match(v4.reason, /v4/);
  assert.deepEqual(body.feed.windows, ['5m', '1h', '24h']);
});

test('the feed pages with a cursor: no duplicates, no gaps, bad cursors refused', async (t) => {
  const f = await terminal(t);
  for (const sort of ['age', 'volume']) {
    const all = (await f.req(`/api/launches?limit=200&sort=${sort}`)).body.launches.map((l) => l.address);
    const seen = []; let cursor = null, pages = 0;
    do {
      const { body } = await f.req(`/api/launches?limit=3&sort=${sort}${cursor ? `&cursor=${cursor}` : ''}`);
      seen.push(...body.launches.map((l) => l.address)); cursor = body.nextCursor; pages += 1;
      assert.equal(body.sort, sort);
    } while (cursor && pages < 100);
    assert.deepEqual(seen, all, `${sort}: paging returns the same rows in the same order`);
    assert.ok(pages > 1);
  }
  const first = (await f.req('/api/launches?limit=2&sort=age')).body.nextCursor;
  assert.equal((await f.req(`/api/launches?limit=2&sort=volume&cursor=${first}`)).status, 400, 'a cursor from another sort is refused');
  assert.equal((await f.req('/api/launches?cursor=not-a-cursor')).status, 400);
});

test('the stream numbers events and replays what a reconnecting client missed', async (t) => {
  const f = await terminal(t);
  const read = async (headers = {}, want = 2) => {
    const ctrl = new AbortController();
    const res = await fetch(`${f.origin}/api/stream`, { headers, signal: ctrl.signal });
    const reader = res.body.getReader(); let text = '';
    const deadline = Date.now() + 1500;
    while (Date.now() < deadline && (text.match(/^event: /gm) ?? []).length < want) {
      const { value, done } = await Promise.race([reader.read(), new Promise((r) => setTimeout(() => r({ done: false }), 200))]);
      if (done) break; if (value) text += new TextDecoder().decode(value);
    }
    ctrl.abort();
    return text;
  };
  const hello = await read({}, 1);
  assert.match(hello, /event: hello\ndata: \{"source":"simulated","streamId":"[a-z0-9]+","lastId":\d+\}/);
  // Produce three launches, then reconnect claiming we saw none of them.
  const before = Number(hello.match(/"lastId":(\d+)/)[1]);
  for (let i = 0; i < 3; i += 1) f.app.locals.terminal.source.newLaunch(f.now());
  const replay = await read({ 'Last-Event-ID': String(before) }, 4);
  const ids = [...replay.matchAll(/^id: (\d+)$/gm)].map((m) => Number(m[1]));
  assert.ok(ids.length >= 3, 'missed events are replayed');
  assert.deepEqual(ids, [...ids].sort((a, b) => a - b), 'in order');
  assert.ok(ids.every((id) => id > before));
});

test('a partner site can read and plan routers from its own origin, but nothing else', async (t) => {
  const f = await terminal(t);
  const AGORA = 'https://agoradex.app';
  const call = (path, { method = 'GET', origin = AGORA, body, headers = {} } = {}) => fetch(f.origin + path, { method, headers: { Origin: origin, ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  // Allowed: public reads, with CORS for that origin and no credentials.
  const caps = await call('/api/capabilities');
  assert.equal(caps.status, 200);
  assert.equal(caps.headers.get('access-control-allow-origin'), AGORA);
  assert.equal(caps.headers.get('access-control-allow-credentials'), null, 'partners never get cookies');
  assert.equal((await call('/api/launches?limit=1')).status, 200);
  assert.equal((await call('/api/router/pads')).status, 200);
  // Preflight for the plan endpoint.
  const pre = await call('/api/router/plan', { method: 'OPTIONS', headers: { 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } });
  assert.equal(pre.status, 204);
  // Plan from the partner's page: attributed to it, return URL kept only on its hosts.
  const creator = '0x1111111111111111111111111111111111111111';
  const body = { creator, buckets: [{ kind: 'native', bps: 10000, wallets: [{ address: creator, bps: 10000 }] }] };
  const plan = await (await call('/api/router/plan', { method: 'POST', body: { ...body, returnUrl: 'https://agoradex.app/launch/abc' } })).json();
  assert.deepEqual(plan.ref, { id: 'agora', name: 'Agora' });
  assert.equal(plan.returnUrl, 'https://agoradex.app/launch/abc');
  const evil = await (await call('/api/router/plan', { method: 'POST', body: { ...body, returnUrl: 'https://agoradex.app.evil.example/x' } })).json();
  assert.equal(evil.returnUrl, null, 'look-alike hosts are not followed');
  assert.equal((await (await call('/api/router/plan', { method: 'POST', body: { ...body, returnUrl: 'http://agoradex.app/x' } })).json()).returnUrl, null, 'https only');
  // Refused: sessions, alerts, paper desk, trade quotes, and unknown origins.
  assert.equal((await call('/api/alerts')).status, 403);
  assert.equal((await call('/api/auth/demo', { method: 'POST', body: { role: 'poster' } })).status, 403);
  assert.equal((await call('/api/trade/quote', { method: 'POST', body: {} })).status, 403);
  assert.equal((await call('/api/capabilities', { origin: 'https://evil.example' })).status, 403);
  // From misthra itself, ?ref=agora works the same; an unknown ref is refused.
  assert.deepEqual((await f.req('/api/router/plan', { ...body, ref: 'agora' })).body.ref, { id: 'agora', name: 'Agora' });
  assert.equal((await f.req('/api/router/plan', { ...body, ref: 'nobody' })).status, 400);
  // Partner list and attribution records.
  const list = (await f.req('/api/partners')).body.partners;
  assert.deepEqual(list.map((p) => p.id), ['agora']);
  f.app.locals.terminal.store.addRef('0x' + 'ab'.repeat(20), 'agora', creator, f.now());
  const routers = (await f.req('/api/partners/agora/routers')).body;
  assert.equal(routers.planned, 1);
  assert.equal(routers.routers[0].router, '0x' + 'ab'.repeat(20));
  assert.equal(routers.deployed, null, 'simulated: deployment unknown, not zero');
});

test('simulated feed shows dollar market cap from a labelled simulated rate', async (t) => {
  const f = await terminal(t);
  const { body } = await f.req('/api/launches?limit=50');
  assert.equal(body.source, 'simulated');
  assert.equal(body.usd.source, 'simulated');
  const { usd } = await import('../server/terminal/hype-usd.mjs');
  const priced = body.launches.filter((l) => Number(l.mcapHype) > 0);
  assert.ok(priced.length > 0);
  for (const l of priced) assert.equal(l.mcapUsd, usd(l.mcapHype, body.usd.hypeUsd), l.symbol);
  const caps = (await f.req('/api/capabilities')).body;
  assert.equal(caps.usdPrices.available, true); assert.equal(caps.usdPrices.simulated, true);
  const one = await f.req(`/api/launches/${priced[0].address}`);
  assert.equal(one.body.usd.source, 'simulated');
});

test('live mode: stale or missing HYPE/USD means mcapUsd null and usdPrices unavailable', async (t) => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const directory = await mkdtemp(join(tmpdir(), 'misthra-usd-'));
  const stale = { current: () => ({ hypeUsd: null, source: 'Hyperliquid HYPE mid (api.hyperliquid.xyz allMids)', fetchedAt: 1, stale: true, maxAgeMs: 120000, reason: 'HYPE/USD price is stale.' }), start() {}, stop() {}, refresh: async () => {} };
  const { setupTerminal } = await import('../server/terminal/index.mjs');
  const { DatabaseSync } = await import('node:sqlite');
  const express = (await import('express')).default;
  const app = express();
  const terminal = setupTerminal(app, { db: new DatabaseSync(join(directory, 't.sqlite')), auth: () => null, config: { live: true, pads: [], v3Factories: [], whypes: [], hypercoreListed: new Set(), confirmations: 0, montra: null, agora: { enabled: false, allowedTargets: [] } }, provider: { getBlockNumber: async () => 0 }, hypeUsd: stale });
  t.after(async () => { terminal.close(); await rm(directory, { recursive: true, force: true }); });
  const raw = { address: '0x' + '1'.repeat(40), name: 'A', symbol: 'A', decimals: 18, createdAt: Date.now(), creator: '0x' + '2'.repeat(40), pool: { address: '0x' + '3'.repeat(40), venue: 'uniswap-v3' } };
  terminal.store.putLaunch(raw, 'live');
  const api = terminal.store.toApi(terminal.store.getRaw(raw.address), terminal.config);
  assert.equal(api.mcapUsd, null);
  const { capabilities } = await import('../server/terminal/capabilities.mjs');
  const caps = capabilities(terminal.config, { usd: stale.current() });
  assert.equal(caps.usdPrices.available, false);
  assert.match(caps.usdPrices.reason, /stale/);
});
