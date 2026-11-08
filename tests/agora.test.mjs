import test from 'node:test';
import assert from 'node:assert/strict';
import { formatUnits } from 'ethers';
import { AgoraError, PERMIT2, createAgoraClient, encode, loadAgoraConfig } from '../chain/agora.mjs';

const ROUTER = '0xaf8dec958df2bd664aa661716a8de5fe0417a295';
const EVIL = '0x0000000000000000000000000000000000000bad';
const TOKEN = '0x1111111111111111111111111111111111111111';
const WALLET = '0x2222222222222222222222222222222222222222';
const ctx = { chainId: 99901, formatOut: (w) => formatUnits(w, 18), formatHype: (w) => formatUnits(w, 18) };

function fakeAgora(response, { status = 200 } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url: new URL(url), headers: init.headers }); return { ok: status < 400, status, json: async () => response }; };
  const client = createAgoraClient({ ...loadAgoraConfig({ AGORA_ENABLED: '1', AGORA_API_KEY: 'k-123', AGORA_BUILDER_CODE: 'misthra', AGORA_ALLOWED_TARGETS: ROUTER }) }, { fetchImpl });
  return { client, calls };
}
const quote = (extra = {}) => ({ transaction: { to: ROUTER, data: '0xabcdef', value: '1000000000000000000' }, approvals: [], amountOut: '1000000000000000000000', minAmountOut: '990000000000000000000', fee: '7500000000000000', ...extra });
const rejectsWith = (p, code) => assert.rejects(p, (e) => e instanceof AgoraError && e.code === code);

test('a buy quote passes the builder code and key, and maps to Misthra’s shape', async () => {
  const { client, calls } = fakeAgora(quote());
  const q = await client.quote({ token: TOKEN, side: 'buy', amount: '1', recipient: WALLET, slippageBps: 100 }, ctx);
  assert.equal(calls[0].url.pathname, '/api/v1/quote');
  assert.equal(calls[0].url.searchParams.get('ref'), 'misthra');
  assert.equal(calls[0].url.searchParams.get('recipient'), WALLET);
  assert.equal(calls[0].headers['x-api-key'], 'k-123');
  assert.equal(q.via, 'agora');
  assert.equal(q.amountOut, '1000.0');
  assert.equal(q.minOut, '990.0');
  assert.equal(q.feeHype, '0.0075');
  assert.deepEqual(q.tx, { to: ROUTER, data: '0xabcdef', value: '1000000000000000000', chainId: 99901 });
});

test('a transaction to a contract outside the allowlist is refused', async () => {
  const { client } = fakeAgora(quote({ transaction: { to: EVIL, data: '0xabcdef', value: '1' } }));
  await rejectsWith(client.quote({ token: TOKEN, side: 'buy', amount: '1', recipient: WALLET, slippageBps: 100 }, ctx), 'untrusted_target');
});

test('approvals must name an allowlisted spender, directly or through Permit2', async () => {
  const ok = fakeAgora(quote({ approvals: [{ to: TOKEN, data: encode.approve(ROUTER, 5n) }] }));
  assert.equal((await ok.client.quote({ token: TOKEN, side: 'sell', amount: '5', recipient: WALLET, slippageBps: 100 }, ctx)).approvals.length, 1);
  const viaPermit2 = fakeAgora(quote({ approvals: [{ to: TOKEN, data: encode.approve(PERMIT2, 5n) }, { transaction: { to: PERMIT2, data: encode.permit2Approve(TOKEN, ROUTER) } }] }));
  assert.equal((await viaPermit2.client.quote({ token: TOKEN, side: 'sell', amount: '5', recipient: WALLET, slippageBps: 100 }, ctx)).approvals.length, 2);
  const bad = fakeAgora(quote({ approvals: [{ to: TOKEN, data: encode.approve(EVIL, 5n) }] }));
  await rejectsWith(bad.client.quote({ token: TOKEN, side: 'sell', amount: '5', recipient: WALLET, slippageBps: 100 }, ctx), 'untrusted_target');
  const badPermit2 = fakeAgora(quote({ approvals: [{ to: PERMIT2, data: encode.permit2Approve(TOKEN, EVIL) }] }));
  await rejectsWith(badPermit2.client.quote({ token: TOKEN, side: 'sell', amount: '5', recipient: WALLET, slippageBps: 100 }, ctx), 'untrusted_target');
  const other = fakeAgora(quote({ approvals: [{ to: TOKEN, data: '0xa9059cbb' + '0'.repeat(128) }] })); // transfer, not approve
  await rejectsWith(other.client.quote({ token: TOKEN, side: 'sell', amount: '5', recipient: WALLET, slippageBps: 100 }, ctx), 'bad_approval');
});

test('wrong chain, unknown amount fields and API errors never produce a transaction', async () => {
  await rejectsWith(fakeAgora(quote({ transaction: { to: ROUTER, data: '0x01', value: '0', chainId: 1 } })).client.quote({ token: TOKEN, side: 'buy', amount: '1', recipient: WALLET, slippageBps: 100 }, ctx), 'wrong_chain');
  await rejectsWith(fakeAgora({ transaction: { to: ROUTER, data: '0x01', value: '0' }, approvals: [] }).client.quote({ token: TOKEN, side: 'buy', amount: '1', recipient: WALLET, slippageBps: 100 }, ctx), 'unmapped_format');
  await rejectsWith(fakeAgora({ error: { code: 'no_route', message: 'No route' } }, { status: 404 }).client.quote({ token: TOKEN, side: 'buy', amount: '1', recipient: WALLET, slippageBps: 100 }, ctx), 'no_route');
  const limited = fakeAgora({ error: { code: 'rate_limited', message: 'Slow down' } }, { status: 429 });
  await assert.rejects(limited.client.quote({ token: TOKEN, side: 'buy', amount: '1', recipient: WALLET, slippageBps: 100 }, ctx), (e) => e.status === 429);
  const unconfigured = createAgoraClient(loadAgoraConfig({ AGORA_ENABLED: '1' }), { fetchImpl: async () => ({ ok: true, status: 200, json: async () => quote() }) });
  await rejectsWith(unconfigured.quote({ token: TOKEN, side: 'buy', amount: '1', recipient: WALLET, slippageBps: 100 }, ctx), 'not_configured');
});
