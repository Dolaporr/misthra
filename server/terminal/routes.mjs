// Terminal, Launch and Alerts routes. Contract: docs/terminal-api.md.
import express from 'express';
import { isAddress } from 'ethers';
import { z } from 'zod';
import { liveQuote, simulatedQuote } from '../../chain/trade.mjs';
import { planRouter } from '../../chain/router-plan.mjs';
import { AgoraError, createAgoraClient } from '../../chain/agora.mjs';
import { Interface, formatUnits } from 'ethers';

const STAGES = ['new', 'stretch', 'migrated'];

export function mountTerminal(app, { store, config, provider = null, auth, now = () => Date.now() }) {
  const r = express.Router();
  const source = () => (config.live ? 'live' : 'simulated');
  const clients = new Map(); // response -> wallet address or null
  // Market events go to everyone; an alert goes only to the session that owns it.
  const send = (event, data, owner = null) => {
    for (const [res, address] of clients) if (!owner || owner === address) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  const fail = (status, message) => { const e = new Error(message); e.status = status; throw e; };
  const json = (fn) => async (req, res, next) => { try { res.json(await fn(req, res)); } catch (e) { next(e); } };
  const who = (req) => { try { return auth(req)?.address ?? null; } catch { return null; } };
  const need = (req) => who(req) ?? fail(401, 'Connect a wallet first.');
  const launchOr404 = (address) => { if (!isAddress(address)) fail(400, 'A valid token address is required.'); return store.getRaw(address) ?? fail(404, 'This launch is not indexed.'); };

  r.get('/launches', json((req) => {
    const stage = STAGES.includes(req.query.stage) ? req.query.stage : undefined;
    const limit = Number(req.query.limit) || 60;
    const launches = store.list(config, { stage, pad: req.query.pad || undefined, q: req.query.q || undefined, sort: req.query.sort, limit });
    // Configured pads in live mode; in the simulated preview, the sample pads present in the feed.
    const pads = config.pads.length ? config.pads.map((p) => ({ id: p.id, name: p.name, url: p.url }))
      : [...new Map(store.list(config, { limit: 200 }).filter((l) => l.pad).map((l) => [l.pad.id, l.pad])).values()];
    return { source: source(), networkVerified: config.live ? config.networkVerified : null, tradeFeeBps: config.tradeFeeBps, indexedBlock: Number(store.meta('idx.indexedBlock') ?? 0), updatedAt: now(), pads, launches };
  }));
  r.get('/launches/:address', json((req) => ({ source: source(), launch: store.toApi(launchOr404(req.params.address), config) })));
  r.get('/launches/:address/candles', json((req) => { launchOr404(req.params.address); return { source: source(), bars: store.candles(req.params.address, req.query.tf) }; }));
  r.get('/launches/:address/trades', json((req) => { launchOr404(req.params.address); return { source: source(), trades: store.trades(req.params.address, Math.min(200, Number(req.query.limit) || 50)) }; }));
  r.get('/launches/:address/holders', json((req) => ({ source: source(), holders: store.holders(launchOr404(req.params.address)).list })));

  const quoteSchema = z.object({ token: z.string().refine(isAddress), side: z.enum(['buy', 'sell']), amount: z.string().regex(/^\d+(\.\d{1,18})?$/), slippageBps: z.number().int().min(1).max(5000), wallet: z.string().refine(isAddress).optional() });
  const parse = (schema, body) => { const p = schema.safeParse(body); if (!p.success) fail(400, p.error.issues[0]?.message ?? 'Invalid request'); return p.data; };

  const agoraOn = Boolean(config.agora?.enabled && config.agora.allowedTargets.length && config.live);
  const agora = agoraOn ? createAgoraClient(config.agora) : null;
  const decimalsAbi = new Interface(['function decimals() view returns (uint8)']);
  const noRoute = (reason) => ({ source: 'live', via: 'agora', amountOut: '0', minOut: '0', feeHype: null, feeBps: null, priceImpactBps: null, route: 'Agora best price', tx: null, approveTx: null, approvals: [], reason });

  r.post('/trade/quote', express.json(), json(async (req) => {
    const body = parse(quoteSchema, req.body);
    const raw = store.getRaw(body.token);
    if (!raw && !agoraOn) fail(404, 'This launch is not indexed.');
    // Route 1: Misthra's own gateway, for pools on the canonical factory quoted in
    // the canonical WHYPE. Earns the Misthra trade fee.
    const tradable = Boolean(raw) && (!raw.pool.factory || (raw.pool.factory === config.v3Factory && (!raw.pool.quote || raw.pool.quote === config.whype)));
    if (config.tradeReady && provider && tradable) {
      const quote = await liveQuote(provider, config, { ...body, wallet: body.wallet ?? who(req), fee: raw.pool.fee, decimals: raw.decimals, now: now() });
      return { source: 'live', via: 'misthra', approvals: quote.approveTx ? [quote.approveTx] : [], ...quote };
    }
    // Route 2: Agora's best price across pads, with Misthra's builder code.
    if (agoraOn) {
      const wallet = body.wallet ?? who(req);
      if (!wallet) return noRoute('Connect a wallet to get a quote from Agora.');
      const decimals = raw?.decimals ?? Number(decimalsAbi.decodeFunctionResult('decimals', await provider.call({ to: body.token, data: decimalsAbi.encodeFunctionData('decimals') }))[0]);
      try {
        return { source: 'live', ...(await agora.quote({ ...body, recipient: wallet }, { chainId: config.chainId, formatOut: (w) => formatUnits(w, body.side === 'buy' ? decimals : 18), formatHype: (w) => formatUnits(w, 18) })) };
      } catch (e) {
        if (!(e instanceof AgoraError)) throw e;
        return noRoute(e.message);
      }
    }
    const launch = store.toApi(raw, config);
    const reason = !config.live ? undefined
      : !tradable ? 'This pool is on another DEX deployment. Trade it on its launchpad; Misthra shows it for research only.'
      : 'Trading is not switched on yet: the Misthra trade gateway or quoter address is not configured.';
    const quote = simulatedQuote({ ...body, priceHype: launch.priceHype, liquidityHype: launch.liquidityHype, feeBps: config.tradeFeeBps });
    return { source: 'simulated', via: 'simulated', approvals: [], ...quote, reason: reason ?? quote.reason };
  }));

  // Paper fills exist only against the simulated feed; real trades are signed by the user.
  r.post('/paper/fill', express.json(), json((req) => {
    const owner = need(req);
    if (config.live) fail(409, 'Paper fills are only available in the simulated preview.');
    const body = parse(quoteSchema.omit({ wallet: true }), req.body);
    const launch = store.toApi(launchOr404(body.token), config);
    const quote = simulatedQuote({ ...body, priceHype: launch.priceHype, liquidityHype: launch.liquidityHype, feeBps: config.tradeFeeBps });
    if (quote.amountOut === '0') fail(409, quote.reason);
    const hype = body.side === 'buy' ? Number(body.amount) : Number(quote.amountOut);
    const tokens = body.side === 'buy' ? Number(quote.amountOut) : Number(body.amount);
    if (body.side === 'sell') {
      const held = store.paper(owner).filter((f) => f.token === body.token.toLowerCase()).reduce((s, f) => s + (f.side === 'buy' ? f.tokens : -f.tokens), 0);
      if (tokens > held + 1e-9) fail(409, 'You do not hold that many paper tokens.');
    }
    const fill = { token: body.token.toLowerCase(), side: body.side, hype, tokens, price: hype / tokens };
    store.addPaper(owner, fill);
    return { source: 'simulated', fill };
  }));
  r.get('/paper/positions', json((req) => {
    const owner = need(req);
    const byToken = new Map();
    for (const f of store.paper(owner)) {
      const p = byToken.get(f.token) ?? { token: f.token, tokens: 0, spentHype: 0, receivedHype: 0 };
      if (f.side === 'buy') { p.tokens += f.tokens; p.spentHype += f.hype; } else { p.tokens -= f.tokens; p.receivedHype += f.hype; }
      byToken.set(f.token, p);
    }
    const positions = [...byToken.values()].map((p) => {
      const raw = store.getRaw(p.token), price = raw ? Number(store.toApi(raw, config).priceHype) : 0;
      const value = p.tokens * price;
      return { token: p.token, symbol: raw?.symbol ?? '?', tokens: p.tokens, spentHype: p.spentHype, receivedHype: p.receivedHype, valueHype: value, pnlHype: value + p.receivedHype - p.spentHype };
    });
    return { source: 'simulated', positions };
  }));

  const ruleSchema = z.object({
    kind: z.enum(['launch', 'stage', 'wallet']), pad: z.string().max(40).optional(), minVolumeHype: z.number().min(0).optional(), maxAgeMin: z.number().int().min(1).max(1440).optional(),
    minHolders: z.number().int().min(0).optional(), token: z.string().refine(isAddress).optional(), wallet: z.string().refine(isAddress).optional(),
  }).refine((v) => v.kind !== 'stage' || v.token, 'A stage alert needs a token.').refine((v) => v.kind !== 'wallet' || v.wallet, 'A wallet alert needs a wallet.');
  r.get('/alerts', json((req) => { const owner = need(req); return { rules: store.rules(owner), events: store.events(owner) }; }));
  r.post('/alerts', express.json(), json((req) => {
    const owner = need(req);
    if (store.rules(owner).length >= 25) fail(409, 'You can keep up to 25 alert rules.');
    const rule = parse(ruleSchema, req.body);
    if (rule.token) rule.token = rule.token.toLowerCase();
    if (rule.wallet) rule.wallet = rule.wallet.toLowerCase();
    return { rule: store.addRule(owner, rule) };
  }));
  r.delete('/alerts/:id', json((req) => { const owner = need(req); if (!store.deleteRule(owner, req.params.id)) fail(404, 'No such alert.'); return { ok: true }; }));

  r.post('/router/plan', express.json(), json(async (req) => planRouter(provider, config, req.body ?? {})));

  r.get('/stream', (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(`event: hello\ndata: ${JSON.stringify({ source: source() })}\n\n`);
    clients.set(res, who(req));
    const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
    req.on('close', () => { clearInterval(ping); clients.delete(res); });
  });

  app.use('/api', r);

  // Alert evaluation: called by the feed or indexer whenever something changes.
  const lastStage = new Map();
  function evaluate(address, kind) {
    const raw = store.getRaw(address);
    if (!raw) return;
    const launch = store.toApi(raw, config);
    const ageMin = (now() - launch.createdAt) / 60_000;
    for (const rule of store.allRules()) {
      let hit = null;
      if (rule.kind === 'launch' && launch.stage && (!rule.pad || launch.pad?.id === rule.pad) && (rule.maxAgeMin == null || ageMin <= rule.maxAgeMin)
        && (rule.minVolumeHype == null || Number(launch.volume24hHype) >= rule.minVolumeHype) && (rule.minHolders == null || launch.holders >= rule.minHolders)) {
        hit = { title: `${launch.symbol} matches your launch alert`, detail: `${launch.name}: ${launch.holders} holders, ${launch.volume24hHype} HYPE traded`, dedupe: `${rule.id}:${address}` };
      } else if (rule.kind === 'stage' && rule.token === address && launch.stage && lastStage.has(address) && lastStage.get(address) !== launch.stage) {
        hit = { title: `${launch.symbol} moved to ${launch.stage}`, detail: `Previously ${lastStage.get(address) ?? 'off the Pulse'}`, dedupe: `${rule.id}:${address}:${launch.stage}` };
      } else if (rule.kind === 'wallet' && kind === 'trade') {
        const t = store.trades(address, 1)[0];
        if (t && t.trader === rule.wallet) hit = { title: `Watched wallet ${t.side === 'buy' ? 'bought' : 'sold'} ${launch.symbol}`, detail: `${t.amountHype} HYPE`, dedupe: `${rule.id}:${t.tx}` };
      }
      if (hit && store.addEvent({ ruleId: rule.id, owner: rule.owner, token: address, ...hit })) send('alert', { ruleId: rule.id, token: address, title: hit.title, detail: hit.detail, at: now() }, rule.owner);
    }
    lastStage.set(address, launch.stage);
  }

  return {
    onLaunch(address) { const raw = store.getRaw(address); if (raw) send('launch', store.toApi(raw, config)); evaluate(address, 'launch'); },
    onTrade(address) { const raw = store.getRaw(address); if (raw) { const l = store.toApi(raw, config); send('update', { address, priceHype: l.priceHype, volume5mHype: l.volume5mHype, holders: l.holders, stage: l.stage }); } evaluate(address, 'trade'); },
    close() { for (const res of clients.keys()) res.end(); clients.clear(); },
  };
}
