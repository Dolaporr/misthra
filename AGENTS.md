# Misthra: rules for coding agents

Read this file first. It applies to every agent working in this repository: Claude, Codex, or anyone else.

## What Misthra is now (decided 2026-11-07/08)

Misthra is a three-in-one product on **Elysium**, Kinetiq's Arbitrum Orbit L2 that settles to HyperEVM and uses **HYPE** as gas. Testnet chain ID `99801`; mainnet launches 2026-11-09 and its chain ID is not yet published. Do not invent it.

| Section | What it is | Origin |
|---|---|---|
| **Terminal** | Axiom-style launch terminal: Pulse columns, coin sheet, safety, AI reads, quotes, alerts | Design learned from Blix Trade (MIT, Solana). Data layer rewritten for EVM. |
| **Launch** | Fee router a creator sets as their launch's fee recipient: split, unwrap, buyback-and-burn, fund sinks | Contracts ported from Sinjoh (Apache-2.0, Robinhood Chain) |
| **Agents** | The original Misthra agent work exchange: post missions, agents deliver, pay on accept | This repo's first version |

One app, one wallet session, one dark chrome design system, one launches table. The terminal shows which launches use a Misthra router. Agents can use the same data through the MCP connector.

## Elysium facts to build against

- HYPE is native gas, bridged 1:1 from HyperEVM. WHYPE is the wrapped ERC-20.
- Launchpads announced for mainnet: Citadel, Montra, BunnyPad, Ascend, Supercolony. Most launch **straight into Uniswap V3 pools quoted in HYPE, with no bonding curve**. Confirm every pad contract address from the pad itself before using it.
- Uniswap V2 routers are being tested; V3 pools are what pads use.
- The Kinetiq lifecycle is: long-tail AMM → PropAMM → HyperCore spot order book → HIP-3 perps. HyperCore read/write hooks arrive about four weeks after mainnet. Nothing here may claim HyperCore execution before then.
- "Final stretch" and "Migrated" in the terminal are **our** Elysium definitions (see `docs/terminal-api.md`), not pump.fun bonding progress.

## Honesty rules (non-negotiable)

- Every number shown is live from chain/indexer or visibly labelled **simulated**. Responses carry `source: "live" | "simulated"`; the UI must show it.
- Unconfigured AI, alerts or RPC show an honest unavailable state. Never fabricate a grade, score, holder count or price.
- The app never holds user keys. Buys produce a transaction for the user's own wallet to sign, or a labelled simulated fill.
- Stop-loss and other actions that need someone to act while the user is away are not offered until a keeper design exists.

## Ownership (to avoid conflicting edits)

Codex did not start, so Claude built the first frontend too (2026-11-08). Whoever picks up a task below should claim it in the PR title and stay inside its files.

| Area | Current owner |
|---|---|
| `contracts/`, `chain/`, `indexer/`, `server/`, `mcp/`, `scripts/compile-contracts.mjs`, `tests/` | Claude |
| `src/` terminal pages (`src/pages/{Terminal,Coin,Launch,Alerts}.tsx`, `src/terminal/`, `src/terminal.css`) | open: take a task from `docs/briefs/codex-frontend.md` → "Next frontend tasks" |
| `docs/terminal-api.md`, `fixtures/` | shared contract: change only by agreement, note it in the PR |
| `AGENTS.md`, `NOTICE`, `LICENSES/` | either, carefully |

If you need an API field that does not exist, mark it `TODO(api)` and say so in your PR. Do not add server routes from a frontend branch.

## Branches

- `main`: last reviewed state (the original agent exchange).
- `terminal-router`: Claude's integration branch (router contracts, indexer, API).
- Feature branches are cut from `terminal-router` (e.g. `codex/<task>`), with a PR back into `terminal-router`.
- Small commits, clear messages. Never force-push a shared branch. Never commit `.env`, keys or `data/`.

## Licences

- Sinjoh-derived Solidity keeps Apache-2.0 headers and the "Modified by Misthra" line; see `NOTICE`.
- Anything copied from Blix (MIT) must keep the MIT copyright notice: add a line to `NOTICE` and the notice to `LICENSES/MIT-blix.txt`. Prefer learning the pattern and writing our own.
- Do not use the Sinjoh or Blix names or logos as Misthra branding.

## Commands

```sh
npm ci --ignore-scripts      # Node 24 (22.13+ works for tests)
npm run dev                  # UI on :5173, API on :4317
npm test                     # service, MCP and adapter tests
npm run test:contracts       # escrow + fee router on a disposable local EVM
npm run contracts:compile    # solc 0.8.28 for the router; pins its codehash
npm run build                # typecheck + Vite build
```

Design system: `DESIGN.md` (charcoal `#0c0f16`, silver `#eef1f7`, blue `#7fa8ff` / `#315bd5`, Manrope headings, Inter body, joining-path M). Keep it.
