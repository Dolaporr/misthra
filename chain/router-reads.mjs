// Confirmed-chain snapshot of one Misthra fee router.
//
// Pattern from Sinjoh's SDK (packages/sdk/src/reads.ts): state comes from
// contract getters at a confirmed block, never from summing indexed events.
// Amounts are exact base-unit integer strings; `assets[address].decimals`
// says how to display them. Anything that could not be read is null, never 0.
import { Contract, Interface, ZeroAddress, getAddress, isAddress } from 'ethers';

export const ROUTER_ABI = [
  'function initialized() view returns (bool)', 'function creator() view returns (address)', 'function subject() view returns (address)',
  'function bound() view returns (bool)', 'function whype() view returns (address)', 'function protocolFeeRecipient() view returns (address)',
  'function launchpadAdapter() view returns (address)', 'function configHash() view returns (bytes32)', 'function PROTOCOL_FEE_BPS() view returns (uint16)',
  'function bucketCount() view returns (uint256)',
  'function bucketInfo(uint8) view returns ((uint8 kind,address token) output,address resolvedOutput,uint16 bps,uint256 conversionCount,uint256 allocationCount)',
  'function conversionInfo(uint8,uint8) view returns ((uint8 kind,address token) input,address resolvedInput,address adapter,address priceGuard,bytes routeData,uint128 maxAmountInPerCall,uint48 minInterval)',
  'function allocationInfo(uint8,uint8) view returns (address destination,uint16 bps,bool isSink,bool creatorMayRepoint,bytes sinkConfig)',
  'function allocationKey(uint8,uint8) pure returns (uint16)',
  'function normalizationCount() view returns (uint256)', 'function intakeAssetCount() view returns (uint256)',
  'function intakeAsset(uint256) view returns ((uint8 kind,address token) ref,address resolved)',
  'function normalizationInfo(address) view returns (address adapter,address priceGuard,bytes routeData,uint128 maxAmountInPerCall)',
  'function bucketInputOwed(uint8,address) view returns (uint256)', 'function walletOwed(address,address) view returns (uint256)',
  'function sinkOwed(uint16,address) view returns (uint256)', 'function protocolOwed(address) view returns (uint256)',
  'function totalLiability(address) view returns (uint256)', 'function unaccountedBalance(address) view returns (uint256)',
  'function bind(address)', 'function sync(address) returns (uint256,uint256)', 'function sync(address,uint256) returns (uint256,uint256)',
  'function processBucket(uint8,address,uint256,uint256,bytes) returns (uint256)', 'function sendWallet(address,address,uint256)',
  'function sendProtocolFee(address,uint256)', 'function fundSink(uint8,uint8,uint256)', 'function repointWallet(uint8,uint8,address)',
];
const FACTORY_ABI = ['function implementation() view returns (address)'];
const ERC20_ABI = ['function symbol() view returns (string)', 'function decimals() view returns (uint8)', 'function balanceOf(address) view returns (uint256)'];
export const routerInterface = new Interface(ROUTER_ABI);
const KIND = ['native', 'fixed', 'subject'];
export const NATIVE = ZeroAddress.toLowerCase();
const lower = (a) => a.toLowerCase();
const str = (v) => (v == null ? null : v.toString());

export class RouterReadError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

// EIP-1167 minimal proxy runtime pointing at `implementation`.
export const cloneCode = (implementation) => `0x363d3d373d3d3d363d73${lower(implementation).slice(2)}5af43d82803e903d91602b57fd5bf3`;

async function settle(promise) { try { return await promise; } catch { return null; } }

