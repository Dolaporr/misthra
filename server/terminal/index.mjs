// Wires the terminal store, routes and a data source (live indexer or
// simulated feed) into the existing Express app.
import { JsonRpcProvider } from 'ethers';
import { fileURLToPath } from 'node:url';
import { loadElysiumConfig } from '../../chain/elysium.mjs';
import { createIndexer } from '../../indexer/elysium.mjs';
import { createTerminalStore } from './store.mjs';
import { createSimFeed } from './simfeed.mjs';
import { mountTerminal } from './routes.mjs';

const FIXTURE = fileURLToPath(new URL('../../fixtures/launches.sample.json', import.meta.url));

export function setupTerminal(app, { db, auth, now = () => Date.now(), config = loadElysiumConfig({}), provider = null, start = false, log = () => {}, partners = [] }) {
  const store = createTerminalStore(db, { now });
  const rpc = provider ?? (config.live ? new JsonRpcProvider(config.rpcUrl, config.chainId, { staticNetwork: true }) : null);
  const routes = mountTerminal(app, { store, config, provider: rpc, auth, now, partners });
  const hooks = { onLaunch: routes.onLaunch, onTrade: routes.onTrade };
  const source = config.live ? createIndexer(store, rpc, config, { ...hooks, log }) : createSimFeed(store, { fixturePath: FIXTURE, now, ...hooks });
  if (!config.live) source.seedFromFixture();
  if (start) source.start();
  return { store, config, source, close() { source.stop(); routes.close(); } };
}
