import {createContext,useContext,useEffect,useMemo,useRef,useState} from 'react';
import {Activity,ArrowUpRight,ChevronDown,Columns3,HelpCircle,Pause,Play,RefreshCw,Route as RouteIcon,Search,ShieldAlert,ShieldCheck,ShieldQuestion,SlidersHorizontal,Star,Users,Wallet,Zap} from 'lucide-react';
import {STAGES,age,hype,pct,type Feed,type Launch,type Source,type Stage} from '../terminal/model';
import {useLaunchFeed} from '../terminal/useLaunchFeed';
import {blankFilters,hasFilters,loadColumnFilters,matchesLaunch,PRESETS,validFilters,type ColumnFilters,type Filters,type Preset} from '../terminal/pulse-filters';
import {readPulseView,sortLaunches,toggleWatch,type PulseSort,type PulseView} from '../terminal/pulse-view';
import {PoolVenue} from '../terminal/PoolVenue';
import {tradeAccess} from '../terminal/trade-access';
import {validQuickAmount} from '../terminal/quick-amount';
import {MarketCap,UsdProvider} from '../terminal/MarketCap';
import {TokenArtwork} from '../terminal/TokenArtwork';
import {DisplayPanel,useTerminalDisplay} from '../terminal/TerminalDisplay';
import {PulseFiltersPanel} from '../terminal/PulseFiltersPanel';
import {readTerminalSection} from '../terminal/TerminalDock';
import {openTokenSearch} from '../terminal/TokenSearch';
import {TerminalNavigation,TerminalWelcome,TerminalSectionContent,type TerminalSection} from '../terminal/TerminalSections';
import '../terminal/pulse-next.css';
import '../terminal/pulse-workspace.css';

export function SourceBadge({source}:{source?:string}){
  if(source!=='live'&&source!=='simulated')return <span className="source-badge unavailable">Source unavailable</span>;
  return <span className={`source-badge ${source}`} title={source==='live'?'Read from Elysium by the Misthra indexer':'Invented preview data, not real launches.'}>{source==='live'?'Live':'Simulated'}</span>;
}
export function SafetyIcon({status}:{status:Launch['safety']['status']}){
  const label={pass:'Safety checks passed',warn:'Some safety checks warn or are unknown',fail:'A safety check failed',unchecked:'Not checked yet'}[status];
  const Icon=status==='pass'?ShieldCheck:status==='fail'||status==='warn'?ShieldAlert:ShieldQuestion;
  return <span className={`safety-icon ${status}`} title={label} role="img" aria-label={label}><Icon size={14} aria-hidden="true"/></span>;
}
const filterCount=(filters:Filters)=>Object.entries(filters).filter(([key,value])=>value!==blankFilters[key as keyof Filters]).length;
const QuickAmount=createContext<string|null>(null);

