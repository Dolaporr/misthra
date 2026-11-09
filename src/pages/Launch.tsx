import {useEffect, useRef, useState} from 'react';
import {ArrowLeft, ArrowRight, Check, ChevronDown, Copy, Flame, Plus, Trash2, Wallet, Coins, ArrowUpRight, Pencil, LockKeyhole, GitBranch} from 'lucide-react';
import {motion, useReducedMotion} from 'framer-motion';
import {RouterLookup} from './RouterStatus';
import {post} from '../api';
import {useApp,useResource} from '../state';
import {type Tx} from '../terminal/model';
import {confirmInWallet} from '../terminal/trade-flow';
import {readPartnerLink,partnerPlanFields,creatorWalletIssue,confirmedPartnerReturn,sendCreatorDeployment,type Partner} from '../terminal/partner-launch';
import {buybackUnavailable, buybackUnavailableMessage, oneHypeBucketPreview, percentToBps} from '../terminal/router-preview';
import {createBuckets, destinationLabel, isAddress, routeIssues, toggleDestination, type Bucket, type Kind, type WalletRow} from '../terminal/router-journey';
import {PadSupport, usePadSupport} from '../terminal/PadSupport';
import '../terminal/router-preview.css';
import '../terminal/router-workspace.css';

type Plan = {predictedAddress: string | null; salt: string | null; buckets: {label: string; bps: number}[]; deployTx: Tx | null; steps: string[]; reason: string | null;ref?:{id:string;name:string}|null;returnUrl?:string|null};
const DESTINATIONS = [
  {kind:'native',title:'Native HYPE wallets',text:'Send HYPE to yourself, your team or a partner.',note:'Most people want native HYPE.',Icon:Wallet},
  {kind:'wallets',title:'Wrapped HYPE (WHYPE) wallets',text:'Pay recipients in the wrapped token instead.',note:'Most people want native HYPE; choose WHYPE when the recipient needs it.',Icon:Coins},
  {kind:'buyback-burn',title:'Buy back and burn',text:'Buy your token through a compatible pool, then send it to the burn address.',note:'Every swap uses a price guard. Requires a supported pool.',Icon:Flame},
] as const;
const STAGES = [
  {label:'Creator',title:'Start with your creator wallet.',text:'This wallet deploys the router and binds your token. Prepare your route now; connect when you are ready to sign.'},
  {label:'Destinations',title:'Where should your fees go?',text:'Choose how your creator fees are used. Keep it simple with one destination, or combine a few.'},
  {label:'Allocation',title:'Make the split yours.',text:'Allocate 100% across your destinations. Within each wallet destination, recipient shares also add up to 100%.'},
  {label:'Review',title:'One last look. Your rules.',text:'Review every recipient and share before checking the deployment plan. Checking a plan does not move funds.'},
];
function RouteDiagram(){return <svg className="router-hero-diagram" viewBox="0 0 350 180" aria-hidden="true"><path className="route-wire" d="M44 90H164M164 90V34H286M164 90H286M164 90V146H286"/><circle cx="44" cy="90" r="22"/><path className="route-mark" d="M48 77a13 13 0 0 0 0 26M40 77a13 13 0 0 1 0 26"/><circle cx="286" cy="34" r="7"/><circle cx="286" cy="90" r="7"/><circle cx="286" cy="146" r="7"/><text x="202" y="23">HYPE wallets</text><text x="202" y="79">WHYPE wallets</text><text x="202" y="135">Buyback &amp; burn</text></svg>}

