import {useEffect,useRef,useState} from 'react';
import {Check,ArrowUpRight,Info} from 'lucide-react';
import {post} from '../api';
import {useApp} from '../state';
import {SourceBadge} from '../pages/Terminal';
import {hype,type Launch,type Quote} from './model';
import {confirmInWallet,quoteRoute,runTradeSteps,tradeSteps,type StepProgress} from './trade-flow';
import './trade-steps.css';
import {tradeAccess,quoteMatchesSource} from './trade-access';
import {quickAmountFromHash} from './quick-amount';
import {sendReviewedTrade,sameQuoteReview} from './quote-review';
import {exactAmount} from './router-status';
import {pendingTradeKey,readPendingTrade,receiptRecorder} from './pending-trade';

export function TradePanel({launch,autoFocus,source}:{launch:Launch;autoFocus:boolean;source:string}){
  const {identity,config,notify,openWallet}=useApp();
  const [side,setSide]=useState<'buy'|'sell'>('buy'),[amount,setAmount]=useState(()=>quickAmountFromHash(window.location.hash)),[slippage,setSlippage]=useState('1');
  const [quote,setQuote]=useState<Quote|null>(null),[progress,setProgress]=useState<StepProgress[]>([]);
  const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
  const [clock,setClock]=useState(Date.now());
  const [recovering,setRecovering]=useState(false),[recoveryNote,setRecoveryNote]=useState<string|null>(null);
  const restored=useRef('');
  const restoringInputs=useRef<string|null>(null);
  const inputKey=[side,amount,slippage,launch.address,identity.address,source,launch.trade?.misthra].join(':');
  const input=useRef<HTMLInputElement>(null),request=useRef(0);
  const access=tradeAccess(source,launch.trade);
  useEffect(()=>{if(autoFocus)input.current?.focus()},[autoFocus]);
  useEffect(()=>{if(restoringInputs.current===inputKey){restoringInputs.current=null;return}restoringInputs.current=null;request.current++;setQuote(null);setProgress([]);setError(null);setBusy(false)},[inputKey]);
  useEffect(()=>{
    if(source!=='live'||identity.role!=='wallet'||!identity.address||!config)return;
    const key=pendingTradeKey(launch.address,identity.address);if(restored.current===key)return;restored.current=key;
    try{const saved=readPendingTrade(JSON.parse(sessionStorage.getItem(key)||'null'),identity.address,config.network.chainId);if(saved){restoringInputs.current=[saved.side,saved.amount,saved.slippage,launch.address,identity.address,source,launch.trade?.misthra].join(':');setSide(saved.side);setAmount(saved.amount);setSlippage(saved.slippage);setQuote(saved.quote);setProgress(saved.progress);setRecovering(true);setRecoveryNote('A submitted transaction was recovered. Check its receipt before requesting another quote.')}}catch{}
  },[launch.address,identity.address,identity.role,source,config]);
  useEffect(()=>{
    if(source!=='live'||identity.role!=='wallet'||!identity.address)return;
    const key=pendingTradeKey(launch.address,identity.address);
    if(progress.some(step=>step.status==='submitted'&&step.hash)&&quote){try{sessionStorage.setItem(key,JSON.stringify({quote,progress,side,amount,slippage}))}catch{setRecoveryNote('Receipt recovery could not be saved on this device. Keep this page open and save the transaction hash.')}}
    else if(progress.some(step=>step.hash)){try{sessionStorage.removeItem(key)}catch{}}
  },[quote,progress,side,amount,slippage,launch.address,identity.address,identity.role,source]);
  useEffect(()=>()=>{request.current++},[]);
  useEffect(()=>{if(!quote?.expiresAt)return;const timer=setInterval(()=>setClock(Date.now()),1000);setClock(Date.now());return()=>clearInterval(timer)},[quote]);
  const slippageBps=Math.round(Number(slippage)*100);
  const valid=/^\d+(\.\d{1,18})?$/.test(amount)&&Number(amount)>0&&slippageBps>=1&&slippageBps<=5000;
  const steps=quote?tradeSteps(quote):[];
  const submitted=progress.some(s=>s.status==='submitted'),locked=busy||submitted;
  const complete=steps.length>0&&progress.length===steps.length&&progress.every(s=>s.status==='confirmed');
  const reverted=progress.some(s=>s.status==='failed'&&s.hash);
  const expired=access.wallet&&(!quote?.expiresAt||quote.expiresAt<=clock);
  const next=Math.max(0,progress.findIndex(s=>s.status!=='confirmed'));
  const getQuote=async()=>{
    if(!access.quote||!valid||locked)return;
    const ticket=++request.current;setBusy(true);setError(null);setQuote(null);setProgress([]);setRecovering(false);setRecoveryNote(null);
    try{const value=await post<Quote>('/trade/quote',{token:launch.address,side,amount,slippageBps,...(identity.address&&identity.role==='wallet'?{wallet:identity.address}:{})});if(ticket===request.current){if(!quoteMatchesSource(source,value))throw new Error('The quote source changed. Refresh this coin before continuing.');setQuote(value);setProgress(tradeSteps(value).map(()=>({status:'waiting'})))}}
    catch(e){if(ticket===request.current)setError((e as Error).message)}finally{if(ticket===request.current)setBusy(false)}
  };
  const execute=async()=>{
    if(!access.wallet||!quote||!quoteMatchesSource(source,quote)||!quote.tx||busy||complete||reverted)return;
    if(identity.role!=='wallet'||!identity.address){openWallet();return}
    const ticket=request.current;setBusy(true);setError(null);
    try{
      let activeQuote=quote,activeSteps=steps;
      if(!progress.some(step=>step.hash)){
        const fresh=await post<Quote>('/trade/quote',{token:launch.address,side,amount,slippageBps,wallet:identity.address});
        if(ticket!==request.current)throw new Error('The quote changed. Request a fresh quote.');
        if(!quoteMatchesSource(source,fresh)||!fresh.tx)throw new Error('A fresh live wallet quote is unavailable.');
        setQuote(fresh);setProgress(tradeSteps(fresh).map(()=>({status:'waiting'})));
        if(!sameQuoteReview(quote,fresh)){setError('The quote changed. Review the updated amounts and steps, then continue.');return}
        activeQuote=fresh;activeSteps=tradeSteps(fresh);
      }
      const record=receiptRecorder({quote:activeQuote,progress:activeSteps.map((_,i)=>progress[i]||{status:'waiting'}),side,amount,slippage},pendingTradeKey(launch.address,identity.address),sessionStorage);
      await runTradeSteps(activeSteps,progress,{
      send:async tx=>{
        if(recovering)throw new Error('Receipt recovered. Get a fresh quote and review any remaining transaction steps.');
        if(ticket!==request.current)throw new Error('The quote changed. Request a fresh quote.');
        const eth=(window as unknown as {ethereum?:{request:(args:{method:string;params?:unknown[]})=>Promise<unknown>;on?:(event:string,listener:()=>void)=>void;removeListener?:(event:string,listener:()=>void)=>void}}).ethereum;
        if(!eth||!config)throw new Error('Reconnect your wallet before continuing.');
        return sendReviewedTrade(activeQuote,tx,identity.address!,config.network.chainId,{request:args=>eth.request(args),watch:invalidate=>{if(!eth.on||!eth.removeListener)throw new Error('This wallet cannot monitor account changes. Use a compatible EVM wallet.');eth.on('accountsChanged',invalidate);eth.on('chainChanged',invalidate);return()=>{eth.removeListener?.('accountsChanged',invalidate);eth.removeListener?.('chainChanged',invalidate)}},now:Date.now,isCurrent:()=>ticket===request.current});
      },confirm:confirmInWallet,progress:(index,state)=>{try{record(index,state)}catch{if(ticket===request.current)setRecoveryNote('Receipt recovery could not be saved on this device. Keep this page open and save the transaction hash.')}if(ticket===request.current)setProgress(previous=>previous.map((s,i)=>i===index?state:s))},
    });if(ticket===request.current)notify('Swap confirmed in your wallet.')}catch(e){if(ticket===request.current)setError((e as Error).message)}finally{if(ticket===request.current)setBusy(false)}
  };
  const paper=async()=>{
    if(!access.paper||!quote||!quoteMatchesSource(source,quote))return;
    if(!identity.address){openWallet();return}setBusy(true);setError(null);
    try{const r=await post<{fill:{tokens:number;hype:number}}>('/paper/fill',{token:launch.address,side,amount,slippageBps});notify(`Paper ${side}: ${hype(r.fill.tokens)} ${launch.symbol} for ${hype(r.fill.hype)} HYPE.`);setQuote(null)}catch(e){setError((e as Error).message)}finally{setBusy(false)}
  };
  return <section className="panel trade-panel" id="coin-trade" tabIndex={-1} aria-label={`Trade ${launch.symbol}`}>
    <div className="trade-panel-heading"><h2>{access.paper?'Paper trading':access.wallet?'Trade':'Trade on the launchpad'}</h2><SourceBadge source={source}/></div>
    {!access.quote?<div className="trade-unavailable"><Info size={20}/><p>{access.reason}</p>{access.venueUrl&&<a className="button secondary full" href={access.venueUrl} target="_blank" rel="noopener noreferrer">Trade on {launch.pad?.name||'the launchpad'}<ArrowUpRight size={15}/></a>}<p className="muted small">You can still inspect the chart, indexed activity and checks here.</p></div>:<>
    {access.paper&&<p className="trade-paper-note">{access.reason} No real funds are used.</p>}
    {recoveryNote&&<p className="trade-progress" role="status">{recoveryNote}</p>}
    <div className="side-switch" role="group" aria-label="Side">{(['buy','sell'] as const).map(s=><button key={s} className={side===s?`selected ${s}`:''} aria-pressed={side===s} disabled={locked} onClick={()=>setSide(s)}>{s==='buy'?'Buy':'Sell'}</button>)}</div>
    <label className="field-label" htmlFor="trade-amount">{side==='buy'?'Amount in HYPE':`Amount in ${launch.symbol}`}</label><input id="trade-amount" ref={input} className="amount-field" inputMode="decimal" value={amount} disabled={locked} onChange={e=>setAmount(e.target.value.trim())}/>
    {side==='buy'&&<div className="presets">{['0.1','0.5','1','5'].map(p=><button key={p} className={amount===p?'selected':''} disabled={locked} onClick={()=>setAmount(p)}>{p}</button>)}</div>}
    <label className="field-label inline" htmlFor="trade-slippage">Slippage %<input id="trade-slippage" inputMode="decimal" value={slippage} disabled={locked} onChange={e=>setSlippage(e.target.value.trim())}/></label>
    <button className="button primary full" disabled={!valid||locked} onClick={getQuote}>{busy&&!quote?'Quoting…':access.paper?'Preview paper trade':reverted?'Get fresh quote':'Get quote'}</button>
    {quote&&<div className="quote"><div className="trade-route"><strong>{quoteRoute(quote.via)}</strong><SourceBadge source={quote.source}/></div><dl><div><dt>You receive</dt><dd>{hype(quote.amountOut)} {side==='buy'?launch.symbol:'HYPE'}</dd></div><div><dt>At least</dt><dd>{hype(quote.minOut)}</dd></div><div><dt>{quote.via==='agora'?'Agora fee':`Misthra fee${quote.feeBps!=null?` (${(quote.feeBps/100).toFixed(2).replace(/0$/,'')}%)`:''}`}</dt><dd>{quote.feeHype==null?'Included in the quote':`${hype(quote.feeHype)} HYPE`}</dd></div><div><dt>Price impact</dt><dd>{quote.priceImpactBps==null?'Unavailable':`${(quote.priceImpactBps/100).toFixed(2)}%`}</dd></div><div><dt>Path</dt><dd>{quote.route}</dd></div></dl>
      {access.wallet&&quote.units&&<dl className="quote-exact" aria-label="Exact quote amounts"><div><dt>Exact input</dt><dd>{exactAmount(quote.units.amountIn,quote.units.amountInDecimals)} {side==='buy'?'HYPE':launch.symbol}</dd></div><div><dt>Exact output</dt><dd>{exactAmount(quote.units.amountOut,quote.units.amountOutDecimals)} {side==='buy'?launch.symbol:'HYPE'}</dd></div><div><dt>Exact minimum</dt><dd>{exactAmount(quote.units.minOut,quote.units.amountOutDecimals)}</dd></div><div><dt>Exact fee · HYPE</dt><dd>{exactAmount(quote.units.fee,quote.units.feeDecimals)}</dd></div></dl>}
      {access.wallet&&<p className="trade-progress">{expired?'Quote expired. Get a fresh quote before signing.':`Quote valid for ${Math.max(0,Math.ceil(((quote.expiresAt||0)-clock)/1000))}s. Refreshed before signing.`}{quote.blockNumber!=null&&<> Priced at block {quote.blockNumber}.</>}</p>}
      {access.wallet&&!!steps.length&&<>
        <ol className="trade-steps" aria-label="Wallet transaction steps">{steps.map((step,i)=>{const state=progress[i]||{status:'waiting'};return <li key={i} data-status={state.status}><span className="trade-step-number" aria-hidden="true">{state.status==='confirmed'?<Check size={13}/>:i+1}</span><div><strong>{step.label}</strong><span>Step {i+1} of {steps.length} · {({waiting:'Ready',wallet:'Awaiting wallet signature',submitted:'Submitted · awaiting confirmation',confirmed:'Confirmed',failed:state.hash?'Reverted':'Signature not completed'} as const)[state.status]}</span>{state.hash&&<code title={state.hash}>{state.hash.slice(0,12)}…{state.hash.slice(-6)}</code>}</div></li>})}</ol>
        <p className="trade-progress" role="status">{complete?'All transaction steps confirmed.':busy?`Working on step ${next+1} of ${steps.length}.`:submitted?'A transaction is pending. Check its confirmation without resending it.':`Your wallet will ask for ${steps.length} transaction${steps.length===1?'':'s'}, one at a time.`}</p>
        <button className="button primary full" disabled={busy||complete||reverted||(expired&&!submitted)} onClick={execute}>{complete?'Swap confirmed':busy?`Step ${next+1} of ${steps.length}…`:submitted?'Check confirmation':expired?'Get a fresh quote above':`Continue in wallet · step ${next+1} of ${steps.length}`}</button>
      </>}
      {!quote.tx&&<><p className="muted small">{quote.reason}</p>{quote.source==='simulated'&&<button className="button secondary full" disabled={busy} onClick={paper}>{identity.address?'Paper fill (simulated)':'Sign in for a paper fill'}</button>}</>}
    </div>}
    {error&&<p className="error-text" role="alert">{error}</p>}
    </>}
    {!access.paper&&<p className="muted small">Transactions are signed in your own wallet. No keys are held by this app.</p>}
  </section>;
}
