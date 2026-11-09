import test from 'node:test';
import assert from 'node:assert/strict';
import { createHypeUsd, usd, simulatedHypeUsd } from '../server/terminal/hype-usd.mjs';
import { createTerminalStore } from '../server/terminal/store.mjs';
import { DatabaseSync } from 'node:sqlite';

const reply = (body, ok = true) => async () => ({ ok, status: ok ? 200 : 503, json: async () => body });

test('fresh price is served with its source and time; stale becomes null, never a fixed rate', async () => {
  let clock = 1_000_000;
  const rate = createHypeUsd({ fetchImpl: reply({ HYPE: '39.871', BTC: '100000' }), now: () => clock, maxAgeMs: 120_000 });
  assert.equal(rate.current().hypeUsd, null, 'nothing before the first fetch');
  assert.match(rate.current().reason, /not fetched/);
  await rate.refresh();
  assert.deepEqual({ ...rate.current() }, { hypeUsd: '39.871', source: 'Hyperliquid HYPE mid (api.hyperliquid.xyz allMids)', fetchedAt: 1_000_000, stale: false, maxAgeMs: 120_000, reason: null });
  clock += 120_001;
  assert.equal(rate.current().hypeUsd, null);
  assert.equal(rate.current().stale, true);
  assert.match(rate.current().reason, /stale/);
});

test('bad responses keep the last good price only while it is fresh', async () => {
  let clock = 0, body = { HYPE: '40.5' }, ok = true;
  const rate = createHypeUsd({ fetchImpl: async () => ({ ok, status: ok ? 200 : 503, json: async () => body }), now: () => clock });
  await rate.refresh();
  for ([body, ok] of [[{ HYPE: '-1' }, true], [{ HYPE: 'NaN' }, true], [{}, true], [{ HYPE: '1e9' }, true], [{ HYPE: '41' }, false]]) {
    await rate.refresh();
    assert.equal(rate.current().hypeUsd, '40.5', JSON.stringify(body));
  }
  const down = createHypeUsd({ fetchImpl: async () => { throw new Error('network down'); }, now: () => clock });
  await down.refresh();
  assert.equal(down.current().hypeUsd, null);
  assert.match(down.current().reason, /network down/);
});

test('dollar amounts are decimal strings: cents above $1, significant digits below', () => {
  assert.equal(usd('45.36', '39.87'), '1808.50');
  assert.equal(usd('0.1', '0.3'), '0.03');
  assert.equal(usd('0.000001', '40'), '0.00004');
  assert.equal(usd('0', '40'), '0');
  assert.equal(usd('10', null), null, 'no rate, no dollars');
  assert.equal(usd(null, '40'), null);
  assert.equal(usd('1234567.891', '41.2'), '50864197.11');
});

test('launch mcapUsd follows the rate: present when fresh, null when stale; simulated is labelled', async () => {
  const store = createTerminalStore(new DatabaseSync(':memory:'), { now: () => 1e12, usdRate: () => ({ hypeUsd: null }) });
  const raw = { address: '0x' + '1'.repeat(40), name: 'A', symbol: 'A', decimals: 18, createdAt: 1e12, creator: '0x' + '2'.repeat(40), pool: { address: '0x' + '3'.repeat(40), venue: 'uniswap-v3' } };
  store.putLaunch(raw, 'live');
  assert.equal(store.toApi(store.getRaw(raw.address), { pads: [], live: true }).mcapUsd, null, 'no trades: no market cap in any currency');
  const sim = simulatedHypeUsd(() => 5);
  assert.equal(sim.current().source, 'simulated');
  assert.equal(sim.current().stale, false);
});
