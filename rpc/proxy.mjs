// Misthra's public Elysium RPC: a thin JSON-RPC forwarder with failover.
//
// Requests go to the first healthy upstream (your provider first, Agora's public
// RPC as the backup). An upstream is healthy only if it answers eth_chainId with
// the expected chain and is not far behind the best block seen. A request moves
// to the next upstream on a network error, timeout, HTTP 5xx or 429; a JSON-RPC
// error is a real answer and is returned as is.
//
// No dependencies. Upstream URLs may contain API keys: they are never logged and
// never sent to clients.
import http from 'node:http';

const ALLOWED_PREFIXES = ['eth_', 'net_', 'web3_'];
const BLOCKED = new Set(['eth_sign', 'eth_signTransaction', 'eth_signTypedData', 'eth_signTypedData_v3', 'eth_signTypedData_v4', 'eth_accounts', 'eth_requestAccounts', 'eth_coinbase', 'eth_mining', 'eth_submitWork', 'eth_submitHashrate', 'eth_getWork']);
const STATEFUL = new Set(['eth_newFilter', 'eth_newBlockFilter', 'eth_newPendingTransactionFilter', 'eth_getFilterChanges', 'eth_getFilterLogs', 'eth_uninstallFilter', 'eth_subscribe', 'eth_unsubscribe']);

