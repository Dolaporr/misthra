// Elysium network and protocol settings, read only from the environment.
//
// Nothing here is invented: addresses that are not configured stay null, and
// every feature that needs one reports that it is unavailable. Testnet is 99801,
// mainnet 99901; addresses are still supplied, never assumed (docs/elysium-mainnet.md).
import { readFileSync } from 'node:fs';
import { getAddress, isAddress } from 'ethers';
import { loadAgoraConfig } from './agora.mjs';

const list = (value) => (value || '').split(',').map((v) => addr(v.trim())).filter(Boolean);
const addr = (value) => (value && isAddress(value) ? getAddress(value).toLowerCase() : null);

export function loadElysiumConfig(env = process.env) {
  const pads = loadPads(env.ELYSIUM_PADS_FILE);
  const config = {
    rpcUrl: env.ELYSIUM_RPC_URL || null,
    chainId: env.ELYSIUM_CHAIN_ID ? Number(env.ELYSIUM_CHAIN_ID) : null,
    explorer: env.ELYSIUM_EXPLORER_URL || null,
    // Comma-separated lists. The first entry is canonical: the WHYPE and factory the
    // terminal trades through. Others are only indexed (e.g. a pad's own factory).
    whypes: list(env.ELYSIUM_WHYPE),
    v3Factories: list(env.ELYSIUM_UNISWAP_V3_FACTORY),
    networkVerified: env.ELYSIUM_NETWORK_VERIFIED === '1',
    tradeGateway: addr(env.MISTHRA_TRADE_GATEWAY),
    tradeFeeBps: Number(env.MISTHRA_TRADE_FEE_BPS ?? 75),
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
    // IPFS artwork: served through PUBLIC_URL/api/img/ipfs/… (server-side fetch from
    // IPFS_GATEWAYS, cached). Without PUBLIC_URL, links point at IPFS_GATEWAY directly.
    publicUrl: (env.PUBLIC_URL || '').replace(/\/+$/, '') || null,
    ipfsGateway: (env.IPFS_GATEWAY || 'https://gateway.pinata.cloud').replace(/\/+$/, ''),
    ipfsGateways: (env.IPFS_GATEWAYS || '').split(',').map((g) => g.trim().replace(/\/+$/, '')).filter((g) => /^https:\/\//.test(g)),
    // Montra (Uniswap v4): set both to index its launches; the hook is excluded from holders.
    montra: addr(env.ELYSIUM_MONTRA_FACTORY) && addr(env.ELYSIUM_UNISWAP_V4_POOL_MANAGER)
      ? { factory: addr(env.ELYSIUM_MONTRA_FACTORY), poolManager: addr(env.ELYSIUM_UNISWAP_V4_POOL_MANAGER), hook: addr(env.ELYSIUM_MONTRA_HOOK) }
      : null,
    agora: loadAgoraConfig(env),
  };
  config.whype = config.whypes[0] ?? null;
  config.v3Factory = config.v3Factories[0] ?? null;
  config.live = Boolean(config.rpcUrl && config.chainId && config.whype && config.v3Factory);
  // Live trades go only through the fee gateway, which itself calls the swap router.
  config.tradeReady = Boolean(config.live && config.v3Quoter && config.tradeGateway);
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