export function Launch(){
  const {identity,config,notify,openWallet}=useApp();
  const [link]=useState(()=>readPartnerLink(window.location.hash));
  const partners=useResource<{partners:Partner[]}>('/partners');
  const partner=partners.data?.partners.find(p=>p.id===link.ref);
  const active=useRef(true);
  useEffect(()=>{active.current=true;window.scrollTo({top:0,behavior:'instant'});return()=>{active.current=false}},[]);
  const reduce=useReducedMotion();
  const [creator,setCreator]=useState(link.creator||(identity.role==='wallet'&&identity.address?identity.address:''));
  const [buckets,setBuckets]=useState<Bucket[]>(createBuckets);
  const [plan,setPlan]=useState<Plan|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  const [deployed,setDeployed]=useState<string|null>(null);
  const [confirmed,setConfirmed]=useState(false),[reverted,setReverted]=useState(false);
  const [step,setStep]=useState(0);
  const [attempted,setAttempted]=useState(false);
  const [summaryOpen,setSummaryOpen]=useState(false);
  const connectedWallet=identity.role==='wallet'?identity.address:undefined;
  const activeWallet=useRef(connectedWallet);activeWallet.current=connectedWallet;
  useEffect(()=>{if(connectedWallet){setCreator(current=>current.trim()?current:connectedWallet);if(!busy&&!deployed)setPlan(null)}},[connectedWallet]);
  const support=usePadSupport();
  const [selectedPads,setSelectedPads]=useState<string[]>([]);
  const padApplied=useRef(false);
  useEffect(()=>{if(!support.data||padApplied.current)return;padApplied.current=true;if(support.data.pads.some(p=>p.id===link.pad)){setSelectedPads([link.pad]);setPlan(null);if(buybackUnavailable(support.data.pads,[link.pad]))setBuckets(bs=>bs.map(b=>b.kind==='buyback-burn'?{...b,on:false}:b))}},[support.data,link.pad]);
  const blocked=buybackUnavailable(support.data?.pads||[],selectedPads);
  const buybackMessage=buybackUnavailableMessage(support.data?.pads||[],selectedPads);
  const choosePads=(ids:string[])=>{setSelectedPads(ids);setPlan(null);if(buybackUnavailable(support.data?.pads||[],ids))setBuckets(bs=>bs.map(b=>b.kind==='buyback-burn'?{...b,on:false}:b))};
  const selectedNames=(support.data?.pads||[]).filter(p=>selectedPads.includes(p.id)).map(p=>p.name);
  const enabled=buckets.filter(b=>b.on);
  const shares=enabled.map(b=>percentToBps(b.pct));
  const total=shares.every(value=>value!==null)?shares.reduce<number>((sum,value)=>sum+value!,0):null;
  const splitValid=enabled.length>0&&total===10_000&&shares.every(value=>value!==null&&value>0);
  const issues=routeIssues(creator,buckets);
  const ready=!issues.length;
  const creatorValid=isAddress(creator);
  const walletIssue=creatorWalletIssue(creator,connectedWallet);
  const returnHref=plan?confirmedPartnerReturn(plan,partner,confirmed):null;
  const locked=busy||!!deployed;
  const currentIssues=issues.filter(issue=>issue.step===step);
  const move=(next:number)=>{setStep(next);setAttempted(false);window.requestAnimationFrame(()=>{const title=document.getElementById('router-stage-title');title?.focus({preventScroll:true});title?.scrollIntoView({block:'start',behavior:'instant'})})};
  const advance=()=>{if(currentIssues.length){setAttempted(true);return}move(step+1)};
  const update=(kind:Kind,patch:Partial<Bucket>)=>{setPlan(null);setError(null);setBuckets(bs=>bs.map(b=>b.kind===kind?{...b,...patch}:b))};
  const updateWallet=(b:Bucket,index:number,patch:Partial<WalletRow>)=>update(b.kind,{wallets:b.wallets.map((w,i)=>i===index?{...w,...patch}:w)});
  const toggle=(kind:Kind,on:boolean)=>{setPlan(null);setBuckets(bs=>toggleDestination(bs,kind,on))};
  const review=async()=>{
    if(busy||!ready)return;
    if(link.ref&&(partners.loading||partners.error)){setError('Load the partner details before checking this plan.');return}
    setBusy(true);setError(null);setPlan(null);
    try{setPlan(await post<Plan>('/router/plan',{creator:creator.trim(),...partnerPlanFields(link,partners.data?.partners||[]),buckets:enabled.map(b=>({kind:b.kind,bps:percentToBps(b.pct),...(b.kind==='buyback-burn'?{}:{wallets:b.wallets.map(w=>({address:w.address.trim(),bps:percentToBps(w.pct),editable:w.editable}))})}))}));window.requestAnimationFrame(()=>document.getElementById('router-plan-result')?.focus({preventScroll:true}))}
    catch(e){setError((e as Error).message)}finally{setBusy(false)}
  };
  const checkReceipt=async(hash:string,tx:Tx)=>{try{await confirmInWallet(hash,tx);setConfirmed(true);notify('Router deployment confirmed.')}catch(e){setError((e as Error).message);if((e as {reverted?:boolean}).reverted)setReverted(true)}};
  const deploy=async()=>{if(!plan?.deployTx||busy||deployed||walletIssue)return;setBusy(true);setError(null);try{const eth=(window as unknown as {ethereum?:{request:(args:{method:string;params?:unknown[]})=>Promise<unknown>;on?:(event:string,listener:()=>void)=>void;removeListener?:(event:string,listener:()=>void)=>void}}).ethereum;if(!eth||!config)throw new Error('Connect the creator wallet to deploy.');const hash=await sendCreatorDeployment(plan.deployTx,creator,connectedWallet,config.network.chainId,{request:args=>eth.request(args),watch:invalidate=>{if(!eth.on||!eth.removeListener)throw new Error('This wallet cannot monitor account changes. Use a compatible EVM wallet.');eth.on('accountsChanged',invalidate);eth.on('chainChanged',invalidate);return()=>{eth.removeListener?.('accountsChanged',invalidate);eth.removeListener?.('chainChanged',invalidate)}},isCurrent:()=>active.current&&activeWallet.current?.toLowerCase()===creator.trim().toLowerCase()});setDeployed(hash);notify('Router deployment sent.');await checkReceipt(hash,plan.deployTx)}catch(e){setError((e as Error).message)}finally{setBusy(false)}};
  const copy=async(text:string)=>{try{await navigator.clipboard.writeText(text);notify('Copied.')}catch{notify('Select the address and copy it manually.',true)}};
  const edit=(index:number,label:string)=><button className="router-edit-link" disabled={locked} onClick={()=>move(index)} aria-label={'Edit '+label}>Edit <Pencil size={12}/></button>;
  return <div className="page-shell launch-page router-workspace">
    {partner&&<p className="notice router-partner-banner">Setting up for <a href={partner.url} target="_blank" rel="noopener noreferrer">{partner.name}<ArrowUpRight size={13}/></a></p>}
    {link.ref&&partners.error&&<p className="error-text">Partner details could not be loaded. <button onClick={partners.reload}>Try again</button></p>}
    <header className="router-workspace-heading"><div><h1>Give your fees<br/>a destination.</h1><p>Set the split for your Elysium launch.<br/>Keep control of where the creator fees go.</p><div className="router-hero-facts"><span>1% router protocol fee</span><span>Signed by your wallet</span></div></div><RouteDiagram/></header>
    <div className="router-workspace-toolbar"><nav className="router-step-nav" aria-label="Router setup steps">{STAGES.map((stage,index)=><button key={stage.label} disabled={locked} aria-current={step===index?'step':undefined} onClick={()=>move(index)}><span className={'router-step-number'+(!issues.some(issue=>issue.step===index)&&index<3?' complete':'')}>{!issues.some(issue=>issue.step===index)&&index<3?<Check size={13} aria-hidden="true"/>:String(index+1).padStart(2,'0')}</span>{stage.label}</button>)}</nav><a href="#/terminal" className="router-terminal-link">Explore launches <ArrowUpRight size={15}/></a></div>
    <div className="router-workspace-grid"><div className="router-editor">
      <fieldset className="router-stage" aria-busy={busy} disabled={locked}>
        <legend className="sr-only">{STAGES[step].label}</legend>
        <div className="router-stage-heading"><h2 id="router-stage-title" tabIndex={-1}>{STAGES[step].title}</h2><span>{step+1} / {STAGES.length}</span></div>
        <p className="router-stage-intro">{STAGES[step].text}</p>
        <motion.div key={step} initial={reduce?false:{y:8}} animate={{y:0}} transition={{duration:.28,ease:[.16,1,.3,1]}}>
        {step===0&&<>
          <div className="router-creator-field"><label className="field-label" htmlFor="creator">Creator wallet address</label><div className="row"><input id="creator" aria-invalid={(!!creator||attempted)&&!creatorValid} aria-describedby="creator-help" value={creator} onChange={e=>{setCreator(e.target.value);setPlan(null)}} placeholder="0x…" spellCheck={false} autoComplete="off"/><button className="button secondary" onClick={()=>{if(connectedWallet){setCreator(connectedWallet);setPlan(null)}else openWallet()}}><Wallet size={15}/>{connectedWallet?'Use connected wallet':'Connect wallet'}</button></div><p id="creator-help" className="router-field-hint">Only payout addresses you mark editable can change later. The fee split is fixed when deployed.</p></div>
          <div className="router-pad-note"><h3>Your launchpad</h3><p>Choose the pads you plan to use so we can check destination compatibility.</p><details className="router-pad-disclosure"><summary><span>{selectedNames.join(', ')||'Choose a launchpad'}</span><ChevronDown size={16}/></summary><PadSupport data={support.data} error={support.error} reload={support.reload} selected={selectedPads} onSelect={choosePads}/></details><p className="router-field-hint">You can prepare a route without a pad selected. Confirm custom fee-recipient support before launching.</p></div>
          <div className="router-stage-note"><LockKeyhole size={17}/><p>Your wallet stays yours. Misthra prepares the transaction; you review and sign it.</p></div>
        </>}
        {step===1&&<div className="router-destinations">{DESTINATIONS.map(({kind,title,text,note,Icon})=>{const b=buckets.find(b=>b.kind===kind)!;const unavailable=kind==='buyback-burn'&&blocked;return <label className={'router-destination'+(b.on?' selected':'')+(unavailable?' unavailable':'')} key={kind}><input type="checkbox" checked={b.on} disabled={unavailable} onChange={e=>toggle(kind,e.target.checked)}/><span className="router-destination-symbol"><Icon size={25} strokeWidth={1.4}/></span><span className="router-destination-copy"><strong>{title}</strong><span>{text}</span><small>{unavailable?buybackMessage:note}</small></span><span className="router-destination-check" aria-hidden="true">{b.on&&<Check size={15}/>}</span></label>})}</div>}
        {step===2&&<>
          <div className="router-allocation-status"><span>Allocated <strong>{total===null?'—':total/100}%</strong></span><span>{total===10_000?'All fees assigned':total!==null&&total<10_000?`${(10_000-total)/100}% left to assign`:total!==null?'Reduce shares to 100%':'Check share values'}</span></div>
          <div className="router-allocation-track" aria-hidden="true">{enabled.map(b=><span key={b.kind} className={'router-segment '+b.kind} style={{width:Math.max(0,Math.min(100,Number(b.pct)||0))+'%'}}/>)}</div>
          <div className="router-allocations">{enabled.map(b=><section className="router-allocation" key={b.kind}><header><h3>{destinationLabel(b.kind)}</h3><label className="share"><input inputMode="decimal" value={b.pct} aria-invalid={percentToBps(b.pct)===null||(percentToBps(b.pct)??0)<=0} onChange={e=>update(b.kind,{pct:e.target.value})} aria-label={destinationLabel(b.kind)+' share in percent'}/><span>% of fees</span></label></header><p className="router-bucket-preview">From 1 HYPE of creator fees: <strong>{oneHypeBucketPreview(b.pct)??'—'} {b.kind==='wallets'?'WHYPE':'HYPE'}</strong> after the 1% protocol fee.{b.kind==='buyback-burn'?' Used for a guarded buyback.':''}</p>
            {b.kind!=='buyback-burn'&&<><div className="router-recipient-heading"><span>Recipients</span><span>Share of this destination</span></div><div className="router-recipients">{b.wallets.map((w,index)=><div className="router-recipient" key={index}><div className="router-recipient-inputs"><input value={w.address} onChange={e=>updateWallet(b,index,{address:e.target.value})} placeholder="Wallet address · 0x…" aria-label={`${destinationLabel(b.kind)}: recipient ${index+1} address`} spellCheck={false} aria-invalid={!!w.address&&!isAddress(w.address)}/><label><input inputMode="decimal" value={w.pct} onChange={e=>updateWallet(b,index,{pct:e.target.value})} aria-label={`${destinationLabel(b.kind)}: recipient ${index+1} share in percent`}/><span>%</span></label>{b.wallets.length>1&&<button className="icon-button" aria-label={`Remove ${destinationLabel(b.kind)} recipient ${index+1}`} onClick={()=>update(b.kind,{wallets:b.wallets.filter((_,i)=>i!==index)})}><Trash2 size={15}/></button>}</div><div className="router-recipient-options"><label className="check"><input type="checkbox" checked={w.editable} onChange={e=>updateWallet(b,index,{editable:e.target.checked})}/>Address editable later</label>{creatorValid&&w.address.trim().toLowerCase()!==creator.trim().toLowerCase()&&<button className="router-edit-link" onClick={()=>updateWallet(b,index,{address:creator.trim()})}>Use creator wallet</button>}</div></div>)}</div>{b.wallets.length<16&&<button className="button subtle router-add-recipient" onClick={()=>update(b.kind,{wallets:[...b.wallets,{address:'',pct:'0',editable:false}]})}><Plus size={15}/>Add recipient</button>}</>}
          </section>)}</div>{!enabled.length&&<p className="router-stage-intro">Choose a destination first. <button className="text-link" onClick={()=>move(1)}>Choose destinations</button></p>}
        </>}
        {step===3&&<>
          <section className="router-review-section"><header><h3>Creator &amp; launchpad</h3>{edit(0,'creator and launchpad')}</header><dl className="router-review-basics"><div><dt>Creator</dt><dd><code>{creator.trim()||'Not added'}</code></dd></div><div><dt>Launchpad</dt><dd>{selectedNames.join(', ')||'Not selected · confirm support before launching'}</dd></div><div><dt>Protocol fee</dt><dd>1% of incoming creator fees, taken first</dd></div></dl></section>
          <section className="router-review-section"><header><h3>Your destinations</h3>{edit(1,'destinations')}</header><p>{enabled.map(b=>destinationLabel(b.kind)).join(' · ')||'None selected'}</p></section>
          <section className="router-review-section"><header><h3>Allocation &amp; recipients</h3>{edit(2,'allocation and recipients')}</header><div className="router-review-rules">{enabled.map(b=><section key={b.kind}><h4>{destinationLabel(b.kind)}<span>{b.pct||'—'}%</span></h4>{b.kind==='buyback-burn'?<p>Uses the configured price guard. Requires a compatible pool and route.</p>:<ul>{b.wallets.map((w,i)=><li key={i}><code>{w.address.trim()||'Recipient address missing'}</code><span>{w.pct||'—'}% of destination · {w.editable?'Address editable later':'Address fixed'}</span></li>)}</ul>}</section>)}</div></section>
          {!!issues.length&&<section className="router-review-issues" aria-labelledby="router-issues-title"><h3 id="router-issues-title">A few things to finish</h3><ul>{issues.map(issue=><li key={issue.message}><button onClick={()=>move(issue.step)}>{issue.message}<ArrowUpRight size={14}/></button></li>)}</ul></section>}
          {!plan&&ready&&<p className="router-review-hint">After deployment, set the router as your launchpad’s fee recipient, then bind your token from the creator wallet.</p>}
          {error&&<p className="error-text" role="alert">{error}</p>}
          {plan&&<div className="router-checked-plan" aria-live="polite"><h3 id="router-plan-result" tabIndex={-1}><Check size={18}/>Plan checked</h3>{plan.predictedAddress?<><p>Predicted router address</p><div className="address-line"><code>{plan.predictedAddress}</code><button className="icon-button" onClick={()=>void copy(plan.predictedAddress!)} aria-label="Copy router address"><Copy size={15}/></button></div><ol className="steps">{plan.steps.map(s=><li key={s}>{s}</li>)}</ol></>:<p className="notice">{plan.reason} Your allocation is valid. Deployment stays unavailable until the factory is configured.</p>}</div>}
        </>}
        {attempted&&!!currentIssues.length&&<div className="router-step-errors" role="alert">{currentIssues.map(issue=><p key={issue.message}>{issue.message}</p>)}</div>}
        </motion.div>
      </fieldset>
      <div className="router-stage-footer"><button className="button secondary" disabled={step===0||locked} onClick={()=>move(step-1)}><ArrowLeft size={15}/>Back</button>{step<3?<button className="button primary" disabled={locked} onClick={advance}>Continue · {STAGES[step+1].label}<ArrowRight size={15}/></button>:plan?.deployTx&&!deployed?<button className="button primary" disabled={busy||!ready||!!walletIssue} onClick={deploy}>{busy?'Waiting for your wallet…':'Deploy from your wallet'}<ArrowRight size={15}/></button>:!deployed?<button className="button primary" disabled={busy||!ready||!!(link.ref&&(partners.loading||partners.error))} onClick={review}>{busy?'Checking…':!ready?`Finish ${issues.length} ${issues.length===1?'item':'items'}`:plan?'Check plan again':'Check deployment plan'}<ArrowRight size={15}/></button>:<span className="router-submitted">{confirmed?'Deployment confirmed':reverted?'Deployment reverted':'Deployment submitted'}</span>}</div>
      {step===3&&creatorValid&&walletIssue&&!deployed&&<div className="notice router-partner-status"><p>{walletIssue}</p><button className="button secondary" onClick={openWallet}>Connect creator wallet</button></div>}
      {deployed&&<section className="notice router-partner-status" aria-label="Deployment status"><p role="status">{confirmed?'Router deployment confirmed.':reverted?'Deployment reverted.':'Deployment submitted · confirmation pending.'}</p><code className="router-transaction-hash">{deployed}</code>{!confirmed&&!reverted&&<button className="button secondary" disabled={busy} onClick={async()=>{if(!plan?.deployTx)return;setBusy(true);setError(null);try{await checkReceipt(deployed,plan.deployTx)}finally{setBusy(false)}}}>{busy?'Checking confirmation…':'Check confirmation'}</button>}{reverted&&<button className="button secondary" onClick={()=>{setDeployed(null);setPlan(null);setReverted(false);setError(null)}}>Prepare a new plan</button>}{confirmed&&plan?.predictedAddress&&<><p>Router address</p><div className="address-line"><code>{plan.predictedAddress}</code><button className="icon-button" onClick={()=>void copy(plan.predictedAddress!)} aria-label="Copy confirmed router address"><Copy size={15}/></button></div>{returnHref&&<a className="button primary" href={returnHref}>Back to {plan.ref?.name}<ArrowUpRight size={15}/></a>}<a className="button secondary" href={'#/launch/'+plan.predictedAddress}>View router<ArrowRight size={15}/></a></>}</section>}
    </div>
    <aside className="router-route-summary" aria-label="Your fee route"><button className="router-summary-toggle" aria-expanded={summaryOpen} aria-controls="router-summary-body" onClick={()=>setSummaryOpen(!summaryOpen)}>Your fee route<span>{total===null?'—':total/100}% allocated</span><ChevronDown size={16}/></button><div id="router-summary-body" className={'router-summary-body'+(summaryOpen?' is-open':'')}><div className="router-summary-title"><GitBranch size={25} strokeWidth={1.4}/><h2>Your fee route</h2></div><p className="router-summary-caption">An example from <strong>1 HYPE</strong> of creator fees. A calculation, not live earnings.</p>
      <div className="router-summary-flow"><div><span>Creator fees</span><strong>1 HYPE</strong></div><ArrowRight size={16}/><div><span>After protocol fee</span><strong>0.99 HYPE</strong></div></div>
      {splitValid&&<div className="router-split-bar" role="img" aria-label="1% protocol fee; remaining 99% allocated by your chosen split"><span className="router-fee-segment" style={{width:'1%'}}/>{enabled.map(b=><span key={b.kind} className={'router-segment '+b.kind} style={{width:(percentToBps(b.pct)??0)/100*.99+'%'}}/>)}</div>}
      <dl className="router-summary-amounts"><div><dt><span className="router-summary-dot fee"/>Protocol fee</dt><dd>0.01 HYPE</dd></div>{enabled.map(b=><div key={b.kind}><dt><span className={'router-summary-dot '+b.kind}/>{destinationLabel(b.kind)}</dt><dd>{oneHypeBucketPreview(b.pct)??'—'} {b.kind==='wallets'?'WHYPE':'HYPE'}</dd></div>)}</dl>
      {!splitValid&&<p className="router-summary-warning">Allocate exactly 100% to complete this example.</p>}
      <dl className="router-summary-context"><div><dt>Creator</dt><dd>{creatorValid?creator.slice(0,6)+'…'+creator.slice(-4):'Not added yet'}</dd></div><div><dt>Launchpad</dt><dd>{selectedNames.join(', ')||'Not selected'}</dd></div><div><dt>Deployment</dt><dd>{confirmed?'Confirmed':reverted?'Reverted':deployed?'Submitted · confirmation pending':plan?.deployTx?'Plan ready for your wallet':'Not deployed'}</dd></div></dl><p className="router-fixed-rules"><LockKeyhole size={15}/><span>Your split is fixed at deployment. Only addresses you mark editable can change later.</span></p>
    </div></aside></div><RouterLookup/>
  </div>;
}
