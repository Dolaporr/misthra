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
