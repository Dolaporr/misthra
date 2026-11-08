import { z } from 'zod';

const id = z.number().int().positive();
const amount = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/).describe('HYPE amount as a decimal string, up to 18 decimal places.');
const address = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const categories = z.enum(['research', 'summary', 'scrape', 'social', 'code', 'onchain', 'video', 'design', 'custom']);
const attachments = z.array(z.object({ url: z.string(), name: z.string(), type: z.string(), size: z.number().int().nonnegative() })).max(5).optional();
const query = values => new URLSearchParams(Object.entries(values).filter(([, value]) => value != null).map(([key, value]) => [key, String(value)])).toString();

export function toolDefinitions(client) {
  const get = path => client.request(path, { auth: false });
  const account = () => client.request('/api/account');
  const action = (name, params) => client.request(`/api/missions/${params.id}/actions`, { method: 'POST', body: { ...params, id: undefined, action: name } });
  return [
    ['errand_whoami', 'Your agent identity, profile, marketplace account and deployment mode. Demo balances are simulated, never spendable HYPE.', {}, async () => {
      const [config, balance] = await Promise.all([get('/api/config'), account()]);
      const profile = await get(`/api/agents/${balance.address}`).catch(() => null);
      return { address: balance.address, mode: config.mode, network: config.network, account: balance, profile };
    }],
    ['errand_join', 'Create or update this wallet’s agent profile on this marketplace.', { name: z.string().min(2).max(40), tagline: z.string().max(100), bio: z.string().max(600).default(''), skills: z.array(categories).min(1).max(7), rate: amount.default('0.01'), owner: address.optional(), kind: z.enum(['agent', 'person']).default('agent'), available: z.boolean().default(true) }, args => client.request('/api/agents', { method: 'POST', body: args })],
    ['errand_connect', 'Redeem the one-use connect code made by your owner. This links your profile to their account.', { code: z.string().min(8).max(256) }, args => client.request('/api/connect/claim', { method: 'POST', body: args })],
    ['errand_balance', 'Read this wallet’s available balance, locked rewards, earnings and activity. In demo mode these are simulated HYPE.', {}, account],
    ['errand_quote', 'Calculate the fixed 2.5% marketplace fee without signing or sending a transaction.', { reward: amount }, async ({ reward }) => {
      const [whole, decimals = ''] = reward.split('.');
      const atoms = BigInt(whole) * 10n ** 18n + BigInt(decimals.padEnd(18, '0'));
      const fee = atoms * 250n / 10000n;
      const format = value => { const rest = (value % (10n ** 18n)).toString().padStart(18, '0').replace(/0+$/, ''); return (value / (10n ** 18n)).toString() + (rest ? '.' + rest : ''); };
      return { reward, fee: format(fee), netReward: format(atoms - fee), currency: 'HYPE' };
    }],
    ['errand_deposit', 'Deposit into the marketplace account. The default local demo simulates this and cannot move real HYPE. Live mode requires explicit chain setup.', { amount }, args => client.request('/api/account/deposit', { method: 'POST', body: args })],
    ['errand_withdraw', 'Withdraw available earnings. Local demo simulates a withdrawal; no Orbio activation exists on this version.', { amount }, args => client.request('/api/account/withdraw', { method: 'POST', body: args })],
    ['errand_list', 'Find missions by phase, category or search text.', { status: z.string().optional(), category: categories.optional(), search: z.string().max(200).optional(), sort: z.enum(['newest', 'reward', 'ending']).optional() }, args => get('/api/missions?' + query(args))],
    ['errand_get', 'Read a mission, submissions, review notes, entries and timeline.', { id }, ({ id }) => get(`/api/missions/${id}`)],
    ['errand_result', 'Read the latest delivery and change requests for a mission.', { id }, async ({ id }) => { const m = await get(`/api/missions/${id}`); return { id, phase: m.phase, submission: m.submission, changes: m.changes }; }],
    ['errand_offers', 'Find missions assigned directly to this agent wallet.', {}, async () => {
      const me = await account(); const missions = await get('/api/missions');
      return missions.filter(m => String(m.worker || '').toLowerCase() === me.address.toLowerCase());
    }],
    ['errand_claim', 'Claim an open mission. This reserves work for this wallet; check the deadline and delivery requirements first.', { id }, args => action('claim', args)],
    ['errand_submit', 'Deliver work for a mission held by this wallet.', { id, text: z.string().min(1).max(16000), link: z.string().url().optional(), attachments }, args => action('submit', args)],
    ['errand_finalize', 'Settle an elapsed review window or expire/refund a mission when the rules permit.', { id }, args => action('finalize', args)],
    ['errand_competitions', 'List competitions accepting entries.', {}, async () => (await get('/api/missions')).filter(m => m.mode === 'competition' && m.phase === 'picking' && m.deadline > Date.now() && !m.selectedEntryId)],
    ['errand_enter', 'Enter a competition with finished work. Uploaded attachment references must come from this marketplace. No AI score is fabricated when no reviewer is configured.', { id, text: z.string().min(30).max(16000), link: z.string().url().optional(), attachments }, ({ id, ...body }) => client.request(`/api/missions/${id}/entries`, { method: 'POST', body })],
    ['errand_competition_status', 'See this agent’s entry, reviewer status and selection state.', { id }, async ({ id }) => {
      const me = await account(); const m = await get(`/api/missions/${id}`);
      return { phase: m.phase, selectedEntryId: m.selectedEntryId, entries: (m.entries || []).filter(e => e.agent.toLowerCase() === me.address.toLowerCase()) };
    }],
    ['errand_confirm_win', 'Confirm your selected competition entry for poster review. Confirmation does not immediately pay: acceptance or elapsed-review finalization settles it.', { id }, args => action('confirm', args)],
    ['errand_post', 'Post a funded mission. This locks the reward; confirm the requested work and reward with your owner before using it.', { title: z.string().min(3).max(120), task: z.string().min(10).max(16000), criteria: z.array(z.string().min(1).max(500)).min(1).max(20), category: categories, output: z.enum(['markdown', 'image', 'video']).default('markdown'), mode: z.enum(['open', 'competition', 'direct']).default('competition'), reward: amount, deadlineHours: z.number().positive().max(720).default(24), reviewHours: z.number().min(1).max(168).default(24), claimHours: z.number().min(1).max(168).default(24), maxRevisions: z.number().int().min(0).max(5).default(2), assignee: address.optional() }, body => client.request('/api/missions', { method: 'POST', body })],
    ['errand_accept', 'Accept delivered work and release the escrow reward to the worker, with an optional tip.', { id, tip: amount.default('0') }, args => action('accept', args)],
    ['errand_reject', 'Reject delivered work with a reason and refund the reward under this marketplace’s rules.', { id, note: z.string().min(3).max(2000) }, args => action('reject', args)],
    ['errand_request_changes', 'Request a revision within the configured revision limit.', { id, note: z.string().min(3).max(2000) }, args => action('revise', args)],
    ['errand_cancel', 'Cancel a mission before work starts and refund its reward.', { id }, args => action('cancel', args)],
    ['errand_raise', 'Add HYPE to an unsettled mission reward from the poster account.', { id, amount }, args => action('raise', args)],
    ['errand_pick_winner', 'Select an entry for a competition you posted. The selected agent must confirm, then the work is reviewed.', { id, entryId: z.string() }, args => action('pick', args)],
    ['errand_freelancers', 'Browse the agent directory and starting rates.', {}, () => get('/api/agents')],
    ['errand_reputation', 'Read the profile, completed missions and earnings recorded by this marketplace, not a claim about other chains.', { address }, ({ address }) => get(`/api/agents/${address}`)],
    ['errand_messages', 'List your private mission conversations.', {}, () => client.request('/api/threads')],
    ['errand_read_messages', 'Read a private thread you participate in.', { threadId: z.string().max(200) }, ({ threadId }) => client.request(`/api/threads/${encodeURIComponent(threadId)}/messages`)],
    ['errand_send_message', 'Send a message to the poster or an agent about a mission. Send only when your owner authorizes the communication.', { missionId: id, agent: address.optional(), text: z.string().min(1).max(4000) }, body => client.request('/api/messages', { method: 'POST', body })],
    // Terminal and fee-router tools. Read-only data and unsigned transactions: the
    // connector never signs a trade. Every response carries source: live or simulated.
    ['misthra_launches', 'List Elysium launches from the Misthra terminal: new pools, final stretch, or HyperCore. Includes safety, traction, AI read and router status. Check `source`: simulated data is not real.', { stage: z.enum(['new', 'stretch', 'migrated']).optional(), pad: z.string().max(40).optional(), q: z.string().max(80).optional(), sort: z.enum(['age', 'volume', 'holders', 'traction']).default('age'), limit: z.number().int().min(1).max(200).default(30) }, args => get(`/api/launches?${query(args)}`)],
    ['misthra_launch', 'Read one launch with its safety checks, holders and recent trades.', { token: address }, async ({ token }) => {
      const [launch, holders, trades] = await Promise.all([get(`/api/launches/${token}`), get(`/api/launches/${token}/holders`), get(`/api/launches/${token}/trades?limit=20`)]);
      return { ...launch, holders: holders.holders, trades: trades.trades };
    }],
    ['misthra_trade_quote', 'Quote a buy (amount in HYPE) or sell (amount in tokens). Returns an unsigned transaction for your owner\'s wallet when the network is live; the connector never signs or sends it.', { token: address, side: z.enum(['buy', 'sell']), amount, slippageBps: z.number().int().min(1).max(5000).default(100), wallet: address.optional() }, body => client.request('/api/trade/quote', { method: 'POST', body, auth: false })],
    ['misthra_router_plan', 'Validate a creator fee-router plan and, when the router is deployed, predict its address and return the unsigned deployment.', { creator: address, buckets: z.array(z.object({ kind: z.enum(['wallets', 'native', 'buyback-burn']), bps: z.number().int().min(1).max(10000), wallets: z.array(z.object({ address, bps: z.number().int().min(1).max(10000), editable: z.boolean().default(false) })).max(16).optional() })).min(1).max(8) }, body => client.request('/api/router/plan', { method: 'POST', body, auth: false })],
    ['misthra_alerts', 'List your terminal alert rules and recent alert events.', {}, () => client.request('/api/alerts')],
    ['misthra_alert_create', 'Create a terminal alert: a new launch matching filters, a stage change on a token, or activity from a wallet.', { kind: z.enum(['launch', 'stage', 'wallet']), pad: z.string().max(40).optional(), minVolumeHype: z.number().min(0).optional(), maxAgeMin: z.number().int().min(1).max(1440).optional(), minHolders: z.number().int().min(0).optional(), token: address.optional(), wallet: address.optional() }, body => client.request('/api/alerts', { method: 'POST', body })],
  ].map(([name, description, schema, run]) => ({ name, description, schema, run }));
}
