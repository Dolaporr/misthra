import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ganache from 'ganache';
import { AbiCoder, BrowserProvider, Contract, ContractFactory, ZeroAddress, keccak256, parseEther } from 'ethers';
import { compileRouter } from '../../scripts/compile-contracts.mjs';

// Behaviour checks for the Misthra fee router ported from Sinjoh. They run on a
// disposable in-process EVM; no public RPC, keys or funds are involved.
const E = parseEther;
const coder = AbiCoder.defaultAbiCoder();
const BURN = '0x000000000000000000000000000000000000dEaD';
const NATIVE = 0, FIXED = 1, SUBJECT = 2;
const fee3000 = coder.encode(['uint24'], [3000]);

// Ganache returns no revert data from estimateGas on this Node build, so every
// expected failure is checked through eth_call, which does carry the error.
async function reverts(method, ...rest) {
  const name = rest.pop();
  try { await method.staticCall(...rest); }
  catch (e) {
    const text = [e.revert?.name, e.shortMessage, e.message].filter(Boolean).join(' ');
    assert.ok(!name || e.revert?.name === name || text.includes(name), `expected ${name}, got: ${text.slice(0, 300)}`);
    return;
  }
  assert.fail(`expected revert ${name}`);
}

test('Misthra fee router: deterministic deployment, exact splits, guarded swaps, buyback-and-burn', async (t) => {
  const { artifacts, codehash } = compileRouter({ evmVersion: 'shanghai', extraSources: { 'tests/contracts/RouterMocks.sol': readFileSync(new URL('RouterMocks.sol', import.meta.url), 'utf8') } });
  const rpc = ganache.provider({ logging: { quiet: true }, chain: { chainId: 31337, hardfork: 'shanghai', vmErrorsOnRPCResponse: true }, wallet: { totalAccounts: 8, defaultBalance: 1000 }, miner: { timestampIncrement: 0 } });
  t.after(() => rpc.disconnect());
  const provider = new BrowserProvider(rpc, undefined, { cacheTimeout: -1 }); provider.pollingInterval = 10;
  const signers = await Promise.all([0, 1, 2, 3, 4, 5].map(i => provider.getSigner(i)));
  const [deployer, creator, partner, team, treasury, stranger] = signers;
  const [, c, p, tm, tr] = await Promise.all(signers.map(s => s.getAddress()));
  const deploy = async (name, ...args) => { const k = await new ContractFactory(artifacts[name].abi, artifacts[name].bytecode, deployer).deploy(...args); await k.waitForDeployment(); return k; };
  const wait = async (promise) => (await promise).wait();

  const whype = await deploy('MockWHYPE');
  const subject = await deploy('MockToken', 'Launch', 'LNCH');
  const v3 = await deploy('MockV3Router');
  const guard = await deploy('MockPriceGuard');
  const sink = await deploy('MockSink');
  const adapter = await deploy('MisthraV3SwapAdapter', await v3.getAddress(), await whype.getAddress());
  const impl = await deploy('MisthraFeeRouter');
  assert.equal(keccak256(await provider.getCode(await impl.getAddress())), codehash, 'implementation matches pinned hash');
  const factory = await deploy('MisthraFeeRouterFactory', await impl.getAddress());
  const W = await whype.getAddress(), S = await subject.getAddress(), A = await adapter.getAddress(), G = await guard.getAddress(), K = await sink.getAddress();

  // Liquidity for the mock venue.
  await wait(deployer.sendTransaction({ to: W, value: E('50') }));
  await wait(whype.transfer(await v3.getAddress(), E('50')));
  await wait(subject.mint(await v3.getAddress(), E('10000000')));

  const wallet = (destination, bps, creatorMayRepoint = false) => ({ destination, bps, isSink: false, creatorMayRepoint, sinkConfig: '0x' });
  const config = (overrides = {}) => ({
    creator: c, protocolFeeRecipient: tr, whype: W, launchpadAdapter: ZeroAddress,
    normalizations: [{ asset: { kind: SUBJECT, token: ZeroAddress }, route: { adapter: A, routeData: fee3000 }, priceGuard: G, maxAmountInPerCall: E('1000000000') }],
    buckets: [
      { output: { kind: FIXED, token: W }, bps: 5000, route: { adapter: ZeroAddress, routeData: '0x' }, priceGuard: ZeroAddress, maxAmountInPerCall: E('1000000'), allocations: [wallet(c, 7000, true), wallet(p, 3000)] },
      { output: { kind: NATIVE, token: ZeroAddress }, bps: 2000, route: { adapter: A, routeData: '0x' }, priceGuard: ZeroAddress, maxAmountInPerCall: E('1000000'), allocations: [wallet(tm, 10000)] },
      { output: { kind: SUBJECT, token: ZeroAddress }, bps: 3000, route: { adapter: A, routeData: fee3000 }, priceGuard: G, maxAmountInPerCall: E('1000000'), allocations: [wallet(BURN, 6000), { destination: K, bps: 4000, isSink: true, creatorMayRepoint: false, sinkConfig: '0x' }] },
    ],
    ...overrides,
  });
  const routerAt = (address, signer = deployer) => new Contract(address, artifacts.MisthraFeeRouter.abi, signer);
  const asCreator = factory.connect(creator);

  await t.test('implementation is locked and the factory refuses foreign code', async () => {
    await reverts(impl.initialize, config(), 'AlreadyInitialized');
    const foreign = await new ContractFactory(artifacts.MisthraFeeRouterFactory.abi, artifacts.MisthraFeeRouterFactory.bytecode, deployer).getDeployTransaction(W);
    await assert.rejects(provider.call(foreign), /revert|InvalidImplementation|0x/);
  });

  let router;
  await t.test('launchpad deployment address depends only on creator and salt', async () => {
    const salt = keccak256(coder.encode(['string'], ['first launch']));
    const predicted = await factory.predictLaunchpadAddress(c, salt);
    await reverts(factory.connect(stranger).deployForLaunchpad, c, salt, config(), 'Unauthorized');
    await wait(asCreator.deployForLaunchpad(c, salt, config()));
    assert.equal(await provider.getCode(predicted) !== '0x', true);
    router = routerAt(predicted);
    assert.equal(await router.creator(), c);
    assert.equal(await router.whype(), W);
    // Same salt with a different config cannot silently redirect fees.
    await reverts(asCreator.deployForLaunchpad, c, salt, config({ protocolFeeRecipient: p }), 'ConfigMismatch');
  });

  await t.test('invalid configurations never initialize', async () => {
    const bad = config(); bad.buckets[0].bps = 4999;
    await reverts(asCreator.deployForLaunchpad, c, keccak256('0x01'), bad, 'InitializationFailed');
    const burnNative = config(); burnNative.buckets[1].allocations = [wallet(BURN, 10000)];
    await reverts(asCreator.deployForLaunchpad, c, keccak256('0x02'), burnNative, 'InitializationFailed');
  });

  await t.test('only the creator binds, exactly once', async () => {
    await reverts(router.connect(stranger).bind, S, 'Unauthorized');
    await wait(router.connect(creator).bind(S));
    await reverts(router.connect(creator).bind, S, 'AlreadyBound');
    assert.equal(await router.subject(), S);
  });

  await t.test('WHYPE fees pay the 1% protocol fee and split across buckets', async () => {
    await wait(deployer.sendTransaction({ to: W, value: E('10') }));
    await wait(whype.transfer(await router.getAddress(), E('10')));
    await wait(router.connect(stranger)['sync(address)'](W));
    assert.equal(await router.protocolOwed(W), E('0.1'));
    assert.equal(await router.bucketInputOwed(0, W), E('4.95'));
    assert.equal(await router.bucketInputOwed(1, W), E('1.98'));
    assert.equal(await router.bucketInputOwed(2, W), E('2.97'));
    await wait(router.sendProtocolFee(W, E('0.1')));
    assert.equal(await whype.balanceOf(tr), E('0.1'));
  });

  await t.test('identity bucket pays wallets in WHYPE', async () => {
    await wait(router.processBucket(0, W, E('4.95'), 0, '0x'));
    assert.equal(await router.walletOwed(c, W), E('3.465'));
    assert.equal(await router.walletOwed(p, W), E('1.485'));
    await wait(router.connect(stranger).sendWallet(c, W, E('3.465')));
    assert.equal(await whype.balanceOf(c), E('3.465'));
  });

  await t.test('native bucket unwraps to HYPE', async () => {
    await wait(router.processBucket(1, W, E('1.98'), 0, '0x'));
    const before = await provider.getBalance(tm);
    await wait(router.connect(stranger).sendWallet(tm, ZeroAddress, E('1.98')));
    assert.equal(await provider.getBalance(tm) - before, E('1.98'));
  });

  await t.test('buyback bucket is held to the price guard, then burns and funds the sink', async () => {
    await wait(v3.setRate(1000, 1));
    await wait(guard.set(E('3000'), 300)); // demands more than the venue returns
    await reverts(router.processBucket, 2, W, E('2.97'), 0, '0x', '');
    await wait(guard.set(E('2821.5'), 300)); // 5% under the expected 2,970
    await reverts(router.processBucket, 2, W, E('2.97'), E('2971'), '0x', ''); // a caller floor can only tighten
    await wait(router.processBucket(2, W, E('2.97'), 0, '0x'));
    assert.equal(await router.walletOwed(BURN, S), E('1782'));
    await wait(router.sendWallet(BURN, S, E('1782')));
    assert.equal(await subject.balanceOf(BURN), E('1782'));
    await wait(router.fundSink(2, 1, E('1188')));
    assert.equal(await sink.total(), E('1188'));
    await wait(guard.set(E('1'), 0));
  });

  await t.test('subject-denominated fees need a floor and normalize to WHYPE', async () => {
    await wait(subject.mint(await router.getAddress(), E('500')));
    await reverts(router['sync(address)'], S, 'NormalizationFloorRequired');
    await reverts(router['sync(address,uint256)'], S, 0, 'NormalizationFloorRequired');
    await wait(v3.setRate(1, 1000));
    await wait(guard.set(E('0.45'), 300));
    await wait(router['sync(address,uint256)'](S, 1));
    assert.equal(await router.protocolOwed(W), E('0.005'));
    assert.equal(await router.bucketInputOwed(0, W), E('0.2475'));
  });

  await t.test('only repointable wallet allocations move, and only by the creator', async () => {
    await reverts(router.connect(stranger).repointWallet, 0, 0, tm, 'Unauthorized');
    await reverts(router.connect(creator).repointWallet, 0, 1, tm, 'ImmutableAllocation');
    await wait(router.connect(creator).repointWallet(0, 0, tm));
    assert.equal((await router.allocationInfo(0, 0))[0], tm);
  });

  await t.test('cumulative apportionment: many small syncs equal one large one', async () => {
    const make = async (label) => {
      const salt = keccak256(coder.encode(['string'], [label]));
      await wait(asCreator.deployForLaunchpad(c, salt, config()));
      const r = routerAt(await factory.predictLaunchpadAddress(c, salt));
      await wait(r.connect(creator).bind(S));
      return r;
    };
    const one = await make('one'), many = await make('many');
    const pay = async (r, amount) => { await wait(deployer.sendTransaction({ to: W, value: amount })); await wait(whype.transfer(await r.getAddress(), amount)); await wait(r['sync(address)'](W)); };
    const parts = [7n, 13n, 10001n, 3333n, 999999n];
    for (const part of parts) await pay(many, part);
    await pay(one, parts.reduce((a, b) => a + b));
    for (const id of [0, 1, 2]) assert.equal(await many.bucketInputOwed(id, W), await one.bucketInputOwed(id, W));
    // Accounting never exceeds the balance actually held.
    assert.ok(await whype.balanceOf(await many.getAddress()) >= await many.totalLiability(W));
  });
});

