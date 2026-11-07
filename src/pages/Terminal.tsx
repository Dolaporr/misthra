import { useEffect, useMemo, useRef, useState } from 'react';
import { HelpCircle, Route as RouteIcon, Search, ShieldAlert, ShieldCheck, ShieldQuestion, Zap } from 'lucide-react';
import { go } from '../components/ui';
import { STAGES, age, hype, pct, usePoll, type Feed, type Launch, type Stage } from '../terminal/model';

export function SourceBadge({ source }: { source?: string }) {
  if (!source) return null;
  return <span className={`source-badge ${source}`} title={source === 'live' ? 'Read from Elysium by the Misthra indexer' : 'Invented sample data for previewing the terminal. Not real launches.'}>{source === 'live' ? 'Live' : 'Simulated'}</span>;
}

export function SafetyIcon({ status }: { status: Launch['safety']['status'] }) {
  const label = { pass: 'Safety checks passed', warn: 'Some safety checks warn or are unknown', fail: 'A safety check failed', unchecked: 'Not checked yet' }[status];
  const Icon = status === 'pass' ? ShieldCheck : status === 'fail' || status === 'warn' ? ShieldAlert : ShieldQuestion;
  return <span className={`safety-icon ${status}`} title={label} aria-label={label}><Icon size={15} /></span>;
}

type Filters = { pad: string; minLiq: string; minHolders: string; maxAgeH: string; hideFailed: boolean };
const blank: Filters = { pad: '', minLiq: '', minHolders: '', maxAgeH: '', hideFailed: false };

