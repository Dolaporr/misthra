// "Launch on Montra" with creator fees going to a Misthra fee router.
//
// The creator signs three transactions, in this order:
//   1. deploy the fee router (it names the adapter that may bind it),
//   2. Montra launch, with the adapter as the only fee recipient (+ our builder code),
//   3. activate the adapter (anyone may send this; it checks the token is the creator's).
// For a coin already on Montra, step 2 is instead hook.updateRecipient(poolId, adapter),
// signed by the wallet that currently receives the fees.
// Misthra never signs anything: every step is returned as an unsigned transaction.
import { Contract, ZeroAddress, getAddress, hexlify, isAddress, parseUnits, randomBytes } from 'ethers';
import { planRouter, PlanError } from './router-plan.mjs';
import { adapterFactoryAbi, builderSuffix, montraFactoryAbi, montraHookAbi, montraTokenAbi } from './montra.mjs';

export class MontraPlanError extends Error { constructor(message, status = 400, code = 'bad_request') { super(message); this.status = status; this.code = code; } }
const fail = (m, status, code) => { throw new MontraPlanError(m, status, code); };
const str = (v, max, label) => { const s = v == null ? '' : String(v).trim(); if (s.length > max) fail(`${label} is too long (max ${max}).`); return s; };
const isSalt = (s) => typeof s === 'string' && /^0x[0-9a-fA-F]{64}$/.test(s);

function ready(provider, config, montra) {
  if (!config.live || !provider) fail('Launching on Montra needs a live Elysium connection.', 503, 'not_live');
  if (!config.routerReady) fail('The fee router is not deployed on this network yet.', 503, 'router_not_ready');
  if (!montra?.ready) fail('Launch on Montra is not configured on this server yet.', 503, 'montra_not_configured');
}

// What a launch screen needs: is Montra open, what it costs, and which configs can be used.
export async function montraOptions(provider, config, montra) {
  ready(provider, config, montra);
  const f = new Contract(montra.factory, montraFactoryAbi, provider);
  const [enabled, fee, count] = await Promise.all([f.launchEnabled(), f.launchFee(), f.configCount()]);
  const ids = Array.from({ length: Math.min(Number(count), 32) }, (_, i) => i);
  const rows = await Promise.all(ids.map(async (id) => { try { return [id, await f.getConfig(id)]; } catch { return [id, null]; } }));
  const configs = rows.filter(([, c]) => c && c.exists && c.enabled).map(([id, c]) => ({
    id, quote: c.quote.toLowerCase(), native: c.quote === ZeroAddress, baseSupply: c.baseSupply.toString(),
    totalFeePct: Number(c.totalFeePips) / 10_000, protocolFeePct: Number(c.protocolFeePips) / 10_000, lpFeePct: Number(c.lpFeePips) / 10_000,
    earlyBuyFeeStartPct: Number(c.earlyBuyFeeStartPips) / 10_000, earlyBuyFeeWindowS: Number(c.earlyBuyFeeWindow),
  }));
  return { launchEnabled: enabled, launchFee: fee.toString(), builderCode: montra.builderCode, configs };
}

function launchFields(body) {
  const name = str(body.name, 64, 'Name'), symbol = str(body.symbol, 16, 'Symbol');
  if (!name) fail('A coin name is required.');
  if (!/^[A-Za-z0-9$._-]{1,16}$/.test(symbol)) fail('A ticker of 1–16 letters or digits is required.');
  const socials = body.socials ?? {};
  return {
    name, symbol, metadataURI: str(body.metadataURI, 512, 'Metadata URI'),
    profile: {
      logo: str(body.logo, 512, 'Logo'), description: str(body.description, 1000, 'Description'),
      socials: { telegram: str(socials.telegram, 200, 'Telegram'), twitter: str(socials.twitter, 200, 'Twitter'), discord: str(socials.discord, 200, 'Discord'), website: str(socials.website, 200, 'Website'), extra: str(socials.extra, 200, 'Extra link') },
    },
  };
}

const withSuffix = (data, code) => (code ? data + builderSuffix(code) : data);

