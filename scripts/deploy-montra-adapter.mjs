// Deploys the Misthra Montra adapter factory (and its adapter implementation) to Elysium.
//
//   node scripts/deploy-montra-adapter.mjs              # dry run: reads Montra, checks, sends nothing
//   node scripts/deploy-montra-adapter.mjs --broadcast  # deploys
//
// Environment: ELYSIUM_RPC_URL, ELYSIUM_CHAIN_ID, DEPLOYER_PRIVATE_KEY, EXPECTED_DEPLOYER,
// ELYSIUM_MONTRA_FACTORY. Optional: MONTRA_CONFIG_ID (default: the first enabled config),
// MONTRA_SAMPLE_TOKEN (default: the ANSEM launch in fixtures/, a real Montra coin).
//
// The hook and token master are read from Montra itself, then checked against a real coin:
// its code must be the exact EIP-1167 clone of that master, and it must name that hook.
// If either check fails the adapter could never activate, so nothing is deployed.
import { Contract, ContractFactory, JsonRpcProvider, Wallet, ZeroAddress, getAddress, keccak256, concat } from 'ethers';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileRouter } from './compile-contracts.mjs';
import { montraFactoryAbi, montraTokenAbi } from '../chain/montra.mjs';

export const cloneCode = (master) => concat(['0x363d3d373d3d3d363d73', master, '0x5af43d82803e903d91602b57fd5bf3']);

export async function readMontraModules(provider, factoryAddress, configId = null) {
  const f = new Contract(factoryAddress, montraFactoryAbi, provider);
  const count = Number(await f.configCount());
  const configs = [];
  for (let id = 0; id < Math.min(count, 32); id++) { const c = await f.getConfig(id).catch(() => null); if (c?.exists) configs.push({ id, c }); }
  const chosen = configId == null ? configs.find((x) => x.c.enabled) : configs.find((x) => x.id === Number(configId));
  if (!chosen) throw new Error(configId == null ? 'Montra has no enabled launch config.' : `Montra config ${configId} does not exist.`);
  const mods = await f.getModuleSet(chosen.c.moduleSetId);
  const sets = new Map();
  for (const { id, c } of configs.filter((x) => x.c.enabled)) { const k = c.moduleSetId.toString(); sets.set(k, [...(sets.get(k) ?? []), id]); }
  return { configId: chosen.id, moduleSetId: chosen.c.moduleSetId.toString(), hook: getAddress(mods.hook), tokenMaster: getAddress(mods.tokenMaster), coveredConfigs: sets.get(chosen.c.moduleSetId.toString()) ?? [], otherSets: [...sets.entries()].filter(([k]) => k !== chosen.c.moduleSetId.toString()) };
}

export async function checkSampleToken(provider, token, { hook, tokenMaster }) {
  const code = await provider.getCode(token);
  if (code === '0x') throw new Error(`Sample token ${token} has no code on this chain.`);
  if (keccak256(code) !== keccak256(cloneCode(tokenMaster))) throw new Error(`Sample token ${token} is not a plain EIP-1167 clone of ${tokenMaster}; the adapter's codehash check would reject every coin. Do not deploy.`);
  const t = new Contract(token, montraTokenAbi, provider);
  const [h, creator] = await Promise.all([t.hook(), t.creator()]);
  if (getAddress(h) !== hook) throw new Error(`Sample token names hook ${h}, not ${hook}.`);
  if (creator === ZeroAddress) throw new Error('Sample token reports no creator.');
}

async function main() {
  const env = process.env, broadcast = process.argv.includes('--broadcast');
  const need = (k) => { if (!env[k]) throw new Error(`${k} is required`); return env[k]; };
  const provider = new JsonRpcProvider(need('ELYSIUM_RPC_URL'));
  const chainId = Number((await provider.getNetwork()).chainId);
  if (chainId !== Number(need('ELYSIUM_CHAIN_ID'))) throw new Error(`RPC is chain ${chainId}, expected ${env.ELYSIUM_CHAIN_ID}. Refusing to continue.`);
  const factory = getAddress(need('ELYSIUM_MONTRA_FACTORY').toLowerCase());
  const m = await readMontraModules(provider, factory, env.MONTRA_CONFIG_ID ?? null);
  console.log(`Montra config ${m.configId} (module set ${m.moduleSetId}): hook ${m.hook}, token master ${m.tokenMaster}.`);
  console.log(`This adapter factory covers enabled configs [${m.coveredConfigs.join(', ')}].`);
  if (m.otherSets.length) console.log(`Note: configs ${m.otherSets.map(([, ids]) => ids.join(',')).join(' / ')} use other module sets and need their own adapter factory.`);
  const sample = env.MONTRA_SAMPLE_TOKEN || JSON.parse(readFileSync(new URL('../fixtures/montra-launch-tx.json', import.meta.url), 'utf8')).token;
  await checkSampleToken(provider, getAddress(sample.toLowerCase()), m);
  console.log(`Checked against real coin ${sample}: same clone code and hook.`);
  const signer = new Wallet(need('DEPLOYER_PRIVATE_KEY'), provider);
  if (signer.address.toLowerCase() !== need('EXPECTED_DEPLOYER').toLowerCase()) throw new Error(`Key is for ${signer.address}, not EXPECTED_DEPLOYER. Refusing to continue.`);
  console.log(`Deployer ${signer.address} holds ${Number(await provider.getBalance(signer.address)) / 1e18} HYPE.`);
  if (!broadcast) { console.log('Dry run: every check passed. Run again with --broadcast to deploy.'); return; }
  const { artifacts } = compileRouter({ evmVersion: 'cancun' });
  const a = artifacts.MisthraMontraAdapterFactory;
  const k = await new ContractFactory(a.abi, a.bytecode, signer).deploy(m.hook, m.tokenMaster);
  await k.waitForDeployment();
  const address = await k.getAddress();
  console.log(`\nMisthraMontraAdapterFactory: ${address}\nAdd these to Railway:\n\nMISTHRA_MONTRA_ADAPTER_FACTORY=${address}\nELYSIUM_MONTRA_HOOK=${m.hook}\nMONTRA_BUILDER_CODE=misthra   # only once the code is registered`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => { console.error(err.message); process.exit(1); });
}
