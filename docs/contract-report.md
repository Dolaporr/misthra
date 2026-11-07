# Native HYPE escrow implementation and verification

This is new, inspectable Solidity source in `contracts/ErrandBoard.sol`. It does not reuse the original board bytecode, deployed addresses, CREDIT token, service, credentials, or signing domain version. It has not been deployed to any public network.

## Build and EVM evidence

- Node 24.21.0, solc 0.8.30, OpenZeppelin Contracts pinned by the project to 5.0.2, ethers 6.17.0, Ganache 7.9.2.
- `npm run contracts:compile` writes `artifacts/ErrandBoard.json`: ABI, compiler version, Paris target, creation bytecode and runtime template. Constructor immutables are populated at deployment.
- `npm run test:contracts` runs a disposable in-process EVM, local generated wallets, and actual deployments, transactions, account credits, native transfers and block time advancement. There is no public RPC or real-key use.
- Initial RED before source creation: the contract test failed its explicit source-availability assertion (`new inspectable escrow source must exist before it can hold HYPE`). This proves the initial suite could not silently use an original or deployed contract; it is not a claim that each individual lifecycle assertion failed separately before implementation.
- A later regression was exercised RED on the actual EVM: recovering a timed-out claim reset the revision count, so `claim recovery preserves the mission revision cap across workers` failed with `Missing expected rejection`. Removing that reset made the mission-wide cap hold.
- During lifecycle alignment, the coordinating agent ran the expanded EVM suite before the Solidity changes: five new behavior scenarios failed (competition selection after deadline, replacing/cancelling a selected winner, selection-window expiry, confirmation TTL, and revisions after the old deadline). The actual client-adapter round trip and existing scenarios passed in that RED run. After the changes, the coordinating agent reran `npm run test:contracts`: all 19 behavior subtests passed (Node reports 20 tests including the parent), 0 failures, 22.24 seconds. The reviewer inspected `/private/tmp/errand-contract-red.log` and `/private/tmp/errand-contract-green.log`; these are parent-run results, not a separate execution by this reviewer.
- Ganache prints nonfatal native-binding notices on this Node version and uses its JavaScript implementation. Those notices do not mean a public-node fallback is used.

The EVM suite checks successful acceptance with a tip, 2.5% fee, actual withdrawal destination balance, double-payment prevention, authorization, fee-free cancellation/rejection/expiry, claim recovery before and after the deadline, mission-wide revision limits, review lapse settlement after the global deadline, direct hire, ordinary picking, competition winner selection and confirmation, typed posting/submission/withdrawal, replay, wrong-chain, wrong-contract, expired and modified-data signatures, insufficient balance and malicious withdrawal reentry. Added regressions exercise the selection and confirmation windows, selected-winner immutability, revisions after an old deadline, exact claim/deadline/review/signature boundaries, and competition revision recovery. A real `HypeEscrowClient` uses the in-process Ganache `BrowserProvider` to prepare post, submit and withdrawal actions; disposable wallets sign them and the actual contract executes them. A mined insufficient-credit execution must preserve its nonce, after which the same signed action succeeds following a deposit. Each scenario checks native balance equals accounted liabilities in its controlled environment. Provider request caching is disabled so immediate time-boundary calls observe the mined block.

The broader `npm test` was also attempted while other components were being implemented. That run was not green: `tests/backend.test.mjs` aborted in Node's native `execution_async_id` assertion; the in-progress chain adapter existence assertion failed; the MCP local HTTP test failed with sandbox `listen EPERM 127.0.0.1`. Those files are outside this contract task's ownership. The final project verification must be performed after those components are ready, with local-listener permissions where needed.

## Money and lifecycle

All values are integer native HYPE wei, using 18 decimals. Users fund their account through payable `deposit()` or `depositFor(account)`. Posting and raises move account credit into escrow; settlement/refunds return escrow into account credit. `withdraw(amount,to)` performs the external native transfer after debiting the account. The contract does not implement arbitrary calls or token spending approvals.

`treasury` is immutable and constructor-supplied. `FEE_BPS` is the constant 250. Successful settlement charges `floor(reward * 250 / 10000)` and credits the remainder to the worker. Tips are funded from the poster's account and go entirely to the worker; tips incur no fee. Refunds return the complete reward and charge no fee. Treasury fees are pull-payment account credits, with the same withdrawal route as other accounts.

| Phase value | Meaning |
| --- | --- |
| 0 | None / unknown mission |
| 1 | Open: a different account may claim |
| 2 | Picking: poster assigns, or chooses a competition winner; a nonzero worker means selection is awaiting confirmation |
| 3 | Claimed: reserved worker may submit |
| 4 | Submitted: poster reviews; elapsed review allows anyone to finalize |
| 5 | Paid: terminal |
| 6 | Refunded: cancelled or rejected, terminal |
| 7 | Expired: deadline refund, terminal |

Direct hire starts Claimed immediately. `assign` handles ordinary Picking missions. Competition `selectWinner` is poster-only and commits once to a worker and result hash, recording selection time in `claimedAt`; it does not pay or start review. Selection is allowed strictly before `deadline + reviewWindow`, including after the entry deadline. Once selected, the worker/hash cannot be replaced and the poster cannot cancel. The selected worker authenticates `confirmWinner` by transaction sender or signed meta-action, supplying the committed result hash and a result URI strictly before `claimedAt + claimTtl`. Confirmation may occur after both the entry deadline and the selection window; it starts Submitted and a fresh review timer. Neither posters nor workers can choose themselves as the worker on their own mission.

