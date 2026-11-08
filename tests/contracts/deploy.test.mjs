import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ganache from 'ganache';
import { BrowserProvider, Contract, ContractFactory } from 'ethers';
import { compileRouter } from '../../scripts/compile-contracts.mjs';
import { deployAll } from '../../scripts/deploy-elysium.mjs';

// The deployment script, run against stand-ins for WHYPE and Uniswap on a local EVM.
test('deploy script deploys a consistent set and prints the server settings', async (t) => {
  const { artifacts } = compileRouter({ evmVersion: 'shanghai', extraSources: { 'tests/contracts/RouterMocks.sol': readFileSync(new URL('RouterMocks.sol', import.meta.url), 'utf8') } });
  const rpc = ganache.provider({ logging: { quiet: true }, chain: { chainId: 31337, hardfork: 'shanghai' }, wallet: { totalAccounts: 2 } });
  t.after(() => rpc.disconnect());
  const provider = new BrowserProvider(rpc, undefined, { cacheTimeout: -1 }); provider.pollingInterval = 10;
  const signer = await provider.getSigner(0);
  const mock = async (name, ...args) => { const k = await new ContractFactory(artifacts[name].abi, artifacts[name].bytecode, signer).deploy(...args); await k.waitForDeployment(); return k.getAddress(); };
  const settings = { whype: await mock('MockWHYPE'), v3Factory: await mock('MockV3Factory'), swapRouter: await mock('MockV3Router'), feeRecipient: '0x000000000000000000000000000000000000bEEF', tradeFeeBps: 90, poolFee: 10000 };
  const { env } = await deployAll(signer, settings, { evmVersion: 'shanghai', log: () => {} });
  for (const key of ['MISTHRA_TRADE_GATEWAY', 'MISTHRA_ROUTER_FACTORY', 'MISTHRA_ROUTER_SWAP_ADAPTER', 'MISTHRA_ROUTER_SHARED_GUARD']) assert.notEqual(await provider.getCode(env[key]), '0x', key);
  assert.equal(env.MISTHRA_TRADE_FEE_BPS, '90');
  const gateway = new Contract(env.MISTHRA_TRADE_GATEWAY, artifacts.MisthraTradeGateway.abi, provider);
  assert.equal(await gateway.feeBps(), 90n);
  assert.equal((await gateway.feeRecipient()).toLowerCase(), settings.feeRecipient.toLowerCase());
  const factory = new Contract(env.MISTHRA_ROUTER_FACTORY, artifacts.MisthraFeeRouterFactory.abi, provider);
  assert.notEqual(await provider.getCode(await factory.implementation()), '0x');
});

// The dry run's Uniswap cross-checks: router/quoter must agree on factory and WHYPE, fee tier must exist.
test('deploy dry run refuses a mismatched Uniswap address set', async () => {
  const { checkUniswap } = await import('../../scripts/deploy-elysium.mjs');
  const { AbiCoder, id } = await import('ethers');
  const enc = (t, v) => AbiCoder.defaultAbiCoder().encode([t], [v]);
  const F = '0x1707327F626496A7b5b3872e7E4d2879Df7d7a9f', W = '0xbA876237B0F021A6c6D852d6c26E107997cC5E81', R = '0x2d01411773c8C24805306E89A41F7855C3c4Fe65', Q = '0x204FAca1764B154221e35c0d20aBb3c525710498';
  const stub = (answers) => ({
    provider: null,
    getCode: async () => '0x01',
    call: async (tx) => {
      const sel = tx.data.slice(0, 10), to = tx.to.toLowerCase();
      if (sel === id('factory()').slice(0, 10)) return enc('address', answers[to]?.factory ?? F);
      if (sel === id('WETH9()').slice(0, 10)) return enc('address', answers[to]?.weth ?? W);
      if (sel === id('feeAmountTickSpacing(uint24)').slice(0, 10)) return enc('int24', answers.spacing ?? 200);
      throw new Error('unexpected call');
    },
  });
  const settings = { whype: W, v3Factory: F, swapRouter: R, poolFee: 10000 };
  const quiet = console.log; console.log = () => {};
  try {
    await checkUniswap(stub({}), settings, Q);
    await assert.rejects(checkUniswap(stub({ [Q.toLowerCase()]: { factory: '0x000000000000000000000000000000000000dEaD' } }), settings, Q), /Quoter points at factory/);
    await assert.rejects(checkUniswap(stub({ [R.toLowerCase()]: { weth: '0x000000000000000000000000000000000000dEaD' } }), settings, Q), /Swap router points at WHYPE/);
    await assert.rejects(checkUniswap(stub({ spacing: 0 }), settings, Q), /Fee tier 10000 is not enabled/);
  } finally { console.log = quiet; }
});
