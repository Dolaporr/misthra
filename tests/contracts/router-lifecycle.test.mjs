import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import ganache from 'ganache';
import { BrowserProvider, ContractFactory, ZeroAddress, parseEther } from 'ethers';
import { compileRouter } from '../../scripts/compile-contracts.mjs';
import { planRouter } from '../../chain/router-plan.mjs';
import { readRouterSnapshot, RouterReadError } from '../../chain/router-reads.mjs';
import { prepareRouterAction } from '../../chain/router-actions.mjs';

// The whole creator journey on a disposable EVM, driven only by what the server
// reads and prepares: plan → deploy → bind → fees in → sync → process → pay out.
test('router lifecycle through server-prepared transactions', async (t) => {
  const { artifacts } = compileRouter({ evmVersion: 'shanghai', extraSources: { 'tests/contracts/RouterMocks.sol': readFileSync(new URL('RouterMocks.sol', import.meta.url), 'utf8') } });
  const rpc = ganache.provider({ logging: { quiet: true }, chain: { chainId: 31337, hardfork: 'shanghai' }, wallet: { totalAccounts: 6, defaultBalance: 1000 } });
  t.after(() => rpc.disconnect());
  const provider = new BrowserProvider(rpc, undefined, { cacheTimeout: -1 }); provider.pollingInterval = 10;
  const [deployer, creator, team, treasury, stranger] = await Promise.all([0, 1, 2, 3, 4].map((i) => provider.getSigner(i)));
  const [C, TM, TR, X] = await Promise.all([creator, team, treasury, stranger].map((s) => s.getAddress()));
  const deploy = async (name, ...args) => { const k = await new ContractFactory(artifacts[name].abi, artifacts[name].bytecode, deployer).deploy(...args); await k.waitForDeployment(); return k; };
  const wait = async (p) => (await p).wait();
  const send = async (signer, prepared) => { assert.ok(prepared.ok, `expected a prepared transaction, got: ${prepared.reason}`); const r = await wait(signer.sendTransaction({ to: prepared.tx.to, data: prepared.tx.data, value: BigInt(prepared.tx.value) })); assert.equal(r.status, 1); return r; };
  const E = parseEther;

  const whype = await deploy('MockWHYPE'), token = await deploy('MockToken', 'Launch', 'LNCH'), venue = await deploy('MockV3Router'), guard = await deploy('MockPriceGuard');
  const W = (await whype.getAddress()).toLowerCase(), S = (await token.getAddress()).toLowerCase();
  const adapter = await deploy('MisthraV3SwapAdapter', await venue.getAddress(), W);
  const impl = await deploy('MisthraFeeRouter'), factory = await deploy('MisthraFeeRouterFactory', await impl.getAddress());
  await wait(token.mint(await venue.getAddress(), E('1000000')));
  await wait(deployer.sendTransaction({ to: W, value: E('20') })); await wait(whype.transfer(await venue.getAddress(), E('20')));
  const config = { live: true, chainId: 31337, networkVerified: false, confirmations: 0, whype: W, routerFactory: (await factory.getAddress()).toLowerCase(), routerSwapAdapter: (await adapter.getAddress()).toLowerCase(), routerSharedGuard: (await guard.getAddress()).toLowerCase(), routerProtocolFeeRecipient: TR, routerReady: true };

  // Plan and deploy from the creator's wallet.
  const plan = await planRouter(provider, config, { creator: C, poolFee: 3000, buckets: [
    { kind: 'wallets', bps: 5000, wallets: [{ address: C, bps: 10000, editable: true }] },
    { kind: 'native', bps: 2000, wallets: [{ address: TM, bps: 10000 }] },
    { kind: 'buyback-burn', bps: 3000 },
  ] });
  const R = plan.predictedAddress;
  assert.equal((await readRouterSnapshot(provider, config, R)).status, 'not_deployed', 'predicted, not yet deployed');
  await wait(creator.sendTransaction({ to: plan.deployTx.to, data: plan.deployTx.data }));

  let s = await readRouterSnapshot(provider, config, R);
  assert.equal(s.status, 'ok');
  assert.equal(s.verification.codeMatchesClone, true);
  assert.equal(s.creator, C.toLowerCase());
  assert.equal(s.bound, false);
  assert.equal(s.subject, null);
  assert.equal(s.buckets[2].resolvedOutput, null, 'the buyback token is unknown until bound');
  assert.equal(s.buckets[2].allocations[0].owed, null, 'unknown is null, not zero');
  assert.deepEqual(s.actions.filter((a) => a.enabled).map((a) => a.action).sort(), ['bind', 'repointWallet']);

  // Bind: only the creator, only once.
  assert.equal((await prepareRouterAction(provider, config, R, { action: 'bind', from: X, params: { token: S } })).reason, 'Only the router’s creator can do this.');
  await send(creator, await prepareRouterAction(provider, config, R, { action: 'bind', from: C, params: { token: S } }));
  assert.match((await prepareRouterAction(provider, config, R, { action: 'bind', from: C, params: { token: S } })).reason, /already bound/);
  assert.match((await prepareRouterAction(provider, config, R, { action: 'sync', from: X, params: { asset: ZeroAddress } })).reason, /no new fees/, 'empty router has nothing to sync');

  // A pad pays 2 HYPE of creator fees in native HYPE. Anyone can sync it.
  await wait(deployer.sendTransaction({ to: R, value: E('2') }));
  s = await readRouterSnapshot(provider, config, R);
  assert.equal(s.money.find((m) => m.asset === ZeroAddress).unaccounted, E('2').toString());
  await send(stranger, await prepareRouterAction(provider, config, R, { action: 'sync', from: X, params: { asset: ZeroAddress } }));
  s = await readRouterSnapshot(provider, config, R);
  const w = s.money.find((m) => m.asset === W);
  assert.equal(w.protocolOwed, E('0.02').toString());
  assert.equal(w.unaccounted, '0', 'nothing is counted twice');
  assert.equal(w.balance, w.liability);
  assert.deepEqual(s.buckets.map((b) => b.inputOwed), [E('0.99'), E('0.396'), E('0.594')].map(String));

  // Process each bucket. The buyback uses the guard's real minimum and fails honestly when the venue cannot meet it.
  await send(stranger, await prepareRouterAction(provider, config, R, { action: 'processBucket', from: X, params: { bucket: 0 } }));
  await send(stranger, await prepareRouterAction(provider, config, R, { action: 'processBucket', from: X, params: { bucket: 1 } }));
  await wait(venue.setRate(1000, 1));
  await wait(guard.set(E('600'), 300)); // more than 0.594 WHYPE can buy at 1:1000
  const refused = await prepareRouterAction(provider, config, R, { action: 'processBucket', from: X, params: { bucket: 2 } });
  assert.equal(refused.ok, false);
  assert.equal(refused.tx, null);
  await wait(guard.set(E('564.3'), 300)); // 5% under 594
  const buyback = await prepareRouterAction(provider, config, R, { action: 'processBucket', from: X, params: { bucket: 2 } });
  assert.match(buyback.steps[0], /at least 564300000000000000000 base units/);
  await send(stranger, buyback);

  s = await readRouterSnapshot(provider, config, R);
  if (process.env.DUMP_ROUTER_SNAPSHOT) writeFileSync(process.env.DUMP_ROUTER_SNAPSHOT, JSON.stringify(s, null, 2));
  const owed = Object.fromEntries(s.wallets.map((x) => [`${x.recipient}:${x.asset}`, x.owed]));
  assert.equal(owed[`${C.toLowerCase()}:${W}`], E('0.99').toString());
  assert.equal(owed[`${TM.toLowerCase()}:${ZeroAddress}`], E('0.396').toString());
  assert.equal(owed[`0x000000000000000000000000000000000000dead:${S}`], E('594').toString());
  assert.equal(s.actions.filter((a) => a.action === 'sendWallet').length, 3);

  // Pay everyone. Native HYPE and WHYPE each reach the right wallet.
  const teamBefore = await provider.getBalance(TM);
  for (const a of s.actions.filter((x) => x.action === 'sendWallet' || x.action === 'sendProtocolFee')) await send(stranger, await prepareRouterAction(provider, config, R, { action: a.action, from: X, params: a.params }));
  assert.equal(await whype.balanceOf(C), E('0.99'));
  assert.equal(await provider.getBalance(TM) - teamBefore, E('0.396'));
  assert.equal(await token.balanceOf('0x000000000000000000000000000000000000dEaD'), E('594'));
  assert.equal(await whype.balanceOf(TR), E('0.02'));
  s = await readRouterSnapshot(provider, config, R);
  assert.ok(s.money.every((m) => m.liability === '0' && m.unaccounted === '0'), 'router ends empty');

  // Destinations: editable only where the creator chose so.
  assert.equal((await prepareRouterAction(provider, config, R, { action: 'repointWallet', from: C, params: { bucket: 1, allocation: 0, destination: X } })).reason, 'This destination was fixed when the router was deployed.');
  assert.equal((await prepareRouterAction(provider, config, R, { action: 'repointWallet', from: X, params: { bucket: 0, allocation: 0, destination: X } })).reason, 'Only the router’s creator can do this.');
  await send(creator, await prepareRouterAction(provider, config, R, { action: 'repointWallet', from: C, params: { bucket: 0, allocation: 0, destination: TM } }));
  assert.equal((await readRouterSnapshot(provider, config, R)).buckets[0].allocations[0].destination, TM.toLowerCase());

  // Unknown, foreign, wrong-chain and unreachable cases.
  assert.equal((await readRouterSnapshot(provider, config, W)).status, 'not_misthra_router');
  await assert.rejects(readRouterSnapshot(provider, config, 'nope'), (e) => e instanceof RouterReadError && e.status === 400);
  await assert.rejects(readRouterSnapshot(provider, { ...config, chainId: 99901 }, R), (e) => e.code === 'wrong_chain' && e.status === 503);
  const dead = { getNetwork: async () => { throw new Error('connect ECONNREFUSED'); }, getBlockNumber: async () => 0 };
  await assert.rejects(readRouterSnapshot(dead, config, R), (e) => e.code === 'rpc_unavailable' && e.status === 503);
});
