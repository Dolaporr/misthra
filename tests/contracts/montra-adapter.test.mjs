import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ganache from 'ganache';
import { BrowserProvider, ContractFactory, ZeroAddress, parseEther, id } from 'ethers';
import { compileRouter } from '../../scripts/compile-contracts.mjs';
import { planRouter } from '../../chain/router-plan.mjs';
import { readRouterSnapshot } from '../../chain/router-reads.mjs';
import { prepareRouterAction } from '../../chain/router-actions.mjs';
import { montraOptions, planMontraLaunch, planMontraSwitch, MontraPlanError } from '../../chain/montra-launch.mjs';
import { builderSuffix } from '../../chain/montra.mjs';
import { readMontraModules, checkSampleToken } from '../../scripts/deploy-montra-adapter.mjs';

const src = (n) => readFileSync(new URL(n, import.meta.url), 'utf8');

// A Montra launch whose creator fees go through a MisthraMontraAdapter into a fee router:
// plan (adapter named) → deploy router → launch with the adapter as recipient → anyone
// activates → fees accrue in the hook → anyone claims and forwards → router splits.
test('Montra adapter: claim-based fees reach the router, and only through checked activation', async (t) => {
  const { artifacts } = compileRouter({ evmVersion: 'shanghai', extraSources: { 'tests/contracts/RouterMocks.sol': src('RouterMocks.sol'), 'tests/contracts/MontraMocks.sol': src('MontraMocks.sol') } });
  const rpc = ganache.provider({ logging: { quiet: true }, chain: { chainId: 31337, hardfork: 'shanghai' }, wallet: { totalAccounts: 6, defaultBalance: 1000 } });
  t.after(() => rpc.disconnect());
  const provider = new BrowserProvider(rpc, undefined, { cacheTimeout: -1 }); provider.pollingInterval = 10;
  const [deployer, creator, team, treasury, stranger, victim] = await Promise.all([0, 1, 2, 3, 4, 5].map((i) => provider.getSigner(i)));
  const [C, TM, TR, X, V] = await Promise.all([creator, team, treasury, stranger, victim].map((s) => s.getAddress()));
  const deploy = async (name, ...args) => { const k = await new ContractFactory(artifacts[name].abi, artifacts[name].bytecode, deployer).deploy(...args); await k.waitForDeployment(); return k; };
  const wait = async (p) => (await p).wait();
  const E = parseEther;

  const whype = await deploy('MockWHYPE'), venue = await deploy('MockV3Router'), guard = await deploy('MockPriceGuard');
  const W = (await whype.getAddress()).toLowerCase();
  const swap = await deploy('MisthraV3SwapAdapter', await venue.getAddress(), W);
  const impl = await deploy('MisthraFeeRouter'), routers = await deploy('MisthraFeeRouterFactory', await impl.getAddress());
  const hook = await deploy('MockMontraHook'), master = await deploy('MockMontraToken');
  const H = await hook.getAddress();
  const montra = await deploy('MockMontraLaunchFactory', await master.getAddress(), H);
  const adapters = await deploy('MisthraMontraAdapterFactory', H, await master.getAddress());
  const config = { live: true, chainId: 31337, confirmations: 0, whype: W, routerFactory: (await routers.getAddress()).toLowerCase(), routerSwapAdapter: (await swap.getAddress()).toLowerCase(), routerSharedGuard: (await guard.getAddress()).toLowerCase(), routerProtocolFeeRecipient: TR, routerReady: true };
  const buckets = [{ kind: 'native', bps: 10000, wallets: [{ address: C, bps: 6000 }, { address: TM, bps: 4000 }] }];

  // 1. Predict the router, then the adapter from it, then plan the router naming the adapter.
  const first = await planRouter(provider, config, { creator: C, buckets });
  const R = first.predictedAddress;
  const A = (await adapters.predict(R)).toLowerCase();
  const plan = await planRouter(provider, config, { creator: C, buckets, salt: first.salt, launchpadAdapter: A });
  assert.equal(plan.predictedAddress, R, 'naming the adapter does not move the router');
  assert.equal(plan.config.launchpadAdapter.toLowerCase(), A);
  await wait(creator.sendTransaction({ to: plan.deployTx.to, data: plan.deployTx.data }));

  // 2. Launch on "Montra" with the adapter (not yet deployed) as the fee recipient.
  const salt = id('launch-1');
  const [T] = await montra.connect(creator).launch.staticCall(salt, A);
  await wait(montra.connect(creator).launch(salt, A));

  // Activation refuses anything the creator did not make.
  const fake = await deploy('FakeMontraToken', C, H);
  await assert.rejects(adapters.connect(stranger).activate.staticCall(R, await fake.getAddress(), ZeroAddress), /NotMontraToken/);
  const [T2] = await montra.connect(victim).launch.staticCall(id('other'), A);
  await wait(montra.connect(victim).launch(id('other'), A));
  await assert.rejects(adapters.connect(stranger).activate.staticCall(R, T2, ZeroAddress), /CreatorMismatch/, 'another creator\'s token cannot be bound');
  const lone = await planRouter(provider, config, { creator: C, buckets });
  await wait(creator.sendTransaction({ to: lone.deployTx.to, data: lone.deployTx.data }));
  await assert.rejects(adapters.connect(stranger).activate.staticCall(lone.predictedAddress, T, ZeroAddress), /AdapterNotNamed/);

  // 3. Anyone activates: the adapter appears at the predicted address and binds the router.
  await wait(adapters.connect(stranger).activate(R, T, ZeroAddress));
  const adapter = new (await import('ethers')).Contract(A, artifacts.MisthraMontraAdapter.abi, stranger);
  assert.equal((await adapter.router()).toLowerCase(), R);
  assert.equal((await adapter.subject()).toLowerCase(), T.toLowerCase());
  let s = await readRouterSnapshot(provider, config, R);
  assert.equal(s.bound, true); assert.equal(s.subject, T.toLowerCase());
  await assert.rejects(adapters.connect(stranger).activate.staticCall(R, T, ZeroAddress), 'only once');
  await assert.rejects(adapter.initialize.staticCall(H, R, T, ZeroAddress), /AlreadyInitialized/);
  const implementation = new (await import('ethers')).Contract(await adapters.implementation(), artifacts.MisthraMontraAdapter.abi, stranger);
  await assert.rejects(implementation.initialize.staticCall(H, R, T, ZeroAddress), /AlreadyInitialized/, 'the implementation is locked');

  // 4. Trades accrue 2 HYPE of creator fees in the hook; anyone claims and forwards; anyone syncs.
  const poolId = await adapter.poolId();
  await wait(hook.accrue(poolId, { value: E('2') }));
  assert.equal(await adapter.collectAndForward.staticCall(), E('2'));
  await wait(adapter.collectAndForward());
  assert.equal(await provider.getBalance(R), E('2'));
  assert.equal(await adapter.collectAndForward.staticCall(), 0n, 'nothing accrued is a no-op, not a revert');
  const sync = await prepareRouterAction(provider, config, R, { action: 'sync', from: X, params: { asset: ZeroAddress } });
  assert.ok(sync.ok, sync.reason);
  await wait(stranger.sendTransaction({ to: sync.tx.to, data: sync.tx.data }));
  s = await readRouterSnapshot(provider, config, R);
  assert.equal(String(s.buckets[0].inputOwed), String(E('1.98')), '1% protocol fee leaves 1.98 HYPE for the bucket');

  // A recipient can only be moved by the current recipient (the adapter has no such function).
  await assert.rejects(hook.connect(creator).updateRecipient.staticCall(poolId, C), /not recipient/);
});

