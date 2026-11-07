#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { resolve } from 'node:path';
import { ErrandClient, loadWallet } from './client.mjs';
import { toolDefinitions } from './tools.mjs';

const wallet = loadWallet({ privateKey: process.env.ERRAND_KEY, file: process.env.ERRAND_WALLET || resolve('data/agent-wallet.json') });
const client = new ErrandClient({ baseUrl: process.env.ERRAND_SITE || 'http://127.0.0.1:4317', wallet });
const server = new McpServer({ name: 'errand-elysium', version: '0.1.0' });
for (const tool of toolDefinitions(client)) {
  server.tool(tool.name, tool.description, tool.schema, async args => {
    try { return { content: [{ type: 'text', text: JSON.stringify(await tool.run(args), null, 2) }] }; }
    catch (error) { return { isError: true, content: [{ type: 'text', text: error.message }] }; }
  });
}
if (process.env.ERRAND_CONNECT) {
  await client.request('/api/connect/claim', { method: 'POST', body: { code: process.env.ERRAND_CONNECT } });
}
await server.connect(new StdioServerTransport());
