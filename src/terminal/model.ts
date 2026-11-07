// Types from docs/terminal-api.md, plus small helpers shared by the terminal pages.
import { useEffect, useRef, useState } from 'react';
import { api } from '../api';

export type Source = 'live' | 'simulated';
export type Stage = 'new' | 'stretch' | 'migrated';
export type Check = { id: string; label: string; result: 'pass' | 'warn' | 'fail' | 'unknown'; detail: string };
export type Safety = { status: 'pass' | 'warn' | 'fail' | 'unchecked'; checks: Check[]; checkedAt: number | null };
export type Traction = { score: number; up: string[]; down: string[] };
export type AiRead = { grade: 'A' | 'B' | 'C' | 'D' | 'F'; verdict: 'buy' | 'watch' | 'avoid'; summary: string; thesis: string; risks: string[]; model: string; readAt: number } | null;
export type Pad = { id: string; name: string; url: string | null } | null;
export type Pool = { address: string; venue: 'uniswap-v3' | 'uniswap-v2'; fee: number | null; quote: 'WHYPE' };
export type RouterRef = { address: string; buckets: { label: string; bps: number }[] } | null;
export type Launch = {
  address: string; name: string; symbol: string; decimals: number; image: string | null;
  pad: Pad; stage: Stage; createdAt: number; createdBlock: number; creator: string; pool: Pool;
  priceHype: string; mcapHype: string; liquidityHype: string; volume5mHype: string; volume24hHype: string;
  txCount24h: number; traders24h: number; holders: number; top10Pct: number | null;
  change5mPct: number | null; change1hPct: number | null;
  traction: Traction | null; safety: Safety; ai: AiRead; router: RouterRef;
  links: { explorer: string | null; pad: string | null; pool: string | null };
};
export type Feed = { source: Source; indexedBlock: number; updatedAt: number; pads: NonNullable<Pad>[]; launches: Launch[] };
export type Bar = { t: number; o: string; h: string; l: string; c: string; v: string };
export type Trade = { tx: string; t: number; side: 'buy' | 'sell'; trader: string; amountHype: string; amountToken: string };
export type Holder = { address: string; pct: number; tags: string[] };
export type Tx = { to: string; data: string; value: string; chainId: number | null; from?: string };
export type Quote = { source: Source; amountOut: string; minOut: string; priceImpactBps: number | null; route: string; tx: Tx | null; approveTx: Tx | null; reason: string | null };
export type AlertRule = { id: string; kind: 'launch' | 'stage' | 'wallet'; pad?: string; minVolumeHype?: number; maxAgeMin?: number; minHolders?: number; token?: string; wallet?: string; createdAt: number };
export type AlertEvent = { id: string; ruleId: string; at: number; title: string; detail: string; token: string | null };

export const STAGES: { key: Stage; label: string; help: string }[] = [
  { key: 'new', label: 'New pools', help: 'HYPE-quoted pools created in the last 6 hours that have not met the Final stretch criteria.' },
  { key: 'stretch', label: 'Final stretch', help: 'At least 25 holders, 50 HYPE traded in 24 hours and 20 HYPE of liquidity.' },
  { key: 'migrated', label: 'HyperCore', help: 'Has a HyperCore spot market. Taken from a reviewed list until Kinetiq’s hooks ship.' },
];

// Polls a path, pausing while the tab is hidden. Keeps the last good data on errors.
export function usePoll<T>(path: string | null, ms = 3000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    if (!path) { setData(null); return; }
    let timer: number | undefined;
    const run = async () => {
      if (document.hidden) { timer = window.setTimeout(run, ms); return; }
      try { const d = await api<T>(path); if (alive.current) { setData(d); setError(null); } }
      catch (e) { if (alive.current) setError((e as Error).message); }
      if (alive.current) timer = window.setTimeout(run, ms);
    };
    run();
    return () => { alive.current = false; window.clearTimeout(timer); };
  }, [path, ms]);
  return { data, error };
}

export function hype(value: string | number, digits = 4) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return '0';
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  if (Math.abs(n) >= 1) return n.toFixed(2).replace(/\.?0+$/, '');
  const zeros = Math.max(0, -Math.floor(Math.log10(Math.abs(n))) - 1);
  return n.toFixed(Math.min(18, zeros + digits)).replace(/0+$/, '');
}
export function age(createdAt: number, now = Date.now()) {
  const s = Math.max(0, Math.floor((now - createdAt) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}
export const pct = (n: number | null) => (n == null ? '–' : `${n > 0 ? '+' : ''}${n.toFixed(1)}%`);
export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

// Sends an unsigned transaction with the injected wallet. Never signs on the server.
type Eth = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };
export async function sendWithWallet(tx: Tx): Promise<string> {
  const eth = (window as unknown as { ethereum?: Eth }).ethereum;
  if (!eth) throw new Error('No browser wallet found. Install or unlock one to sign this transaction.');
  const [from] = (await eth.request({ method: 'eth_requestAccounts' })) as string[];
  if (tx.chainId) {
    const current = Number(await eth.request({ method: 'eth_chainId' }));
    if (current !== tx.chainId) await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: `0x${tx.chainId.toString(16)}` }] });
  }
  const value = `0x${BigInt(tx.value || '0').toString(16)}`;
  return (await eth.request({ method: 'eth_sendTransaction', params: [{ from: tx.from ?? from, to: tx.to, data: tx.data, value }] })) as string;
}
