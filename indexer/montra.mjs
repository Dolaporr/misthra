// Montra launches (Uniswap v4).
//
// Montra creates each token and its v4 pool in one transaction and emits TokenLaunched
// on its factory. Trades then appear as Swap on the shared v4 PoolManager, keyed by poolId.
// Event signatures come from Montra's public docs as relayed in research (2026-11-08) and
// are NOT yet checked against a real launch transaction: if the factory emits nothing that
// matches over a long range, the indexer logs a warning instead of guessing.
import { Interface, formatUnits } from 'ethers';

export const montraEvents = new Interface([
  'event TokenLaunched(address indexed token, address indexed creator, bytes32 indexed poolId, uint256 configId, address quote, bool quoteIsCurrency0, uint256 supply, int24 startTick, address feeRecipient, bool feeLocked, uint256 firstBuyIn, uint256 firstBuyOut)',
]);
export const v4Events = new Interface([
  'event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)',
]);
export const MONTRA_T = {
  launched: montraEvents.getEvent('TokenLaunched').topicHash,
  swap: v4Events.getEvent('Swap').topicHash,
};

const NATIVE = '0x0000000000000000000000000000000000000000';
const lower = (a) => a.toLowerCase();
const abs = (x) => (x < 0n ? -x : x);
const Q96 = 2n ** 96n;

// Quote must be native HYPE (v4 currency address(0)) or a configured WHYPE.
export function parseLaunch(entry, quotes) {
  const e = montraEvents.parseLog(entry);
  const quote = lower(e.args.quote);
  if (quote !== NATIVE && !quotes.has(quote)) return null;
  return {
    token: lower(e.args.token), creator: lower(e.args.creator), poolId: lower(e.args.poolId), quote,
    launchIs0: !e.args.quoteIsCurrency0, feeRecipient: lower(e.args.feeRecipient), feeLocked: e.args.feeLocked,
  };
}

// v4 PoolManager reports amounts from the swapper's side (BalanceDelta): positive means the
// swapper received that currency. So a positive launch-token amount is a buy. This is the
// opposite sign to v3's pool-side amounts.
export function parseSwap(entry, launch, decimals = 18) {
  const e = v4Events.parseLog(entry);
  const tokenDelta = launch.launchIs0 ? e.args.amount0 : e.args.amount1;
  const hypeDelta = launch.launchIs0 ? e.args.amount1 : e.args.amount0;
  const tokens = Number(formatUnits(abs(tokenDelta), decimals)), hype = Number(formatUnits(abs(hypeDelta), 18));
  if (!tokens || !hype) return null;
  return { side: tokenDelta > 0n ? 'buy' : 'sell', tokens, hype, price: hype / tokens, sender: lower(e.args.sender), liquidityHype: activeLiquidityHype(e.args.liquidity, e.args.sqrtPriceX96, launch.launchIs0) };
}

// Quote-side virtual reserve of the active liquidity, doubled (both sides valued in HYPE),
// the same convention as the v3 reader. An estimate of depth near the price, not TVL.
export function activeLiquidityHype(liquidity, sqrtPriceX96, launchIs0) {
  if (!liquidity || !sqrtPriceX96) return null;
  const L = BigInt(liquidity), s = BigInt(sqrtPriceX96);
  // token1 reserve = L * sqrtP ; token0 reserve = L / sqrtP (raw units, sqrtP = s / 2^96)
  const quoteRaw = launchIs0 ? (L * s) / Q96 : (L * Q96) / s;
  return Number(formatUnits(quoteRaw * 2n, 18));
}