export function loadRpcConfig(env = process.env) {
  const upstreams = (env.RPC_UPSTREAMS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return {
    port: Number(env.PORT || 8545),
    host: env.HOST || '0.0.0.0',
    upstreams,
    chainId: Number(env.EXPECTED_CHAIN_ID || 0),
    timeoutMs: Number(env.RPC_TIMEOUT_MS || 8000),
    maxLag: Number(env.RPC_MAX_LAG_BLOCKS || 200),
    maxBatch: Number(env.RPC_MAX_BATCH || 50),
    maxLogRange: Number(env.RPC_MAX_LOG_RANGE || 10_000),
    maxBodyBytes: Number(env.RPC_MAX_BODY_BYTES || 512_000),
    ratePerSecond: Number(env.RPC_RATE_PER_SECOND || 25),
    rateBurst: Number(env.RPC_RATE_BURST || 100),
    healthEveryMs: Number(env.RPC_HEALTH_EVERY_MS || 15_000),
    trustProxy: env.RPC_TRUST_PROXY !== '0',
  };
}

const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
const label = (i) => `upstream-${i + 1}`; // never the URL: it may hold a key

function checkCall(call, cfg) {
  if (!call || call.jsonrpc !== '2.0' || typeof call.method !== 'string') return rpcError(call?.id, -32600, 'Invalid request');
  const m = call.method;
  if (BLOCKED.has(m) || !ALLOWED_PREFIXES.some((p) => m.startsWith(p))) return rpcError(call.id, -32601, `Method ${m} is not available on this endpoint`);
  if (STATEFUL.has(m)) return rpcError(call.id, -32601, `Method ${m} needs a stateful connection; poll eth_getLogs or eth_blockNumber instead`);
  if (m === 'eth_getLogs') {
    const f = call.params?.[0] ?? {};
    if (f.blockHash) return null;
    const num = (v) => (typeof v === 'string' && /^0x[0-9a-f]+$/i.test(v) ? Number(BigInt(v)) : null);
    const from = num(f.fromBlock), to = num(f.toBlock);
    if (from == null || to == null) return rpcError(call.id, -32005, 'eth_getLogs needs numeric fromBlock and toBlock (or a blockHash) on this endpoint');
    if (to - from > cfg.maxLogRange) return rpcError(call.id, -32005, `eth_getLogs is limited to ${cfg.maxLogRange} blocks per request`);
  }
  return null;
}

export function createRpcProxy(cfg, { fetchImpl = fetch, now = () => Date.now(), log = () => {} } = {}) {
  if (!cfg.upstreams.length) throw new Error('RPC_UPSTREAMS is empty');
  if (!cfg.chainId) throw new Error('EXPECTED_CHAIN_ID is required');
  const state = cfg.upstreams.map(() => ({ healthy: false, block: 0, chainOk: false, checkedAt: 0, failures: 0 }));
  const buckets = new Map();

  async function post(i, body) {
    const res = await fetchImpl(cfg.upstreams[i], { method: 'POST', headers: { 'content-type': 'application/json' }, body, signal: AbortSignal.timeout(cfg.timeoutMs) });
    if (res.status >= 500 || res.status === 429) throw new Error(`HTTP ${res.status}`);
    return res;
  }

  async function checkHealth() {
    await Promise.all(state.map(async (s, i) => {
      try {
        const res = await post(i, JSON.stringify([{ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }, { jsonrpc: '2.0', id: 2, method: 'eth_blockNumber', params: [] }]));
        const out = await res.json();
        const byId = Object.fromEntries((Array.isArray(out) ? out : []).map((r) => [r.id, r.result]));
        s.chainOk = Number(BigInt(byId[1] ?? '0x0')) === cfg.chainId;
        s.block = Number(BigInt(byId[2] ?? '0x0'));
        if (!s.chainOk) log(`${label(i)} answered the wrong chain; excluded`);
      } catch (e) { s.chainOk = false; log(`${label(i)} health check failed: ${e.message}`); }
      s.checkedAt = now();
    }));
    const best = Math.max(0, ...state.filter((s) => s.chainOk).map((s) => s.block));
    for (const s of state) s.healthy = s.chainOk && best - s.block <= cfg.maxLag;
    return status();
  }

  function status() {
    return { chainId: cfg.chainId, upstreams: state.map((s, i) => ({ name: label(i), healthy: s.healthy, block: s.block, chainOk: s.chainOk, failures: s.failures })) };
  }

  function allow(ip) {
    const t = now() / 1000;
    const b = buckets.get(ip) ?? { tokens: cfg.rateBurst, at: t };
    b.tokens = Math.min(cfg.rateBurst, b.tokens + (t - b.at) * cfg.ratePerSecond);
    b.at = t;
    if (b.tokens < 1) { buckets.set(ip, b); return false; }
    b.tokens -= 1;
    buckets.set(ip, b);
    if (buckets.size > 50_000) buckets.clear();
    return true;
  }

  // Forward one checked payload through healthy upstreams in priority order.
  async function forward(body) {
    const order = state.map((s, i) => i).filter((i) => state[i].healthy);
    if (!order.length) throw Object.assign(new Error('No healthy upstream'), { status: 503 });
    let last;
    for (const i of order) {
      try {
        const res = await post(i, body);
        state[i].failures = 0;
        return await res.text();
      } catch (e) { last = e; state[i].failures += 1; log(`${label(i)} failed: ${e.message}; trying next`); }
    }
    throw Object.assign(new Error(`All upstreams failed (${last?.message})`), { status: 502 });
  }

  async function handle(req, res) {
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, GET, OPTIONS', 'access-control-allow-headers': 'content-type' };
    const send = (code, payload) => { res.writeHead(code, { 'content-type': 'application/json', ...cors }); res.end(typeof payload === 'string' ? payload : JSON.stringify(payload)); };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
    if (req.method === 'GET') return send(200, { name: 'Misthra Elysium RPC', ...status() });
    if (req.method !== 'POST') return send(405, rpcError(null, -32600, 'Use POST'));
    const ip = (cfg.trustProxy && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || 'unknown';
    if (!allow(ip)) return send(429, rpcError(null, -32005, 'Rate limit exceeded; slow down'));

    let size = 0; const chunks = [];
    for await (const c of req) { size += c.length; if (size > cfg.maxBodyBytes) return send(413, rpcError(null, -32600, 'Request too large')); chunks.push(c); }
    let payload;
    try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return send(400, rpcError(null, -32700, 'Parse error')); }

    const batch = Array.isArray(payload);
    const calls = batch ? payload : [payload];
    if (!calls.length || calls.length > cfg.maxBatch) return send(400, rpcError(null, -32600, `Batches must hold 1 to ${cfg.maxBatch} calls`));
    const rejected = calls.map((c) => checkCall(c, cfg));
    if (!batch && rejected[0]) return send(200, rejected[0]);
    const passing = calls.filter((_, i) => !rejected[i]);
    try {
      if (!passing.length) return send(200, rejected);
      const answer = await forward(JSON.stringify(batch ? passing : passing[0]));
      if (!batch || passing.length === calls.length) return send(200, answer);
      // Merge upstream answers with our refusals, keeping the client's order.
      const answers = new Map(JSON.parse(answer).map((r) => [JSON.stringify(r.id), r]));
      return send(200, calls.map((c, i) => rejected[i] ?? answers.get(JSON.stringify(c.id))));
    } catch (e) {
      return send(e.status ?? 502, rpcError(batch ? null : calls[0]?.id, -32603, e.message));
    }
  }

  let timer = null;
  return {
    handle, checkHealth, status,
    listen() {
      const server = http.createServer((req, res) => { handle(req, res).catch((e) => { log(`handler: ${e.message}`); if (!res.headersSent) { res.writeHead(500); res.end(); } }); });
      timer = setInterval(() => checkHealth().catch(() => {}), cfg.healthEveryMs); timer.unref?.();
      return new Promise((r) => server.listen(cfg.port, cfg.host, () => r(server)));
    },
    stop() { if (timer) clearInterval(timer); },
  };
}
