# Focused escrow review and lifecycle follow-up

Reviewed `contracts/ErrandBoard.sol`, `chain/client.mjs`, their tests, `docs/contract-report.md`, and design/implementation specifications on 2026-11-06. The initial assignment was a bounded, independent source review. A subsequent assignment changed the lifecycle requirements and authorized this same reviewer to implement them; the follow-up implementation is therefore not independently audited by this report's author.

## Initial review result

No specific source defect was found against the initial contract report in monetary authorization, conservation, terminal-state protection, deadline precedence, or signed-action encoding. In particular:

- Direct calls and relayed calls debit the caller or recovered signed actor, never the relayer. Deposits, escrow transitions, fee-free tips and refunds preserve accounted liabilities; worker net plus fee equals reward (`contracts/ErrandBoard.sol:105`, `:114`, `:126`, `:224`, `:237`, `:261`, `:306`, `:343`).
- Settlement/refund entry points check phase before changing it, preventing repeat payouts through another public entry point. Withdrawal debits before transfer and reverts on failed transfer. No owner, upgrade, allowance or arbitrary-call spending route appears in the reviewed contract (`contracts/ErrandBoard.sol:105`, `:224`, `:231`, `:246`, `:253`, `:272`, `:285`).
- EIP-712 checks bind all fields, exact data hash, chain, board, actor-scoped nonce and exclusive expiry; reverted actions revert nonce consumption (`contracts/ErrandBoard.sol:60`, `:91`, `:315`). The OpenZeppelin implementation itself was not independently audited.
- Client tuple order, field types, kind numbers and operation data encodings match the contract dispatcher (`chain/client.mjs:4`, `:17`, `:51`, `:103`; `contracts/ErrandBoard.sol:15`, `:45`, `:322`).

## Intentional lifecycle alignment

The previous source matched its initial report but differed from the intended demo workflow in several timing rules. The follow-up changes address those product differences:

1. `contracts/ErrandBoard.sol:169`: select a competition winner once, strictly before `deadline + reviewWindow`; record selection time, and forbid replacement.
2. `contracts/ErrandBoard.sol:182`: selected worker confirmation uses its own claim TTL, so the entry deadline and selection-window end cannot cut short confirmation.
3. `contracts/ErrandBoard.sol:253` and `:272`: selected winners cannot be cancelled; public expiry follows the selected winner's TTL, while unselected competitions wait for the full selection window. Competition revision recovery refunds rather than reopening winner selection (`:285`).
4. `contracts/ErrandBoard.sol:209`: changes may be requested while review is open after an old deadline; a full claim TTL is granted by extending the deadline when needed, while revision count remains mission-wide.

Submitted work remains protected from deadline/claim-expiry refunds. At exact review lapse, reject/revise cease and public finalization begins (`contracts/ErrandBoard.sol:231`, `:359`). Fees, account authority and signed-action schema are unchanged by the lifecycle follow-up.

## Validation coverage and status

The initial review identified two concrete validation gaps: client-produced signed actions were not executed against the actual EVM, and exact time boundaries/failed-action nonce rollback were untested. Follow-up tests now cover those cases:

- `tests/contracts/escrow.test.mjs:79`: actual `HypeEscrowClient.prepareMeta()` post/submit/withdraw outputs are signed and relayed against the deployed local contract. A mined, correctly signed post with insufficient funds must revert without consuming its nonce, then the same signature succeeds after funding. The test checks actor, worker, result hash, destination balance and conservation.
- `tests/contracts/escrow.test.mjs:33`, `:46`, `:52`, `:64`, `:72`, `:91`: selection-window, confirmation TTL, ordinary claim/global deadline, review lapse and signature-expiry boundaries include exact equality and immediately-before cases. Additional tests forbid overwriting/cancelling a selected winner and reopening a timed-out competition revision (`:41`, `:58`).

The coordinating agent captured the RED run against the old Solidity: five new lifecycle scenarios failed, while adapter round-trip and existing cases passed. After the implementation, the coordinating agent reran `npm run test:contracts`: all 19 behavior subtests passed (20 tests including the parent), 0 failures, 22.24 seconds. This reviewer inspected the parent-run output at `/private/tmp/errand-contract-red.log` and `/private/tmp/errand-contract-green.log`; this is execution evidence from the coordinating agent, not a separate run by this reviewer. No public transactions were performed.

## Limits

This is a focused source review plus implementation record, not a full security audit or production-readiness certification. No independent execution, fuzzing, deployed-bytecode comparison, target-chain assessment, original-service compatibility check or OpenZeppelin audit was performed by this reviewer. Application integration and the demo ledger were outside the initial review. The constructor treasury and deployment address remain deployment decisions. Forced native transfers can create inaccessible surplus, as explicitly documented. Public deployment has not been performed.
