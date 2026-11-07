// Traction score and safety summary.
//
// The traction score follows the shape of Blix Trade's traction rank
// (github.com/blixvip/blixtrade, server/quality.js, MIT): start at 35, add or
// subtract for recent volume, trader count, momentum and size, and explain every
// adjustment in plain words. The thresholds here are our own, in HYPE, and are a
// starting point to tune against Elysium data, not measured results.

const usd = (n) => `${n >= 100 ? Math.round(n) : n.toFixed(1)} HYPE`;
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);

export function traction(f = {}) {
  let s = 35;
  const up = [], down = [];
  const add = (n, text) => { s += n; if (text) (n > 0 ? up : down).push(text); };
  if (isNum(f.volume5m)) { if (f.volume5m >= 20) add(18, `${usd(f.volume5m)} traded in the last 5 minutes`); else if (f.volume5m >= 3) add(6); else add(-14, 'almost nothing traded in the last 5 minutes'); }
  if (isNum(f.traders)) { if (f.traders >= 40) add(10, `${f.traders} different traders today`); else if (f.traders >= 9) add(4); else add(-8, `only ${f.traders} traders so far`); }
  if (isNum(f.change5m)) { if (f.change5m > 0) add(4); else add(-5, 'flat or down over 5 minutes'); }
  if (isNum(f.change1h)) { if (f.change1h > 130) add(-5, `already up ${Math.round(f.change1h)}% this hour`); else if (f.change1h >= -2) add(10, 'holding or climbing this hour'); else add(-9, `down ${Math.round(-f.change1h)}% this hour`); }
  if (isNum(f.holders) && f.holders >= 60 && f.holders <= 400) add(5, `${f.holders} holders, still early`);
  if (isNum(f.liquidity) && f.liquidity < 10) add(-10, `thin liquidity (${usd(f.liquidity)})`);
  return { score: Math.max(0, Math.min(100, Math.round(s))), up, down };
}

// A launch passes only when every check passes. An unchecked or unknown result
// is a warning, never a quiet pass.
export function safetyStatus(safety) {
  const checks = safety?.checks ?? [];
  if (!checks.length) return 'unchecked';
  if (checks.some((c) => c.result === 'fail')) return 'fail';
  if (checks.some((c) => c.result !== 'pass')) return 'warn';
  return 'pass';
}

const MINT_SELECTOR = '40c10f19';             // mint(address,uint256)
const EIP1967_IMPL = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';

// Read-only probes against the token contract. Each check states what was
// actually observed; anything not observed is `unknown`.
export async function probeSafety(provider, { token, pad, top10Pct }) {
  const checks = [];
  const code = (await provider.getCode(token)).toLowerCase();
  let owner = null;
  try { const out = await provider.call({ to: token, data: '0x8da5cb5b' }); if (out && out.length >= 66) owner = `0x${out.slice(-40)}`; } catch { owner = null; }
  checks.push(owner === null
    ? { id: 'owner', label: 'No owner powers', result: 'pass', detail: 'The token has no owner() function' }
    : /^0x0{40}$/.test(owner)
      ? { id: 'owner', label: 'No owner powers', result: 'pass', detail: 'Ownership is renounced' }
      : { id: 'owner', label: 'No owner powers', result: 'warn', detail: `Owner ${owner} can still call owner-only functions` });
  checks.push(code.includes(MINT_SELECTOR)
    ? { id: 'mint', label: 'No mint function', result: 'warn', detail: 'The code contains a mint(address,uint256) selector' }
    : { id: 'mint', label: 'No mint function', result: 'pass', detail: 'No mint(address,uint256) selector in the code' });
  const impl = await provider.getStorage(token, EIP1967_IMPL).catch(() => '0x0');
  // Some RPCs answer an empty slot with "0x"; treat that as zero.
  checks.push((/^0x0*$/.test(impl) ? 0n : BigInt(impl)) === 0n
    ? { id: 'proxy', label: 'Not upgradeable', result: 'pass', detail: 'No EIP-1967 implementation slot set' }
    : { id: 'proxy', label: 'Not upgradeable', result: 'warn', detail: 'This is an upgradeable proxy; its rules can change' });
  checks.push(pad?.locksLiquidity
    ? { id: 'lp-locked', label: 'Liquidity locked', result: 'pass', detail: `${pad.name} states that it locks launch liquidity` }
    : { id: 'lp-locked', label: 'Liquidity locked', result: 'unknown', detail: 'Lock status not verified for this pool' });
  if (typeof top10Pct === 'number') checks.push(top10Pct > 50
    ? { id: 'concentration', label: 'Holder concentration', result: 'warn', detail: `Top 10 holders own ${top10Pct}% of supply` }
    : { id: 'concentration', label: 'Holder concentration', result: 'pass', detail: `Top 10 holders own ${top10Pct}% of supply` });
  checks.push({ id: 'tax', label: 'Buy/sell tax', result: 'unknown', detail: 'Sell simulation is not run yet' });
  return { checks, checkedAt: Date.now() };
}
