import { useState } from 'react';
import { Copy, Flame, Plus, Trash2, Wallet as WalletIcon, Coins } from 'lucide-react';
import { post } from '../api';
import { useApp } from '../state';
import { sendWithWallet, type Tx } from '../terminal/model';
import {buybackUnavailable,oneHypeBucketPreview,percentToBps} from '../terminal/router-preview';
import '../terminal/router-preview.css';
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
    setBusy(true); setError(null); setPlan(null);
    try {
      setPlan(await post<Plan>('/router/plan', { creator: creator.trim(), buckets: on.map((b) => ({ kind: b.kind, bps: bps(b.pct), ...(b.kind === 'buyback-burn' ? {} : { wallets: b.wallets.map((w) => ({ address: w.address.trim(), bps: bps(w.pct), editable: w.editable })) }) })) }));
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const deploy = async () => {
    if (!plan?.deployTx) return;
    setBusy(true); setError(null);
    try { const hash = await sendWithWallet(plan.deployTx); setDeployed(hash); notify('Router deployment sent.'); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const copy = (text: string) => { navigator.clipboard?.writeText(text); notify('Copied.'); };

  return <div className="page-shell launch-page">
    <header className="launch-intro">
      <h1>Route your launch’s fees by rules you set once.</h1>
      <p>A Misthra fee router is a small contract you name as your token’s fee recipient on the launchpad. Fees arrive there and are split the way you choose here: to wallets, in WHYPE or native HYPE, or into a buyback that burns your token. The rules are fixed when the router is deployed. Anyone can trigger a payout, and payouts only ever go where you said. Misthra keeps a fixed 1% of fees.</p>
    </header>

    <PadSupport data={support.data} error={support.error} reload={support.reload} selected={selectedPads} onSelect={choosePads}/>

    <ol className="wizard">
      <li className="panel"><h2>1. Creator wallet</h2>
        <p className="muted small">This wallet deploys the router and is the only one that can bind your token or move an editable wallet later.</p>
        <label className="field-label" htmlFor="creator">Creator address</label>
        <div className="row"><input id="creator" aria-invalid={!!creator&&!isAddr(creator)} aria-describedby={creator&&!isAddr(creator)?'creator-error':undefined} value={creator} onChange={(e) => { setCreator(e.target.value); setPlan(null); }} placeholder="0x…" spellCheck={false} />{identity.role !== 'wallet' && <button className="button secondary" onClick={openWallet}>Connect wallet</button>}</div>
        {creator && !isAddr(creator) && <p className="error-text" id="creator-error">That is not a valid address.</p>}
      </li>

      <li className="panel"><h2>2. Where fees go</h2>
        <p className="router-example-note">Distribution example: for 1 HYPE in launch fees, 0.01 HYPE is the protocol fee and 0.99 HYPE is split between your buckets. This is an example, not live earnings.</p>
        <div className="bucket-list">
          {KINDS.map((k, i) => { const b = buckets[i]; return <div key={k.kind} className={`bucket${b.on ? ' on' : ''}`}>
            <label className="bucket-toggle"><input type="checkbox" checked={b.on} disabled={k.kind==='buyback-burn'&&blocked} aria-describedby={k.kind==='buyback-burn'&&blocked?'buyback-unavailable':undefined} onChange={(e) => update(i, { on: e.target.checked })} /><k.Icon size={18} aria-hidden="true" /><span><strong>{k.title}</strong><span className="muted small">{k.text}</span></span></label>
            {k.kind==='buyback-burn'&&blocked&&<p className="router-bucket-preview" id="buyback-unavailable">Buyback-and-burn is unavailable for the selected pads because their pools do not use the router’s supported Uniswap v3 route. Choose a wallet payout instead.</p>}
            {b.on && <label className="share">Share<input inputMode="decimal" value={b.pct} onChange={(e) => update(i, { pct: e.target.value })} aria-label={`${k.title} share in percent`} />%</label>}
            {b.on && <p className="router-bucket-preview">{oneHypeBucketPreview(b.pct)===null?'Enter a share from 0% to 100% with up to two decimal places.':`Example: ${oneHypeBucketPreview(b.pct)} HYPE to this bucket from 1 HYPE of fees, after the protocol fee.`}</p>}
            {b.on && k.kind !== 'buyback-burn' && <div className="wallet-rows">
              {b.wallets.map((w, wi) => <div key={wi} className="wallet-row">
                <input value={w.address} onChange={(e) => updateWallet(i, wi, { address: e.target.value })} placeholder="Wallet 0x…" aria-label={`${k.title}: wallet ${wi + 1} address`} spellCheck={false} />
                <input className="pct" inputMode="decimal" value={w.pct} onChange={(e) => updateWallet(i, wi, { pct: e.target.value })} aria-label={`${k.title}: wallet ${wi + 1} share in percent`} /><span>%</span>
                <label className="check small"><input type="checkbox" checked={w.editable} onChange={(e) => updateWallet(i, wi, { editable: e.target.checked })} />Editable later</label>
                {b.wallets.length > 1 && <button className="icon-button" aria-label={`${k.title}: remove wallet ${wi + 1}`} onClick={() => update(i, { wallets: b.wallets.filter((_, x) => x !== wi) })}><Trash2 size={15} /></button>}
              </div>)}
              {b.wallets.length < 16 && <button className="button subtle" onClick={() => update(i, { wallets: [...b.wallets, { address: '', pct: '0', editable: false }] })}><Plus size={14} /> Add wallet</button>}
            </div>}
          </div>; })}
        </div>
        <p className={`total ${total === 10_000 ? 'ok' : 'bad'}`} aria-live="polite">Shares total {Number.isFinite(total)?`${total / 100}%`:'—'}{total !== 10_000 && ' (they must total 100%)'}</p>
        {invalidShares && <p className="error-text">Each enabled bucket needs a share above 0%, at most 100%, with up to two decimal places.</p>}
        {walletProblems.map((p) => <p key={p} className="error-text">{p}</p>)}
      </li>

      <li className="panel"><h2>3. Review</h2>
        <button className="button primary" disabled={!ready || busy} onClick={review}>{busy && !plan ? 'Checking…' : 'Check plan'}</button>
        {error && <p className="error-text" role="alert">{error}</p>}
        {plan && <div className="plan">
          <ul className="buckets">{plan.buckets.map((b) => <li key={b.label}><span>{b.label}</span><strong>{b.bps / 100}%</strong></li>)}<li className="muted"><span>Misthra protocol fee, taken first</span><strong>1%</strong></li></ul>
          {plan.predictedAddress ? <>
            <p>Your router address will be:</p>
            <p className="address-line"><code>{plan.predictedAddress}</code><button className="icon-button" onClick={() => copy(plan.predictedAddress!)} aria-label="Copy router address"><Copy size={15} /></button></p>
            <ol className="steps">{plan.steps.map((s) => <li key={s}>{s}</li>)}</ol>
            {plan.deployTx && !deployed && <button className="button primary" disabled={busy} onClick={deploy}>Deploy router from your wallet</button>}
            {deployed && <p className="notice">Deployment sent ({deployed.slice(0, 10)}…). Next, set <code>{plan.predictedAddress}</code> as the creator fee recipient on your launchpad.</p>}
          </> : <p className="notice">{plan.reason} The plan above is valid, so you can deploy as soon as the router is live on Elysium.</p>}
        </div>}
      </li>
    </ol>
  </div>;
}
