// HYPE/USD for dollar market caps.
//
// Source: Hyperliquid's public info API, `allMids`, key "HYPE": the mid price of the
// HYPE perpetual on Hyperliquid, which is where HYPE trades deepest. HYPE on Elysium is
// HYPE bridged 1:1 from HyperEVM, so this is its dollar price. No key needed.
//
// Freshness: refreshed every `refreshMs`; a price older than `maxAgeMs` is stale and
// reported as null, so dollar figures disappear instead of drifting. There is no fixed or
// fallback rate. The simulated preview uses a labelled simulated rate.

export const HYPERLIQUID_INFO = 'https://api.hyperliquid.xyz/info';
export const SIMULATED_HYPE_USD = '40'; // preview only, always labelled source: 'simulated'

const POSITIVE_DECIMAL = /^\d{1,9}(\.\d{1,18})?$/;

export function createHypeUsd({ fetchImpl = globalThis.fetch, now = () => Date.now(), url = HYPERLIQUID_INFO, refreshMs = 30_000, maxAgeMs = 120_000, timeoutMs = 8_000, log = () => {} } = {}) {
  let price = null, fetchedAt = null, lastError = null, timer = null;

  async function refresh() {
    try {
      const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'allMids' }), signal: ctrl.signal }).finally(() => clearTimeout(t));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      const mid = String(body?.HYPE ?? '');
      if (!POSITIVE_DECIMAL.test(mid) || !(Number(mid) > 0)) throw new Error('no valid HYPE mid in the response');
      price = mid; fetchedAt = now(); lastError = null;
    } catch (err) { lastError = err.message; log(`HYPE/USD: ${err.message}`); }
    return current();
  }

  function current() {
    const age = fetchedAt == null ? null : now() - fetchedAt;
    const fresh = age != null && age <= maxAgeMs;
    return {
      hypeUsd: fresh ? price : null,
      source: 'Hyperliquid HYPE mid (api.hyperliquid.xyz allMids)',
      fetchedAt, stale: !fresh, maxAgeMs,
      reason: fresh ? null : fetchedAt == null ? (lastError ? `HYPE/USD unavailable: ${lastError}` : 'HYPE/USD not fetched yet.') : 'HYPE/USD price is stale.',
    };
  }

  return {
    refresh, current,
    start() { if (!timer) { refresh(); timer = setInterval(refresh, refreshMs); timer.unref?.(); } },
    stop() { clearInterval(timer); timer = null; },
  };
}

export function simulatedHypeUsd(now = () => Date.now()) {
  return { current: () => ({ hypeUsd: SIMULATED_HYPE_USD, source: 'simulated', fetchedAt: now(), stale: false, maxAgeMs: null, reason: null }), refresh: async () => {}, start() {}, stop() {} };
}

// Dollar amount as a decimal string: cents for $1 and up, significant digits below.
export function usd(hypeAmount, hypeUsd) {
  if (hypeUsd == null || hypeAmount == null) return null;
  const x = Number(hypeAmount) * Number(hypeUsd);
  if (!Number.isFinite(x) || x < 0) return null;
  if (x === 0) return '0';
  if (x >= 1) return x.toFixed(2);
  const digits = Math.min(18, 3 - Math.floor(Math.log10(x)));
  return x.toFixed(digits).replace(/\.?0+$/, '');
}
