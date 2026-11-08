import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import ganache from 'ganache';
import { BrowserProvider, ContractFactory, ZeroAddress, keccak256, parseEther } from 'ethers';
import { compileRouter } from '../../scripts/compile-contracts.mjs';
import { createTerminalStore } from '../../server/terminal/store.mjs';
import { createIndexer } from '../../indexer/elysium.mjs';

// The live indexer against a disposable EVM: a pad launches a token into a WHYPE
// pool, trades and transfers happen, and a real Misthra router is bound to it.
test('indexer turns pool, swap, transfer and router events into launches', async (t) => {
  const mocks = (name) => readFileSync(new URL(name, import.meta.url), 'utf8');
  const { artifacts } = compileRouter({ evmVersion: 'shanghai', extraSources: { 'tests/contracts/RouterMocks.sol': mocks('RouterMocks.sol'), 'tests/contracts/IndexerMocks.sol': mocks('IndexerMocks.sol') } });
  const rpc = ganache.provider({ logging: { quiet: true }, chain: { chainId: 31337, hardfork: 'shanghai' }, wallet: { totalAccounts: 4, defaultBalance: 1000 } });
  t.after(() => rpc.disconnect());
  const provider = new BrowserProvider(rpc, undefined, { cacheTimeout: -1 }); provider.pollingInterval = 10;
  const [deployer, creator, buyer] = await Promise.all([0, 1, 2].map((i) => provider.getSigner(i)));
  const deploy = async (name, ...args) => { const k = await new ContractFactory(artifacts[name].abi, artifacts[name].bytecode, deployer).deploy(...args); await k.waitForDeployment(); return k; };
  const wait = async (p) => (await p).wait();

  const whype = await deploy('MockWHYPE'), factory = await deploy('MockEventFactory'), pad = await deploy('MockPad');
  // A pad with its own factory and its own wrapped HYPE, as one pad's docs describe.
  const padFactory = await deploy('MockEventFactory'), padWhype = await deploy('MockWHYPE');
  const impl = await deploy('MisthraFeeRouter'), routerFactory = await deploy('MisthraFeeRouterFactory', await impl.getAddress());
  const W = (await whype.getAddress()).toLowerCase();
  const config = {
    live: true, whype: W, whypes: [W, (await padWhype.getAddress()).toLowerCase()], v3Factory: (await factory.getAddress()).toLowerCase(), v3Factories: [(await factory.getAddress()).toLowerCase(), (await padFactory.getAddress()).toLowerCase()], routerFactory: (await routerFactory.getAddress()).toLowerCase(),
    pads: [{ id: 'testpad', name: 'Test Pad', url: null, locksLiquidity: true, contracts: [(await pad.getAddress()).toLowerCase()] }],
    confirmations: 0, startBlock: 0, hypercoreListed: new Set(), explorer: null,
  };
  const store = createTerminalStore(new DatabaseSync(':memory:'));
  const launched = [], traded = [];
  const indexer = createIndexer(store, provider, config, { onLaunch: (a) => launched.push(a), onTrade: (a) => traded.push(a) });

  // Launch through the pad, then give the pool some WHYPE.
  const [token, pool] = await pad.connect(creator).launch.staticCall(await factory.getAddress(), W, 'Indexed', 'IDX');
  await wait(pad.connect(creator).launch(await factory.getAddress(), W, 'Indexed', 'IDX'));
  await wait(deployer.sendTransaction({ to: W, value: parseEther('30') }));
  await wait(whype.transfer(pool, parseEther('30')));
  // Unrelated pool (not quoted in WHYPE) must be ignored.
  const other = await deploy('MockToken', 'Other', 'OTH');
  await wait(factory.createPool(await other.getAddress(), await impl.getAddress(), 3000));

  // A buy: the pool pays out 1,000 tokens and receives 2 WHYPE. Then a sell.
  const tokenIs0 = token.toLowerCase() < W;
  const legs = (tokens, hype) => (tokenIs0 ? [tokens, hype] : [hype, tokens]);
  const poolContract = new ContractFactory(artifacts.MockEventPool.abi, artifacts.MockEventPool.bytecode).attach(pool).connect(buyer);
  await wait(poolContract.swap(...legs(-parseEther('1000'), parseEther('2')), await buyer.getAddress()));
  await wait(poolContract.swap(...legs(parseEther('500'), -parseEther('0.9')), await buyer.getAddress()));
  const tokenContract = new ContractFactory(artifacts.MockToken.abi, artifacts.MockToken.bytecode).attach(token).connect(creator);
  await wait(tokenContract.transfer(await buyer.getAddress(), parseEther('1000')));

  // Bind a real Misthra router to the launch.
  const routerConfig = { creator: await creator.getAddress(), protocolFeeRecipient: await deployer.getAddress(), whype: W, launchpadAdapter: ZeroAddress, normalizations: [],
    buckets: [{ output: { kind: 1, token: W }, bps: 10000, route: { adapter: ZeroAddress, routeData: '0x' }, priceGuard: ZeroAddress, maxAmountInPerCall: parseEther('1000'), allocations: [{ destination: await creator.getAddress(), bps: 10000, isSink: false, creatorMayRepoint: false, sinkConfig: '0x' }] }] };
  const salt = keccak256('0x01');
  await wait(routerFactory.connect(creator).deployForLaunchpad(await creator.getAddress(), salt, routerConfig));
  const routerAddress = await routerFactory.predictLaunchpadAddress(await creator.getAddress(), salt);
  const router = new ContractFactory(artifacts.MisthraFeeRouter.abi, artifacts.MisthraFeeRouter.bytecode).attach(routerAddress).connect(creator);
  await wait(router.bind(token));

  const [padToken, padPool] = await pad.connect(creator).launch.staticCall(await padFactory.getAddress(), await padWhype.getAddress(), 'Own Factory', 'OWN');
  await wait(pad.connect(creator).launch(await padFactory.getAddress(), await padWhype.getAddress(), 'Own Factory', 'OWN'));

  let r; do { r = await indexer.step(); } while (r.to < r.head);
  await indexer.refreshSafety(token.toLowerCase());

  assert.deepEqual(launched, [token.toLowerCase(), padToken.toLowerCase()], 'WHYPE pools on every configured factory are launches; the other pool is not');
  const own = store.getRaw(padToken);
  assert.equal(own.pool.factory, (await padFactory.getAddress()).toLowerCase());
  assert.equal(own.pool.quote, (await padWhype.getAddress()).toLowerCase());
  assert.equal(own.pool.address, padPool.toLowerCase());
  const raw = store.getRaw(token);
  assert.equal(raw.source, 'live');
  const api = store.toApi(raw, { ...config, pads: config.pads });
  assert.equal(api.symbol, 'IDX');
  assert.equal(api.pad.id, 'testpad', 'attributed by the pad contract the creator called');
  assert.equal(api.creator, (await creator.getAddress()).toLowerCase());
  assert.equal(api.liquidityHype, '60', 'WHYPE side valued twice');
  assert.equal(api.txCount24h, 2);
  assert.equal(api.volume24hHype, '2.9');
  assert.equal(api.priceHype, '0.0018', 'last trade: 0.9 HYPE for 500 tokens');
  const trades = store.trades(token);
  assert.deepEqual(trades.map((x) => x.side), ['sell', 'buy']);
  assert.equal(api.holders, 2, 'creator and buyer; the pool is excluded');
  assert.equal(api.router.address, routerAddress.toLowerCase());
  assert.deepEqual(api.router.buckets, [{ label: 'Wallets in WHYPE', bps: 10000 }]);
  const checks = Object.fromEntries(api.safety.checks.map((c) => [c.id, c.result]));
  assert.equal(checks.owner, 'pass');
  assert.equal(checks.mint, 'warn', 'the mock token can mint');
  assert.equal(checks['lp-locked'], 'pass');
  assert.equal(checks.tax, 'unknown');
  assert.equal(api.safety.status, 'warn');
});
