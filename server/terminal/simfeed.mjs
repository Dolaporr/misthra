// Simulated launch feed for local preview and UI development.
//
// Everything it writes is stored with source "simulated", and the API reports
// that source on every response. It seeds from fixtures/launches.sample.json,
// back-fills a day of invented trades, then keeps adding trades and the odd new
// launch so Pulse, charts and alerts have something to move. It never touches a
// chain and never claims to.
import { readFileSync } from 'node:fs';
import { keccak256, toUtf8Bytes } from 'ethers';

const MIN = 60_000;
const fakeAddress = (seed) => `0x${keccak256(toUtf8Bytes(seed)).slice(26)}`;
const NAMES = ['Quartz', 'Ember Fox', 'Low Tide', 'Signal', 'Paper Crane', 'Saltmarsh', 'Copper', 'Night Shift', 'Halo', 'Brine', 'Wicker', 'Static'];

function prng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

export function createSimFeed(store, { fixturePath, now = () => Date.now(), seed = 7, onLaunch = () => {}, onTrade = () => {} } = {}) {
  const rand = prng(seed);
  let counter = Number(store.meta('sim.counter') ?? 0);

  function seedFromFixture() {
    if (store.meta('sim.seeded')) return 0;
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
    const at = now();
    for (const f of fixture.launches) {
      const age = fixture.updatedAt - f.createdAt;
      const raw = {
        address: f.address, name: f.name, symbol: f.symbol, decimals: 18, image: null, padId: f.pad?.id ?? null, pad: f.pad,
        createdAt: at - age, createdBlock: f.createdBlock, creator: f.creator, pool: { address: f.pool.address, venue: 'uniswap-v3', fee: f.pool.fee },
        totalSupply: 1_000_000_000, liquidityHype: Number(f.liquidityHype), simHolders: f.holders, simTop10Pct: f.top10Pct,
        simStage: f.stage === 'migrated' ? 'migrated' : undefined, safety: f.safety, ai: f.ai, router: f.router, links: {},
      };
      store.putLaunch(raw, 'simulated');
      backfill(raw, Number(f.priceHype), Number(f.volume24hHype), Math.min(f.txCount24h, 400), Math.min(age, 24 * 60 * MIN), at);
    }
    store.setMeta('sim.seeded', at);
    return fixture.launches.length;
  }

  function backfill(raw, endPrice, volume, count, span, at) {
    if (!count) return;
    let price = endPrice;
    const points = [];
    for (let i = 0; i < count; i++) {
      const t = at - Math.floor((i / count) * span) - Math.floor(rand() * 5000);
      points.push({ t, price });
      price = price / (1 + (rand() - 0.48) * 0.06);
    }
    const unit = volume / count;
    for (const [i, p] of points.reverse().entries()) {
      const hype = unit * (0.3 + rand() * 1.4), side = rand() > 0.45 ? 'buy' : 'sell';
      store.addTrade({ token: raw.address, tx: `sim-${raw.address.slice(2, 10)}-${i}`, logIndex: 0, t: p.t, side, trader: fakeAddress(`${raw.address}:${Math.floor(rand() * Math.max(8, count / 2))}`), hype, tokens: hype / p.price, price: p.price });
    }
  }

  function newLaunch(at) {
    counter += 1; store.setMeta('sim.counter', counter);
    const name = `${NAMES[counter % NAMES.length]} ${counter}`;
    const symbol = name.replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase() + (counter % 100);
    const address = fakeAddress(`sim-launch-${counter}`);
    const raw = {
      address, name, symbol, decimals: 18, image: null, padId: null, pad: null, createdAt: at, createdBlock: 2_000_000 + counter * 300,
      creator: fakeAddress(`sim-creator-${counter}`), pool: { address: fakeAddress(`sim-pool-${counter}`), venue: 'uniswap-v3', fee: 10000 },
      totalSupply: 1_000_000_000, liquidityHype: 5 + rand() * 30, simHolders: 1, simTop10Pct: null, safety: { checks: [], checkedAt: null }, ai: null, router: null, links: {},
    };
    store.putLaunch(raw, 'simulated');
    onLaunch(address);
    return address;
  }

  // One step: a few trades on random live launches, sometimes a new launch.
  function tick() {
    const at = now();
    if (rand() < 0.08) newLaunch(at);
    const list = store.list({ pads: [], hypercoreListed: new Set() }, { limit: 200 }, at);
    for (let i = 0; i < 3 && list.length; i++) {
      const l = list[Math.floor(rand() * list.length)];
      const raw = store.getRaw(l.address);
      const last = Number(l.priceHype) || 0.0000002;
      const side = rand() > 0.46 ? 'buy' : 'sell';
      const price = last * (1 + (side === 'buy' ? 1 : -1) * rand() * 0.03);
      const hype = 0.05 + rand() * 2;
      store.addTrade({ token: l.address, tx: `sim-${at}-${i}`, logIndex: 0, t: at, side, trader: fakeAddress(`${l.address}:${Math.floor(rand() * 60)}`), hype, tokens: hype / price, price });
      const holders = (raw.simHolders ?? 1) + (side === 'buy' && rand() < 0.4 ? 1 : 0);
      store.putLaunch({ ...raw, simHolders: holders, liquidityHype: Math.max(1, (raw.liquidityHype ?? 5) + (side === 'buy' ? hype : -hype) * 0.5) }, 'simulated');
      onTrade(l.address);
    }
    store.prune(at - 26 * 60 * MIN);
  }

  let timer = null;
  return {
    seedFromFixture, tick, newLaunch,
    start(ms = 3000) { seedFromFixture(); timer ??= setInterval(tick, ms); timer.unref?.(); },
    stop() { if (timer) clearInterval(timer); timer = null; },
  };
}