export async function readRouterSnapshot(provider, config, address, { confirmations = config.confirmations ?? 0 } = {}) {
  if (!isAddress(address)) throw new RouterReadError(400, 'bad_address', 'A valid router address is required.');
  const router = lower(getAddress(address));
  let network, head;
  try { [network, head] = await Promise.all([provider.getNetwork(), provider.getBlockNumber()]); }
  catch (e) { throw new RouterReadError(503, 'rpc_unavailable', `The Elysium RPC did not answer: ${e.shortMessage ?? e.message}`); }
  const rpcChainId = Number(network.chainId);
  if (config.chainId && rpcChainId !== config.chainId) throw new RouterReadError(503, 'wrong_chain', `The RPC is on chain ${rpcChainId}, not ${config.chainId}.`);
  const blockTag = Math.max(0, head - confirmations);
  const block = await provider.getBlock(blockTag);
  const base = { source: 'live', network: { chainId: rpcChainId, verified: config.networkVerified ?? null }, asOf: { block: blockTag, timestamp: block ? block.timestamp * 1000 : null, confirmations }, router };

  const code = (await provider.getCode(router, blockTag)).toLowerCase();
  if (code === '0x') return { ...base, status: 'not_deployed', reason: 'No contract at this address in the confirmed state. A deployment may still be pending.' };
  let implementation = null;
  if (config.routerFactory) implementation = await settle(new Contract(config.routerFactory, FACTORY_ABI, provider).implementation({ blockTag }));
  const codeMatches = implementation ? code === cloneCode(implementation) : null;
  if (codeMatches === false) return { ...base, status: 'not_misthra_router', reason: 'This contract is not a router from the configured Misthra factory.', verification: { factory: config.routerFactory, implementation: lower(implementation), codeMatchesClone: false } };

  const r = new Contract(router, ROUTER_ABI, provider);
  const at = { blockTag };
  const initialized = await settle(r.initialized(at));
  if (initialized !== true) return { ...base, status: initialized === false ? 'uninitialized' : 'not_misthra_router', reason: initialized === false ? 'The router exists but was never configured.' : 'This contract does not answer like a Misthra router.' };

  const [creator, subject, bound, whype, feeRecipient, adapter, configHash, feeBps, bucketCount, intakeCount] = await Promise.all([
    r.creator(at), r.subject(at), r.bound(at), r.whype(at), r.protocolFeeRecipient(at), r.launchpadAdapter(at), r.configHash(at), r.PROTOCOL_FEE_BPS(at), r.bucketCount(at), r.intakeAssetCount(at),
  ]);
  const W = lower(whype), S = bound ? lower(subject) : null;

  // Assets this router can hold: native HYPE, WHYPE, the bound token, every intake and bucket output.
  const assetSet = new Set([NATIVE, W, ...(S ? [S] : [])]);
  const intake = [];
  for (let i = 0; i < Number(intakeCount); i++) {
    const it = await r.intakeAsset(i, at);
    const resolved = lower(it.resolved);
    intake.push({ kind: KIND[Number(it.ref.kind)], token: lower(it.ref.token), resolved: resolved === NATIVE && Number(it.ref.kind) === 2 && !bound ? null : resolved });
    if (resolved !== NATIVE || Number(it.ref.kind) === 0) assetSet.add(resolved);
  }
  const buckets = [];
  for (let b = 0; b < Number(bucketCount); b++) {
    const [info, conv] = await Promise.all([r.bucketInfo(b, at), r.conversionInfo(b, 0, at)]);
    const outputKind = KIND[Number(info.output.kind)];
    const resolvedOutput = outputKind === 'native' ? NATIVE : outputKind === 'subject' ? S : lower(info.output.token);
    if (resolvedOutput) assetSet.add(resolvedOutput);
    const allocations = [];
    for (let a = 0; a < Number(info.allocationCount); a++) {
      const al = await r.allocationInfo(b, a, at);
      const key = Number(await r.allocationKey(b, a));
      allocations.push({ id: a, key, destination: lower(al.destination), bps: Number(al.bps), isSink: al.isSink, creatorMayRepoint: al.creatorMayRepoint });
    }
    buckets.push({
      id: b, output: { kind: outputKind, token: lower(info.output.token) }, resolvedOutput, bps: Number(info.bps),
      route: { adapter: lower(conv.adapter), priceGuard: lower(conv.priceGuard), routeData: conv.routeData, maxAmountInPerCall: str(conv.maxAmountInPerCall) },
      inputOwed: str(await r.bucketInputOwed(b, W, at)), allocations,
    });
  }

  // Exact balances, liabilities and what is not yet accounted for, per asset.
  const assets = {}, money = [];
  for (const asset of assetSet) {
    const meta = asset === NATIVE ? { symbol: 'HYPE', decimals: 18 } : await (async () => {
      const t = new Contract(asset, ERC20_ABI, provider);
      const [symbol, decimals] = await Promise.all([settle(t.symbol()), settle(t.decimals())]);
      return { symbol: symbol ?? null, decimals: decimals == null ? null : Number(decimals) };
    })();
    assets[asset] = { ...meta, kind: asset === NATIVE ? 'native' : asset === W ? 'whype' : asset === S ? 'subject' : 'erc20' };
    const balance = asset === NATIVE ? await settle(provider.getBalance(router, blockTag)) : await settle(new Contract(asset, ERC20_ABI, provider).balanceOf(router, at));
    const [liability, unaccounted, protocol] = await Promise.all([settle(r.totalLiability(asset, at)), settle(r.unaccountedBalance(asset, at)), settle(r.protocolOwed(asset, at))]);
    money.push({ asset, balance: str(balance), liability: str(liability), unaccounted: str(unaccounted), protocolOwed: str(protocol), insolvent: balance != null && liability != null && balance < liability });
  }
  // Payouts owed, per wallet and asset (a wallet in two buckets shares one balance), and per sink.
  const walletKeys = new Map(), sinks = [];
  for (const b of buckets) for (const a of b.allocations) {
    if (!b.resolvedOutput) { a.owed = null; continue; }
    if (a.isSink) { a.owed = str(await settle(r.sinkOwed(a.key, b.resolvedOutput, at))); sinks.push({ bucket: b.id, allocation: a.id, destination: a.destination, asset: b.resolvedOutput, owed: a.owed }); }
    else walletKeys.set(`${a.destination}:${b.resolvedOutput}`, { recipient: a.destination, asset: b.resolvedOutput });
  }
  const wallets = [];
  for (const w of walletKeys.values()) wallets.push({ ...w, owed: str(await settle(r.walletOwed(w.recipient, w.asset, at))) });
  for (const b of buckets) for (const a of b.allocations) if (!a.isSink && b.resolvedOutput) a.owed = wallets.find((w) => w.recipient === a.destination && w.asset === b.resolvedOutput)?.owed ?? null;

  const snapshot = {
    ...base, status: 'ok', reason: null,
    verification: { factory: config.routerFactory ?? null, implementation: implementation ? lower(implementation) : null, codeMatchesClone: codeMatches, configHash },
    creator: lower(creator), protocolFeeRecipient: lower(feeRecipient), protocolFeeBps: Number(feeBps), whype: W, launchpadAdapter: lower(adapter),
    bound, subject: S, assets, intake, buckets, money, wallets, sinks,
  };
  snapshot.actions = availableActions(snapshot);
  return snapshot;
}

