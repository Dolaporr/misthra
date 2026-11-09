# Add "Route fees with Misthra" to your launch flow

For launchpads and aggregators on Elysium. Two ways, pick one. Neither needs keys, accounts or approvals from Misthra: the creator signs everything in their own wallet.

## What it does for your creators

A creator's launch has one creator-fee recipient. A Misthra fee router can be that recipient and then:
- split the fees across many wallets with exact shares (dev 40%, designer 20%, KOL 15%, marketing 25%…),
- pay out automatically: anyone can trigger a payout, and money only ever goes to the wallets set at creation,
- show a public page per router: what came in, what was paid, who is owed what.

The split is fixed when the router is created. Misthra takes a fixed 1% of fees routed through it. Contracts: `docs/elysium-mainnet.md`. They are unaudited; start small.

## Option A: link out (no code beyond a link)

Add a "Route fees with Misthra" button that opens:

```
https://misthra.com/#/launch?ref=<your-id>&creator=<creator wallet>&pad=<your pad id>&returnUrl=<https url on your site>
```

The creator sets the split on Misthra and deploys their router from their wallet. Misthra then shows a **"Back to <your name>"** button that opens your `returnUrl` with `router=<router address>` added, so your form can fill in the fee recipient. Misthra only sends people back to `https` URLs on the hosts you registered.

## Option B: inside your own UI (API)

From your site's origin (registered with us), no cookies:

1. `POST https://misthra.com/api/router/plan` with `{ creator, buckets, returnUrl? }`. Example `buckets` for a 70/30 split paid in native HYPE:
   ```json
   [{ "kind": "native", "bps": 10000, "wallets": [
       { "address": "0xDev…", "bps": 7000 },
       { "address": "0xMarketing…", "bps": 3000 } ] }]
   ```
   Response: `predictedAddress` (the router's address, fixed before deployment), `deployTx` (`{ to, data, value, chainId, from }`), `steps`.
2. Have the creator's wallet send `deployTx`.
3. Use `predictedAddress` as the creator-fee recipient in your launch.
4. After launch, the creator binds the token once: `POST /api/router/<router>/prepare` with `{ action: "bind", from: creator, params: { token } }` returns the transaction to sign.

Plans made from your origin are attributed to you automatically. `GET /api/partners/<your-id>/routers` lists them and whether each was deployed. Router pages show "via <your name>".

Other public reads you may use: `GET /api/router/pads`, `GET /api/router/<address>` (live router status), `GET /api/launches`, `GET /api/capabilities`.

## To register

Send your id, display name, site origins (e.g. `https://agoradex.app`) and return hosts. They go in `chain/partners.json`.
