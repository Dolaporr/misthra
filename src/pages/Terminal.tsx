import {useEffect,useMemo,useRef,useState} from 'react';
import {HelpCircle,Route as RouteIcon,Search,ShieldAlert,ShieldCheck,ShieldQuestion,SlidersHorizontal,Zap} from 'lucide-react';
import {STAGES,age,hype,pct,type Launch,type Stage} from '../terminal/model';
import {useLaunchFeed} from '../terminal/useLaunchFeed';
import {blankFilters,hasFilters,loadColumnFilters,matchesLaunch,PRESETS,validFilters,type ColumnFilters,type Filters,type Preset} from '../terminal/pulse-filters';
import '../terminal/pulse-next.css';

export function SourceBadge({ source }: { source?: string }) {
  if (!source) return null;
  return <span className={`source-badge ${source}`} title={source === 'live' ? 'Read from Elysium by the Misthra indexer' : 'Invented sample data for previewing the terminal. Not real launches.'}>{source === 'live' ? 'Live' : 'Simulated'}</span>;
}

export function SafetyIcon({ status }: { status: Launch['safety']['status'] }) {
  const label = { pass: 'Safety checks passed', warn: 'Some safety checks warn or are unknown', fail: 'A safety check failed', unchecked: 'Not checked yet' }[status];
  const Icon = status === 'pass' ? ShieldCheck : status === 'fail' || status === 'warn' ? ShieldAlert : ShieldQuestion;
  return <span className={`safety-icon ${status}`} title={label} aria-label={label}><Icon size={15} /></span>;
}


