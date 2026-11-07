// Quotes and unsigned swap transactions on Elysium's Uniswap v3 deployment.
// The server never signs: it returns calldata for the user's own wallet.
import { Interface, MaxUint256, formatUnits, parseUnits } from 'ethers';

const quoter = new Interface(['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut,uint160,uint32,uint256)']);
const router = new Interface([
  'function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256)',
  'function unwrapWETH9(uint256 amountMinimum,address recipient) payable',
  'function multicall(uint256 deadline,bytes[] data) payable returns (bytes[])',
]);
const erc20 = new Interface(['function approve(address,uint256) returns (bool)', 'function allowance(address,address) view returns (uint256)']);
const ADDRESS_THIS = '0x0000000000000000000000000000000000000002'; // SwapRouter02: keep output in the router

async function quoteExact(provider, config, tokenIn, tokenOut, amountIn, fee) {
  const data = quoter.encodeFunctionData('quoteExactInputSingle', [{ tokenIn, tokenOut, amountIn, fee, sqrtPriceLimitX96: 0 }]);
  const out = await provider.call({ to: config.v3Quoter, data });
  return quoter.decodeFunctionResult('quoteExactInputSingle', out)[0];
}

export async function liveQuote(provider, config, { token, side, amount, slippageBps, wallet, fee, decimals = 18, now = Date.now() }) {
  const buy = side === 'buy';
  const tokenIn = buy ? config.whype : token, tokenOut = buy ? token : config.whype;
  const amountIn = parseUnits(amount, buy ? 18 : decimals);
  const amountOut = await quoteExact(provider, config, tokenIn, tokenOut, amountIn, fee);
  // Price impact against a quote one thousandth the size.
  const probeIn = amountIn / 1000n || 1n;
  const probeOut = await quoteExact(provider, config, tokenIn, tokenOut, probeIn, fee).catch(() => 0n);
  const impact = probeOut > 0n ? Number(10_000n - (amountOut * 10_000n * probeIn) / (probeOut * amountIn)) : null;
  const minOut = (amountOut * BigInt(10_000 - slippageBps)) / 10_000n;
  const deadline = BigInt(Math.floor(now / 1000) + 120);
  const result = { amountOut: formatUnits(amountOut, buy ? decimals : 18), minOut: formatUnits(minOut, buy ? decimals : 18), priceImpactBps: impact == null ? null : Math.max(0, impact), route: `Uniswap v3 ${fee / 10_000}% pool`, tx: null, approveTx: null, reason: null };
  if (!wallet) return { ...result, reason: 'Connect a wallet to get a transaction to sign.' };
  if (buy) {
    const swap = router.encodeFunctionData('exactInputSingle', [{ tokenIn, tokenOut, fee, recipient: wallet, amountIn, amountOutMinimum: minOut, sqrtPriceLimitX96: 0 }]);
    result.tx = { to: config.v3SwapRouter, data: router.encodeFunctionData('multicall', [deadline, [swap]]), value: amountIn.toString(), chainId: config.chainId };
  } else {
    const allowance = BigInt(await provider.call({ to: token, data: erc20.encodeFunctionData('allowance', [wallet, config.v3SwapRouter]) }));
    if (allowance < amountIn) result.approveTx = { to: token, data: erc20.encodeFunctionData('approve', [config.v3SwapRouter, MaxUint256]), value: '0', chainId: config.chainId };
    const swap = router.encodeFunctionData('exactInputSingle', [{ tokenIn, tokenOut, fee, recipient: ADDRESS_THIS, amountIn, amountOutMinimum: minOut, sqrtPriceLimitX96: 0 }]);
    const unwrap = router.encodeFunctionData('unwrapWETH9', [minOut, wallet]);
    result.tx = { to: config.v3SwapRouter, data: router.encodeFunctionData('multicall', [deadline, [swap, unwrap]]), value: '0', chainId: config.chainId };
  }
  return result;
}

// Simulated quote from the simulated feed's last price and liquidity. Labelled
// by the caller; never returns a transaction.
export function simulatedQuote({ side, amount, slippageBps, priceHype, liquidityHype }) {
  const size = Number(amount), price = Number(priceHype), liq = Math.max(1, Number(liquidityHype));
  if (!(size > 0) || !(price > 0)) return { amountOut: '0', minOut: '0', priceImpactBps: null, route: 'Simulated pool', tx: null, approveTx: null, reason: 'No simulated price for this token yet.' };
  const hypeSize = side === 'buy' ? size : size * price;
  const impactBps = Math.min(9_000, Math.round((hypeSize / (liq + hypeSize)) * 10_000));
  const gross = side === 'buy' ? size / price : size * price;
  const out = gross * (1 - 0.01) * (1 - impactBps / 10_000);
  const fmt = (x) => x.toPrecision(8).replace(/\.?0+$/, '');
  return { amountOut: fmt(out), minOut: fmt(out * (1 - slippageBps / 10_000)), priceImpactBps: impactBps, route: 'Simulated pool (1% fee)', tx: null, approveTx: null, reason: 'Simulated feed: no transaction is built. Use a paper fill.' };
}
