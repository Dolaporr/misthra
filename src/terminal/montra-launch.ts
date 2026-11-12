// Launch on Montra: form checks, request bodies and plan checks for the page.
// API: docs/terminal-api.md § Launch on Montra. Every step is signed in the user's wallet.
import type { Tx } from './model.ts';
import { percentToBps } from './router-preview.ts';

export type MontraConfig = { id: number; quote: string; native: boolean; baseSupply: string; totalFeePct: number; protocolFeePct: number; lpFeePct: number; earlyBuyFeeStartPct: number; earlyBuyFeeWindowS: number };
export type MontraOptions = { launchEnabled: boolean; launchFee: string; builderCode: string | null; configs: MontraConfig[] };
export type MontraStep = { id: 'router' | 'launch' | 'recipient' | 'activate'; title: string; note?: string; tx: Tx & { from: string } };
export type MontraPlan = { router: string; adapter: string; token: string; steps: MontraStep[]; buckets: { label: string; bps: number }[]; launchFee?: string; firstBuy?: string; routerSalt: string; launchSalt?: string; poolId?: string };
export type Payee = { address: string; pct: string };
export type CoinForm = { name: string; symbol: string; description: string; logo: string; website: string; twitter: string; telegram: string; configId: number | null; firstBuy: string };
export type Issue = { field: string; message: string };

export const isAddress = (a: string) => /^0x[0-9a-fA-F]{40}$/.test(a.trim());
const ZERO = '0x0000000000000000000000000000000000000000';
export const COLLECT_SELECTOR = '0xfc778863'; // collectAndForward()

export function payeeIssues(payees: Payee[]): Issue[] {
  const out: Issue[] = [];
  if (!payees.length) out.push({ field: 'payees', message: 'Add at least one wallet.' });
  if (payees.length > 16) out.push({ field: 'payees', message: 'Up to 16 wallets.' });
  const seen = new Set<string>();
  let total = 0, bad = false;
  payees.forEach((p, i) => {
    const a = p.address.trim().toLowerCase();
    if (!isAddress(a)) out.push({ field: `payee-${i}`, message: `Wallet ${i + 1} needs a valid address.` });
    else if (a === ZERO || a === '0x000000000000000000000000000000000000dead') out.push({ field: `payee-${i}`, message: `Wallet ${i + 1} cannot be a burn address.` });
    else if (seen.has(a)) out.push({ field: `payee-${i}`, message: `Wallet ${i + 1} is listed twice.` });
    seen.add(a);
    const bps = percentToBps(p.pct);
    if (bps === null || bps <= 0) { bad = true; out.push({ field: `payee-${i}`, message: `Wallet ${i + 1} needs a share above 0%.` }); } else total += bps;
  });
  if (!bad && payees.length && total !== 10_000) out.push({ field: 'payees', message: `Shares add up to ${total / 100}%. They must total 100%.` });
  return out;
}

export function coinIssues(form: CoinForm, options: MontraOptions | null): Issue[] {
  const out: Issue[] = [];
  if (!form.name.trim()) out.push({ field: 'name', message: 'Add a coin name.' });
  else if (form.name.trim().length > 64) out.push({ field: 'name', message: 'Keep the name under 64 characters.' });
  if (!/^[A-Za-z0-9$._-]{1,16}$/.test(form.symbol.trim())) out.push({ field: 'symbol', message: 'Use a ticker of 1 to 16 letters or digits.' });
  if (form.description.length > 1000) out.push({ field: 'description', message: 'Keep the description under 1000 characters.' });
  if (form.logo.trim() && !/^(https:\/\/|ipfs:\/\/)\S+$/.test(form.logo.trim())) out.push({ field: 'logo', message: 'The logo must be an https:// or ipfs:// link.' });
  const config = options?.configs.find(c => c.id === form.configId);
  if (!config) out.push({ field: 'config', message: 'Choose a Montra launch type.' });
  if (form.firstBuy.trim()) {
    if (!/^\d{0,6}(\.\d{0,18})?$/.test(form.firstBuy.trim()) || form.firstBuy.trim() === '.') out.push({ field: 'firstBuy', message: 'Enter the first buy as a HYPE amount, like 0.5.' });
    else if (config && !config.native && Number(form.firstBuy) > 0) out.push({ field: 'firstBuy', message: 'A first buy is only available on HYPE launch types.' });
  }
  return out;
}

const routerBuckets = (payees: Payee[]) => [{ kind: 'native', bps: 10_000, wallets: payees.map(p => ({ address: p.address.trim(), bps: percentToBps(p.pct), editable: false })) }];

export function launchBody(creator: string, form: CoinForm, payees: Payee[]) {
  return {
    creator: creator.trim(), name: form.name.trim(), symbol: form.symbol.trim(), description: form.description.trim(), logo: form.logo.trim(),
    socials: { website: form.website.trim(), twitter: form.twitter.trim(), telegram: form.telegram.trim(), discord: '', extra: '' },
    configId: form.configId, ...(form.firstBuy.trim() && Number(form.firstBuy) > 0 ? { firstBuy: form.firstBuy.trim() } : {}),
    buckets: routerBuckets(payees),
  };
}
export function switchBody(creator: string, token: string, payees: Payee[]) {
  return { creator: creator.trim(), token: token.trim(), buckets: routerBuckets(payees) };
}

// Refuse to sign a plan that does not match the wallet, network or flow it was made for.
export function planIssue(plan: MontraPlan, creator: string, chainId: number | null | undefined, mode: 'launch' | 'switch'): string | null {
  const ids = plan.steps.map(s => s.id).join(',');
  if (ids !== (mode === 'launch' ? 'router,launch,activate' : 'router,recipient,activate')) return 'This plan has unexpected steps. Check it again.';
  if (![plan.router, plan.adapter, plan.token].every(isAddress)) return 'This plan is missing an address. Check it again.';
  if (plan.steps.some(s => s.tx.from?.toLowerCase() !== creator.trim().toLowerCase())) return 'This plan was made for another wallet. Check it again.';
  if (!chainId || plan.steps.some(s => s.tx.chainId !== chainId)) return 'This plan is for another network. Check it again.';
  return null;
}

// Wei string → HYPE text, exact, trailing zeros trimmed.
export function hypeText(wei: string | null | undefined): string {
  if (!wei || !/^\d+$/.test(wei)) return '—';
  const v = BigInt(wei), whole = v / 10n ** 18n, frac = (v % 10n ** 18n).toString().padStart(18, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : `${whole}`;
}
export function totalValue(plan: MontraPlan): string {
  return plan.steps.reduce((sum, s) => sum + BigInt(s.tx.value || '0'), 0n).toString();
}
export function collectTx(adapter: string, chainId: number, from?: string): Tx {
  return { to: adapter, data: COLLECT_SELECTOR, value: '0', chainId, ...(from ? { from } : {}) };
}
