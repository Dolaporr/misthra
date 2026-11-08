import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.mjs';
import fixtureData from '../fixtures/launches.sample.json' with { type: 'json' };

const LAUNCH_KEYS = ['address', 'name', 'symbol', 'decimals', 'image', 'pad', 'stage', 'createdAt', 'createdBlock', 'creator', 'pool', 'priceHype', 'mcapHype', 'liquidityHype', 'volume5mHype', 'volume24hHype', 'txCount24h', 'traders24h', 'holders', 'top10Pct', 'change5mPct', 'change1hPct', 'traction', 'safety', 'ai', 'router', 'links'];

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
  t.after(async () => { await new Promise((r) => server.close(r)); app.locals.close(); await rm(directory, { recursive: true, force: true }); });
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
  assert.match(new TextDecoder().decode(value), /event: hello\ndata: \{"source":"simulated"\}/);
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
