// Live Elysium launch indexer.
//
// Reads, in confirmed block ranges:
//   - Uniswap v3 PoolCreated where one side is WHYPE: a launch
//   - Swap on those pools: trades, price and volume
//   - Transfer on those tokens: balances, so holders are counted, not estimated
//   - Misthra RouterDeployed and SubjectBound: which launches route their fees
// and writes everything to the shared terminal store with source "live".
// Pad attribution uses only contract addresses the pads publish (ELYSIUM_PADS_FILE).
import { Contract, Interface, formatUnits, id as topic } from 'ethers';
import { probeSafety } from '../server/terminal/scoring.mjs';
import { explorerLink } from '../chain/elysium.mjs';

const v3 = new Interface([
  'event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)',
  'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)',
]);
const token = new Interface(['event Transfer(address indexed from, address indexed to, uint256 value)', 'function name() view returns (string)', 'function symbol() view returns (string)', 'function decimals() view returns (uint8)', 'function totalSupply() view returns (uint256)', 'function balanceOf(address) view returns (uint256)']);
const routerEvents = new Interface([
  'event RouterDeployed(address indexed router, address indexed creator, bytes32 indexed userSalt, bytes32 derivedSalt, bytes32 configHash, bool created)',
  'event SubjectBound(address indexed subject, address indexed binder)',
]);
const routerView = ['function bucketCount() view returns (uint256)', 'function bucketInfo(uint8) view returns ((uint8 kind,address token) output,address resolvedOutput,uint16 bps,uint256 conversionCount,uint256 allocationCount)'];
const T = {
  poolCreated: v3.getEvent('PoolCreated').topicHash, swap: v3.getEvent('Swap').topicHash, transfer: topic('Transfer(address,address,uint256)'),
  routerDeployed: routerEvents.getEvent('RouterDeployed').topicHash, subjectBound: routerEvents.getEvent('SubjectBound').topicHash,
};
const lower = (a) => a.toLowerCase();
const chunks = (list, n) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));

