import { useState } from 'react';
import { ArrowLeft, ExternalLink, Route as RouteIcon } from 'lucide-react';
import { TradePanel } from '../terminal/TradePanel';
import { CandleChart } from '../terminal/CandleChart';
import { CoinPaperPosition } from '../terminal/PaperPositions';
import { Empty } from '../components/ui';
import { SafetyIcon, SourceBadge } from './Terminal';
import { STAGES, age, hype, pct, shortAddr, usePoll, type Bar, type Holder, type Launch, type Trade } from '../terminal/model';

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
        <p className="coin-meta"><SourceBadge source={data.source} /><span className="badge">{l.pad?.name ?? 'Unknown pad'}</span>{stage && <span className="badge" title={stage.help}>{stage.label}</span>}<span className="muted">Created {age(l.createdAt)} ago</span><button className="copy" onClick={() => navigator.clipboard?.writeText(l.address)} title="Copy token address" aria-label={`Copy ${l.symbol} token address`}>{shortAddr(l.address)}</button></p>
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
          <div className="panel-head"><h2>Price in HYPE</h2><div className="tf-switch" role="group" aria-label="Timeframe">{TFS.map((t) => <button key={t} id={`timeframe-${t}`} onKeyDown={e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const index=TFS.indexOf(t),next=e.key==='Home'?0:e.key==='End'?TFS.length-1:(index+(e.key==='ArrowRight'?1:-1)+TFS.length)%TFS.length;setTf(TFS[next]);document.getElementById(`timeframe-${TFS[next]}`)?.focus()}}} className={tf === t ? 'selected' : ''} aria-pressed={tf === t} onClick={() => setTf(t)}>{t}</button>)}</div></div>
          <CandleChart bars={bars} />
        </section>
        <dl className="coin-stats panel">
          {[['Market cap', `${hype(l.mcapHype)} HYPE`], ['Liquidity', `${hype(l.liquidityHype)} HYPE`], ['5m volume', `${hype(l.volume5mHype)} HYPE`], ['24h volume', `${hype(l.volume24hHype)} HYPE`], ['24h trades', l.txCount24h], ['24h traders', l.traders24h], ['Holders', l.holders], ['Top 10', l.top10Pct == null ? '–' : `${l.top10Pct}%`]].map(([k, v]) => <div key={String(k)}><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
        <section className="panel"><h2>Recent trades</h2>
          {!trades.length ? <p className="muted small">No trades recorded yet.</p> : <div className="coin-trades-scroll" tabIndex={0} role="region" aria-label="Recent trades table"><table className="mini-table"><caption className="sr-only">Recent indexed trades. Amounts in HYPE and token units.</caption><thead><tr><th scope="col">Age</th><th scope="col">Side</th><th scope="col">HYPE</th><th scope="col">Tokens</th><th scope="col">Trader</th></tr></thead><tbody>
            {trades.map((t) => <tr key={`${t.tx}-${t.t}-${t.trader}`}><td>{age(t.t)}</td><td className={t.side === 'buy' ? 'up' : 'down'}>{t.side}</td><td>{hype(t.amountHype)}</td><td>{hype(t.amountToken)}</td><td>{shortAddr(t.trader)}</td></tr>)}
          </tbody></table></div>}
        </section>
      </div>
      <aside className="coin-right">
        <TradePanel launch={l} autoFocus={wantsBuy} />
        <CoinPaperPosition token={l.address}/>
        <section className="panel"><h2>Safety <SafetyIcon status={l.safety.status} /></h2>
          {!l.safety.checks.length ? <p className="muted small">Not checked yet.</p> : <ul className="checks">{l.safety.checks.map((c) => <li key={c.id} className={c.result}><strong>{c.label}</strong><span>{c.detail}</span></li>)}</ul>}
        </section>
        <section className="panel"><h2>Traction {l.traction && <span className="badge accent">{l.traction.score}/100</span>}</h2>
          {!l.traction ? <p className="muted small">No trades yet, so no score.</p> : <ul className="reasons">{l.traction.up.map((r) => <li key={r} className="up">{r}</li>)}{l.traction.down.map((r) => <li key={r} className="down">{r}</li>)}{!l.traction.up.length && !l.traction.down.length && <li className="muted">Nothing stands out either way.</li>}</ul>}
        </section>
        <section className="panel"><h2>AI read</h2>
          {!l.ai ? <p className="muted small">No AI read. AI reads are not connected on this server yet.</p> : <div className="ai-read"><p><span className={`grade g-${l.ai.grade}`}>{l.ai.grade}</span> <strong className="capitalize">{l.ai.verdict}</strong> · <span className="muted small">{l.ai.model}</span></p><p>{l.ai.summary}</p><p className="muted">{l.ai.thesis}</p>{!!l.ai.risks.length && <ul>{l.ai.risks.map((r) => <li key={r}>{r}</li>)}</ul>}</div>}
        </section>
        {l.router && <section className="panel"><h2><RouteIcon size={15} /> Fee router</h2><p className="muted small">Creator fees for this token go to <a href={'#/launch/'+l.router.address}><code>{shortAddr(l.router.address)}</code></a>, which splits them by fixed rules:</p><ul className="buckets">{l.router.buckets.map((b) => <li key={b.label}><span>{b.label}</span><strong>{(b.bps / 100).toFixed(2).replace(/\.00$/, '')}%</strong></li>)}</ul></section>}
        <section className="panel"><h2>Top holders</h2>
          {!holders.length ? <p className="muted small">{data.source === 'simulated' ? 'Holder balances are not simulated.' : 'No balances indexed yet.'}</p> : <ul className="holders">{holders.slice(0, 15).map((h) => <li key={h.address}><span>{shortAddr(h.address)} {h.tags.map((t) => <span key={t} className="badge">{t}</span>)}</span><strong>{h.pct}%</strong></li>)}</ul>}
        </section>
      </aside>
    </div>
  </div>;
}