export function Terminal(){
  const {data,error,transport,reload}=useLaunchFeed();
  const [q,setQ]=useState(''),[tab,setTab]=useState<Stage>('new'),[focused,setFocused]=useState<string|null>(null);
  const [now,setNow]=useState(Date.now());
  const [compact,setCompact]=useState(()=>window.matchMedia('(max-width:900px)').matches);
  const [columns,setColumns]=useState<ColumnFilters>(()=>{try{return loadColumnFilters(JSON.parse(localStorage.getItem('misthra.pulse.columns')||'null'))}catch{return loadColumnFilters(null)}});
  const [open,setOpen]=useState<Partial<Record<Stage,boolean>>>({}),[help,setHelp]=useState<Stage|null>(null);
  const search=useRef<HTMLInputElement>(null);
  useEffect(()=>{try{localStorage.setItem('misthra.pulse.columns',JSON.stringify(columns))}catch{/* storage unavailable */}},[columns]);
  useEffect(()=>{const media=window.matchMedia('(max-width:900px)');const change=()=>setCompact(media.matches);media.addEventListener('change',change);const timer=window.setInterval(()=>{if(!document.hidden)setNow(Date.now())},5000);return()=>{media.removeEventListener('change',change);window.clearInterval(timer)}},[]);
  const byStage=useMemo(()=>Object.fromEntries(STAGES.map(s=>[s.key,(data?.launches||[]).filter(l=>l.stage===s.key&&matchesLaunch(l,q,columns[s.key].presets[columns[s.key].active],now))])) as Record<Stage,Launch[]>,[data,q,columns,now]);
  const keyboardCards=compact?byStage[tab]:STAGES.flatMap(s=>byStage[s.key]);
  useEffect(()=>{
    const key=(e:KeyboardEvent)=>{
      const target=e.target as HTMLElement;
      if(target.closest('input,select,textarea,[contenteditable=true]')||e.metaKey||e.ctrlKey||e.altKey)return;
      if(e.key==='/'){e.preventDefault();search.current?.focus();return}
      if(!['j','k'].includes(e.key)||target.closest('button,a,summary')&&!target.closest('.launch-main'))return;
      if(!keyboardCards.length)return;e.preventDefault();
      const current=target.closest<HTMLElement>('[data-launch]')?.dataset.launch||focused;
      const index=keyboardCards.findIndex(l=>l.address===current);
      const next=index<0?(e.key==='j'?0:keyboardCards.length-1):Math.max(0,Math.min(keyboardCards.length-1,index+(e.key==='j'?1:-1)));
      const address=keyboardCards[next].address;setFocused(address);
      const link=document.querySelector<HTMLAnchorElement>(`[data-launch="${address}"] .launch-main`);link?.focus({preventScroll:true});link?.scrollIntoView({block:'nearest'});
    };document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);
  },[keyboardCards,focused]);
  const update=(stage:Stage,patch:Partial<Filters>)=>setColumns(previous=>{const column=previous[stage];return {...previous,[stage]:{...column,presets:{...column.presets,[column.active]:{...column.presets[column.active],...patch}}}}});
  const preset=(stage:Stage,value:Preset)=>setColumns(previous=>({...previous,[stage]:{...previous[stage],active:value}}));
  const selectTab=(stage:Stage)=>{setTab(stage);document.getElementById(`pulse-tab-${stage}`)?.focus()};
  return <div className="terminal-page">
    <header className="terminal-head"><div className="terminal-title"><h1>Terminal</h1><SourceBadge source={data?.source}/></div><div className="pulse-head-actions"><a href="#/paper" className="button secondary">Paper desk</a><label className="search-input terminal-search"><Search size={16} aria-hidden="true"/><span className="sr-only">Search launches</span><input ref={search} value={q} onChange={e=>setQ(e.target.value)} placeholder="Search name, symbol or address"/><kbd>/</kbd></label></div></header>
    <div className="pulse-connection"><span role="status">{transport==='stream'?'Streaming updates':transport==='polling'?'Polling fallback · every 3 seconds':transport==='paused'?'Updates paused while hidden':'Connecting to updates…'}</span><span className="muted small">j / k move · Enter opens a focused launch</span></div>
    <p id="pulse-source-note" className={data?.source==='simulated'?'sim-note':'pulse-source-note'}>{data?.source==='simulated'?'Simulated launches, prices and activity. These are preview examples, not real launches.':data?.source==='live'?'Launch data comes from the Elysium indexer.':'Waiting for launch data.'}</p>
    {data?.source==='live'&&data.networkVerified===false&&<p className="sim-note">Live data, but the operator has not confirmed all network settings. Check the explorer before trading.</p>}
    {error&&<p className="error-text" role="alert">{data?'Showing the last available feed. ':''}{error} <button className="text-link" onClick={reload}>Retry feed</button></p>}
    <div className="pulse-tabs" role="tablist" aria-label="Launch stage">{STAGES.map((s,index)=><button key={s.key} id={`pulse-tab-${s.key}`} role="tab" aria-selected={tab===s.key} aria-controls={`pulse-panel-${s.key}`} tabIndex={tab===s.key?0:-1} className={tab===s.key?'selected':''} onClick={()=>setTab(s.key)} onKeyDown={e=>{if(['ArrowRight','ArrowLeft','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?STAGES.length-1:(index+(e.key==='ArrowRight'?1:-1)+STAGES.length)%STAGES.length;selectTab(STAGES[next].key)}}}>{s.label}<span>{byStage[s.key].length}</span></button>)}</div>
    <div className="pulse-columns">{STAGES.map(s=>{const column=columns[s.key],filters=column.presets[column.active],active=hasFilters(filters);return <section key={s.key} id={`pulse-panel-${s.key}`} className={`pulse-column${tab===s.key?' is-tab':''}`} aria-labelledby={`col-${s.key}`} role={compact?'tabpanel':undefined}>
      <div className="pulse-column-header"><h2 id={`col-${s.key}`}>{s.label}<span className="count">{byStage[s.key].length}</span></h2><button className="pulse-column-filter-toggle" aria-label={`${open[s.key]?'Hide':'Show'} ${s.label} filters`} aria-expanded={!!open[s.key]} aria-controls={`filters-${s.key}`} onClick={()=>setOpen(previous=>({...previous,[s.key]:!previous[s.key]}))}><SlidersHorizontal size={14}/>{column.active}{active&&<span className="pulse-filter-dot" aria-label="Filters active"/>}</button><button className="icon-button pulse-help-button" aria-label={`Explain ${s.label}`} aria-expanded={help===s.key} onClick={()=>setHelp(help===s.key?null:s.key)}><HelpCircle size={15}/></button></div>
      {help===s.key&&<p className="pulse-definition">{s.help}</p>}
      {open[s.key]&&<form className="column-filter-form" id={`filters-${s.key}`} aria-label={`${s.label} filters`} onSubmit={e=>e.preventDefault()}><label>Preset<select aria-label={`Preset for ${s.label}`} value={column.active} onChange={e=>preset(s.key,e.target.value as Preset)}>{PRESETS.map(p=><option key={p}>{p}</option>)}</select></label><label>Launchpad<select value={filters.pad} onChange={e=>update(s.key,{pad:e.target.value})}><option value="">All pads</option>{(data?.pads||[]).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Min liquidity (HYPE)<input inputMode="decimal" value={filters.minLiq} onChange={e=>update(s.key,{minLiq:e.target.value})} placeholder="Any"/></label><label>Min holders<input inputMode="numeric" value={filters.minHolders} onChange={e=>update(s.key,{minHolders:e.target.value})} placeholder="Any"/></label><label>Max age (hours)<input inputMode="decimal" value={filters.maxAgeH} onChange={e=>update(s.key,{maxAgeH:e.target.value})} placeholder="Any"/></label><label className="check"><input type="checkbox" checked={filters.hideFailed} onChange={e=>update(s.key,{hideFailed:e.target.checked})}/>Hide failed safety</label><p>Saved here for this column and preset.</p>{!validFilters(filters)&&<p className="error-text" role="alert">Use non-negative numbers and a whole number of holders.</p>}<button type="button" className="button subtle" onClick={()=>update(s.key,{...blankFilters})}>Reset {column.active}</button></form>}
      <div className="pulse-list">{!data&&!error&&<p className="muted small pad">Loading launches…</p>}{data&&!byStage[s.key].length&&<p className="muted small pad">{active||q?'Nothing matches these filters.':'No launches here right now.'}</p>}{byStage[s.key].map(l=><LaunchCard key={l.address} launch={l} focused={focused===l.address}/>)}</div>
    </section>})}</div>
  </div>;
}

function LaunchCard({ launch: l, focused }: { launch: Launch; focused: boolean }) {
  const href = `#/t/${l.address}`;
  return <article className={`launch-card${focused ? ' focused' : ''}${l.safety.status === 'fail' ? ' failed' : ''}`} data-launch={l.address} aria-describedby="pulse-source-note">
    <a className="launch-main" href={href} aria-label={`${l.symbol}, ${l.name}. Open launch details.`}>
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
    <a className="button primary buy" href={`${href}?buy=1`} aria-label={`Buy ${l.symbol}`}>Buy</a>
  </article>;
}