Ordinary claims and all Claimed-phase submissions must occur strictly before the current mission deadline; submission also must occur strictly before `claimedAt + claimTtl`. Anyone can recover a timed-out ordinary claim: before the deadline it returns to Open/Picking; at or after the deadline it refunds. Recovered claims preserve the mission's used revision count. For unselected competitions, public expiry starts at `deadline + reviewWindow`. For selected competitions awaiting confirmation or revision delivery, expiry starts at `claimedAt + claimTtl`, even if that is before the entry deadline or after the selection window. Recovering a timed-out competition revision refunds rather than reopening the selection. Ordinary Open/Picking/Claimed expiry starts at the current mission deadline. Submitted work cannot be refunded by deadline/claim expiry and remains payable after review lapse.

Before review lapse the poster may reject for a full refund or request changes within the mission-wide `maxRevisions`, even after the old mission deadline. A change request starts a new claim TTL and extends the mission deadline to at least `block.timestamp + claimTtl`, preserving a later existing deadline. At `submittedAt + reviewWindow`, rejection/change requests stop and anyone may finalize. Acceptance can settle Submitted at any time, with an optional funded tip. Cancellation is allowed only in Open/Picking before assignment or winner selection. All window ends are exclusive for performing the work and inclusive for the corresponding public expiry/finalization action.

Reward must be positive; deadlines must be in the future and within 365 days; review and claim windows are 1 second through 365 days; max revisions is 10. Spec/result hashes must be nonzero and result URI is 1–2048 bytes. Hashes are commitments: the contract does not download or assess content or prove that a URI contains the supplied hash.

## Direct client interface

`post(PostParams)` fields, in ABI order:

```
uint256 reward
uint64 deadline
uint64 reviewWindow
uint64 claimTtl
address assignee
bool pickOnly
bool competition
uint8 maxRevisions
bytes32 specHash
```

An assignee cannot be the poster or the board. Competitions require `pickOnly=true` and zero assignee. `post` returns the monotonic ID; `Posted` also emits it.

Available writes: `deposit`, `depositFor`, `withdraw`, `post`, `claim`, `assign`, `submit`, `requestChanges`, `accept`, `reject`, `cancel`, `raise`, `selectWinner`, `confirmWinner`, `finalize`, `expire`, `recoverClaim` and `execute`.

Reads include `balanceOf(account)`, `missions(id)`, `nextId`, `quote(reward)`, `treasury`, `totalAccountLiability`, `totalEscrowLiability`, `nonces(actor,nonce)` and the inherited EIP-712 domain getter. The complete ABI is generated in `artifacts/ErrandBoard.json`; `missions` includes named fields for the latest result and note hash.

## Signed meta-actions

Domain: `{ name: "ErrandBoard", version: "1", chainId, verifyingContract }`. The chain and board must be the actual configured deployment.

```
Action(address actor,uint8 kind,uint256 id,uint256 amount,address who,bytes32 dataHash,uint256 nonce,uint64 expiry)
```

`execute(action,data,signature)` binds `keccak256(data)` and verifies the actor using OpenZeppelin ECDSA/EIP712. Nonces are arbitrary actor-scoped one-use uint256 values. Expiry is exclusive: `block.timestamp >= expiry` fails. A failed operation reverts the nonce consumption. The dispatcher invokes only explicit internal operations; the caller cannot supply arbitrary self-call calldata.

| Kind | Operation | Signed scalar fields | `data` ABI encoding |
| --- | --- | --- | --- |
| 0 | Post | actor | `abi.encode(PostParams)` |
| 1 | Claim | id | `0x` |
| 2 | Assign | id, who=worker | `0x` |
| 3 | Submit | id | `abi.encode(string resultURI,bytes32 resultHash)` |
| 4 | Request changes | id | `abi.encode(bytes32 noteHash)` |
| 5 | Accept | id, amount=tip | `0x` |
| 6 | Reject | id | `0x` |
| 7 | Cancel | id | `0x` |
| 8 | Raise | id, amount | `0x` |
| 9 | Withdraw | amount, who=recipient | `0x` |
| 10 | Select winner | id, who=worker | `abi.encode(bytes32 resultHash)` |
| 11 | Confirm winner | id | `abi.encode(string resultURI,bytes32 resultHash)` |

Set unused scalar fields to zero for a clear signing request. Every field remains signed even when unused by that kind. Use the empty-bytes keccak for `dataHash` on operations with `data=0x`. Depositing remains a payable direct call; public maintenance functions need no actor signature.

## Boundaries and remaining deployment work

There is no administrator, upgrade proxy, pausing role, delegated allowance, X bot, Orbio activation, AI adjudicator, or arbitrary execution feature in the escrow. Competition entries and judging are offchain. Rejection is the poster's explicit contractual authority; there is no dispute arbitration. Meta-signatures currently support EOAs through ECDSA; ERC-1271 contract-wallet meta-signatures are not implemented, although contract accounts can call the direct API.

Liabilities must never exceed the native balance. Forced native transfers can create surplus, so exact equality is a property of the controlled tests, not a guarantee against unsolicited forced funds. There is intentionally no surplus-withdrawal administrator. All external payout transfers use checks-effects-interactions and `ReentrancyGuard`. The contract retains the last submitted URI/hash and change note; events provide the history.

This is local execution evidence, not an independent security audit or proof of production readiness. Public deployment still requires target-chain verification, a selected treasury, deployment review, funding, and an independent security review. No real keys or funds were used.