// New coin: router → launch → activate.
export async function planMontraLaunch(provider, config, montra, body = {}) {
  ready(provider, config, montra);
  if (!isAddress(body.creator ?? '')) fail('A valid creator wallet is required.');
  const creator = getAddress(String(body.creator).toLowerCase());
  const fields = launchFields(body);
  const f = new Contract(montra.factory, montraFactoryAbi, provider);
  const configId = Number(body.configId);
  if (!Number.isInteger(configId) || configId < 0) fail('Choose a Montra launch config.');
  const [enabled, launchFee, cfg] = await Promise.all([f.launchEnabled(), f.launchFee(), f.getConfig(configId).catch(() => null)]);
  if (!enabled) fail('Montra launches are paused right now.', 409, 'montra_paused');
  if (!cfg || !cfg.exists || !cfg.enabled) fail(`Montra config ${configId} is not available.`, 409, 'config_unavailable');
  const native = cfg.quote === ZeroAddress;
  let firstBuy = 0n;
  try { firstBuy = body.firstBuy ? parseUnits(String(body.firstBuy), 18) : 0n; } catch { fail('First buy must be a number of HYPE.'); }
  if (firstBuy < 0n) fail('First buy cannot be negative.');
  if (firstBuy > 0n && !native) fail('A first buy is only offered here on HYPE-quoted configs.');

  // Router first (its address does not depend on its config), then the adapter it names.
  const routerSalt = isSalt(body.routerSalt) ? body.routerSalt : hexlify(randomBytes(32));
  const adapters = new Contract(montra.adapterFactory, adapterFactoryAbi, provider);
  const routerBody = { creator, buckets: body.buckets, salt: routerSalt };
  let plan;
  try { plan = await planRouter(provider, config, routerBody); } catch (e) { if (e instanceof PlanError) fail(e.message); throw e; }
  const adapter = (await adapters.predict(plan.predictedAddress)).toLowerCase();
  plan = await planRouter(provider, config, { ...routerBody, launchpadAdapter: adapter });

  const launchSalt = isSalt(body.launchSalt) ? body.launchSalt : hexlify(randomBytes(32));
  const token = (await f.predictTokenAddress(creator, launchSalt, configId)).toLowerCase();
  const params = {
    ...fields, configId, supply: cfg.baseSupply, salt: launchSalt,
    feeRecipients: [adapter], feeShares: [10_000],
    firstBuyAmount: firstBuy, firstBuyMinOut: 0n, // atomic with pool creation, nobody can trade in between
    permit: { deadline: 0n, v: 0, r: '0x' + '00'.repeat(32), s: '0x' + '00'.repeat(32) },
  };
  const launchData = withSuffix(montraFactoryAbi.encodeFunctionData('launch', [params]), montra.builderCode);
  const value = native ? launchFee + firstBuy : launchFee;
  const activate = adapterFactoryAbi.encodeFunctionData('activate', [plan.predictedAddress, token, cfg.quote]);

  return {
    router: plan.predictedAddress, adapter, token, configId, quote: cfg.quote.toLowerCase(),
    routerSalt, launchSalt, builderCode: montra.builderCode, launchFee: launchFee.toString(), firstBuy: firstBuy.toString(),
    buckets: plan.buckets, routerConfig: plan.config,
    steps: [
      { id: 'router', title: 'Create your fee router', tx: { from: creator, to: plan.deployTx.to, data: plan.deployTx.data, value: '0', chainId: config.chainId } },
      { id: 'launch', title: 'Launch on Montra', note: 'Creator fees go to your router through its Montra adapter.', tx: { from: creator, to: montra.factory, data: launchData, value: value.toString(), chainId: config.chainId } },
      { id: 'activate', title: 'Connect Montra fees to the router', note: 'Anyone can send this; it only works for your own coin.', tx: { from: creator, to: montra.adapterFactory, data: activate, value: '0', chainId: config.chainId } },
    ],
  };
}

// Coin already on Montra: router → updateRecipient → activate. Only for coins whose fees
// go to a single wallet that the connected creator controls.
export async function planMontraSwitch(provider, config, montra, body = {}) {
  ready(provider, config, montra);
  if (!isAddress(body.creator ?? '') || !isAddress(body.token ?? '')) fail('A creator wallet and a Montra coin address are required.');
  const creator = getAddress(String(body.creator).toLowerCase()), tokenAddr = getAddress(String(body.token).toLowerCase());
  const t = new Contract(tokenAddr, montraTokenAbi, provider);
  const [tokenCreator, hook, poolId] = await Promise.all([t.creator(), t.hook(), t.poolId()]).catch(() => fail('That address is not a Montra coin.', 404, 'not_montra'));
  if (montra.hook && getAddress(hook) !== getAddress(montra.hook)) fail('That coin does not use the Montra hook this server knows.', 409, 'wrong_hook');
  if (getAddress(tokenCreator) !== creator) fail('Only the wallet that launched this coin can route its fees.', 403, 'not_creator');
  const routerSalt = isSalt(body.routerSalt) ? body.routerSalt : hexlify(randomBytes(32));
  const adapters = new Contract(montra.adapterFactory, adapterFactoryAbi, provider);
  const routerBody = { creator, buckets: body.buckets, salt: routerSalt };
  let plan;
  try { plan = await planRouter(provider, config, routerBody); } catch (e) { if (e instanceof PlanError) fail(e.message); throw e; }
  const adapter = (await adapters.predict(plan.predictedAddress)).toLowerCase();
  plan = await planRouter(provider, config, { ...routerBody, launchpadAdapter: adapter });
  const quote = isAddress(body.quote ?? '') ? getAddress(body.quote) : ZeroAddress;
  return {
    router: plan.predictedAddress, adapter, token: tokenAddr.toLowerCase(), poolId, routerSalt, buckets: plan.buckets, routerConfig: plan.config,
    steps: [
      { id: 'router', title: 'Create your fee router', tx: { from: creator, to: plan.deployTx.to, data: plan.deployTx.data, value: '0', chainId: config.chainId } },
      { id: 'recipient', title: 'Point Montra fees at the router', note: 'Sign with the wallet that receives this coin\'s fees today. Claim anything already owed first.', tx: { from: creator, to: getAddress(hook), data: montraHookAbi.encodeFunctionData('updateRecipient', [poolId, adapter]), value: '0', chainId: config.chainId } },
      { id: 'activate', title: 'Connect Montra fees to the router', tx: { from: creator, to: montra.adapterFactory, data: adapterFactoryAbi.encodeFunctionData('activate', [plan.predictedAddress, tokenAddr, quote]), value: '0', chainId: config.chainId } },
    ],
  };
}
