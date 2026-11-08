import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronDown, Copy, Flame, Plus, Trash2, Wallet as WalletIcon, Coins } from 'lucide-react';
import { post } from '../api';
import { useApp } from '../state';
import { sendWithWallet, type Tx } from '../terminal/model';
import {buybackUnavailable,oneHypeBucketPreview,percentToBps} from '../terminal/router-preview';
import '../terminal/router-preview.css';
import '../terminal/router-workspace.css';
import {PadSupport,usePadSupport} from '../terminal/PadSupport';

type Kind = 'wallets' | 'native' | 'buyback-burn';
type WalletRow = { address: string; pct: string; editable: boolean };
type Bucket = { kind: Kind; on: boolean; pct: string; wallets: WalletRow[] };
type Plan = { predictedAddress: string | null; salt: string | null; buckets: { label: string; bps: number }[]; deployTx: Tx | null; steps: string[]; reason: string | null };

const KINDS: { kind: Kind; title: string; text: string; Icon: typeof Coins }[] = [
  { kind: 'wallets', title: 'Pay wallets in WHYPE', text: 'Your share, your team’s or a partner’s, paid in wrapped HYPE.', Icon: WalletIcon },
  { kind: 'native', title: 'Pay wallets in native HYPE', text: 'The same, unwrapped to plain HYPE before it is paid.', Icon: Coins },
  { kind: 'buyback-burn', title: 'Buy back and burn', text: 'Buys your token on its pool and sends it to the burn address. Every swap is held to a price guard.', Icon: Flame },
];
const isAddr = (a: string) => /^0x[0-9a-fA-F]{40}$/.test(a.trim());
const bps = (p: string) => percentToBps(p) ?? NaN;

