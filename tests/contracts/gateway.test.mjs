import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ganache from 'ganache';
import { BrowserProvider, ContractFactory, parseEther } from 'ethers';
import { compileRouter } from '../../scripts/compile-contracts.mjs';
import { liveQuote } from '../../chain/trade.mjs';

// The trade gateway on a disposable EVM: the fee lands with the treasury in the
// same transaction, the trader gets the rest, and every minimum is enforced.
test('trade gateway takes a fixed HYPE fee on buys and sells and holds nothing', async (t) => {
  const { artifacts } = compileRouter({ evmVersion: 'shanghai', extraSources: { 'tests/contracts/RouterMocks.sol': readFileSync(new URL('RouterMocks.sol', import.meta.url), 'utf8') } });
  const rpc = ganache.provider({ logging: { quiet: true }, chain: { chainId: 31337, hardfork: 'shanghai' }, wallet: { totalAccounts: 4, defaultBalance: 1000 }, miner: { timestampIncrement: 0 } });
  t.after(() => rpc.disconnect());
  const provider = new BrowserProvider(rpc, undefined, { cacheTimeout: -1 }); provider.pollingInterval = 10;
  const [deployer, trader, treasury] = await Promise.all([0, 1, 2].map((i) => provider.getSigner(i)));
  const T = await treasury.getAddress(), U = await trader.getAddress();
  const deploy = async (name, ...args) => { const k = await new ContractFactory(artifacts[name].abi, artifacts[name].bytecode, deployer).deploy(...args); await k.waitForDeployment(); return k; };
  const wait = async (p) => (await p).wait();
  const reverts = async (method, ...args) => { const name = args.pop(); await assert.rejects(method.staticCall(...args), (e) => [e.revert?.name, ...(e.revert?.args ?? []), e.reason, e.shortMessage, e.message].filter(Boolean).join(' ').includes(name)); };
  const now = async () => Number((await provider.getBlock('latest')).timestamp);

  const whype = await deploy('MockWHYPE'), token = await deploy('MockToken', 'Launch', 'LNCH'), router = await deploy('MockV3Router');
  const W = await whype.getAddress(), S = await token.getAddress(), R = await router.getAddress();
  await assert.rejects(new ContractFactory(artifacts.MisthraTradeGateway.abi, artifacts.MisthraTradeGateway.bytecode, deployer).deploy(R, W, T, 101));
  const gateway = (await deploy('MisthraTradeGateway', R, W, T, 90)).connect(trader);
  const G = await gateway.getAddress();
  await wait(token.mint(R, parseEther('1000000')));
  await wait(deployer.sendTransaction({ to: W, value: parseEther('100') }));
  await wait(whype.transfer(R, parseEther('100')));
  await wait(router.setRate(1000, 1)); // 1 WHYPE buys 1,000 tokens

  // Buy 10 HYPE: 0.09 to the treasury, 9.91 swapped for 9,910 tokens.
  const deadline = (await now()) + 600;
  await reverts(gateway.buy, S, 10000, parseEther('9911'), deadline, { value: parseEther('10') }, 'Too little received');
  await reverts(gateway.buy, S, 10000, 0, (await now()) - 1, { value: parseEther('10') }, 'Expired');
  const treasuryBefore = await provider.getBalance(T);
  await wait(gateway.buy(S, 10000, parseEther('9910'), deadline, { value: parseEther('10') }));
  assert.equal(await token.balanceOf(U), parseEther('9910'));
  assert.equal(await provider.getBalance(T) - treasuryBefore, parseEther('0.09'));

  // Sell 5,000 tokens: 5 WHYPE gross, 0.045 fee, 4.955 HYPE to the trader.
  await wait(router.setRate(1, 1000));
  await wait(token.connect(trader).approve(G, parseEther('5000')));
  await reverts(gateway.sell, S, 10000, parseEther('5000'), parseEther('4.956'), deadline, 'InsufficientOutput');
  const traderBefore = await provider.getBalance(U), treasuryMid = await provider.getBalance(T);
  const receipt = await wait(gateway.sell(S, 10000, parseEther('5000'), parseEther('4.955'), deadline));
  const gas = receipt.gasUsed * receipt.gasPrice;
  assert.equal(await provider.getBalance(U) - traderBefore + gas, parseEther('4.955'));
  assert.equal(await provider.getBalance(T) - treasuryMid, parseEther('0.045'));

  // Nothing is left behind, and stray HYPE is refused.
  assert.equal(await provider.getBalance(G), 0n);
  assert.equal(await whype.balanceOf(G), 0n);
  assert.equal(await token.balanceOf(G), 0n);
  await assert.rejects(trader.sendTransaction({ to: G, value: 1n }).then((tx) => tx.wait()));

  // The server-built transactions execute exactly as quoted.
  const quoter = await deploy('MockQuoter', R);
  const config = { whype: W, v3Quoter: await quoter.getAddress(), tradeGateway: G, chainId: 31337 };
  await wait(router.setRate(1000, 1));
  const buyQuote = await liveQuote(provider, config, { token: S, side: 'buy', amount: '2', slippageBps: 100, wallet: U, fee: 10000, now: (await now()) * 1000 });
  assert.equal(buyQuote.feeHype, '0.018');
  assert.equal(buyQuote.amountOut, '1982.0');
  const tokensBefore = await token.balanceOf(U);
  await wait(trader.sendTransaction({ to: buyQuote.tx.to, data: buyQuote.tx.data, value: BigInt(buyQuote.tx.value) }));
  assert.equal(await token.balanceOf(U) - tokensBefore, parseEther('1982'));
  await wait(router.setRate(1, 1000));
  const freshToken = await deploy('MockToken', 'Fresh', 'FRSH');
  await wait(freshToken.mint(U, parseEther('100')));
  const sellQuote = await liveQuote(provider, config, { token: await freshToken.getAddress(), side: 'sell', amount: '100', slippageBps: 100, wallet: U, fee: 10000, now: (await now()) * 1000 });
  assert.ok(sellQuote.approveTx, 'a first sell asks for approval');
  await wait(trader.sendTransaction({ to: sellQuote.approveTx.to, data: sellQuote.approveTx.data }));
  const hypeBefore = await provider.getBalance(U);
  const sold = await wait(trader.sendTransaction({ to: sellQuote.tx.to, data: sellQuote.tx.data }));
  assert.equal(await provider.getBalance(U) - hypeBefore + sold.gasUsed * sold.gasPrice, parseEther(sellQuote.amountOut));
});
