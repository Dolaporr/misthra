// Builds a Misthra fee-router configuration from a creator's plain choices and
// returns the unsigned deployment for the creator's wallet. Mirrors the checks
// MisthraFeeRouter makes at initialization, so a bad plan fails here with a
// readable message instead of as a reverted transaction.
import { AbiCoder, Contract, Interface, ZeroAddress, getAddress, hexlify, isAddress, randomBytes } from 'ethers';

const BURN = '0x000000000000000000000000000000000000dEaD';
const NATIVE = 0, FIXED = 1, SUBJECT = 2;
const MAX_PER_CALL = 10n ** 24n; // one million HYPE per bucket call; larger balances wait for the next call
const coder = AbiCoder.defaultAbiCoder();
const LABELS = { wallets: 'Wallets in WHYPE', native: 'Wallets in native HYPE', 'buyback-burn': 'Buyback and burn' };

export class PlanError extends Error { constructor(message) { super(message); this.status = 400; } }
const fail = (message) => { throw new PlanError(message); };

export const factoryAbi = [
  'function deployForLaunchpad(address creator, bytes32 userSalt, (address creator,address protocolFeeRecipient,address whype,address launchpadAdapter,((uint8 kind,address token) asset,(address adapter,bytes routeData) route,address priceGuard,uint128 maxAmountInPerCall)[] normalizations,((uint8 kind,address token) output,uint16 bps,(address adapter,bytes routeData) route,address priceGuard,uint128 maxAmountInPerCall,(address destination,uint16 bps,bool isSink,bool creatorMayRepoint,bytes sinkConfig)[] allocations)[] buckets) config) returns (address)',
  'function predictLaunchpadAddress(address creator, bytes32 userSalt) view returns (address)',
];

export function buildRouterConfig(config, { creator, buckets, poolFee = 10000 }) {
  if (!isAddress(creator)) fail('A valid creator wallet is required.');
  if (!Array.isArray(buckets) || !buckets.length || buckets.length > 8) fail('Choose between one and eight buckets.');
  const kinds = new Set();
  let total = 0;
  const out = buckets.map((b) => {
    if (!LABELS[b.kind]) fail(`Unknown bucket kind "${b.kind}".`);
    if (kinds.has(b.kind)) fail(`Only one ${LABELS[b.kind].toLowerCase()} bucket is allowed.`);
    kinds.add(b.kind);
    const bps = Number(b.bps);
    if (!Number.isInteger(bps) || bps <= 0 || bps > 10_000) fail('Each bucket needs a share between 0.01% and 100%.');
    total += bps;
    if (b.kind === 'buyback-burn') {
      if (!config.routerSharedGuard) fail('Buyback and burn needs the shared price guard, which is not configured on this server.');
      return { output: { kind: SUBJECT, token: ZeroAddress }, bps, route: { adapter: config.routerSwapAdapter, routeData: coder.encode(['uint24'], [poolFee]) }, priceGuard: config.routerSharedGuard, maxAmountInPerCall: MAX_PER_CALL, allocations: [{ destination: BURN, bps: 10_000, isSink: false, creatorMayRepoint: false, sinkConfig: '0x' }] };
    }
    const wallets = b.wallets ?? [];
    if (!wallets.length || wallets.length > 16) fail(`${LABELS[b.kind]} needs between one and sixteen wallets.`);
    let walletTotal = 0;
    const allocations = wallets.map((w) => {
      if (!isAddress(w.address)) fail(`"${w.address}" is not a valid wallet address.`);
      if (b.kind === 'native' && getAddress(w.address) === BURN) fail('Native HYPE cannot be sent to the burn address.');
      walletTotal += Number(w.bps);
      return { destination: getAddress(w.address), bps: Number(w.bps), isSink: false, creatorMayRepoint: w.editable === true, sinkConfig: '0x' };
    });
    if (walletTotal !== 10_000) fail(`Wallet shares inside ${LABELS[b.kind].toLowerCase()} must total 100%.`);
    return b.kind === 'wallets'
      ? { output: { kind: FIXED, token: config.whype }, bps, route: { adapter: ZeroAddress, routeData: '0x' }, priceGuard: ZeroAddress, maxAmountInPerCall: MAX_PER_CALL, allocations }
      : { output: { kind: NATIVE, token: ZeroAddress }, bps, route: { adapter: config.routerSwapAdapter, routeData: '0x' }, priceGuard: ZeroAddress, maxAmountInPerCall: MAX_PER_CALL, allocations };
  });
  if (total !== 10_000) fail('Bucket shares must total 100%.');
  // Fees paid in the launched token are swapped to WHYPE through the shared guard when it exists.
  const normalizations = config.routerSharedGuard
    ? [{ asset: { kind: SUBJECT, token: ZeroAddress }, route: { adapter: config.routerSwapAdapter, routeData: coder.encode(['uint24'], [poolFee]) }, priceGuard: config.routerSharedGuard, maxAmountInPerCall: MAX_PER_CALL }]
    : [];
  return {
    creator: getAddress(creator), protocolFeeRecipient: config.routerProtocolFeeRecipient, whype: config.whype, launchpadAdapter: ZeroAddress,
    normalizations, buckets: out,
  };
}

export async function planRouter(provider, config, body) {
  const summary = (body.buckets ?? []).map((b) => ({ label: LABELS[b.kind] ?? b.kind, bps: Number(b.bps) }));
  if (!config.routerReady) {
    // Still validate what we can so the wizard can show real errors.
    buildRouterConfig({ ...config, whype: config.whype ?? ZeroAddress, routerSwapAdapter: config.routerSwapAdapter ?? ZeroAddress, routerSharedGuard: config.routerSharedGuard ?? ZeroAddress }, body);
    return { predictedAddress: null, salt: null, config: null, buckets: summary, deployTx: null, steps: [], reason: 'The fee router is not deployed on the configured network yet, so no address can be predicted.' };
  }
  const routerConfig = buildRouterConfig(config, body);
  const salt = body.salt && /^0x[0-9a-fA-F]{64}$/.test(body.salt) ? body.salt : hexlify(randomBytes(32));
  const factory = new Contract(config.routerFactory, factoryAbi, provider);
  const predictedAddress = (await factory.predictLaunchpadAddress(routerConfig.creator, salt)).toLowerCase();
  const data = new Interface(factoryAbi).encodeFunctionData('deployForLaunchpad', [routerConfig.creator, salt, routerConfig]);
  return {
    predictedAddress, salt, config: JSON.parse(JSON.stringify(routerConfig, (_, v) => (typeof v === 'bigint' ? v.toString() : v))), buckets: summary,
    deployTx: { to: config.routerFactory, data, value: '0', chainId: config.chainId, from: routerConfig.creator },
    steps: [
      'Sign the deployment from your creator wallet. The router address is fixed before you launch.',
      `On your launchpad, set ${predictedAddress} as the creator fee recipient.`,
      'Launch the token.',
      'Bind the launched token to the router from your creator wallet (bind(token)). This can only happen once.',
      'Anyone can then run sync and processBucket; payouts go only to the wallets you set. Misthra takes a fixed 1% of fees.',
    ],
    reason: null,
  };
}