export function createIndexer(store, provider, config, { onLaunch = () => {}, onTrade = () => {}, log = () => {}, rangeSize = 5000 } = {}) {
  const blockTime = new Map();
  const timeOf = async (n) => { if (!blockTime.has(n)) { blockTime.set(n, (await provider.getBlock(n)).timestamp * 1000); if (blockTime.size > 5000) blockTime.delete(blockTime.keys().next().value); } return blockTime.get(n); };
  const tracked = () => JSON.parse(store.meta('idx.tracked') ?? '{}'); // pool -> token
  const saveTracked = (m) => store.setMeta('idx.tracked', JSON.stringify(m));
  const routers = () => new Set(JSON.parse(store.meta('idx.routers') ?? '[]'));
  const padFor = (addresses) => config.pads.find((p) => p.contracts.some((c) => addresses.includes(c))) ?? null;

  async function erc20(address) {
    const c = new Contract(address, token, provider);
    const [name, symbol, decimals, supply] = await Promise.all([c.name().catch(() => '?'), c.symbol().catch(() => '?'), c.decimals().catch(() => 18n), c.totalSupply().catch(() => 0n)]);
    return { name: String(name).slice(0, 80), symbol: String(symbol).slice(0, 24), decimals: Number(decimals), totalSupply: Number(formatUnits(supply, decimals)) };
  }

  const quotes = new Set(config.whypes ?? [config.whype]);
  async function liquidity(pool, quote = config.whype) {
    const raw = await provider.call({ to: quote, data: token.encodeFunctionData('balanceOf', [pool]) });
    return Number(formatUnits(BigInt(raw), 18)) * 2; // both sides valued at the WHYPE side: a convention, labelled as such in the docs
  }

  async function onPoolCreated(entry) {
    const e = v3.parseLog(entry);
    const [t0, t1] = [lower(e.args.token0), lower(e.args.token1)];
    if (!quotes.has(t0) && !quotes.has(t1)) return;
    const quote = quotes.has(t0) ? t0 : t1;
    const launchToken = quote === t0 ? t1 : t0, pool = lower(e.args.pool);
    const [meta, tx, at] = await Promise.all([erc20(launchToken), provider.getTransaction(entry.transactionHash), timeOf(entry.blockNumber)]);
    const pad = padFor([lower(tx.to ?? ''), lower(tx.from)]);
    const map = tracked(); map[pool] = launchToken; saveTracked(map);
    const { created } = store.putLaunch({
      address: launchToken, ...meta, image: null, padId: pad?.id ?? null, createdAt: at, createdBlock: entry.blockNumber, creator: lower(tx.from),
      pool: { address: pool, venue: 'uniswap-v3', fee: Number(e.args.fee), token0IsLaunch: t0 === launchToken, factory: lower(entry.address), quote }, liquidityHype: await liquidity(pool, quote).catch(() => 0),
      links: { explorer: explorerLink(config, 'token', launchToken), pool: explorerLink(config, 'address', pool) }, safety: { checks: [], checkedAt: null }, ai: null,
    }, 'live');
    if (created) { onLaunch(launchToken); refreshSafety(launchToken).catch((err) => log(`safety ${launchToken}: ${err.message}`)); }
  }

  async function onSwap(entry, poolToken) {
    const raw = store.getRaw(poolToken);
    if (!raw) return;
    const e = v3.parseLog(entry);
    const launchIs0 = raw.pool.token0IsLaunch;
    const tokenDelta = launchIs0 ? e.args.amount0 : e.args.amount1, hypeDelta = launchIs0 ? e.args.amount1 : e.args.amount0;
    const abs = (x) => (x < 0n ? -x : x);
    const tokens = Number(formatUnits(abs(tokenDelta), raw.decimals)), hype = Number(formatUnits(abs(hypeDelta), 18));
    if (!tokens || !hype) return;
    // The pool paying out the launch token (negative delta) is a buy. The trader is the
    // swap recipient: exact for direct swaps, the router for some routed sells.
    store.addTrade({ token: poolToken, tx: entry.transactionHash, logIndex: entry.index, t: await timeOf(entry.blockNumber), side: tokenDelta < 0n ? 'buy' : 'sell', trader: e.args.recipient, hype, tokens, price: hype / tokens });
    onTrade(poolToken);
  }

  function onTransfer(entry) {
    const e = token.parseLog(entry), t = lower(entry.address), value = e.args.value;
    const from = lower(e.args.from), to = lower(e.args.to);
    if (from !== '0x0000000000000000000000000000000000000000') store.setBalance(t, from, store.balanceOf(t, from) - value);
    store.setBalance(t, to, store.balanceOf(t, to) + value);
  }

  async function onSubjectBound(entry) {
    const routerAddress = lower(entry.address);
    if (!routers().has(routerAddress)) return; // only routers our factory deployed
    const subject = lower(routerEvents.parseLog(entry).args.subject);
    const raw = store.getRaw(subject);
    if (!raw) return;
    const r = new Contract(routerAddress, routerView, provider);
    const count = Number(await r.bucketCount());
    const buckets = [];
    for (let i = 0; i < count; i++) {
      const info = await r.bucketInfo(i);
      const kind = Number(info.output.kind);
      buckets.push({ label: kind === 2 ? 'Buyback and burn' : kind === 0 ? 'Wallets in native HYPE' : 'Wallets in WHYPE', bps: Number(info.bps) });
    }
    store.putLaunch({ ...raw, router: { address: routerAddress, buckets } }, 'live');
  }

  async function refreshSafety(address) {
    const raw = store.getRaw(address);
    const pad = config.pads.find((p) => p.id === raw.padId) ?? null;
    const holders = store.holders(raw);
    const safety = await probeSafety(provider, { token: address, pad, top10Pct: holders.count ? holders.top10Pct : null });
    store.putLaunch({ ...store.getRaw(address), safety }, 'live');
  }

  async function scan(from, to) {
    const created = await provider.getLogs({ address: config.v3Factories ?? [config.v3Factory], topics: [T.poolCreated], fromBlock: from, toBlock: to });
    for (const entry of created) await onPoolCreated(entry);
    const map = tracked(), pools = Object.keys(map);
    const logs = [];
    for (const group of chunks(pools, 200)) logs.push(...await provider.getLogs({ address: group, topics: [T.swap], fromBlock: from, toBlock: to }));
    for (const group of chunks([...new Set(Object.values(map))], 200)) logs.push(...await provider.getLogs({ address: group, topics: [T.transfer], fromBlock: from, toBlock: to }));
    if (config.routerFactory) {
      const deployed = await provider.getLogs({ address: config.routerFactory, topics: [T.routerDeployed], fromBlock: from, toBlock: to });
      if (deployed.length) { const set = routers(); for (const d of deployed) set.add(lower(routerEvents.parseLog(d).args.router)); store.setMeta('idx.routers', JSON.stringify([...set])); }
      logs.push(...await provider.getLogs({ topics: [T.subjectBound], fromBlock: from, toBlock: to }));
    }
    logs.sort((a, b) => a.blockNumber - b.blockNumber || a.index - b.index);
    const touchedPools = new Set();
    for (const entry of logs) {
      if (entry.topics[0] === T.swap) { touchedPools.add(lower(entry.address)); await onSwap(entry, map[lower(entry.address)]); }
      else if (entry.topics[0] === T.transfer) onTransfer(entry);
      else if (entry.topics[0] === T.subjectBound) await onSubjectBound(entry);
    }
    for (const pool of touchedPools) {
      const raw = store.getRaw(map[pool]);
      if (raw) store.putLaunch({ ...raw, liquidityHype: await liquidity(pool, raw.pool.quote).catch(() => raw.liquidityHype) }, 'live');
    }
  }

  async function step() {
    const head = await provider.getBlockNumber();
    const safeHead = head - config.confirmations;
    let next = Number(store.meta('idx.next') ?? config.startBlock ?? Math.max(0, safeHead - 10_000));
    if (next > safeHead) return { from: next, to: next - 1, head };
    const to = Math.min(safeHead, next + rangeSize - 1);
    await scan(next, to);
    store.setMeta('idx.next', to + 1);
    store.setMeta('idx.indexedBlock', to);
    return { from: next, to, head };
  }

  let timer = null, running = false;
  return {
    step, refreshSafety,
    start(ms = 2000) {
      timer ??= setInterval(async () => {
        if (running) return;
        running = true;
        try { const r = await step(); if (r.to >= r.from) log(`indexed ${r.from}-${r.to} (head ${r.head})`); }
        catch (err) { log(`indexer: ${err.message}`); }
        finally { running = false; }
      }, ms);
      timer.unref?.();
    },
    stop() { if (timer) clearInterval(timer); timer = null; },
  };
}