const gt0 = (v) => v != null && BigInt(v) > 0n;
const min = (a, b) => (b != null && BigInt(b) < BigInt(a) ? b : a);

// What can be done now, and by whom. Every entry says why when it cannot.
export function availableActions(s) {
  const out = [];
  out.push(s.bound
    ? { action: 'bind', who: 'creator', enabled: false, reason: 'The launched token is already bound; binding happens once.' }
    : { action: 'bind', who: 'creator', enabled: true, reason: null, params: { token: null }, note: 'Bind the launched token after it exists. Fees can arrive before this, but nothing is split until it is bound.' });
  for (const m of s.money) {
    if (!gt0(m.unaccounted)) continue;
    const kind = s.assets[m.asset]?.kind;
    const syncable = kind === 'native' || kind === 'whype' || s.intake.some((i) => i.resolved === m.asset);
    out.push({ action: 'sync', who: 'anyone', params: { asset: m.asset }, amount: m.unaccounted, enabled: s.bound && syncable,
      reason: !s.bound ? 'Bind the launched token first.' : syncable ? null : 'This router has no route for this asset, so it cannot be synced.' });
  }
  for (const b of s.buckets) if (gt0(b.inputOwed)) {
    out.push({ action: 'processBucket', who: 'anyone', params: { bucket: b.id }, amount: min(b.inputOwed, b.route.maxAmountInPerCall), enabled: s.bound, reason: s.bound ? null : 'Bind the launched token first.' });
  }
  for (const w of s.wallets) if (gt0(w.owed)) out.push({ action: 'sendWallet', who: 'anyone', params: { recipient: w.recipient, asset: w.asset }, amount: w.owed, enabled: true, reason: null });
  for (const k of s.sinks) if (gt0(k.owed)) out.push({ action: 'fundSink', who: 'anyone', params: { bucket: k.bucket, allocation: k.allocation }, amount: k.owed, enabled: true, reason: null });
  for (const m of s.money) if (gt0(m.protocolOwed)) out.push({ action: 'sendProtocolFee', who: 'anyone', params: { asset: m.asset }, amount: m.protocolOwed, enabled: true, reason: null });
  for (const b of s.buckets) for (const a of b.allocations) {
    if (a.isSink) continue;
    out.push({ action: 'repointWallet', who: 'creator', params: { bucket: b.id, allocation: a.id }, enabled: a.creatorMayRepoint, reason: a.creatorMayRepoint ? null : 'This destination was fixed when the router was deployed.' });
  }
  return out;
}
