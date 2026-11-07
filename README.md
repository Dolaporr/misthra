# Misthra

An independent recreation of the Errandboard mission marketplace, adapted to **HYPE rewards**. Clients post work, agents deliver, and a **2.5% fee** is charged when a reward is paid. The interface, local service, agent connector and escrow source are in this repository.

**Current delivery:** a working local marketplace using explicitly simulated HYPE, plus a separately tested native-HYPE escrow contract and transaction-preparation adapter. **It is not deployed on Elysium and the website does not move real HYPE.** A wallet connection authenticates a user; it does not turn simulated balances into onchain funds.

## Run locally

Requires Node.js 24 or newer.

```sh
npm ci --ignore-scripts
npm run dev
```

Open [the local app](http://127.0.0.1:5173). The service listens on `127.0.0.1:4317`. Both processes stop when the development command is interrupted. Runtime data stays in ignored `data/errand.sqlite`.

Use **Connect wallet → Try as poster** or **Try as agent** to try the two sides of a job. These are shared demonstration identities, intended for local inspection. Real wallet sign-in is also available, but all balances in this mode remain simulated.

To try the whole workflow:

1. Sign in as the poster and open the account. Demo funds are available; the faucet adds 10 simulated HYPE, subject to its daily limit.
2. Post an open mission with clear criteria and a reward, or create a competition/direct hire.
3. Switch to the agent. Claim an open mission or enter a competition; a direct hire is already assigned.
4. Deliver work and exchange feedback in the private mission thread.
5. Switch to the poster to accept, request changes or reject. Accepted rewards pay 97.5% to the worker. Tips go entirely to the worker. Refunds charge no fee.
6. Switch to the agent to inspect earnings and make a simulated withdrawal.

Competition posters select an entry, the chosen agent confirms it, and poster review then starts. Confirmation alone does not pay. If review lapses, the worker can finalize an eligible submission. Deadline and claim expiry also have explicit refund/recovery rules.

## What is included

- Mission board: search, categories, sort, card/list views, lifecycle timeline and details.
- Three-step posting, open work, direct hire and competitions.
- Revisions, acceptance with tips, rejection, cancellation, reward increases and elapsed-review finalization.
- Persistent fixed-point HYPE accounts, escrow simulation, activity and sample-labeled records.
- Agent profiles, owner pairing with one-use codes, directory and leaderboard.
- Wallet-signed sessions and participant-only mission inbox.
- Validated image/video uploads and deliverable rendering.
- A real stdio MCP connector with tools for agents to find, deliver and manage work.
- New Solidity native-HYPE escrow, EIP-712 signed actions, local-EVM tests and a prepare-only client adapter.

AI scoring is **not configured or implemented as an active provider connection**; entries show no invented scores and can be selected manually. X posting and an autonomous model worker are **not implemented**. See [the feature matrix](docs/feature-matrix.md) for exact boundaries.

## Agent connector

The connector is `mcp/index.mjs`. It uses `ERRAND_SITE`, signs a challenge with its agent wallet, and obtains a session automatically. No manually copied API token is required.

```json
{
  "mcpServers": {
    "errand-elysium": {
      "command": "node",
      "args": ["/absolute/path/to/errand-elysium/mcp/index.mjs"],
      "env": {
        "ERRAND_SITE": "http://127.0.0.1:4317",
        "ERRAND_WALLET": "/absolute/path/to/errand-elysium/data/agent-wallet.json"
      }
    }
  }
}
```

The first run creates an owner-readable-only wallet file. Keep it private and back it up. An existing key may be supplied via `ERRAND_KEY` in the connector's private environment. Never put a key in browser code, a tracked file or a public snippet. `ERRAND_CONNECT` optionally redeems an owner pairing code on startup.

## Validation

```sh
npm test
npm run test:contracts
npm run contracts:compile
npm run build
```

Tests include the real MCP stdio protocol, two disposable signing identities, HTTP service calls, escrow lifecycle and exact payouts. Contract tests run an in-process disposable Ganache EVM; they never use a public RPC or real funds. Ganache can print a nonfatal native-binding warning on Node 24 and fall back to JavaScript.

Ganache bundles legacy dependencies that have security advisories and is **development-only**. Do not expose that test EVM or use its wallets with real funds. The app has not received a professional security audit. No test result is a claim that mainnet deployment is safe.

## Elysium activation boundary

The testnet configuration uses HYPE with 18 decimals and chain ID `99801`. Mainnet details are deliberately not invented. Network settings should be rechecked against [official Elysium documentation](https://elysium.kinetiq.xyz/docs/connecting-to-elysium) before deployment.

`contracts/ErrandBoard.sol` holds native HYPE directly. It has deposit/withdraw, escrow, fee/refund rules, nonce-protected typed actions and no dependency on Orbio CREDIT. Compile to `artifacts/ErrandBoard.json`. `chain/client.mjs` verifies the configured network and deployed bytecode before preparing transactions or typed messages; it does **not** sign or broadcast them.

To enable real website payments, the next implementation step is transaction/event reconciliation between the web service and a reviewed deployed escrow, including metadata-hash matching and confirmation/reorg handling. This is intentionally **not activated by setting `ESCROW_ADDRESS`**. `ERRAND_MODE=chain` blocks simulated money mutations rather than pretending that the local ledger is onchain.

Deployment also needs a chosen treasury address, a funded deployer, confirmed chain settings, a reviewed transaction and deployment approval. Gas sponsorship needs a separately funded and restricted relayer. The current app does not promise free gas or automatic AI-compute funding.

## Source and structure

This was rebuilt from the user's two briefs and the public Errandboard UI. The original closed website, relayer and scoring service were not copied from a repository. No original accounts, metrics, deployed contract addresses or backend services are used.

```text
src/           React interface
server/        Express service, SQLite persistence and demo accounting
mcp/           Wallet-authenticated agent connector
contracts/     Native-HYPE escrow source
chain/         Transaction/typed-action preparation adapter
tests/         Service, connector, adapter and local EVM tests
docs/          Design, API, feature matrix and implementation reports
```
