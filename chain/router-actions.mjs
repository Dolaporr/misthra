// Prepare-only router actions. Builds an unsigned transaction for the caller's
// own wallet, checks who may send it, takes real minimum outputs from the
// router's price guards, and simulates it against the latest state before
// returning anything to sign. Nothing here signs or holds keys.
//
// Pattern from Sinjoh's SDK (planner.ts + actions.ts), adapted to Misthra's ABI.
import { Contract, Interface, ZeroAddress, getAddress, isAddress, keccak256 } from 'ethers';
import { ROUTER_ABI, routerInterface, readRouterSnapshot, NATIVE, RouterReadError } from './router-reads.mjs';

const GUARD_ABI = ['function minimumOutput(address subject,address assetIn,address assetOut,uint256 amountIn,bytes32 routeHash,bytes guardData) view returns (uint256 minimum,uint48 validUntil)'];
// Errors the router or its guards can raise, in plain words.
const errorInterface = new Interface([
  ...ROUTER_ABI.filter((x) => x.startsWith('function')),
  'error NotBound()', 'error AlreadyBound()', 'error Unauthorized()', 'error ImmutableAllocation()', 'error InvalidAmount()', 'error InvalidBucket()',
  'error InvalidAllocation()', 'error InvalidAddress()', 'error NormalizationFloorRequired(address)', 'error UnsupportedAsset(address)',
  'error UnsupportedConversion(uint8,address)', 'error NativeIntakeUnsupported()', 'error NativeBurnForbidden()', 'error Insolvent(address)',
  'error InvalidExpiry()', 'error InvalidMinimumOutput()', 'error InsufficientOutput(uint256,uint256)', 'error PoolNotFound()', 'error NotActive()',
  'error ExcessivePriceDeviation()', 'error InvalidRoute()', 'error ObservationCardinalityTooLow()', 'error NotContract(address)',
]);
const READABLE = {
  NotBound: 'Bind the launched token first.', AlreadyBound: 'The launched token is already bound; binding happens once.',
  Unauthorized: 'Only the router’s creator can do this.', ImmutableAllocation: 'This destination was fixed when the router was deployed.',
  InvalidAmount: 'There is nothing to process for that amount, or it is more than is owed.', InvalidBucket: 'That bucket does not exist.',
  InvalidAllocation: 'That destination does not exist.', InvalidAddress: 'That address is not allowed here.',
  NormalizationFloorRequired: 'This asset is swapped on intake and needs a price-guarded minimum.', UnsupportedAsset: 'This router has no route for that asset.',
  UnsupportedConversion: 'This bucket cannot convert that asset.', NativeBurnForbidden: 'Native HYPE cannot be sent to the burn address.',
  Insolvent: 'The router holds less than it owes for this asset. Do not send transactions; report this.',
  InvalidExpiry: 'The price guard’s quote expired. Prepare the action again.', InvalidMinimumOutput: 'The price guard could not price this swap right now.',
  InsufficientOutput: 'The swap would return less than the guarded minimum. Try again later or in a smaller amount.',
  PoolNotFound: 'There is no pool for this token on the guarded fee tier yet.', NotActive: 'The price guard is not active for this pool yet.',
  ExcessivePriceDeviation: 'The price is too far from its recent average, a sign of manipulation or a spike. Try again later.',
  ObservationCardinalityTooLow: 'The pool does not have enough price history yet for the guard.', InvalidRoute: 'The swap route does not match the guard.',
};

export function readableRevert(error) {
  const data = error?.data ?? error?.info?.error?.data ?? error?.error?.data;
  if (typeof data === 'string' && data.length >= 10) {
    try { const parsed = errorInterface.parseError(data); if (parsed) return { code: parsed.name, message: READABLE[parsed.name] ?? `The router refused: ${parsed.name}.` }; } catch { /* fall through */ }
  }
  const reason = error?.reason ?? error?.revert?.args?.[0];
  return { code: 'reverted', message: reason ? `The transaction would fail: ${reason}` : 'The transaction would fail in the current state.' };
}

const unavailable = (snapshot, action, message, extra = {}) => ({ ok: false, action, tx: null, reason: message, preparedAt: snapshot?.asOf ?? null, ...extra });

