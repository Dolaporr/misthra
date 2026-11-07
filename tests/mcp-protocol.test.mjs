import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { Wallet } from 'ethers';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createApp } from '../server/app.mjs';

// Exercises the real stdio protocol, wallet signatures, HTTP service and ledger.
// The two principals and all funds are disposable local test fixtures.
test('agent MCP supports the full funded work, conversation and payment lifecycle', { timeout: 30000 }, async () => {
  const app = createApp({ dbPath: ':memory:', seed: false });
  const server = await new Promise(resolveServer => {
    const listening = app.listen(0, '127.0.0.1', () => resolveServer(listening));
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const transports = [];
  const clients = [];
  async function connect() {
    const wallet = Wallet.createRandom();
    const transport = new StdioClientTransport({ command: process.execPath, args: ['mcp/index.mjs'], cwd: resolve('.'), stderr: 'pipe', env: { PATH: process.env.PATH || '', ERRAND_KEY: wallet.privateKey, ERRAND_SITE: origin } });
    transports.push(transport);
    const client = new Client({ name: 'errand-local-verification', version: '1.0.0' });
    clients.push(client);
    await client.connect(transport);
    return client;
  }
  async function call(client, name, args = {}) {
    const result = await client.callTool({ name, arguments: args });
    assert.equal(result.isError || false, false, `${name}: ${JSON.stringify(result.content)}`);
    return JSON.parse(result.content.find(item => item.type === 'text').text);
  }
  try {
    const poster = await connect();
    const agent = await connect();
    const names = (await agent.listTools()).tools.map(tool => tool.name);
    for (const required of ['errand_post', 'errand_claim', 'errand_submit', 'errand_accept', 'errand_enter', 'errand_confirm_win', 'errand_send_message']) assert.ok(names.includes(required), required);
    await call(agent, 'errand_join', { name: 'Protocol test agent', tagline: 'Local fixture only', skills: ['research'], rate: '0.5' });
    await call(poster, 'errand_deposit', { amount: '2' });
    const mission = await call(poster, 'errand_post', { title: 'Verify local agent delivery', task: 'Deliver a source-linked note in this isolated test.', criteria: ['Include a clear handoff'], category: 'research', mode: 'open', reward: '1', deadlineHours: 24, reviewHours: 1, claimHours: 1, maxRevisions: 1 });
    await call(agent, 'errand_claim', { id: mission.id });
    await call(agent, 'errand_send_message', { missionId: mission.id, text: 'This is a local test message about the deliverable.' });
    const threads = await call(poster, 'errand_messages');
    assert.equal(threads.length, 1);
    assert.equal((await call(poster, 'errand_read_messages', { threadId: threads[0].id })).length, 1);
    await call(agent, 'errand_submit', { id: mission.id, text: 'The local verification is complete. Handoff: the test covers the actual MCP, signed identity, service and simulated escrow.' });
    await call(poster, 'errand_accept', { id: mission.id });
    const balance = await call(agent, 'errand_balance');
    assert.equal(balance.balance, '0.975');
    assert.equal(balance.earned, '0.975');
    assert.equal((await call(agent, 'errand_get', { id: mission.id })).phase, 'paid');
    assert.equal(app.locals.snapshot().treasury, '25000000000000000');
  } finally {
    for (const client of clients) await client.close().catch(() => {});
    for (const transport of transports) await transport.close().catch(() => {});
    await new Promise(resolveClose => server.close(resolveClose));
    app.locals.close();
  }
});
