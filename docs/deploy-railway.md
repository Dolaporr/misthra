# Deploying Misthra on Railway

One Railway service runs the API, the indexer and the built website. The Netlify site can be retired, or kept only as a redirect to the Railway URL.

## 1. Create the service

1. In Railway: **New project → Deploy from GitHub repo → Dolaporr/misthra**, branch `terminal-router` (or `main` once merged).
2. Railway reads `railway.json` and builds the `Dockerfile`. The health check is `/api/config`.
3. **Add a volume** to the service, mounted at **`/data`**. The database (missions, alerts, uploads, indexed launches) lives at `/data/misthra.sqlite`. Without the volume, every deploy starts empty.
4. **Settings → Networking → Generate domain** (or attach your own domain).

The first deploy needs no variables: it serves the labelled simulated preview, which already fixes the "unreadable response" on the old link.

## 2. Go live on Elysium (after Kinetiq publishes mainnet details)

Set these service variables. Take every address from Kinetiq's or Uniswap's official pages.

| Variable | Value |
|---|---|
| `ELYSIUM_RPC_URL` | Mainnet RPC (Kinetiq, Alchemy or Chainstack) |
| `ELYSIUM_CHAIN_ID` | Mainnet chain ID |
| `ELYSIUM_EXPLORER_URL` | Explorer base URL |
| `ELYSIUM_WHYPE` | WHYPE address (comma-list allowed; first is canonical) |
| `ELYSIUM_UNISWAP_V3_FACTORY` | Uniswap V3 factory (comma-list allowed, e.g. a pad's own factory second) |
| `ELYSIUM_UNISWAP_V3_QUOTER` | QuoterV2 |
| `ELYSIUM_UNISWAP_V3_SWAP_ROUTER` | SwapRouter02 |
| `ELYSIUM_INDEXER_START_BLOCK` | Block to start indexing from (mainnet genesis or launch day) |
| `ELYSIUM_PADS_FILE` | Optional path to a pads JSON file committed in the repo |
| `ELYSIUM_NETWORK_VERIFIED` | `1` only when all of the above are confirmed |

## 3. Deploy the contracts (from your machine, with your key)

```sh
export ELYSIUM_RPC_URL=… ELYSIUM_CHAIN_ID=… ELYSIUM_WHYPE=… ELYSIUM_UNISWAP_V3_FACTORY=… ELYSIUM_UNISWAP_V3_SWAP_ROUTER=…
export MISTHRA_FEE_RECIPIENT=0xYourSafe EXPECTED_DEPLOYER=0xYourDeployer DEPLOYER_PRIVATE_KEY=…
npm run deploy:contracts                # dry run: checks chain, key and addresses
npm run deploy:contracts -- --broadcast # deploys, then prints the variables below
```

Copy the printed `MISTHRA_TRADE_GATEWAY`, `MISTHRA_TRADE_FEE_BPS`, `MISTHRA_ROUTER_*` lines into Railway's variables and redeploy. Trading switches on when the gateway is set; the Launch page predicts router addresses when the router factory is set.

The key never goes to Railway. Use a fresh deployer wallet with only enough HYPE for gas, and a multisig (e.g. a Safe) as `MISTHRA_FEE_RECIPIENT`.

## 4. Optional: Agora route for every other pad

1. Sign in at agoradex.app/dashboard with the treasury wallet, claim a builder code and create an API key.
2. Check the amount fields in `chain/agora.mjs` (`pick` lists) against `https://api.agoradex.app/api/v1/openapi.json`.
3. Set `AGORA_API_KEY`, `AGORA_BUILDER_CODE`, `AGORA_ALLOWED_TARGETS` (Agora's router and swap executor, from their docs) and `AGORA_ENABLED=1`.

## Notes

- Fees: trades pay 0.75%, the same as Agora on Elysium (set at gateway deployment, capped at 1% in the contract). Fee routers pay 1% of creator fees. Both go to `MISTHRA_FEE_RECIPIENT`.
- The contracts are unaudited. Start with small amounts.
- `ALLOW_DEMO_PRODUCTION=1` is set in the Dockerfile because the Agents section still uses labelled simulated balances.
