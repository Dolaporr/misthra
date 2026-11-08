import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ExternalLink, Route as RouteIcon } from 'lucide-react';
import { post } from '../api';
import { useApp } from '../state';
import { Empty } from '../components/ui';
import { SafetyIcon, SourceBadge } from './Terminal';
import { STAGES, age, hype, pct, sendWithWallet, shortAddr, usePoll, type Bar, type Holder, type Launch, type Quote, type Trade } from '../terminal/model';

const TFS = ['15s', '1m', '5m', '15m', '1h'] as const;

export function Coin({ address }: { address: string }) {
  const { data, error } = usePoll<{ source: string; launch: Launch }>(`/launches/${address}`, 4000);
  const [tf, setTf] = useState<(typeof TFS)[number]>('1m');
  const bars = usePoll<{ bars: Bar[] }>(`/launches/${address}/candles?tf=${tf}`, 5000).data?.bars ?? [];
  const trades = usePoll<{ trades: Trade[] }>(`/launches/${address}/trades?limit=30`, 4000).data?.trades ?? [];
  const holders = usePoll<{ holders: Holder[] }>(`/launches/${address}/holders`, 15000).data?.holders ?? [];
  const wantsBuy = window.location.hash.includes('buy=1');

  if (error && !data) return <div className="page-shell"><Empty title="This launch could not be loaded."><p>{error}</p><p><a href="#/terminal">Back to the terminal</a></p></Empty></div>;
  if (!data) return <div className="page-shell"><p className="muted">Loading launch…</p></div>;
  const l = data.launch;
  const stage = STAGES.find((s) => s.key === l.stage);

  return <div className="coin-page">
    <a className="back-link" href="#/terminal"><ArrowLeft size={15} /> Terminal</a>
    <header className="coin-head">
      <span className="launch-avatar large" aria-hidden="true">{l.image ? <img src={l.image} alt="" /> : l.symbol.slice(0, 2)}</span>
      <div>
        <h1>{l.symbol} <span className="muted">{l.name}</span></h1>
        <p className="coin-meta"><SourceBadge source={data.source} /><span className="badge">{l.pad?.name ?? 'Unknown pad'}</span>{stage && <span className="badge" title={stage.help}>{stage.label}</span>}<span className="muted">Created {age(l.createdAt)} ago</span><button className="copy" onClick={() => navigator.clipboard?.writeText(l.address)} title="Copy token address">{shortAddr(l.address)}</button></p>
      </div>
      <div className="coin-price"><strong>{hype(l.priceHype, 5)} HYPE</strong><span className={(l.change1hPct ?? 0) >= 0 ? 'up' : 'down'}>{pct(l.change1hPct)} 1h</span><span className={(l.change5mPct ?? 0) >= 0 ? 'up' : 'down'}>{pct(l.change5mPct)} 5m</span></div>
      <nav className="coin-links" aria-label="External links">
        {l.links.explorer && <a href={l.links.explorer} target="_blank" rel="noreferrer">Explorer <ExternalLink size={12} /></a>}
        {l.links.pool && <a href={l.links.pool} target="_blank" rel="noreferrer">Pool <ExternalLink size={12} /></a>}
        {l.links.pad && <a href={l.links.pad} target="_blank" rel="noreferrer">{l.pad?.name} <ExternalLink size={12} /></a>}
      </nav>
    </header>

    <div className="coin-grid">
      <div className="coin-left">
        <section className="panel chart-panel" aria-label="Price chart">
          <div className="panel-head"><h2>Price in HYPE</h2><div className="tf-switch" role="group" aria-label="Timeframe">{TFS.map((t) => <button key={t} className={tf === t ? 'selected' : ''} aria-pressed={tf === t} onClick={() => setTf(t)}>{t}</button>)}</div></div>
          <Candles bars={bars} />
        </section>
        <dl className="coin-stats panel">
          {[['Market cap', `${hype(l.mcapHype)} HYPE`], ['Liquidity', `${hype(l.liquidityHype)} HYPE`], ['5m volume', `${hype(l.volume5mHype)} HYPE`], ['24h volume', `${hype(l.volume24hHype)} HYPE`], ['24h trades', l.txCount24h], ['24h traders', l.traders24h], ['Holders', l.holders], ['Top 10', l.top10Pct == null ? '–' : `${l.top10Pct}%`]].map(([k, v]) => <div key={String(k)}><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
        <section className="panel"><h2>Recent trades</h2>
          {!trades.length ? <p className="muted small">No trades recorded yet.</p> : <table className="mini-table"><thead><tr><th>Age</th><th>Side</th><th>HYPE</th><th>Tokens</th><th>Trader</th></tr></thead><tbody>
            {trades.map((t) => <tr key={`${t.tx}-${t.t}-${t.trader}`}><td>{age(t.t)}</td><td className={t.side === 'buy' ? 'up' : 'down'}>{t.side}</td><td>{hype(t.amountHype)}</td><td>{hype(t.amountToken)}</td><td>{shortAddr(t.trader)}</td></tr>)}
          </tbody></table>}
        </section>
      </div>
      <aside className="coin-right">
        <TradePanel launch={l} autoFocus={wantsBuy} />
        <section className="panel"><h2>Safety <SafetyIcon status={l.safety.status} /></h2>
          {!l.safety.checks.length ? <p className="muted small">Not checked yet.</p> : <ul className="checks">{l.safety.checks.map((c) => <li key={c.id} className={c.result}><strong>{c.label}</strong><span>{c.detail}</span></li>)}</ul>}
        </section>
        <section className="panel"><h2>Traction {l.traction && <span className="badge accent">{l.traction.score}/100</span>}</h2>
          {!l.traction ? <p className="muted small">No trades yet, so no score.</p> : <ul className="reasons">{l.traction.up.map((r) => <li key={r} className="up">{r}</li>)}{l.traction.down.map((r) => <li key={r} className="down">{r}</li>)}{!l.traction.up.length && !l.traction.down.length && <li className="muted">Nothing stands out either way.</li>}</ul>}
        </section>
        <section className="panel"><h2>AI read</h2>
          {!l.ai ? <p className="muted small">No AI read. AI reads are not connected on this server yet.</p> : <div className="ai-read"><p><span className={`grade g-${l.ai.grade}`}>{l.ai.grade}</span> <strong className="capitalize">{l.ai.verdict}</strong> · <span className="muted small">{l.ai.model}</span></p><p>{l.ai.summary}</p><p className="muted">{l.ai.thesis}</p>{!!l.ai.risks.length && <ul>{l.ai.risks.map((r) => <li key={r}>{r}</li>)}</ul>}</div>}
        </section>
        {l.router && <section className="panel"><h2><RouteIcon size={15} /> Fee router</h2><p className="muted small">Creator fees for this token go to <code>{shortAddr(l.router.address)}</code>, which splits them by fixed rules:</p><ul className="buckets">{l.router.buckets.map((b) => <li key={b.label}><span>{b.label}</span><strong>{(b.bps / 100).toFixed(2).replace(/\.00$/, '')}%</strong></li>)}</ul></section>}
        <section className="panel"><h2>Top holders</h2>
          {!holders.length ? <p className="muted small">{data.source === 'simulated' ? 'Holder balances are not simulated.' : 'No balances indexed yet.'}</p> : <ul className="holders">{holders.slice(0, 15).map((h) => <li key={h.address}><span>{shortAddr(h.address)} {h.tags.map((t) => <span key={t} className="badge">{t}</span>)}</span><strong>{h.pct}%</strong></li>)}</ul>}
        </section>
      </aside>
    </div>
  </div>;
}

function Candles({ bars }: { bars: Bar[] }) {
  const W = 760, H = 280, pad = 8;
  const shown = bars.slice(-90);
  const geo = useMemo(() => {
    if (!shown.length) return null;
    const hi = Math.max(...shown.map((b) => Number(b.h))), lo = Math.min(...shown.map((b) => Number(b.l)));
    const span = hi - lo || hi * 0.01 || 1;
    const y = (v: string) => pad + (1 - (Number(v) - lo) / span) * (H - pad * 2 - 40);
    const vmax = Math.max(...shown.map((b) => Number(b.v))) || 1;
    const step = W / Math.max(shown.length, 30);
    return { y, step, vmax, hi, lo };
  }, [shown]);
  if (!geo) return <p className="muted small chart-empty">No trades in this window yet.</p>;
  return <svg className="candles" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Price chart, ${shown.length} candles, high ${hype(geo.hi, 5)} and low ${hype(geo.lo, 5)} HYPE`} preserveAspectRatio="none">
    {shown.map((b, i) => {
      const x = i * geo.step + geo.step / 2, up = Number(b.c) >= Number(b.o);
      const top = geo.y(up ? b.c : b.o), bottom = geo.y(up ? b.o : b.c);
      const vh = (Number(b.v) / geo.vmax) * 34;
      return <g key={b.t} className={up ? 'up' : 'down'}>
        <rect x={x - geo.step * 0.35} y={H - vh} width={geo.step * 0.7} height={vh} className="vol" />
        <line x1={x} x2={x} y1={geo.y(b.h)} y2={geo.y(b.l)} />
        <rect x={x - geo.step * 0.35} y={top} width={geo.step * 0.7} height={Math.max(1, bottom - top)} />
      </g>;
    })}
  </svg>;
}

function TradePanel({ launch, autoFocus }: { launch: Launch; autoFocus: boolean }) {
  const { identity, notify, openWallet } = useApp();
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('0.5');
  const [slippage, setSlippage] = useState('1');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (autoFocus) input.current?.focus(); }, [autoFocus]);
  useEffect(() => { setQuote(null); setError(null); }, [side, amount, slippage, launch.address]);
  const slippageBps = Math.round(Number(slippage) * 100);
  const valid = /^\d+(\.\d{1,18})?$/.test(amount) && Number(amount) > 0 && slippageBps >= 1 && slippageBps <= 5000;

  const getQuote = async () => {
    setBusy(true); setError(null);
    try { setQuote(await post<Quote>('/trade/quote', { token: launch.address, side, amount, slippageBps, ...(identity.address && identity.role === 'wallet' ? { wallet: identity.address } : {}) })); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const execute = async () => {
    if (!quote?.tx) return;
    setBusy(true); setError(null);
    try {
      const approvals = quote.approvals?.length ? quote.approvals : quote.approveTx ? [quote.approveTx] : [];
      for (const approval of approvals) { await sendWithWallet(approval); notify('Approval sent. Confirm the next step in your wallet.'); }
      const hash = await sendWithWallet(quote.tx);
      notify(`Transaction sent: ${hash.slice(0, 10)}…`); setQuote(null);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const paper = async () => {
    if (!identity.address) { openWallet(); return; }
    setBusy(true); setError(null);
    try { const r = await post<{ fill: { tokens: number; hype: number } }>('/paper/fill', { token: launch.address, side, amount, slippageBps }); notify(`Paper ${side}: ${hype(r.fill.tokens)} ${launch.symbol} for ${hype(r.fill.hype)} HYPE.`); setQuote(null); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return <section className="panel trade-panel" aria-label={`Trade ${launch.symbol}`}>
    <div className="side-switch" role="group" aria-label="Side">{(['buy', 'sell'] as const).map((s) => <button key={s} className={side === s ? `selected ${s}` : ''} aria-pressed={side === s} onClick={() => setSide(s)}>{s === 'buy' ? 'Buy' : 'Sell'}</button>)}</div>
    <label className="field-label" htmlFor="trade-amount">{side === 'buy' ? 'Amount in HYPE' : `Amount in ${launch.symbol}`}</label>
    <input id="trade-amount" ref={input} className="amount-field" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.trim())} />
    {side === 'buy' && <div className="presets">{['0.1', '0.5', '1', '5'].map((p) => <button key={p} className={amount === p ? 'selected' : ''} onClick={() => setAmount(p)}>{p}</button>)}</div>}
    <label className="field-label inline" htmlFor="trade-slippage">Slippage %<input id="trade-slippage" inputMode="decimal" value={slippage} onChange={(e) => setSlippage(e.target.value.trim())} /></label>
    <button className="button primary full" disabled={!valid || busy} onClick={getQuote}>{busy && !quote ? 'Quoting…' : 'Get quote'}</button>
    {quote && <div className="quote" aria-live="polite">
      <dl><div><dt>You receive</dt><dd>{hype(quote.amountOut)} {side === 'buy' ? launch.symbol : 'HYPE'}</dd></div><div><dt>At least</dt><dd>{hype(quote.minOut)}</dd></div><div><dt>{quote.via === 'agora' ? 'Agora fee' : `Misthra fee${quote.feeBps != null ? ` (${(quote.feeBps / 100).toFixed(2).replace(/0$/, '')}%)` : ''}`}</dt><dd>{quote.feeHype == null ? 'Included in the quote' : `${hype(quote.feeHype)} HYPE`}</dd></div><div><dt>Price impact</dt><dd>{quote.priceImpactBps == null ? '–' : `${(quote.priceImpactBps / 100).toFixed(2)}%`}</dd></div><div><dt>Route</dt><dd>{quote.route}</dd></div></dl>
      {quote.tx ? <button className="button primary full" disabled={busy} onClick={execute}>{(quote.approvals?.length || quote.approveTx) ? 'Approve, then swap in wallet' : 'Confirm in wallet'}</button>
        : <><p className="muted small">{quote.reason}</p>{quote.source === 'simulated' && <button className="button secondary full" disabled={busy} onClick={paper}>{identity.address ? 'Paper fill (simulated)' : 'Sign in for a paper fill'}</button>}</>}
    </div>}
    {error && <p className="error-text" role="alert">{error}</p>}
    <p className="muted small">Misthra never holds your keys. Real trades are signed in your own wallet. Stop-losses are not offered: they would need someone to sell while you are away.</p>
  </section>;
}
