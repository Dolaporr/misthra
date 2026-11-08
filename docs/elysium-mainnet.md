# Elysium mainnet addresses (chain 99901)

Status: **community-verified, not yet official.** Kinetiq's docs list only testnet WHYPE so far; these come from Uniswap's official deployer (`0x2179a60856e37dfeaaca0ab043b931fe224b27b6`, blocks ~256k–256.5k) as verified on-chain by Titan Locker on 2026-11-05, with SwapRouter02/QuoterV2 cross-listed in PerpMe's docs. `npm run deploy:contracts` (dry run) re-checks them live: code exists, router and quoter point at this factory and WHYPE, and the 1% fee tier is enabled. Re-check against the public explorer once it is live.

## Uniswap and WHYPE

| Contract | Address | Railway / deploy variable |
|---|---|---|
| WHYPE | `0xbA876237B0F021A6c6D852d6c26E107997cC5E81` | `ELYSIUM_WHYPE` |
| Uniswap V3 Factory | `0x1707327F626496A7b5b3872e7E4d2879Df7d7a9f` | `ELYSIUM_UNISWAP_V3_FACTORY` |
| SwapRouter02 | `0x2d01411773c8C24805306E89A41F7855C3c4Fe65` | `ELYSIUM_UNISWAP_V3_SWAP_ROUTER` |
| QuoterV2 | `0x204FAca1764B154221e35c0d20aBb3c525710498` | `ELYSIUM_UNISWAP_V3_QUOTER` |
| Universal Router v2.1.2 | `0xA13f7611115752DEB2B13813BDDE16A5073e4b45` | not used yet |
| V4 PoolManager | `0xE2e105d3F7209A9DA11f83cCf3E7398a753823F1` | `ELYSIUM_UNISWAP_V4_POOL_MANAGER` |
| V3 Positions NFT | `0xf025e0fe9e331a0ef05c2ad3c4e9c64b625cda6f` | not used |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` | not used |
| V2 Factory / Router02 | `0xbbbcc62853a5fa27b93d6bab3e6f7ce841e25df2` / `0xe783de89a7f0408687f051e3e6d0beb62719ebad` | not used |

## Launchpads (from public docs and explorers; unverified unless noted)

| Pad | Model | Contracts known | Misthra status |
|---|---|---|---|
| Montra | Direct into Uniswap **v4** pool (hook) | Factory `0x38D3ef3A06D18fA3286Fb5dEAfe611be725fcD15` (`TokenLaunched`), hook `0x6b1216A40B65c83e9c9e18a562C446697B8cf8EC`, router `0xc6E9a8E1a99023B67067B8A3605403b8d7B3A157`, registry `0xF1E2FA75422F889e565F3142bdbf60B28dce2aa7` | Indexed via `TokenLaunched` + v4 `Swap` (see indexer/montra.mjs). Docs say fee routes can be any address, contracts included. |
| Boxa | v4-style pools | Partial addresses only | Needs launcher + event from the team |
| ElysPump | Uniswap v4 | Partial addresses only | Needs launcher from the team |
| Kleos | Bonding curve → Uniswap v3 | Several launchers | Graduated coins appear via v3 `PoolCreated`; curve phase needs events |
| Supercolony, Citadel, ArkhamPad, BunnyPad | Direct, locked Uniswap v3 | — | Appear via v3 `PoolCreated` (shown as "Pad not detected" until the launcher address is added) |
| Volta, PerpMe, Eleos, Elyxa, Mesa | Mixed / v4 | — | Ask the teams |
| Ascend | Curve → Pancake Infinity (USDC pairs) | — | Not indexed; trade via Agora |

Agora (aggregator) router: `0xAf8dEc958Df2bd664AA661716a8de5Fe0417A295` (0.75% fee). Not yet allow-listed in Misthra; confirm with Agora's docs before setting `AGORA_ALLOWED_TARGETS`.
