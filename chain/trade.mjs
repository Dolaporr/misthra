// Quotes and unsigned trades on Elysium. Every live trade goes through
// MisthraTradeGateway, which takes the fixed platform fee in HYPE and calls
// Uniswap's SwapRouter02 in the same transaction. The server never signs.
import { Interface, formatUnits, parseUnits } from 'ethers';

const quoter = new Interface(['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut,uint160,uint32,uint256)']);
export const gatewayAbi = [
  'function buy(address token,uint24 poolFee,uint256 minTokensOut,uint256 deadline) payable returns (uint256)',
  'function sell(address token,uint24 poolFee,uint256 amountIn,uint256 minHypeOut,uint256 deadline) returns (uint256)',
  'function feeBps() view returns (uint16)',
];
const gateway = new Interface(gatewayAbi);
const erc20 = new Interface(['function approve(address,uint256) returns (bool)', 'function allowance(address,address) view returns (uint256)']);
const BPS = 10_000n;

async function quoteExact(provider, config, tokenIn, tokenOut, amountIn, fee) {
  const out = await provider.call({ to: config.v3Quoter, data: quoter.encodeFunctionData('quoteExactInputSingle', [{ tokenIn, tokenOut, amountIn, fee, sqrtPriceLimitX96: 0 }]) });
  return quoter.decodeFunctionResult('quoteExactInputSingle', out)[0];
}

let cachedFee = null;
async function onchainFeeBps(provider, config) {
  if (cachedFee === null) cachedFee = BigInt(gateway.decodeFunctionResult('feeBps', await provider.call({ to: config.tradeGateway, data: gateway.encodeFunctionData('feeBps') }))[0]);
  return cachedFee;
}

export const QUOTE_TTL_S = 120;          // on-chain deadline
export const QUOTE_REFRESH_MS = 20_000;  // re-quote after this

export async function liveQuote(provider, config, { token, side, amount, slippageBps, wallet, fee: poolFee, decimals = 18, now = Date.now() }) {
  const buy = side === 'buy';
  const feeBps = await onchainFeeBps(provider, config);
  const input = parseUnits(amount, buy ? 18 : decimals);
  let out, platformFee, swapIn;
  if (buy) {
    platformFee = (input * feeBps) / BPS;
    swapIn = input - platformFee;
    out = await quoteExact(provider, config, config.whype, token, swapIn, poolFee);
  } else {
    swapIn = input;
    const gross = await quoteExact(provider, config, token, config.whype, swapIn, poolFee);
    platformFee = (gross * feeBps) / BPS;
    out = gross - platformFee;
  }
  // Price impact against a quote one thousandth the size, before the platform fee.
  const probeIn = swapIn / 1000n || 1n;
  const probeOut = await quoteExact(provider, config, buy ? config.whype : token, buy ? token : config.whype, probeIn, poolFee).catch(() => 0n);
  const grossOut = buy ? out : out + platformFee;
  const impact = probeOut > 0n ? Number(BPS - (grossOut * BPS * probeIn) / (probeOut * swapIn)) : null;
  const minOut = (out * (BPS - BigInt(slippageBps))) / BPS;
  // The signed transaction reverts after `deadline`; the UI should re-quote well before
  // that (expiresAt), and always immediately before asking the wallet to sign.
  const deadline = BigInt(Math.floor(now / 1000) + QUOTE_TTL_S);
  const blockNumber = await provider.getBlockNumber().catch(() => null);
  const result = {
    amountOut: formatUnits(out, buy ? decimals : 18), minOut: formatUnits(minOut, buy ? decimals : 18),
    feeHype: formatUnits(platformFee, 18), feeBps: Number(feeBps), priceImpactBps: impact == null ? null : Math.max(0, impact),
    route: `Uniswap v3 ${poolFee / 10_000}% pool via Misthra`, tx: null, approveTx: null, reason: null,
    // Exact integers (base units) alongside the display strings above.
    units: {
      amountIn: input.toString(), amountInDecimals: buy ? 18 : decimals,
      amountOut: out.toString(), minOut: minOut.toString(), amountOutDecimals: buy ? decimals : 18,
      fee: platformFee.toString(), feeDecimals: 18,
    },
    slippageBps, quotedAt: now, expiresAt: now + QUOTE_REFRESH_MS, deadline: Number(deadline) * 1000, blockNumber,
  };
  if (!wallet) return { ...result, reason: 'Connect a wallet to get a transaction to sign.' };
  if (buy) {
    result.tx = { from: wallet, to: config.tradeGateway, data: gateway.encodeFunctionData('buy', [token, poolFee, minOut, deadline]), value: input.toString(), chainId: config.chainId };
  } else {
    const allowance = BigInt(await provider.call({ to: token, data: erc20.encodeFunctionData('allowance', [wallet, config.tradeGateway]) }));
    // Approve exactly this sale, not an unlimited allowance.
    if (allowance < input) result.approveTx = { from: wallet, to: token, data: erc20.encodeFunctionData('approve', [config.tradeGateway, input]), value: '0', chainId: config.chainId };
    result.tx = { from: wallet, to: config.tradeGateway, data: gateway.encodeFunctionData('sell', [token, poolFee, input, minOut, deadline]), value: '0', chainId: config.chainId };
  }
  return result;
}

// Simulated quote from the simulated feed. Applies the same platform fee the
// gateway would, so the preview shows what a trader would really pay.
export function simulatedQuote({ side, amount, slippageBps, priceHype, liquidityHype, feeBps = 75 }) {
  const size = Number(amount), price = Number(priceHype), liq = Math.max(1, Number(liquidityHype));
  const fmt = (x) => x.toPrecision(8).replace(/\.?0+$/, '');
  const empty = { amountOut: '0', minOut: '0', feeHype: '0', feeBps, priceImpactBps: null, route: 'Simulated pool', tx: null, approveTx: null };
  if (!(size > 0) || !(price > 0)) return { ...empty, reason: 'No simulated price for this token yet.' };
  const hypeSize = side === 'buy' ? size : size * price;
  const impactBps = Math.min(9_000, Math.round((hypeSize / (liq + hypeSize)) * 10_000));
  const poolFee = 0.01, platform = feeBps / 10_000;
  let out, fee;
  if (side === 'buy') { fee = size * platform; out = ((size - fee) / price) * (1 - poolFee) * (1 - impactBps / 10_000); }
  else { const gross = size * price * (1 - poolFee) * (1 - impactBps / 10_000); fee = gross * platform; out = gross - fee; }
  return { ...empty, amountOut: fmt(out), minOut: fmt(out * (1 - slippageBps / 10_000)), feeHype: fmt(fee), priceImpactBps: impactBps, route: 'Simulated pool (1% pool fee)', reason: 'Simulated feed: no transaction is built. Use a paper fill.' };
}
