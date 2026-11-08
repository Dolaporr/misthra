import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRpcProxy, loadRpcConfig } from '../rpc/proxy.mjs';

// A fake JSON-RPC node. `mode` can be changed during a test.
async function fakeNode(t, { chainId = 99901, block = 1000, mode = 'ok' } = {}) {
  const node = { chainId, block, mode, calls: [] };
  const answer = (c) => ({ jsonrpc: '2.0', id: c.id, result: c.method === 'eth_chainId' ? `0x${node.chainId.toString(16)}` : c.method === 'eth_blockNumber' ? `0x${node.block.toString(16)}` : `served-by-${node.name}` });
  const server = http.createServer(async (req, res) => {
    let body = ''; for await (const c of req) body += c;
    const p = JSON.parse(body);
    node.calls.push(p);
    if (node.mode === 'down' && !(Array.isArray(p) && p[0]?.method === 'eth_chainId')) { res.writeHead(503); return res.end(); }
    if (node.mode === 'limited') { res.writeHead(429); return res.end(); }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(Array.isArray(p) ? p.map(answer) : answer(p)));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  node.url = `http://127.0.0.1:${server.address().port}`;
  return node;
}

async function proxyFor(t, nodes, env = {}) {
  nodes.forEach((n, i) => (n.name = `node${i + 1}`));
  let clock = 1_000_000;
  const cfg = loadRpcConfig({ RPC_UPSTREAMS: nodes.map((n) => n.url).join(','), EXPECTED_CHAIN_ID: '99901', PORT: '0', HOST: '127.0.0.1', ...env });
  const proxy = createRpcProxy(cfg, { now: () => clock });
  await proxy.checkHealth();
  const server = await proxy.listen();
  t.after(() => { proxy.stop(); server.close(); });
  const url = `http://127.0.0.1:${server.address().port}`;
  const call = async (payload, headers = {}) => { const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(payload) }); return { status: r.status, body: await r.json() }; };
  return { proxy, url, call, tick: (ms) => (clock += ms) };
}
const rpc = (method, params = [], id = 1) => ({ jsonrpc: '2.0', id, method, params });

test('primary serves; on failure the backup does; recovery goes back to primary', async (t) => {
  const primary = await fakeNode(t), backup = await fakeNode(t);
  const p = await proxyFor(t, [primary, backup]);
  assert.equal((await p.call(rpc('eth_getBalance', ['0x0', 'latest']))).body.result, 'served-by-node1');
  primary.mode = 'down';
  assert.equal((await p.call(rpc('eth_getBalance', ['0x0', 'latest']))).body.result, 'served-by-node2');
  primary.mode = 'limited';
  assert.equal((await p.call(rpc('eth_call', [{}, 'latest']))).body.result, 'served-by-node2', '429 also fails over');
  primary.mode = 'ok';
  assert.equal((await p.call(rpc('eth_call', [{}, 'latest']))).body.result, 'served-by-node1');
  backup.mode = 'down'; primary.mode = 'down';
  const both = await p.call(rpc('eth_call', [{}, 'latest']));
  assert.equal(both.status, 502);
  assert.match(both.body.error.message, /All upstreams failed/);
});

test('an upstream on the wrong chain or far behind is never used', async (t) => {
  const wrong = await fakeNode(t, { chainId: 1 }), lagging = await fakeNode(t, { block: 100 }), good = await fakeNode(t, { block: 5000 });
  const p = await proxyFor(t, [wrong, lagging, good]);
  const s = p.proxy.status().upstreams;
  assert.deepEqual(s.map((u) => u.healthy), [false, false, true]);
  assert.equal((await p.call(rpc('eth_call', [{}, 'latest']))).body.result, 'served-by-node3');
  const status = await (await fetch(p.url)).json();
  assert.ok(!JSON.stringify(status).includes('127.0.0.1'), 'status never reveals upstream URLs');
});

test('signing and admin methods are refused; log queries are bounded', async (t) => {
  const node = await fakeNode(t);
  const p = await proxyFor(t, [node], { RPC_MAX_LOG_RANGE: '1000' });
  for (const m of ['eth_sign', 'personal_sign', 'admin_peers', 'debug_traceTransaction', 'eth_newFilter']) {
    assert.equal((await p.call(rpc(m))).body.error.code, -32601, m);
  }
  assert.equal((await p.call(rpc('eth_getLogs', [{ fromBlock: '0x0', toBlock: '0x3e9' }]))).body.error.code, -32005);
  assert.equal((await p.call(rpc('eth_getLogs', [{ fromBlock: 'earliest', toBlock: 'latest' }]))).body.error.code, -32005);
  assert.equal((await p.call(rpc('eth_getLogs', [{ fromBlock: '0x0', toBlock: '0x3e8' }]))).body.result, 'served-by-node1');
  const forwarded = node.calls.flat().map((c) => c.method);
  assert.ok(!forwarded.some((m) => /sign|admin|debug|newFilter/.test(m)), 'refused calls never reach the upstream');
});

test('batches keep their order, mixing answers with refusals', async (t) => {
  const node = await fakeNode(t);
  const p = await proxyFor(t, [node]);
  const { body } = await p.call([rpc('eth_chainId', [], 'a'), rpc('eth_sign', [], 'b'), rpc('eth_call', [{}, 'latest'], 'c')]);
  assert.deepEqual(body.map((r) => r.id), ['a', 'b', 'c']);
  assert.equal(body[0].result, '0x1863d');
  assert.equal(body[1].error.code, -32601);
  assert.equal(body[2].result, 'served-by-node1');
  assert.equal((await p.call(Array.from({ length: 51 }, (_, i) => rpc('eth_chainId', [], i)))).status, 400);
});

test('each client IP is rate limited separately', async (t) => {
  const node = await fakeNode(t);
  const p = await proxyFor(t, [node], { RPC_RATE_BURST: '3', RPC_RATE_PER_SECOND: '1' });
  const a = { 'x-forwarded-for': '1.1.1.1' }, b = { 'x-forwarded-for': '2.2.2.2' };
  for (let i = 0; i < 3; i++) assert.equal((await p.call(rpc('eth_chainId'), a)).status, 200);
  assert.equal((await p.call(rpc('eth_chainId'), a)).status, 429);
  assert.equal((await p.call(rpc('eth_chainId'), b)).status, 200, 'another client is unaffected');
  p.tick(2000);
  assert.equal((await p.call(rpc('eth_chainId'), a)).status, 200, 'tokens refill over time');
});
