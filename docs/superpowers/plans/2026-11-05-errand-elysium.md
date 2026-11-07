# Errand for Elysium Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Recreate the documented mission marketplace with HYPE rewards and a working local preview.
**Architecture:** React client consumes an Express/SQLite API; independent native-HYPE escrow and wallet/MCP adapters provide the Elysium foundation. Local simulation is always distinguishable from onchain settlement.
**Tech Stack:** Node24, React19, TypeScript, Vite, SQLite, ethers6, Solidity0.8.30, MCP SDK.
**Spec:** ../specs/2026-11-05-errand-elysium-design.md and ../../api-contract.md.

## Global Constraints
- 18-decimal HYPE strings; 250bps settlement fee; no floating-point accounting.
- Local-only startup, demo labels, no original service calls, no real transactions/deployments.
- Credential-dependent integrations fail clearly; no invented reviews or usage metrics.
- Shared API contract is docs/api-contract.md; file ownership stays disjoint.

## Review Focus
- Unauthorized role/session cannot spend or view private messages.
- Repeat or concurrent settlement cannot pay twice or create value.
- Deadlines and review changes never strand or incorrectly release escrow.
- User text/attachments render safely, empty and wrong-wallet states recover.
- Chain/address misconfiguration cannot fall back to a simulated payment.

### Task 1: Persistent domain and authenticated API
Files: server/**, tests/*.test.mjs. Produces createApp({dbPath,mode,now}) and documented JSON routes. Domain covers accounts, mission lifecycle, profiles, competitions, pairing, private messages and uploads.
- [ ] Write behavioral tests for balances, role checks, lifecycle, time transitions, competition, sessions and privacy; run and record RED.
- [ ] Implement SQLite transactions and routes against docs/api-contract.md; no secrets generated outside local runtime data.
- [ ] Run domain/API suite, inspect persisted records after restart, record GREEN.

### Task 2: Native HYPE escrow
Files: contracts/**, scripts/compile-contracts.mjs, tests/contracts/**. Produces compiled ABI plus native-HYPE contract, with local deployment test evidence.
- [ ] Write local EVM tests for success/refund/revision/expiry/replay and unauthorized access; record RED.
- [ ] Implement escrow with deposits, signing, nonce protection, review windows and fee; keep contract authority independent from SQLite demo.
- [ ] Compile and run EVM tests, verify conservation and one-shot payouts.

### Task 3: Reference-led interface
Files: src/**, index.html, vite.config.ts, tsconfig*.json. Consumes JSON contract and produces functional responsive UI.
- [ ] Implement API client and pages for home/board/post/detail/agents/profile/join/account/inbox/leaderboard/guide/search.
- [ ] Make every visible action work or explain the missing integration; support loading/errors/empty/keyboard/mobile.
- [ ] Build/typecheck and browser-test complete hiring and competition flows.

### Task 4: Integration, MCP and activation guide
Files: mcp/**, scripts/dev.mjs, scripts/** except compile ownership, README.md, .env.example, docs/feature-matrix.md.
- [ ] Write protocol/API integration tests, run RED, implement MCP transport and wallet auth.
- [ ] Add chain configuration, safe onchain transaction preparation/receipt handling where configured; never substitute demo accounting.
- [ ] Complete test/build runs and desktop/mobile QA, independent security and UI review, fix material findings.
- [ ] Record remaining external activation needs; open preview and provide source/guide links.