test('Misthra V3 TWAP price guard bounds output and refuses manipulated spot prices', async (t) => {
  const { artifacts } = compileRouter({ evmVersion: 'shanghai', extraSources: { 'tests/contracts/RouterMocks.sol': readFileSync(new URL('RouterMocks.sol', import.meta.url), 'utf8') } });
  const rpc = ganache.provider({ logging: { quiet: true }, chain: { chainId: 31337, hardfork: 'shanghai', vmErrorsOnRPCResponse: true }, wallet: { totalAccounts: 2 } });
  t.after(() => rpc.disconnect());
  const provider = new BrowserProvider(rpc, undefined, { cacheTimeout: -1 }); provider.pollingInterval = 10;
  const deployer = await provider.getSigner(0);
  const deploy = async (name, ...args) => { const k = await new ContractFactory(artifacts[name].abi, artifacts[name].bytecode, deployer).deploy(...args); await k.waitForDeployment(); return k; };
  const whype = await deploy('MockWHYPE'), subject = await deploy('MockToken', 'Launch', 'LNCH');
  const W = await whype.getAddress(), S = await subject.getAddress();
  const v3Factory = await deploy('MockV3Factory');
  const pool = await deploy('MockV3Pool', await v3Factory.getAddress(), S, W, 3000);
  const [t0, t1] = S.toLowerCase() < W.toLowerCase() ? [S, W] : [W, S];
  await (await v3Factory.setPool(t0, t1, 3000, await pool.getAddress())).wait();
  const routeHash = keccak256(fee3000);
  const guard = await deploy('MisthraV3TwapPriceGuard', await pool.getAddress(), await v3Factory.getAddress(), S, W, 3000, routeHash, 600, 500, 300, 300, E('1000000'), E('1'));
  await reverts(guard.minimumOutput, S, W, S, E('1'), routeHash, '0x', 'NotActive');
  await (await guard.activate()).wait();
  await (await pool.setTicks(0, 0)).wait();
  const [minOut] = await guard.minimumOutput(S, W, S, E('1'), routeHash, '0x');
  assert.equal(minOut, E('0.97'), 'tick 0 is 1:1, less the 3% output allowance');
  await reverts(guard.minimumOutput, S, W, S, E('1'), keccak256('0x00'), '0x', 'InvalidAmount');
  await (await pool.setTicks(2000, 0)).wait(); // spot ~22% away from the TWAP
  await reverts(guard.minimumOutput, S, W, S, E('1'), routeHash, '0x', 'ExcessivePriceDeviation');
});
