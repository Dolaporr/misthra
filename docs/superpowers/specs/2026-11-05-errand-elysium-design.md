# Errand for Elysium design

## Intent and source
The user requested an independent recreation of Errandboard after no full public source repo could be found. They supplied errandboard-full-brief.md and errandboard-features.md as reference material and confirmed HYPE rewards. The reference describes an Orbio CREDIT product on Robinhood; those addresses, credentials and denomination do not transfer to Elysium.

## Approach
Rebuild the UI and service from documented behavior and recreate escrow in new Solidity source. This produces inspectable code and avoids depending on the closed original service. A frontend-only mock would not satisfy the lifecycle, and redirecting the original MCP to Elysium would fail because its signatures, token, addresses, decimals and backend APIs are chain-specific.

## Delivery
1. Local app: home, searchable/filterable/sortable board, mission detail, three-step post flow, agent directory/profile/join, owned agents, wallet/account, leaderboard, inbox, guide/settings and search palette.
2. Persistent SQLite backend: fixed-point HYPE ledger, authorization and mission phase transitions, escrow simulation, profiles/owner pairing, competition entries/winner confirmation, private mission messaging, uploads, wallet challenge sessions and explicit demo identities.
3. HYPE contract: deposits and withdrawals, mission escrow, open/direct/pick hiring, claim/revision/review time limits, cancellation/expiry/refund, acceptance/finalization, fixed 250bps fee, nonce and expiry protected EIP-712 meta-actions; no real deployment performed.
4. Agent MCP: independently implemented tools for identity, missions, competitions, profile, messages and account operations against the local app. It must never contact or transact with the original Errandboard services.
5. Chain configuration: official Elysium testnet HYPE configuration, explicit deployed-address requirement for onchain mode. Native market-data/HyperCore upgrades are not required. Live writes cannot silently use the demo ledger.

## Limits and truthful states
The local demo is a functional simulation, not spendable HYPE or chain escrow. All preview pages state this. Testnet/mainnet funding and deployment require keys, funding and chosen treasury. AI reviewer is optional through a configured compatible API; without a key, entries show "Awaiting reviewer" and can be selected manually, never fake numeric scores. X bot and model worker cannot operate without credentials; show setup state, implement bounded interfaces where feasible, document remaining activation. CREDIT/Orbio activation is removed rather than misrepresented as an Elysium feature. Files and profiles are new sample fixtures, not imported accounts. Unconfigured integrations return clear errors.

## Invariants
Amounts are decimal strings parsed to bigint at 18 decimals, never floating-point accounting. Successful settlement charges 2.5% of the reward (tips handled explicitly), refund never charges a fee, repeat acceptance/finalization cannot pay twice. Unauthorized actors cannot review, pick, submit, withdraw or read private threads. Deadline, claim TTL and review windows use server/chain time. No private keys in browser bundles or tracked files. State changes are transactional and authenticated. Production disables demo routes and refuses an unsafe startup configuration.

## Defaults chosen by builder
Local server binds 127.0.0.1. One SQLite database per run environment. Demo mode is on by default for local inspection; chain execution remains explicitly configured. Keep both competitions and open/direct jobs; the post form defaults to competition as in the reference. Source code stays local until a publishing/deployment request. Use a local test chain to test contracts with disposable test identities only.

## Validation
Domain and API tests exercise successful work/payment and failure paths, ownership, double spending, revisions, deadlines, competition confirmation, private messages and wallet-session replay. Contract tests exercise actual EVM balances and phase transitions. Build/type checks, desktop/mobile browser checks and an independent review close the work. Feature matrix describes implemented, credential-dependent and undeployed behavior.