// The planner's three unsigned transactions, sent as-is, launch a coin whose fees reach the
// router; the switch planner moves an existing coin's fees onto a router.
test('Launch on Montra planner: launch and switch flows work as signed by the creator', async (t) => {
  const { artifacts } = compileRouter({ evmVersion: 'shanghai', extraSources: { 'tests/contracts/RouterMocks.sol': src('RouterMocks.sol'), 'tests/contracts/MontraMocks.sol': src('MontraMocks.sol') } });
  const rpc = ganache.provider({ logging: { quiet: true }, chain: { chainId: 31337, hardfork: 'shanghai' }, wallet: { totalAccounts: 4, defaultBalance: 1000 } });
  t.after(() => rpc.disconnect());
  const provider = new BrowserProvider(rpc, undefined, { cacheTimeout: -1 }); provider.pollingInterval = 10;
  const [deployer, creator, team, stranger] = await Promise.all([0, 1, 2, 3].map((i) => provider.getSigner(i)));
  const [C, TM] = await Promise.all([creator, team].map((s) => s.getAddress()));
  const deploy = async (name, ...args) => { const k = await new ContractFactory(artifacts[name].abi, artifacts[name].bytecode, deployer).deploy(...args); await k.waitForDeployment(); return k; };
  const wait = async (p) => (await p).wait();
  const send = (signer, tx) => wait(signer.sendTransaction({ to: tx.to, data: tx.data, value: BigInt(tx.value) }));
  const E = parseEther;

  const whype = await deploy('MockWHYPE'), venue = await deploy('MockV3Router'), guard = await deploy('MockPriceGuard');
  const W = (await whype.getAddress()).toLowerCase();
  const swap = await deploy('MisthraV3SwapAdapter', await venue.getAddress(), W);
  const impl = await deploy('MisthraFeeRouter'), routers = await deploy('MisthraFeeRouterFactory', await impl.getAddress());
  const hook = await deploy('MockMontraHook'), master = await deploy('MockMontraToken');
  const H = await hook.getAddress();
  const factory = await deploy('MockMontraFactoryFull', await master.getAddress(), H);
  const adapters = await deploy('MisthraMontraAdapterFactory', H, await master.getAddress());
  const config = { live: true, chainId: 31337, confirmations: 0, whype: W, routerFactory: (await routers.getAddress()).toLowerCase(), routerSwapAdapter: (await swap.getAddress()).toLowerCase(), routerSharedGuard: (await guard.getAddress()).toLowerCase(), routerProtocolFeeRecipient: await deployer.getAddress(), routerReady: true };
  const montra = { factory: await factory.getAddress(), adapterFactory: await adapters.getAddress(), hook: H, builderCode: 'misthra', ready: true };
  const buckets = [{ kind: 'native', bps: 10000, wallets: [{ address: C, bps: 5000 }, { address: TM, bps: 5000 }] }];

  // The deploy script reads hook + token master from Montra and checks them on a real coin.
  const mods = await readMontraModules(provider, montra.factory);
  assert.equal(mods.hook, H); assert.equal(mods.tokenMaster, await master.getAddress()); assert.deepEqual(mods.coveredConfigs, [0]);

  const opts = await montraOptions(provider, config, montra);
  assert.equal(opts.launchEnabled, true);
  assert.deepEqual(opts.configs.map((c) => c.id), [0], 'disabled configs are not offered');
  assert.equal(opts.configs[0].native, true);
  assert.equal(opts.configs[0].totalFeePct, 1);

  await assert.rejects(planMontraLaunch(provider, config, montra, { creator: C, name: 'X', symbol: 'X', configId: 1, buckets }), (e) => e instanceof MontraPlanError && e.code === 'config_unavailable');
  await assert.rejects(planMontraLaunch(provider, { ...config, live: false }, montra, { creator: C }), (e) => e.status === 503);

  const plan = await planMontraLaunch(provider, config, montra, { creator: C, name: 'Misthra Test', symbol: 'MTST', description: 'hi', configId: 0, firstBuy: '0.5', buckets });
  assert.deepEqual(plan.steps.map((s) => s.id), ['router', 'launch', 'activate']);
  assert.equal(plan.steps[1].tx.value, String(E('0.51')), 'launch fee + first buy');
  assert.ok(plan.steps[1].tx.data.endsWith(builderSuffix('misthra')), 'builder code appended');
  assert.equal(plan.routerConfig.launchpadAdapter.toLowerCase(), plan.adapter);
  for (const s of plan.steps) await send(creator, s.tx);
  assert.equal(await factory.lastName(), 'Misthra Test', 'Montra decoded the params despite the suffix');
  const adapter = new (await import('ethers')).Contract(plan.adapter, artifacts.MisthraMontraAdapter.abi, stranger);
  assert.equal((await adapter.subject()).toLowerCase(), plan.token);
  await wait(hook.accrue(await adapter.poolId(), { value: E('1') }));
  await wait(adapter.collectAndForward());
  assert.equal(await provider.getBalance(plan.router), E('1'));

  // Switch: a coin launched with fees to the creator's own wallet moves onto a router.
  const own = await planMontraLaunch(provider, config, { ...montra, builderCode: null }, { creator: C, name: 'Old', symbol: 'OLD', configId: 0, buckets });
  const { feeRecipients } = { feeRecipients: [C] };
  const iface = new (await import('ethers')).Interface(artifacts.MockMontraFactoryFull.abi);
  const params = { name: 'Old', symbol: 'OLD', metadataURI: '', profile: { logo: '', description: '', socials: { telegram: '', twitter: '', discord: '', website: '', extra: '' } }, configId: 0, supply: 10n ** 27n, salt: id('old'), feeRecipients, feeShares: [10000], firstBuyAmount: 0, firstBuyMinOut: 0, permit: { deadline: 0, v: 0, r: '0x' + '00'.repeat(32), s: '0x' + '00'.repeat(32) } };
  await wait(creator.sendTransaction({ to: montra.factory, data: iface.encodeFunctionData('launch', [params]), value: E('0.01') }));
  const oldToken = await factory.predictTokenAddress(C, id('old'), 0);
  await checkSampleToken(provider, oldToken, mods);
  await assert.rejects(checkSampleToken(provider, plan.router, mods), /not a plain EIP-1167 clone/);
  assert.equal(own.steps[1].tx.data.includes('80218021'), false, 'no builder code configured, no suffix');
  await assert.rejects(planMontraSwitch(provider, config, montra, { creator: TM, token: oldToken, buckets }), (e) => e.code === 'not_creator');
  const sw = await planMontraSwitch(provider, config, montra, { creator: C, token: oldToken, buckets });
  assert.deepEqual(sw.steps.map((s) => s.id), ['router', 'recipient', 'activate']);
  for (const s of sw.steps) await send(creator, s.tx);
  assert.equal((await hook.recipient(sw.poolId)).toLowerCase(), sw.adapter);
  await wait(hook.accrue(sw.poolId, { value: E('2') }));
  const a2 = new (await import('ethers')).Contract(sw.adapter, artifacts.MisthraMontraAdapter.abi, stranger);
  await wait(a2.collectAndForward());
  assert.equal(await provider.getBalance(sw.router), E('2'));
});