export function Terminal() {
  const { data, error } = usePoll<Feed>('/launches?limit=200&sort=age', 3000);
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState<Filters>(() => { try { return { ...blank, ...JSON.parse(localStorage.getItem('misthra.pulse.filters') || '{}') }; } catch { return blank; } });
  const [tab, setTab] = useState<Stage>('new');
  const [focus, setFocus] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => { try { localStorage.setItem('misthra.pulse.filters', JSON.stringify(filters)); } catch { /* storage unavailable */ } }, [filters]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.launches ?? []).filter((l) =>
      (!needle || [l.symbol, l.name, l.address].some((v) => v.toLowerCase().includes(needle)))
      && (!filters.pad || l.pad?.id === filters.pad)
      && (!filters.minLiq || Number(l.liquidityHype) >= Number(filters.minLiq))
      && (!filters.minHolders || l.holders >= Number(filters.minHolders))
      && (!filters.maxAgeH || Date.now() - l.createdAt <= Number(filters.maxAgeH) * 3_600_000)
      && (!filters.hideFailed || l.safety.status !== 'fail'));
  }, [data, q, filters]);
  const byStage = (s: Stage) => visible.filter((l) => l.stage === s);
  const flat = STAGES.flatMap((s) => byStage(s.key));

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest('input,select,textarea');
      if (e.key === '/' && !typing) { e.preventDefault(); search.current?.focus(); return; }
      if (typing || e.metaKey || e.ctrlKey) return;
      if (e.key === 'j') setFocus((f) => Math.min(flat.length - 1, f + 1));
      if (e.key === 'k') setFocus((f) => Math.max(0, f - 1));
      if (e.key === 'Enter' && flat[focus]) go(`/t/${flat[focus].address}`);
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [flat, focus]);
  useEffect(() => { document.querySelector<HTMLElement>(`[data-launch="${flat[focus]?.address}"]`)?.scrollIntoView({ block: 'nearest' }); }, [focus, flat]);

  const set = (k: keyof Filters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setFilters((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }));
  const active = Object.entries(filters).some(([k, v]) => v !== blank[k as keyof Filters]);

  return <div className="terminal-page">
    <header className="terminal-head">
      <div className="terminal-title"><h1>Terminal</h1><SourceBadge source={data?.source} />{data?.source === 'live' && <span className="muted small">Block {data.indexedBlock.toLocaleString()}</span>}</div>
      <label className="search-input terminal-search"><Search size={16} aria-hidden="true" /><span className="sr-only">Search launches</span><input ref={search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, symbol or address" /><kbd>/</kbd></label>
    </header>
    <button type="button" className="button secondary filter-toggle" aria-expanded={showFilters} aria-controls="pulse-filters" onClick={() => setShowFilters((v) => !v)}>{showFilters ? 'Hide filters' : `Filters${active ? ' (on)' : ''}`}</button>
    <form id="pulse-filters" className={`pulse-filters${showFilters ? ' open' : ''}`} onSubmit={(e) => e.preventDefault()} aria-label="Pulse filters">
      <label>Pad<select value={filters.pad} onChange={set('pad')}><option value="">All pads</option>{(data?.pads ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label>Min liquidity<input inputMode="decimal" value={filters.minLiq} onChange={set('minLiq')} placeholder="HYPE" /></label>
      <label>Min holders<input inputMode="numeric" value={filters.minHolders} onChange={set('minHolders')} placeholder="0" /></label>
      <label>Max age<input inputMode="numeric" value={filters.maxAgeH} onChange={set('maxAgeH')} placeholder="hours" /></label>
      <label className="check"><input type="checkbox" checked={filters.hideFailed} onChange={set('hideFailed')} />Hide failed safety</label>
      {active && <button type="button" className="button subtle" onClick={() => setFilters(blank)}>Clear</button>}
      <span className="muted small keys" aria-hidden="true"><kbd>j</kbd><kbd>k</kbd> move · <kbd>Enter</kbd> open</span>
    </form>
    {data?.source === 'simulated' && <p className="sim-note">You are looking at simulated launches. Names, prices and trades are invented so the terminal can be previewed. Nothing here is on Elysium.</p>}
    {error && !data && <p className="error-text" role="alert">{error}</p>}
    <div className="pulse-tabs" role="tablist" aria-label="Stage">
      {STAGES.map((s) => <button key={s.key} role="tab" aria-selected={tab === s.key} className={tab === s.key ? 'selected' : ''} onClick={() => setTab(s.key)}>{s.label} <span>{byStage(s.key).length}</span></button>)}
    </div>
    <div className="pulse-columns">
      {STAGES.map((s) => <section key={s.key} className={`pulse-column${tab === s.key ? ' is-tab' : ''}`} aria-labelledby={`col-${s.key}`}>
        <h2 id={`col-${s.key}`}>{s.label}<span className="count">{byStage(s.key).length}</span><span className="help" title={s.help}><HelpCircle size={14} aria-label={s.help} /></span></h2>
        <div className="pulse-list">
          {!data && !error && <p className="muted small pad">Loading launches…</p>}
          {data && !byStage(s.key).length && <p className="muted small pad">{active || q ? 'Nothing matches these filters.' : 'No launches here right now.'}</p>}
          {byStage(s.key).map((l) => <LaunchCard key={l.address} launch={l} focused={flat[focus]?.address === l.address} />)}
        </div>
      </section>)}
    </div>
  </div>;
}

function LaunchCard({ launch: l, focused }: { launch: Launch; focused: boolean }) {
  const href = `#/t/${l.address}`;
  return <article className={`launch-card${focused ? ' focused' : ''}${l.safety.status === 'fail' ? ' failed' : ''}`} data-launch={l.address}>
    <a className="launch-main" href={href}>
      <span className="launch-avatar" aria-hidden="true">{l.image ? <img src={l.image} alt="" /> : l.symbol.slice(0, 2)}</span>
      <span className="launch-names"><strong>{l.symbol}</strong><span className="muted">{l.name}</span></span>
      <span className="launch-age" title={new Date(l.createdAt).toLocaleString()}>{age(l.createdAt)}</span>
    </a>
    <div className="launch-tags">
      <span className="badge">{l.pad?.name ?? 'Unknown pad'}</span>
      <SafetyIcon status={l.safety.status} />
      {l.router && <span className="badge accent" title="Fees go to a Misthra fee router"><RouteIcon size={12} /> Router</span>}
      <span className={`grade ${l.ai ? `g-${l.ai.grade}` : 'none'}`} title={l.ai ? `${l.ai.verdict}: ${l.ai.summary}` : 'No AI read yet'}>{l.ai ? l.ai.grade : 'Not read'}</span>
      {l.traction && <span className="traction" title={[...l.traction.up, ...l.traction.down].join(' · ') || 'Traction score'}><Zap size={12} />{l.traction.score}</span>}
    </div>
    <dl className="launch-stats">
      <div><dt>MC</dt><dd>{hype(l.mcapHype)}</dd></div>
      <div><dt>Liq</dt><dd>{hype(l.liquidityHype)}</dd></div>
      <div><dt>5m vol</dt><dd>{hype(l.volume5mHype)}</dd></div>
      <div><dt>Holders</dt><dd>{l.holders}</dd></div>
      <div><dt>Top 10</dt><dd>{l.top10Pct == null ? '–' : `${l.top10Pct}%`}</dd></div>
      <div><dt>1h</dt><dd className={(l.change1hPct ?? 0) >= 0 ? 'up' : 'down'}>{pct(l.change1hPct)}</dd></div>
    </dl>
    <a className="button primary buy" href={`${href}?buy=1`}>Buy</a>
  </article>;
}