// Returns { ok, action, tx, amount, steps, preconditions, reason, preparedAt }.
export async function prepareRouterAction(provider, config, routerAddress, { action, from, params = {} }) {
  if (!from || !isAddress(from)) throw new RouterReadError(400, 'bad_from', 'Connect the wallet that will send this transaction.');
  const sender = getAddress(from).toLowerCase();
  // Simulate against the newest state, not the confirmed snapshot.
  const s = await readRouterSnapshot(provider, config, routerAddress, { confirmations: 0 });
  if (s.status !== 'ok') return unavailable(s, action, s.reason);
  const r = new Contract(s.router, ROUTER_ABI, provider);
  const pre = [];
  const check = (ok, detail) => { pre.push({ ok, detail }); return ok; };
  let data, amount = null, steps = [];

  switch (action) {
    case 'bind': {
      if (!check(sender === s.creator, 'Sent by the router’s creator')) return unavailable(s, action, READABLE.Unauthorized, { preconditions: pre });
      if (!check(!s.bound, 'Not bound yet')) return unavailable(s, action, READABLE.AlreadyBound, { preconditions: pre });
      if (!params.token || !isAddress(params.token)) return unavailable(s, action, 'Give the launched token’s address.', { preconditions: pre });
      if (!check((await provider.getCode(params.token)) !== '0x', 'The token is a deployed contract')) return unavailable(s, action, 'There is no contract at that token address.', { preconditions: pre });
      data = routerInterface.encodeFunctionData('bind', [getAddress(params.token)]);
      steps = ['Binds this router to the launched token, permanently.', 'After this, fees can be synced and split.'];
      break;
    }
    case 'sync': {
      const asset = String(params.asset ?? '').toLowerCase();
      const m = s.money.find((x) => x.asset === asset);
      if (!check(Boolean(m), 'The router tracks this asset')) return unavailable(s, action, READABLE.UnsupportedAsset, { preconditions: pre });
      if (!check(s.bound, 'Token bound')) return unavailable(s, action, READABLE.NotBound, { preconditions: pre });
      if (!check(m.unaccounted != null && BigInt(m.unaccounted) > 0n, 'New fees are waiting')) return unavailable(s, action, 'There are no new fees to sync for this asset.', { preconditions: pre });
      amount = m.unaccounted;
      const kind = s.assets[asset].kind;
      if (kind === 'native' || kind === 'whype') {
        data = routerInterface.encodeFunctionData('sync(address)', [asset === NATIVE ? ZeroAddress : getAddress(asset)]);
        steps = [kind === 'native' ? 'Wraps the new native HYPE into WHYPE.' : 'Counts the new WHYPE.', `Takes the ${s.protocolFeeBps / 100}% protocol fee and splits the rest across buckets by their shares.`];
      } else {
        // Swapped on intake: the floor comes from the router's own price guard, quoted now.
        const n = await r.normalizationInfo(asset);
        const gross = BigInt(m.unaccounted) > n.maxAmountInPerCall ? n.maxAmountInPerCall : BigInt(m.unaccounted);
        let minimum;
        try { [minimum] = await new Contract(n.priceGuard, GUARD_ABI, provider).minimumOutput(asset, asset, s.whype, gross, keccak256(n.routeData), '0x'); }
        catch (e) { const why = readableRevert(e); return unavailable(s, action, why.message, { code: why.code, preconditions: pre }); }
        if (!check(minimum > 0n, 'The price guard can price this swap')) return unavailable(s, action, READABLE.InvalidMinimumOutput, { preconditions: pre });
        amount = gross.toString();
        data = routerInterface.encodeFunctionData('sync(address,uint256)', [getAddress(asset), minimum]);
        steps = [`Swaps the fees into WHYPE for at least ${minimum} base units (the price guard's minimum, quoted just now).`, 'Then takes the protocol fee and splits the rest across buckets.'];
      }
      break;
    }
    case 'processBucket': {
      const b = s.buckets.find((x) => x.id === Number(params.bucket));
      if (!check(Boolean(b), 'The bucket exists')) return unavailable(s, action, READABLE.InvalidBucket, { preconditions: pre });
      if (!check(s.bound, 'Token bound')) return unavailable(s, action, READABLE.NotBound, { preconditions: pre });
      if (!check(BigInt(b.inputOwed ?? '0') > 0n, 'The bucket has fees waiting')) return unavailable(s, action, 'This bucket has nothing waiting.', { preconditions: pre });
      const amountIn = BigInt(b.inputOwed) > BigInt(b.route.maxAmountInPerCall) ? BigInt(b.route.maxAmountInPerCall) : BigInt(b.inputOwed);
      amount = amountIn.toString();
      let callerMin = 0n;
      if (b.output.kind === 'native') callerMin = amountIn; // unwrapping is 1:1
      else if (b.resolvedOutput !== s.whype) {
        try { [callerMin] = await new Contract(b.route.priceGuard, GUARD_ABI, provider).minimumOutput(b.resolvedOutput, s.whype, b.resolvedOutput, amountIn, keccak256(b.route.routeData), '0x'); }
        catch (e) { const why = readableRevert(e); return unavailable(s, action, why.message, { code: why.code, preconditions: pre }); }
        if (!check(callerMin > 0n, 'The price guard can price this swap')) return unavailable(s, action, READABLE.InvalidMinimumOutput, { preconditions: pre });
      }
      data = routerInterface.encodeFunctionData('processBucket', [b.id, getAddress(s.whype), amountIn, callerMin, '0x']);
      steps = b.output.kind === 'native' ? ['Unwraps the bucket’s WHYPE to native HYPE.', 'Credits each wallet its share.']
        : b.resolvedOutput === s.whype ? ['Credits each wallet its share in WHYPE.']
        : [`Buys the token for at least ${callerMin} base units (price guard minimum, quoted just now).`, 'Credits each destination, including the burn address, its share.'];
      break;
    }
    case 'sendWallet': {
      const recipient = String(params.recipient ?? '').toLowerCase(), asset = String(params.asset ?? '').toLowerCase();
      const w = s.wallets.find((x) => x.recipient === recipient && x.asset === asset);
      if (!check(Boolean(w) && BigInt(w.owed ?? '0') > 0n, 'The wallet is owed something')) return unavailable(s, action, 'Nothing is owed to this wallet in this asset.', { preconditions: pre });
      amount = w.owed;
      data = routerInterface.encodeFunctionData('sendWallet', [getAddress(recipient), asset === NATIVE ? ZeroAddress : getAddress(asset), BigInt(w.owed)]);
      steps = ['Sends the wallet everything it is owed. Anyone can send this; the money only goes to that wallet.'];
      break;
    }
    case 'fundSink': {
      const k = s.sinks.find((x) => x.bucket === Number(params.bucket) && x.allocation === Number(params.allocation));
      if (!check(Boolean(k) && BigInt(k.owed ?? '0') > 0n, 'The sink is owed something')) return unavailable(s, action, 'Nothing is owed to this sink.', { preconditions: pre });
      amount = k.owed;
      data = routerInterface.encodeFunctionData('fundSink', [k.bucket, k.allocation, BigInt(k.owed)]);
      steps = ['Funds the sink contract with what it is owed.'];
      break;
    }
    case 'sendProtocolFee': {
      const asset = String(params.asset ?? '').toLowerCase();
      const m = s.money.find((x) => x.asset === asset);
      if (!check(Boolean(m) && BigInt(m.protocolOwed ?? '0') > 0n, 'Protocol fee is owed')) return unavailable(s, action, 'No protocol fee is owed in this asset.', { preconditions: pre });
      amount = m.protocolOwed;
      data = routerInterface.encodeFunctionData('sendProtocolFee', [asset === NATIVE ? ZeroAddress : getAddress(asset), BigInt(m.protocolOwed)]);
      steps = [`Sends the protocol fee to ${s.protocolFeeRecipient}.`];
      break;
    }
    case 'repointWallet': {
      const b = s.buckets.find((x) => x.id === Number(params.bucket));
      const a = b?.allocations.find((x) => x.id === Number(params.allocation));
      if (!check(Boolean(a), 'The destination exists')) return unavailable(s, action, READABLE.InvalidAllocation, { preconditions: pre });
      if (!check(sender === s.creator, 'Sent by the router’s creator')) return unavailable(s, action, READABLE.Unauthorized, { preconditions: pre });
      if (!check(a.creatorMayRepoint && !a.isSink, 'This destination can be edited')) return unavailable(s, action, READABLE.ImmutableAllocation, { preconditions: pre });
      if (!params.destination || !isAddress(params.destination)) return unavailable(s, action, 'Give the new destination address.', { preconditions: pre });
      data = routerInterface.encodeFunctionData('repointWallet', [b.id, a.id, getAddress(params.destination)]);
      steps = ['Moves this share to the new wallet. Amounts already owed to the old wallet stay with it.'];
      break;
    }
    default:
      throw new RouterReadError(400, 'bad_action', `Unknown action "${action}".`);
  }

  const tx = { chainId: s.network.chainId, from: sender, to: s.router, data, value: '0' };
  try { await provider.call({ from: sender, to: s.router, data }); }
  catch (e) { const why = readableRevert(e); return unavailable(s, action, why.message, { code: why.code, amount, preconditions: pre }); }
  check(true, 'Simulated against the latest block without reverting');
  return { ok: true, action, tx, amount, steps, preconditions: pre, reason: null, preparedAt: s.asOf, note: 'Prepare again if a few blocks pass before signing. A transaction hash is not a confirmation; wait for the receipt.' };
}
