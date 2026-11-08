// Deploys Misthra's contracts to Elysium from the operator's own key.
//
//   node scripts/deploy-elysium.mjs                 # dry run: checks everything, sends nothing
//   node scripts/deploy-elysium.mjs --broadcast     # deploys
//
// Required environment (never commit these):
//   ELYSIUM_RPC_URL, ELYSIUM_CHAIN_ID          the network, checked against the RPC
//   DEPLOYER_PRIVATE_KEY, EXPECTED_DEPLOYER     the key, checked against its address
//   ELYSIUM_WHYPE, ELYSIUM_UNISWAP_V3_FACTORY,
//   ELYSIUM_UNISWAP_V3_SWAP_ROUTER              Uniswap on Elysium (first entry of a list is used)
//   MISTHRA_FEE_RECIPIENT                       treasury (use a multisig)
//   MISTHRA_TRADE_FEE_BPS (default 90)          trade fee, at most 100
//   MISTHRA_ROUTER_POOL_FEE (default 10000)     fee tier the shared price guard prices
//
// Deploys: MisthraTradeGateway, MisthraFeeRouter implementation, MisthraFeeRouterFactory,
// MisthraV3SwapAdapter and MisthraSharedV3TwapPriceGuard, then prints the env lines.
import { ContractFactory, JsonRpcProvider, Wallet, getAddress, parseEther } from 'ethers';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileRouter } from './compile-contracts.mjs';

const first = (v) => (v || '').split(',')[0].trim();

export async function deployAll(signer, settings, { evmVersion = 'cancun', log = console.log } = {}) {
  const { artifacts, codehash } = compileRouter({ evmVersion });
  const deploy = async (name, ...args) => {
    const contract = await new ContractFactory(artifacts[name].abi, artifacts[name].bytecode, signer).deploy(...args);
    await contract.waitForDeployment();
    const address = (await contract.getAddress()).toLowerCase();
    log(`  ${name}: ${address}`);
    return contract;
  };
  const gateway = await deploy('MisthraTradeGateway', settings.swapRouter, settings.whype, settings.feeRecipient, settings.tradeFeeBps);
  const implementation = await deploy('MisthraFeeRouter');
  const factory = await deploy('MisthraFeeRouterFactory', await implementation.getAddress());
  const adapter = await deploy('MisthraV3SwapAdapter', settings.swapRouter, settings.whype);
  // 10-minute TWAP, 5% spot deviation, 3% output slippage, 5-minute validity, 1 HYPE comparison.
  const guard = await deploy('MisthraSharedV3TwapPriceGuard', settings.v3Factory, settings.poolFee, 600, 500, 300, 300, parseEther('1'));
  return {
    codehash,
    env: {
      MISTHRA_TRADE_GATEWAY: await gateway.getAddress(), MISTHRA_TRADE_FEE_BPS: String(settings.tradeFeeBps),
      MISTHRA_ROUTER_FACTORY: await factory.getAddress(), MISTHRA_ROUTER_SWAP_ADAPTER: await adapter.getAddress(),
      MISTHRA_ROUTER_SHARED_GUARD: await guard.getAddress(), MISTHRA_ROUTER_FEE_RECIPIENT: settings.feeRecipient,
    },
  };
}

async function main() {
  const env = process.env, broadcast = process.argv.includes('--broadcast');
  const need = (k) => { if (!env[k]) throw new Error(`${k} is required`); return env[k]; };
  const settings = {
    whype: getAddress(first(need('ELYSIUM_WHYPE'))), v3Factory: getAddress(first(need('ELYSIUM_UNISWAP_V3_FACTORY'))),
    swapRouter: getAddress(first(need('ELYSIUM_UNISWAP_V3_SWAP_ROUTER'))), feeRecipient: getAddress(need('MISTHRA_FEE_RECIPIENT')),
    tradeFeeBps: Number(env.MISTHRA_TRADE_FEE_BPS ?? 90), poolFee: Number(env.MISTHRA_ROUTER_POOL_FEE ?? 10000),
  };
  if (!(settings.tradeFeeBps >= 0 && settings.tradeFeeBps <= 100)) throw new Error('MISTHRA_TRADE_FEE_BPS must be between 0 and 100');
  const provider = new JsonRpcProvider(need('ELYSIUM_RPC_URL'));
  const chainId = Number((await provider.getNetwork()).chainId);
  if (chainId !== Number(need('ELYSIUM_CHAIN_ID'))) throw new Error(`RPC is chain ${chainId}, expected ${env.ELYSIUM_CHAIN_ID}. Refusing to continue.`);
  const signer = new Wallet(need('DEPLOYER_PRIVATE_KEY'), provider);
  if (signer.address.toLowerCase() !== need('EXPECTED_DEPLOYER').toLowerCase()) throw new Error(`Key is for ${signer.address}, not EXPECTED_DEPLOYER. Refusing to continue.`);
  for (const [name, address] of Object.entries({ WHYPE: settings.whype, 'Uniswap V3 factory': settings.v3Factory, 'Swap router': settings.swapRouter })) {
    if ((await provider.getCode(address)) === '0x') throw new Error(`${name} ${address} has no code on chain ${chainId}.`);
  }
  const balance = await provider.getBalance(signer.address);
  console.log(`Chain ${chainId}. Deployer ${signer.address} holds ${Number(balance) / 1e18} HYPE.`);
  console.log(`Trade fee ${settings.tradeFeeBps / 100}% to ${settings.feeRecipient}. Router protocol fee 1% to the same address.`);
  if (!broadcast) { console.log('Dry run: every check passed. Run again with --broadcast to deploy.'); return; }
  const result = await deployAll(signer, settings);
  console.log(`\nRouter implementation codehash ${result.codehash}\nAdd these to the server's environment:\n`);
  for (const [k, v] of Object.entries(result.env)) console.log(`${k}=${v}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => { console.error(err.message); process.exit(1); });
}
