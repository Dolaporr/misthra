// Wires the terminal store, routes and a data source (live indexer or
// simulated feed) into the existing Express app.
import { JsonRpcProvider } from 'ethers';
import { fileURLToPath } from 'node:url';
import { loadElysiumConfig } from '../../chain/elysium.mjs';
import { createIndexer } from '../../indexer/elysium.mjs';
import { createTerminalStore } from './store.mjs';
import { createSimFeed } from './simfeed.mjs';
import { mountTerminal } from './routes.mjs';
import { createHypeUsd, simulatedHypeUsd } from './hype-usd.mjs';
import { createImageProxy } from './image-proxy.mjs';

const FIXTURE = fileURLToPath(new URL('../../fixtures/launches.sample.json', import.meta.url));

export function setupTerminal(app, { db, auth, now = () => Date.now(), config = loadElysiumConfig({}), provider = null, start = false, log = () => {}, partners = [], hypeUsd = null, imageCacheDir = null, images = null }) {
  const rate = hypeUsd ?? (config.live ? createHypeUsd({ log }) : simulatedHypeUsd(now));
  const store = createTerminalStore(db, { now, usdRate: () => rate.current() });
  const rpc = provider ?? (config.live ? new JsonRpcProvider(config.rpcUrl, config.chainId, { staticNetwork: true }) : null);
  const proxy = images ?? createImageProxy({ cacheDir: imageCacheDir, gateways: config.ipfsGateways?.length ? config.ipfsGateways : undefined, log });
  const routes = mountTerminal(app, { store, config, provider: rpc, auth, now, partners, usdRate: () => rate.current(), images: proxy });
  const hooks = { onLaunch: routes.onLaunch, onTrade: routes.onTrade, onUpdate: routes.onUpdate };
  const source = config.live ? createIndexer(store, rpc, config, { ...hooks, log }) : createSimFeed(store, { fixturePath: FIXTURE, now, ...hooks });
  if (!config.live) source.seedFromFixture();
  if (start) { source.start(); rate.start(); }
  return { store, config, source, rate, close() { source.stop(); rate.stop(); routes.close(); } };
}
