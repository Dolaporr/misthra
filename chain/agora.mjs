// Agora (agoradex.app) as a second trade route and data source.
//
// Agora aggregates Elysium launchpads (bonding curves, Uniswap v2/v3/v4, Ascend)
// and returns ready-to-sign best-price swaps. Misthra uses it for tokens its own
// gateway cannot trade, passing a builder code that earns 30% of Agora's fee in
// HYPE (developers.agoradex.app, "Builder rewards").
//
// Safety: an API response is never trusted on its own. A transaction is only
// handed to the user's wallet if its target is on AGORA_ALLOWED_TARGETS, and an
// approval only if it approves an allowlisted spender (directly or via Permit2).
//
// Field names for amounts are mapped in one place, `pick`, below. They were not
// checked against Agora's OpenAPI spec yet, so routing stays off until an
// operator has done that and set AGORA_ENABLED=1.
import { Interface, getAddress, isAddress } from 'ethers';

export const PERMIT2 = '0x000000000022d473030f116ddee9f6b43ac78ba3';
const erc20 = new Interface(['function approve(address spender,uint256 amount)']);
const permit2 = new Interface(['function approve(address token,address spender,uint160 amount,uint48 expiration)']);
const lower = (a) => (typeof a === 'string' ? a.toLowerCase() : a);
const list = (v) => (v || '').split(',').map((s) => s.trim()).filter((s) => isAddress(s)).map((s) => getAddress(s).toLowerCase());

export class AgoraError extends Error {
  constructor(code, message, status = 502) { super(message); this.code = code; this.status = status; }
}

export function loadAgoraConfig(env = process.env) {
  return {
    enabled: env.AGORA_ENABLED === '1',
    baseUrl: (env.AGORA_API_URL || 'https://api.agoradex.app/api/v1').replace(/\/$/, ''),
    apiKey: env.AGORA_API_KEY || null,
    builderCode: env.AGORA_BUILDER_CODE || null,
    allowedTargets: list(env.AGORA_ALLOWED_TARGETS),
  };
}

// The first key present wins. Keep every guess here so one review fixes all of them.
const pick = (obj, keys) => { for (const k of keys) if (obj?.[k] != null) return obj[k]; return undefined; };
const AMOUNT_OUT = ['amountOut', 'outAmount', 'expectedOut', 'out'];
const MIN_OUT = ['minAmountOut', 'minOut', 'amountOutMin', 'minimumOut'];
const FEE = ['fee', 'agoraFee', 'feeAmount'];
const VENUE = ['venue', 'route', 'source', 'launchpad'];

function checkApproval(a, { allowed, chainId }) {
  const tx = a?.transaction ?? a;
  if (!tx?.to || !tx?.data) throw new AgoraError('bad_approval', 'Agora returned an approval Misthra cannot read.');
  const to = lower(tx.to), selector = tx.data.slice(0, 10);
  let spender;
  if (selector === erc20.getFunction('approve').selector) spender = lower(erc20.decodeFunctionData('approve', tx.data)[0]);
  else if (to === PERMIT2 && selector === permit2.getFunction('approve').selector) spender = lower(permit2.decodeFunctionData('approve', tx.data)[1]);
  else throw new AgoraError('bad_approval', 'Agora returned an approval of a kind Misthra does not allow.');
  if (!allowed.has(spender) && spender !== PERMIT2) throw new AgoraError('untrusted_target', `Agora asked to approve ${spender}, which is not on Misthra's allowlist.`);
  return { to, data: tx.data, value: String(tx.value ?? '0'), chainId };
}

// Validates a raw /quote response and turns it into Misthra's quote shape.
export function checkQuote(raw, { allowedTargets, chainId, formatOut, formatHype }) {
  const allowed = new Set(allowedTargets);
  if (!allowed.size) throw new AgoraError('not_configured', 'Agora routing has no allowlisted contracts configured.', 503);
  const tx = raw?.transaction;
  if (!tx?.to || !tx?.data) throw new AgoraError('no_transaction', 'Agora returned a quote without a transaction.');
  if (!allowed.has(lower(tx.to))) throw new AgoraError('untrusted_target', `Agora's transaction targets ${lower(tx.to)}, which is not on Misthra's allowlist.`);
  if (tx.chainId != null && Number(tx.chainId) !== chainId) throw new AgoraError('wrong_chain', `Agora's transaction is for chain ${tx.chainId}, not ${chainId}.`);
  const approvals = (raw.approvals ?? []).map((a) => checkApproval(a, { allowed, chainId }));
  const amountOut = pick(raw, AMOUNT_OUT), minOut = pick(raw, MIN_OUT), fee = pick(raw, FEE);
  if (amountOut == null || minOut == null) throw new AgoraError('unmapped_format', "Agora's quote format is not mapped yet, so the amount cannot be shown. No transaction was built.");
  const venue = pick(raw, VENUE);
  return {
    amountOut: formatOut(String(amountOut)), minOut: formatOut(String(minOut)),
    feeHype: fee == null ? null : formatHype(String(fee)), feeBps: null, priceImpactBps: pick(raw, ['priceImpactBps']) ?? null,
    route: `Agora best price${typeof venue === 'string' ? ` (${venue})` : ''}`, via: 'agora',
    tx: { to: lower(tx.to), data: tx.data, value: String(tx.value ?? '0'), chainId }, approvals, approveTx: approvals[0] ?? null, reason: null,
  };
}

export function createAgoraClient(cfg, { fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  async function request(path, params = {}) {
    const url = new URL(`${cfg.baseUrl}${path}`);
    for (const [k, v] of Object.entries(params)) if (v != null && v !== '') url.searchParams.set(k, String(v));
    let res;
    try { res = await fetchImpl(url, { headers: { accept: 'application/json', ...(cfg.apiKey ? { 'x-api-key': cfg.apiKey } : {}) }, signal: AbortSignal.timeout(timeoutMs) }); }
    catch (e) { throw new AgoraError('unreachable', `Agora did not answer: ${e.message}`); }
    let body = null;
    try { body = await res.json(); } catch { /* handled below */ }
    if (!res.ok || body?.error) throw new AgoraError(body?.error?.code ?? 'http_error', body?.error?.message ?? `Agora returned HTTP ${res.status}.`, res.status === 429 ? 429 : 502);
    return body;
  }
  return {
    request,
    launchpads: () => request('/launchpads'),
    tokens: (params) => request('/tokens', params),
    token: (address) => request(`/tokens/${address}`),
    async quote({ token, side, amount, recipient, slippageBps }, ctx) {
      const raw = await request('/quote', { token, side, amount, recipient, slippageBps, ref: cfg.builderCode });
      return checkQuote(raw, { ...ctx, allowedTargets: cfg.allowedTargets });
    },
  };
}

// Exported for tests: calldata builders for fixtures.
export const encode = {
  approve: (spender, amount) => erc20.encodeFunctionData('approve', [spender, amount]),
  permit2Approve: (token, spender) => permit2.encodeFunctionData('approve', [token, spender, (1n << 160n) - 1n, 2n ** 47n]),
};
