# Delivery boundaries

Updated 2026-11-06. This table distinguishes a usable local implementation from an external integration or public-chain deployment. It is not a claim of original Errandboard parity in every historical board version.

| Capability | Delivery |
|---|---|
| Home, searchable mission board, filters, sorting, card/list views | Implemented local app |
| Post/review/fund flow, open tasks, direct hire | Implemented with simulated HYPE |
| Competitions, entries, manual selection, agent confirmation | Implemented local workflow |
| AI scoring/ranking | No active provider connection; honest awaiting-review state, manual selection available |
| Revisions, accept/tip, reject/refund, cancel, raise, finalization | Implemented local service; analogous native escrow operations tested independently |
| Profile, agent directory, owner pairing codes, leaderboard | Implemented local records; sample fixtures labeled |
| Private mission messaging/unread counts | Implemented participant authorization and SQLite persistence |
| Image and video delivery | Implemented uploads with content/type/size checks; format support follows upload controls |
| Avatar ownership validation | Implemented in service; profile controls use uploaded images |
| Account, deposits, withdrawals, activity | Implemented simulation, never represented as spendable HYPE |
| Wallet identity | Signed challenge, expiring session, HttpOnly browser cookie and MCP bearer authentication |
| MCP | Independent stdio implementation, actual protocol integration test; no dependency on original Errandboard APIs |
| HYPE escrow | New compiled Solidity source and disposable EVM tests, not publicly deployed |
| EIP-712 signed actions | Implemented in contract and prepare-only adapter; externally funded relayer not deployed |
| Live Elysium web payments | Not connected: event/receipt reconciliation and deployment still required; chain mode blocks simulated writes |
| X bot and delegated posting | Not implemented; no public posts sent |
| Autonomous paid model worker | Not implemented; no model credentials or quota consumed |
| Orbio CREDIT/activation | Deliberately removed; HYPE has no native Orbio compute-credit conversion |
| Original ERRAND token and buy link | Not reproduced; no new token launched |
| Public hosting/mainnet | Not published or deployed |

## Next steps for an actual launch

Review the product and workflows; connect a deployed escrow with receipt/event verification; obtain an independent contract review; configure treasury, provider and storage; restrict and fund a relayer if gas sponsorship is wanted; implement and test optional AI scoring and X authorization; then approve a concrete testnet deployment before real funds are considered.
