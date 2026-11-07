// Elysium network and protocol settings, read only from the environment.
//
// Nothing here is invented: addresses that are not configured stay null, and
// every feature that needs one reports that it is unavailable. Testnet chain ID
// 99801 is published; mainnet's is not, so it must be supplied.
import { readFileSync } from 'node:fs';
import { getAddress, isAddress } from 'ethers';

const addr = (value) => (value && isAddress(value) ? getAddress(value).toLowerCase() : null);

export function loadElysiumConfig(env = process.env) {
  const pads = loadPads(env.ELYSIUM_PADS_FILE);
  const config = {
    rpcUrl: env.ELYSIUM_RPC_URL || null,
    chainId: env.ELYSIUM_CHAIN_ID ? Number(env.ELYSIUM_CHAIN_ID) : null,
    explorer: env.ELYSIUM_EXPLORER_URL || null,
    whype: addr(env.ELYSIUM_WHYPE),
    v3Factory: addr(env.ELYSIUM_UNISWAP_V3_FACTORY),
    v3Quoter: addr(env.ELYSIUM_UNISWAP_V3_QUOTER),
    v3SwapRouter: addr(env.ELYSIUM_UNISWAP_V3_SWAP_ROUTER),
    routerFactory: addr(env.MISTHRA_ROUTER_FACTORY),
    routerSwapAdapter: addr(env.MISTHRA_ROUTER_SWAP_ADAPTER),
    routerSharedGuard: addr(env.MISTHRA_ROUTER_SHARED_GUARD),
    routerProtocolFeeRecipient: addr(env.MISTHRA_ROUTER_FEE_RECIPIENT),
    startBlock: env.ELYSIUM_INDEXER_START_BLOCK ? Number(env.ELYSIUM_INDEXER_START_BLOCK) : null,
    confirmations: Number(env.ELYSIUM_CONFIRMATIONS ?? 20),
    hypercoreListed: new Set((env.ELYSIUM_HYPERCORE_LISTED || '').split(',').map(addr).filter(Boolean)),
    pads,
  };
  config.live = Boolean(config.rpcUrl && config.chainId && config.whype && config.v3Factory);
  config.tradeReady = Boolean(config.live && config.v3Quoter && config.v3SwapRouter);
  config.routerReady = Boolean(config.live && config.routerFactory && config.routerSwapAdapter && config.routerProtocolFeeRecipient);
  return config;
}

// Pads are attributed by contract addresses the pad itself publishes. File shape:
// [{ "id": "citadel", "name": "Citadel", "url": "https://…", "contracts": ["0x…"], "locksLiquidity": true }]
export function loadPads(file) {
  if (!file) return [];
  const list = JSON.parse(readFileSync(file, 'utf8'));
  return list.map((p) => ({ id: String(p.id), name: String(p.name), url: p.url || null, locksLiquidity: p.locksLiquidity === true, contracts: (p.contracts || []).map(addr).filter(Boolean) }));
}

export function explorerLink(config, kind, address) {
  return config.explorer ? `${config.explorer.replace(/\/$/, '')}/${kind}/${address}` : null;
}
