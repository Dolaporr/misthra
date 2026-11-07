# Backend implementation review

Reviewed `server/app.mjs`, `server/index.mjs`, the shared JSON API contract and the local product specification. This is an implementation review with executable regression tests, not a formal security audit. No original Errandboard service, account, contract, credential or deployment is used.

## Verified behavior

The service persists the demo marketplace and accounts in SQLite. Each database stores its execution mode; reopening demo history as chain, or chain history as demo, fails with a separate-database instruction. A legacy database without a mode is checked for issued simulated funds, existing missions, simulated wallets/faucets, demo identities/sessions and sample profiles. Legacy demo history cannot open in chain mode; opening it in demo mode adopts the binding while preserving its accounts and missions. Initialization and migration take an immediate database lock so competing startups cannot assign different modes to the same new history. Mutations reload state inside `BEGIN IMMEDIATE`, run the operation and ledger checks, then commit. Failures roll back. Every successful mutation verifies that available account balances, simulated wallets, locked rewards and treasury fees equal issued simulated HYPE, and that each poster's locked balance equals their outstanding mission rewards.

Money is parsed from decimal strings into bigint at 18 decimals. Reward settlement charges `floor(reward * 250 / 10000)`; tips go entirely to the worker. Refunds return the full reward. Paid, refunded and expired missions cannot settle again. Insufficient balances, invalid decimal amounts and malformed action bodies produce 4xx JSON errors.

Open claims recover after their TTL before the deadline; mission-wide used revisions survive replacement workers. Submitted escrow remains locked past the global deadline, and a worker can finalize after its review window. Direct hire starts claimed immediately. Competitions expose `picking` while accepting entries, allow selection before the entry deadline through `deadline + reviewHours`, and preserve that selection window even when empty. A selected winner receives the full claim TTL from selection. Confirmation starts submitted review; it does not pay. If confirmation expires, escrow is refundable without waiting for the old entry deadline. Requested revisions require another submission.

The API requires an authenticated account for mutations and private inbox reads. Poster/worker/entrant checks guard mission operations and conversations. Wallet challenges bind address, message, nonce, origin and expiry; successful verification consumes the challenge. Sessions store only token hashes, set an HttpOnly cookie, expire and can be logged out. Pairing codes expire after 24 hours, are consumed once, enforce different owner/agent identities and preserve an existing owner's binding.

Uploads accept bounded raster image/video types with extension, content-type and signature checks, store bytes under generated identifiers, and enforce attachment metadata and ownership when used. Profile avatars must reference an existing image uploaded by the editor; owner-created pairing drafts may transfer that validated avatar into the paired agent profile. Delivered upload URLs are public resources, not private inbox attachments. Images have a 1.5 MB limit, videos 50 MB, with at most four images and one video per submission. No video-still generation, transcoding, full media decoding or malware scanning is implemented.

API results are unwrapped JSON objects/arrays. Optional AI scores remain null and configuration reports AI and X disabled. Samples are labeled and do not fabricate paid work. Origin checks reject unknown supplied origins. Production startup rejects implicit demo mode; an intentionally labeled demo deployment requires `ALLOW_DEMO_PRODUCTION=1`. Chain mode rejects demo authentication and every simulated financial or mission write, even when an escrow address is configured.

## Reproduced fixes

The original focused backend suite passed 24/24 before review. Each of the following concrete regression cases was run and observed failing before its fix:

| Failure | Observed before fix | Result after fix |
| --- | --- | --- |
| A persisted database could change execution modes and expose simulated balances as chain data | Legacy demo database opened in chain mode without error | Persisted mode binding rejects cross-mode reuse; legacy simulated history requires demo mode or a separate database |
| Direct hire awaited a separate claim | API returned `open` | Returns `claimed`, assigned worker and claim timestamp; worker can submit immediately |
| Competitions were absent from the `picking` filter while entries were open | API returned `open` | Returns `picking` throughout entry collection |
| Empty competition refunded at entry deadline | API returned `expired` during selection window | Keeps selection window until deadline plus review hours |
| Reconfirming a competition after a revision reused the original entry | Confirm returned 200 | Returns 409; revised work must be submitted |
| Pairing snippet referenced an unavailable MCP tool | Instructed callers to use `claim_agent` | Names implemented `errand_connect` and supplies the generated code |
| Profile avatar could reference another account's upload | Profile update returned 200 | Invalid/missing/foreign/non-image avatar references return 400; validated owner draft avatar still pairs successfully |

## Test evidence

Runtime: Node 24.21.0 with Node SQLite. Loopback listener permissions were granted for local HTTP tests. No public network, real wallet key or real funds were used.

- `node --test tests/backend.test.mjs`: original baseline 24/24 passed.
- New regression subsets failed with the expected HTTP/phase assertion failures before the corresponding source fixes, then passed.
- Final `npm test`: **47/47 passed, 0 failed, 0 skipped**, including **37 backend tests**, five chain-client tests and five MCP/client tests. This command includes the complete `tests/*.test.mjs` suite; Solidity EVM tests have their separate command and report. Server syntax checks pass.

Coverage includes fee/tip accounting down to individual wei, insufficient-tip rollback, concurrent claim exclusion, direct worker authorization, TTL boundary behavior, mission-wide revisions, submitted escrow protection, repeat settlement, challenge replay/expiry/wrong signer, private threads, owner pairing, upload misuse, persistence, origins, numeric input validation, production startup refusal and chain-mode financial refusal. The MCP integration also exercises a complete funded work/conversation/payment cycle against this service.

## External activation and limits

This backend is a working local simulation. Its faucet, deposits, withdrawals, balances and mission escrow do not move spendable HYPE. The chain adapter and Solidity contract are separate components; this service has no deployed-transaction ingestion, finality/reorg handling or authenticated reconciliation, and therefore deliberately refuses financial mission writes in chain mode. Supplying an escrow address alone does not activate them.

Public onchain operation still requires a reviewed target-chain deployment, funded deployment account, selected treasury, configured address, and implementation/verification of transaction reconciliation between contract events and marketplace records. No deployment was performed. Real EOAs can authenticate by signing challenges; smart-contract-wallet signature authentication is not implemented here.

AI review requires a configured provider plus the missing reviewer integration/worker, persistence and failure handling; no external model is called. X posting/intake likewise requires a bot integration, credentials, webhook/worker setup and delivery controls; no messages are sent. Production hosting also needs explicit origin/TLS configuration, durable storage/backups and operational controls. The current whole-market JSON state model and synchronous SQLite processing are suitable for local inspection, not evidence of production scale or a multi-instance deployment design.