export function Terminal(){
  const [section,setSectionState]=useState<TerminalSection>(readTerminalSection);
  const setSection=(value:TerminalSection)=>{setSectionState(value);window.location.hash='/terminal?view='+value};
  useEffect(()=>{const update=()=>setSectionState(readTerminalSection());window.addEventListener('hashchange',update);return()=>window.removeEventListener('hashchange',update)},[]);
  const {display}=useTerminalDisplay();const [displayOpen,setDisplayOpen]=useState(false),[filterStage,setFilterStage]=useState<Stage|null>(null);
  const {data,error,transport,reload}=useLaunchFeed();
  const [frozen,setFrozen]=useState<Feed|null>(null);
  const [reading,setReading]=useState<Feed|null>(null);
  const readingReasons=useRef({hover:false,focus:false});
  const hold=(kind:'hover'|'focus',value:boolean)=>{if(!display.pauseOnRead)return;readingReasons.current[kind]=value;setReading(previous=>readingReasons.current.hover||readingReasons.current.focus?previous||data:null)};
  const feed=frozen||reading||data;
  const [quick,setQuick]=useState(false),[quickAmount,setQuickAmount]=useState(()=>{try{const value=localStorage.getItem('misthra.quick.amount');return validQuickAmount(value)?value:'0.5'}catch{return '0.5'}});
  useEffect(()=>{if(validQuickAmount(quickAmount))try{localStorage.setItem('misthra.quick.amount',quickAmount)}catch{}},[quickAmount]);
  const [tab,setTab]=useState<Stage>('new'),[focused,setFocused]=useState<string|null>(null);
  const [watchOnly,setWatchOnly]=useState(false);
  const [view,setView]=useState<PulseView>(()=>{try{return readPulseView(JSON.parse(localStorage.getItem('misthra.pulse.view')||'null'))}catch{return readPulseView(null)}});
  const [saved,setSaved]=useState(true),[now,setNow]=useState(Date.now());
  const [phone,setPhone]=useState(()=>window.matchMedia('(max-width:900px)').matches);
  const [columns,setColumns]=useState<ColumnFilters>(()=>{try{return loadColumnFilters(JSON.parse(localStorage.getItem('misthra.pulse.columns')||'null'))}catch{return loadColumnFilters(null)}});
  const [help,setHelp]=useState<Stage|null>(null);
  const search=useRef<HTMLButtonElement>(null);
  useEffect(()=>{try{localStorage.setItem('misthra.pulse.columns',JSON.stringify(columns))}catch{setSaved(false)}},[columns]);
  useEffect(()=>{try{localStorage.setItem('misthra.pulse.view',JSON.stringify(view))}catch{setSaved(false)}},[view]);
  useEffect(()=>{const media=window.matchMedia('(max-width:900px)');const change=()=>setPhone(media.matches);media.addEventListener('change',change);const timer=window.setInterval(()=>{if(!document.hidden&&!frozen&&!readingReasons.current.hover&&!readingReasons.current.focus)setNow(Date.now())},5000);return()=>{media.removeEventListener('change',change);window.clearInterval(timer)}},[frozen]);
  const byStage=useMemo(()=>Object.fromEntries(STAGES.map(s=>[s.key,sortLaunches((feed?.launches||[]).filter(l=>l.stage===s.key&&matchesLaunch(l,'',columns[s.key].presets[columns[s.key].active],now)&&(!watchOnly||view.watched.includes(l.address.toLowerCase()))),view.sort)])) as Record<Stage,Launch[]>,[feed,columns,now,view.sort,view.watched,watchOnly]);
  const keyboardRows=phone?byStage[tab]:STAGES.flatMap(s=>byStage[s.key]);
  useEffect(()=>{
    const key=(e:KeyboardEvent)=>{
      if(section!=='pulse')return;
      const target=e.target as HTMLElement;
      if(target.closest('input,select,textarea,[contenteditable=true]')||e.metaKey||e.ctrlKey||e.altKey)return;
      if(e.key==='/'){e.preventDefault();openTokenSearch();return}
      if(!['j','k'].includes(e.key)||target.closest('button,a,summary')&&!target.closest('.launch-main')||!keyboardRows.length)return;
      e.preventDefault();const current=target.closest<HTMLElement>('[data-launch]')?.dataset.launch||focused;
      const index=keyboardRows.findIndex(l=>l.address===current);
      const next=index<0?(e.key==='j'?0:keyboardRows.length-1):Math.max(0,Math.min(keyboardRows.length-1,index+(e.key==='j'?1:-1)));
      const address=keyboardRows[next].address;setFocused(address);
      const link=document.querySelector<HTMLAnchorElement>(`[data-launch="${address}"] .launch-main`);link?.focus({preventScroll:true});link?.scrollIntoView({block:'nearest'});
    };document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);
  },[keyboardRows,focused,section]);
  const update=(stage:Stage,patch:Partial<Filters>)=>setColumns(previous=>{const column=previous[stage];return {...previous,[stage]:{...column,presets:{...column.presets,[column.active]:{...column.presets[column.active],...patch}}}}});
  const preset=(stage:Stage,value:Preset)=>setColumns(previous=>({...previous,[stage]:{...previous[stage],active:value}}));
  const selectTab=(stage:Stage)=>{setTab(stage);document.getElementById(`pulse-tab-${stage}`)?.focus()};
  const toggle=(address:string)=>setView(previous=>({...previous,watched:toggleWatch(previous.watched,address)}));
  const connection=frozen?'List frozen':reading?'Paused while reading':transport==='stream'?'Streaming':transport==='polling'?'Polling · 3s':transport==='paused'?'Updates paused while hidden':'Connecting';

  if(section!=='pulse')return <><TerminalNavigation selected={section} onSelect={setSection}/><TerminalSectionContent section={section} data={data} error={error} onDiscover={()=>setSection('pulse')}/></>;
  return <UsdProvider snapshot={feed}><><TerminalNavigation selected={section} onSelect={setSection}/><TerminalWelcome/><div className={'terminal-page pulse-workspace'+(display.compact?' is-compact':'')}>
    <header className="terminal-head"><div className="terminal-title"><Activity size={22} strokeWidth={1.5}/><h1>Pulse</h1><span className="pulse-network">Elysium</span></div><div className="pulse-head-actions"><button ref={search} className="search-input terminal-search" onClick={openTokenSearch}><Search size={16}/><span>Search token or contract address</span><kbd>/</kbd></button><button className="pulse-display-button" onClick={()=>setDisplayOpen(true)}><Columns3 size={15}/>Display<ChevronDown size={12}/></button></div></header>
    <div id="pulse-source-note" className={'pulse-data-banner '+(feed?.source||'unavailable')}><SourceBadge source={feed?.source}/><p>{frozen?'List frozen. Resume to see the latest feed.':feed?.source==='simulated'?'Preview launches, prices and activity. Paper trading only.':feed?.source==='live'?'Elysium indexer data. Trade availability is shown for each pool.':'Waiting for launch data.'}</p></div>
    {feed?.source==='live'&&feed.networkVerified===false&&<p className="sim-note">The operator has not confirmed all network settings. Check the explorer before trading.</p>}
    {error&&<p className="error-text" role="alert">{feed?'Showing the last available feed. ':''}{error}<button className="text-link" onClick={reload}>Retry feed</button></p>}
    <div className="pulse-toolbar"><div className="pulse-view-switch" role="group" aria-label="Launch list"><button aria-pressed={!watchOnly} onClick={()=>setWatchOnly(false)}>All launches</button><button aria-label="Watchlist" title="Watchlist" aria-pressed={watchOnly} onClick={()=>setWatchOnly(true)}><Star size={15}/><span className="control-label">Watchlist</span><span>{view.watched.length}</span></button><a href="#/paper" aria-label="Open paper desk" title="Paper desk"><Wallet size={16}/><span className="control-label">Paper desk</span></a></div><div className="pulse-toolbar-actions"><label className="pulse-sort"><span className="sr-only">Sort launches</span><select aria-label="Sort launches" value={view.sort} onChange={e=>setView(previous=>({...previous,sort:e.target.value as PulseSort}))}><option value="age">Newest first</option><option value="volume">5m volume</option><option value="mcap">Market cap</option></select></label><button className={frozen?'pulse-freeze frozen':'pulse-freeze'} disabled={!data} onClick={()=>setFrozen(previous=>previous?null:data)} aria-label={frozen?'Resume launch list':'Freeze launch list'}>{frozen?<Play size={13}/>:<Pause size={13}/>}<span className="control-label">{frozen?'Resume':'Freeze'}</span></button></div></div>
    <div className="pulse-quick-tools"><label className="check"><input type="checkbox" checked={quick} onChange={e=>setQuick(e.target.checked)}/>Quick amount</label>{quick&&<label>HYPE<input aria-label="Quick buy amount in HYPE" inputMode="decimal" value={quickAmount} onChange={e=>setQuickAmount(e.target.value)} aria-invalid={!validQuickAmount(quickAmount)}/></label>}<span>{quick&&!validQuickAmount(quickAmount)?'Enter a positive amount, up to 18 decimals.':quick?'Opens a quote to review. No automatic signing.':'Lists hold their position while you hover or focus.'}</span></div>
    <div className="pulse-tabs" role="tablist" aria-label="Launch stage">{STAGES.map((s,index)=><button key={s.key} id={`pulse-tab-${s.key}`} role="tab" aria-selected={tab===s.key} aria-controls={`pulse-panel-${s.key}`} tabIndex={tab===s.key?0:-1} onClick={()=>setTab(s.key)} onKeyDown={e=>{if(['ArrowRight','ArrowLeft','Home','End'].includes(e.key)){e.preventDefault();selectTab(STAGES[e.key==='Home'?0:e.key==='End'?STAGES.length-1:(index+(e.key==='ArrowRight'?1:-1)+STAGES.length)%STAGES.length].key)}}}>{s.label}<span>{byStage[s.key].length}</span></button>)}</div>
    <QuickAmount.Provider value={quick&&validQuickAmount(quickAmount)?quickAmount:null}><div className="pulse-reading-area" onMouseEnter={()=>hold('hover',true)} onMouseLeave={()=>hold('hover',false)} onFocus={()=>hold('focus',true)} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))hold('focus',false)}}>
    <div className="pulse-columns">{STAGES.map(s=>{const column=columns[s.key],filters=column.presets[column.active],active=hasFilters(filters);return <section key={s.key} id={`pulse-panel-${s.key}`} className={`pulse-column${tab===s.key?' is-tab':''}`} aria-labelledby={`col-${s.key}`} role={phone?'tabpanel':undefined}>
      <header className="pulse-column-heading"><div><h2 id={`col-${s.key}`}>{s.label}<span>{byStage[s.key].length}</span></h2><button className="icon-button pulse-help-button" aria-label={`Explain ${s.label}`} aria-expanded={help===s.key} onClick={()=>setHelp(help===s.key?null:s.key)}><HelpCircle size={14}/></button></div><div className="pulse-column-settings"><div className="pulse-presets" role="group" aria-label={`${s.label} filter presets`}>{PRESETS.map(p=><button key={p} aria-pressed={column.active===p} onClick={()=>preset(s.key,p)}>{p}</button>)}</div><button className="pulse-column-filter-toggle" aria-label={`Show ${s.label} filters`} aria-expanded={filterStage===s.key} onClick={()=>setFilterStage(s.key)}><SlidersHorizontal size={14}/>Filters{active&&<span>{filterCount(filters)}</span>}</button></div></header>
      {help===s.key&&<p className="pulse-definition">{s.help}</p>}
      <div className="pulse-list" tabIndex={0} role="region" aria-label={`${s.label} launches`}>{!feed&&!error&&<div className="pulse-list-empty"><Activity size={24}/><p>Loading launches…</p></div>}{feed&&!byStage[s.key].length&&<div className="pulse-list-empty">{watchOnly?<Star size={24}/>:<Search size={24}/>}<strong>{watchOnly?'No saved launches here':active?'No matches':'No launches yet'}</strong><p>{watchOnly?'Star a launch to find it here.':active?'Adjust this column’s filters.':'New indexed pools will appear here.'}</p>{(active)&&<button onClick={()=>{update(s.key,{...blankFilters})}}>Clear filters</button>}</div>}{byStage[s.key].map(l=><PulseRow key={l.address} launch={l} source={feed?.source} focused={focused===l.address} watched={view.watched.includes(l.address.toLowerCase())} onWatch={()=>toggle(l.address)}/>)}</div>
    </section>})}</div>
    </div></QuickAmount.Provider>
    <div className="pulse-statusbar"><span><span className={'pulse-transport-dot '+transport}/><span role="status">{connection}</span>{feed&&<span className="pulse-updated">Updated {new Date(feed.updatedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</span>}</span><span className="pulse-key-help">j / k navigate · / search · MC in USD · Volume in HYPE</span><button disabled={!!frozen} aria-label="Refresh launch feed" onClick={reload}><RefreshCw size={12}/>Refresh</button></div>
  {displayOpen&&<DisplayPanel onClose={()=>setDisplayOpen(false)}/>} {filterStage&&<PulseFiltersPanel initialStage={filterStage} columns={columns} pads={feed?.pads||[]} onApply={setColumns} onClose={()=>setFilterStage(null)}/>}</div></></UsdProvider>;
}

function PulseRow({launch:l,source,focused,watched,onWatch}:{launch:Launch;source?:Source;focused:boolean;watched:boolean;onWatch:()=>void}){
  const href=`#/t/${l.address}`,access=tradeAccess(source,l.trade);
  const quickAmount=useContext(QuickAmount);
  return <article className={'pulse-token-row'+(focused?' focused':'')} data-launch={l.address} aria-describedby="pulse-source-note">
    <a className="launch-main" href={href} aria-label={`${l.symbol}, ${l.name}. Open launch details.`}><span className="launch-avatar" aria-hidden="true"><TokenArtwork image={l.image} symbol={l.symbol}/></span><span className="launch-names"><strong>{l.symbol}<span className="pulse-token-age">{age(l.createdAt)}</span></strong><span className="pulse-token-name">{l.name}</span><span className="pulse-token-venue"><span className="pulse-token-pad" title={l.pad?.name||'Pad not detected'}>{l.pad?.name||'Pad not detected'}</span><PoolVenue pool={l.pool}/></span></span></a>
    <dl className="pulse-market-numbers"><div><dt>MC · USD</dt><dd><MarketCap value={l.mcapUsd}/></dd></div><div><dt>5m vol</dt><dd>{hype(l.volume5mHype)}</dd></div></dl>
    <div className="pulse-row-signals"><span title={`${l.holders} holders`}><Users size={12}/><span className="sr-only">Holders </span>{l.holders}</span><span title="Share of supply held by the top 10"><span className="pulse-signal-label">T10</span>{l.top10Pct===null?'—':l.top10Pct+'%'}</span><SafetyIcon status={l.safety.status}/>{l.router&&<a className="pulse-router-signal" href={'#/launch/'+l.router.address} title="Fees go to a Misthra fee router" aria-label={`View fee router for ${l.symbol}`}><RouteIcon size={12}/></a>}</div>
    <div className="pulse-row-actions"><button className="pulse-watch-button" onClick={onWatch} aria-label={`${watched?'Unsave':'Save'} ${l.symbol}`} aria-pressed={watched} title={watched?'Remove from this device’s watchlist':'Save to this device’s watchlist'}><Star size={14} fill={watched?'currentColor':'none'}/></button><a className={'pulse-row-action'+(access.wallet&&quickAmount?' can-trade':'')} href={href+(access.quote&&quickAmount?'?buy=1&amount='+encodeURIComponent(quickAmount):'')} aria-label={`${quickAmount&&access.paper?'Paper trade':quickAmount&&access.wallet?'Review buy for':'View'} ${l.symbol}${quickAmount&&access.quote?' with '+quickAmount+' HYPE':''}`} title={access.reason||'Review a quote before signing'}>{quickAmount&&access.quote?<><Zap size={13}/>{quickAmount}</>:<ArrowUpRight size={16}/>}</a></div>
    {l.change1hPct!==null&&<span className={'pulse-row-change '+(l.change1hPct>=0?'up':'down')}>1h {pct(l.change1hPct)}</span>}
  </article>;
}
