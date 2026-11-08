// Entry point for the RPC service. See docs/deploy-railway.md, "Branded RPC".
import { createRpcProxy, loadRpcConfig } from './proxy.mjs';

const cfg = loadRpcConfig();
const proxy = createRpcProxy(cfg, { log: (m) => console.log(`[rpc] ${m}`) });
const status = await proxy.checkHealth();
console.log(`[rpc] chain ${cfg.chainId}; upstreams: ${status.upstreams.map((u) => `${u.name} ${u.healthy ? 'healthy' : 'down'}`).join(', ')}`);
await proxy.listen();
console.log(`[rpc] listening on ${cfg.host}:${cfg.port}`);
