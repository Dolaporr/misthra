import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, statSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { Wallet, verifyMessage } from 'ethers';

// A client that sends the wallet key, reuses an expired token, or accepts
// an arbitrary remote HTTP URL would violate these public-protocol assertions.
let integration;
try { integration = await import('../mcp/client.mjs'); } catch {}

test('MCP integration exists', () => {
  assert.equal(typeof integration?.ErrandClient, 'function');
});

test('wallet files persist a key with owner-only permissions', { skip: !integration }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'errand-wallet-'));
  try {
    const file = join(dir, 'wallet.json');
    const first = integration.loadWallet({ file });
    const second = integration.loadWallet({ file });
    assert.equal(first.address, second.address);
    assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).privateKey, first.privateKey);
  } finally { rmSync(dir, { recursive: true }); }
});

test('client rejects insecure remote hosts and credential-bearing URLs', { skip: !integration }, () => {
  const wallet = Wallet.createRandom();
  for (const baseUrl of ['http://example.com', 'https://user:secret@example.com', 'file:///tmp/app', 'https://example.com/?token=secret']) {
    assert.throws(() => new integration.ErrandClient({ baseUrl, wallet }));
  }
});

test('client authenticates with a signed challenge and retries one expired session', { skip: !integration }, async () => {
  const wallet = Wallet.createRandom();
  const received = [];
  let authenticated = 0, balanceCalls = 0;
  const server = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : {};
    received.push({ url: req.url, raw, authorization: req.headers.authorization });
    const reply = (status, payload) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(payload)); };
    if (req.url === '/api/auth/challenge') return reply(200, { message: `Errand for Elysium sign-in\nAddress: ${wallet.address}\nNonce: once`, nonce: 'once' });
    if (req.url === '/api/auth/verify') {
      assert.equal(verifyMessage(`Errand for Elysium sign-in\nAddress: ${wallet.address}\nNonce: once`, body.signature), wallet.address);
      authenticated++; return reply(200, { address: wallet.address.toLowerCase(), token: `session-${authenticated}` });
    }
    if (req.url === '/api/account') {
      balanceCalls++;
      if (balanceCalls === 1) return reply(401, { error: 'Session expired' });
      assert.equal(req.headers.authorization, 'Bearer session-2');
      return reply(200, { address: wallet.address.toLowerCase(), balance: '3.25' });
    }
    return reply(404, { error: 'Not found' });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const client = new integration.ErrandClient({ baseUrl: `http://127.0.0.1:${server.address().port}`, wallet });
    assert.equal((await client.request('/api/account')).balance, '3.25');
    assert.equal(authenticated, 2);
    assert.ok(received.every(item => !item.raw.includes(wallet.privateKey)));
    assert.rejects(() => client.request('/api/account?leak=1', { method: 'DELETE' }), /not allowed|method/i);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