export function Launch() {
  const { identity, notify, openWallet } = useApp();
  const [creator, setCreator] = useState(identity.role === 'wallet' && identity.address ? identity.address : '');
  const [buckets, setBuckets] = useState<Bucket[]>(KINDS.map((k, i) => ({ kind: k.kind, on: i === 0, pct: i === 0 ? '100' : '0', wallets: [{ address: '', pct: '100', editable: true }] })));
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deployed, setDeployed] = useState<string | null>(null);
  const connectedWallet = identity.role === 'wallet' ? identity.address : undefined;

  useEffect(() => {
    if (!connectedWallet) return;
    setCreator(current => current.trim() ? current : connectedWallet);
    setPlan(null);
  }, [connectedWallet]);

  const support=usePadSupport();
  const [selectedPads,setSelectedPads]=useState<string[]>([]);
  const blocked=buybackUnavailable(support.data?.pads||[],selectedPads);
  const choosePads=(ids:string[])=>{setSelectedPads(ids);setPlan(null);if(buybackUnavailable(support.data?.pads||[],ids))setBuckets(bs=>bs.map(b=>b.kind==='buyback-burn'?{...b,on:false}:b))};

  const on = buckets.filter((b) => b.on);
  const total = on.reduce((s, b) => s + bps(b.pct), 0);
  const invalidShares = on.some(b => percentToBps(b.pct) === null || bps(b.pct) <= 0);
  const walletProblems = on.filter((b) => b.kind !== 'buyback-burn').map((b) => {
    if (b.wallets.some(w => percentToBps(w.pct) === null || bps(w.pct) <= 0)) return `${KINDS.find(k => k.kind === b.kind)!.title}: wallet shares must be above 0%, at most 100%, with up to two decimal places.`;
    const sum = b.wallets.reduce((s, w) => s + bps(w.pct), 0);
    if (b.wallets.some((w) => !isAddr(w.address))) return `${KINDS.find((k) => k.kind === b.kind)!.title}: every wallet needs a valid address.`;
    if (sum !== 10_000) return `${KINDS.find((k) => k.kind === b.kind)!.title}: wallet shares add up to ${sum / 100}%, not 100%.`;
    return null;
  }).filter(Boolean) as string[];
  const ready = isAddr(creator) && on.length > 0 && total === 10_000 && !invalidShares && !walletProblems.length;

  const update = (i: number, patch: Partial<Bucket>) => { setPlan(null); setBuckets((bs) => bs.map((b, j) => (j === i ? { ...b, ...patch } : b))); };
  const updateWallet = (i: number, w: number, patch: Partial<WalletRow>) => update(i, { wallets: buckets[i].wallets.map((x, k) => (k === w ? { ...x, ...patch } : x)) });

  const review = async () => {
    if(busy||!ready)return;
    setBusy(true); setError(null); setPlan(null);
    try {
      setPlan(await post<Plan>('/router/plan', { creator: creator.trim(), buckets: on.map((b) => ({ kind: b.kind, bps: bps(b.pct), ...(b.kind === 'buyback-burn' ? {} : { wallets: b.wallets.map((w) => ({ address: w.address.trim(), bps: bps(w.pct), editable: w.editable })) }) })) }));
      window.requestAnimationFrame(()=>document.getElementById('router-plan-result')?.focus({preventScroll:true}));
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const deploy = async () => {
    if (!plan?.deployTx) return;
    setBusy(true); setError(null);
    try { const hash = await sendWithWallet(plan.deployTx); setDeployed(hash); notify('Router deployment sent.'); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const copy = (text: string) => { navigator.clipboard?.writeText(text); notify('Copied.'); };

  const [step,setStep]=useState(0),[summaryOpen,setSummaryOpen]=useState(false);
  const titles=['Set up your router','Choose where fees go','Review your route'];
  const move=(value:number)=>{setStep(value);window.requestAnimationFrame(()=>{const title=document.getElementById('router-stage-title');title?.focus({preventScroll:true});title?.scrollIntoView({block:'start',behavior:'instant'})})};
  const selectedNames=(support.data?.pads||[]).filter(p=>selectedPads.includes(p.id)).map(p=>p.name);
  const splitValid=on.length>0&&!invalidShares&&total===10_000;
  const creatorValid=isAddr(creator);
  return <div className="page-shell launch-page router-workspace">
    <header className="router-workspace-heading"><div><h1>Set up your fee router.</h1><p>Choose where your launch’s creator fees go. Review the rules, then deploy from your own wallet.</p></div><a href="#/terminal" className="router-terminal-link">Explore launches <ArrowRight size={16}/></a></header>
    <div className="router-workspace-grid"><div className="router-editor">
      <nav className="router-step-nav" aria-label="Router setup steps">{['Setup','Fee split','Review'].map((label,index)=><button key={label} disabled={busy||!!deployed||(index===1&&!creatorValid)||(index===2&&!ready)} aria-current={step===index?'step':undefined} onClick={()=>move(index)}><span className="router-step-number">{index<step?<Check size={15} aria-hidden="true"/>:index+1}</span><span>{label}</span></button>)}</nav>
      <fieldset className="router-stage" aria-busy={busy} disabled={busy||!!deployed}>
        <legend className="sr-only">{titles[step]}</legend>
        <div className="router-stage-heading"><h2 id="router-stage-title" tabIndex={-1}>{titles[step]}</h2><span>Step {step+1} of 3</span></div>
        {step===0&&<>
          <p className="router-stage-intro">A fee router is a contract you set as the fee recipient on a compatible launchpad. Your split is fixed at deployment.</p>
          <div className="router-creator-field"><label className="field-label" htmlFor="creator">Creator wallet address</label><p>This wallet deploys the router and binds your token. It can change a payout address later only if you allow it.</p><div className="row"><input id="creator" aria-invalid={!!creator&&!creatorValid} aria-describedby="creator-help" value={creator} onChange={e=>{setCreator(e.target.value);setPlan(null)}} placeholder="0x…" spellCheck={false}/><button className="button secondary" onClick={()=>{if(connectedWallet){setCreator(connectedWallet);setPlan(null)}else openWallet()}}><WalletIcon size={15}/> {connectedWallet?'Use connected wallet':'Connect wallet'}</button></div><p id="creator-help" className={creator&&!creatorValid?'error-text':'router-field-hint'}>{creator&&!creatorValid?'Enter a valid EVM wallet address to continue.':'You can prepare the split before connecting. Your wallet signs the deployment.'}</p></div>
          <div className="router-pad-note"><h3>Check your launchpad</h3><p>The launchpad must support a custom creator-fee recipient. Current support comes from documentation and is not yet confirmed on-chain.</p><details className="router-pad-disclosure"><summary>Choose a launchpad <ChevronDown size={16}/>{selectedNames.length>0&&<span>{selectedNames.join(', ')}</span>}</summary><PadSupport data={support.data} error={support.error} reload={support.reload} selected={selectedPads} onSelect={choosePads}/></details></div>
        </>}
        {step===1&&<>
          <p className="router-stage-intro">Allocate 100% across the destinations you need. Misthra takes 1% of incoming fees first; your split applies to the remaining 99%.</p>
          <div className="router-allocation-status" role="status"><span>Allocated <strong>{Number.isFinite(total)?total/100:'—'}%</strong></span><span>{Number.isFinite(total)&&total<=10_000?(10_000-total)/100+'% unassigned':Number.isFinite(total)?'Reduce shares to 100%':'Check share values'}</span></div>
          <div className="bucket-list">{KINDS.map((k,i)=>{const b=buckets[i];return <div key={k.kind} className={'bucket'+(b.on?' on':'')}>
            <label className="bucket-toggle"><input type="checkbox" checked={b.on} disabled={k.kind==='buyback-burn'&&blocked} aria-describedby={k.kind==='buyback-burn'&&blocked?'buyback-unavailable':undefined} onChange={e=>update(i,{on:e.target.checked})}/><k.Icon size={18} aria-hidden="true"/><span><strong>{k.title}</strong><span className="muted small">{k.text}</span></span></label>
            {k.kind==='buyback-burn'&&blocked&&<p className="router-bucket-preview" id="buyback-unavailable">Buyback-and-burn is unavailable for the selected pads because their pools do not use the router’s supported Uniswap v3 route. Choose a wallet payout instead.</p>}
            {b.on&&<><label className="share">Share <input inputMode="decimal" value={b.pct} aria-invalid={percentToBps(b.pct)===null||bps(b.pct)<=0} onChange={e=>update(i,{pct:e.target.value})} aria-label={k.title+' share in percent'}/>%</label><p className="router-bucket-preview">{oneHypeBucketPreview(b.pct)===null?'Use a share above 0% and at most 100%, with up to two decimal places.':'Example: '+oneHypeBucketPreview(b.pct)+' HYPE to this bucket from 1 HYPE of fees, after the protocol fee.'}</p></>}
            {b.on&&k.kind!=='buyback-burn'&&<div className="wallet-rows">{b.wallets.map((w,wi)=><div key={wi} className="wallet-row">
              <input value={w.address} onChange={e=>updateWallet(i,wi,{address:e.target.value})} placeholder="Wallet 0x…" aria-label={k.title+': wallet '+(wi+1)+' address'} spellCheck={false} aria-invalid={!!w.address&&!isAddr(w.address)}/>
              <input className="pct" inputMode="decimal" value={w.pct} onChange={e=>updateWallet(i,wi,{pct:e.target.value})} aria-label={k.title+': wallet '+(wi+1)+' share in percent'}/><span>%</span>
              <label className="check small"><input type="checkbox" checked={w.editable} onChange={e=>updateWallet(i,wi,{editable:e.target.checked})} aria-label={k.title+': wallet '+(wi+1)+' editable later'}/>Editable later</label>
              {b.wallets.length>1&&<button className="icon-button" aria-label={k.title+': remove wallet '+(wi+1)} onClick={()=>update(i,{wallets:b.wallets.filter((_,x)=>x!==wi)})}><Trash2 size={15}/></button>}
            </div>)}{b.wallets.length<16&&<button className="button subtle" onClick={()=>update(i,{wallets:[...b.wallets,{address:'',pct:'0',editable:false}]})}><Plus size={14}/> Add wallet</button>}</div>}
          </div>})}</div>
          {!on.length&&<p className="error-text">Choose at least one destination.</p>}
          {invalidShares&&<p className="error-text">Each enabled bucket needs a share above 0%, at most 100%, with up to two decimal places.</p>}
          {walletProblems.map(problem=><p className="error-text" key={problem}>{problem}</p>)}
        </>}
        {step===2&&<>
          <p className="router-stage-intro">These are the rules you are preparing to deploy. Checking the plan does not move funds or ask your wallet to sign.</p>
          <dl className="router-review-basics"><div><dt>Creator wallet</dt><dd><code>{creator.trim()}</code></dd></div><div><dt>Launchpad</dt><dd>{selectedNames.join(', ')||'Not selected — confirm support before launching'}</dd></div><div><dt>Protocol fee</dt><dd>1% of incoming creator fees, taken first</dd></div></dl>
          <div className="router-review-rules">{on.map(b=><section key={b.kind}><h3>{KINDS.find(k=>k.kind===b.kind)!.title}<span>{b.pct}%</span></h3>{b.kind==='buyback-burn'?<p>Uses the configured price guard. Availability depends on a compatible pool and route.</p>:<ul>{b.wallets.map((w,index)=><li key={index}><code>{w.address.trim()}</code><span>{w.pct}% of this bucket · {w.editable?'Address editable later':'Address fixed'}</span></li>)}</ul>}</section>)}</div>
          {!plan&&!busy&&<p className="router-review-hint">After deployment, launch on your chosen pad with the router as fee recipient, then bind your token from the creator wallet.</p>}
          {error&&<p className="error-text" role="alert">{error}</p>}
          {plan&&<div className="router-checked-plan" aria-live="polite"><h3 id="router-plan-result" tabIndex={-1}>Plan checked</h3>{plan.predictedAddress?<><p>Predicted router address</p><div className="address-line"><code>{plan.predictedAddress}</code><button className="icon-button" onClick={()=>copy(plan.predictedAddress!)} aria-label="Copy router address"><Copy size={15}/></button></div><ol className="steps">{plan.steps.map(s=><li key={s}>{s}</li>)}</ol></>:<p className="notice">{plan.reason} Your allocation is valid. Deployment stays unavailable until the factory is configured.</p>}</div>}
        </>}
      </fieldset>
      <div className="router-stage-footer"><button className="button secondary" disabled={step===0||busy||!!deployed} onClick={()=>move(step-1)}><ArrowLeft size={15}/> Back</button>{step<2?<button className="button primary" disabled={busy||(step===0?!creatorValid:!ready)} onClick={()=>move(step+1)}>{step===0?'Continue to fee split':'Review route'}<ArrowRight size={15}/></button>:plan?.deployTx&&!deployed?<button className="button primary" disabled={busy||!ready} onClick={deploy}>{busy?'Waiting for your wallet…':'Deploy from your wallet'}<ArrowRight size={15}/></button>:!deployed?<button className="button primary" disabled={busy||!ready} onClick={review}>{busy?'Checking…':plan?'Check plan again':'Check plan'}<ArrowRight size={15}/></button>:<span className="router-submitted">Deployment submitted</span>}</div>
      {deployed&&<p className="notice" role="status">Deployment transaction submitted: <code className="router-transaction-hash">{deployed}</code>. Wait for a successful confirmation before using the predicted address. Router confirmation tracking is not connected in this preview.</p>}
    </div>
    <aside className="router-route-summary" aria-label="Your fee route"><button className="router-summary-toggle" aria-expanded={summaryOpen} aria-controls="router-summary-body" onClick={()=>setSummaryOpen(!summaryOpen)}>Your fee route <span>{Number.isFinite(total)?total/100:'—'}% allocated</span><ChevronDown size={16}/></button><div id="router-summary-body" className={'router-summary-body'+(summaryOpen?' is-open':'')}><h2>Your fee route</h2><p className="router-summary-caption">Example distribution from <strong>1 HYPE</strong> of creator fees. This is a calculation, not live earnings.</p>
      {splitValid&&<div className="router-split-bar" role="img" aria-label="1% protocol fee; remaining 99% allocated by your chosen split"><span className="router-fee-segment" style={{width:'1%'}}/>{on.map(b=><span key={b.kind} className={'router-segment '+b.kind} style={{width:bps(b.pct)/100*.99+'%'}}/>)}</div>}
      <dl className="router-summary-amounts"><div><dt><span className="router-summary-dot fee"/>Protocol fee</dt><dd>0.01 HYPE</dd></div>{on.map(b=><div key={b.kind}><dt><span className={'router-summary-dot '+b.kind}/>{b.kind==='wallets'?'WHYPE wallets':b.kind==='native'?'Native HYPE wallets':'Buyback & burn'}</dt><dd>{oneHypeBucketPreview(b.pct)??'—'} HYPE</dd></div>)}</dl>
      {!splitValid&&<p className="router-summary-warning">Allocate exactly 100% to complete this example.</p>}
      <dl className="router-summary-context"><div><dt>Creator</dt><dd>{creatorValid?creator.slice(0,6)+'…'+creator.slice(-4):'Add a creator wallet'}</dd></div><div><dt>Launchpad</dt><dd>{selectedNames.join(', ')||'Not selected'}</dd></div><div><dt>Deployment</dt><dd>{deployed?'Submitted · confirmation pending':plan?.deployTx?'Plan ready for your wallet':'Not deployed'}</dd></div></dl>
      <p className="router-fixed-rules"><Check size={15} aria-hidden="true"/>Your split is fixed on deployment. Only payout addresses explicitly marked editable can change later.</p>
    </div></aside></div>
  </div>;
}
