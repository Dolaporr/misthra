import {useEffect, useRef, useState} from 'react';
import {ArrowLeft, ArrowRight, ArrowUpRight, Check, Copy, LockKeyhole, Plus, RotateCcw, Trash2, Wallet} from 'lucide-react';
import {post} from '../api';
import {useApp, useResource} from '../state';
import {sendWithWallet} from '../terminal/model';
import {confirmInWallet, runTradeSteps, type StepProgress} from '../terminal/trade-flow';
import {coinIssues, hypeText, isAddress, launchBody, payeeIssues, planIssue, switchBody, totalValue, type CoinForm, type MontraOptions, type MontraPlan, type Payee} from '../terminal/montra-launch';
import '../terminal/router-workspace.css';
import '../terminal/trade-steps.css';
import '../terminal/montra-launch.css';

type Capability = {available: boolean; reason: string | null; builderCode?: string | null};
type Mode = 'launch' | 'switch';
type Saved = {mode: Mode; creator: string; plan: MontraPlan; progress: StepProgress[]};
const KEY = 'misthra:montra-plan';
const EMPTY: CoinForm = {name: '', symbol: '', description: '', logo: '', website: '', twitter: '', telegram: '', configId: null, firstBuy: ''};
const short = (a: string) => a.slice(0, 6) + '…' + a.slice(-4);
const load = (): Saved | null => { try { const s = JSON.parse(sessionStorage.getItem(KEY) || 'null'); return s?.plan?.steps ? s : null; } catch { return null; } };
const save = (s: Saved | null) => { try { if (s) sessionStorage.setItem(KEY, JSON.stringify(s)); else sessionStorage.removeItem(KEY); } catch { /* the plan stays in this view */ } };

export function MontraLaunch() {
  const {identity, config, notify, openWallet} = useApp();
  const wallet = identity.role === 'wallet' ? identity.address : null;
  const caps = useResource<{montraLaunch?: Capability}>('/capabilities');
  const cap = caps.data?.montraLaunch;
  const options = useResource<MontraOptions>(cap?.available ? '/montra/options' : null);
  const [saved] = useState(load);
  const [mode, setMode] = useState<Mode>(saved?.mode ?? 'launch');
  const [form, setForm] = useState<CoinForm>(EMPTY);
  const [token, setToken] = useState('');
  const [payees, setPayees] = useState<Payee[]>([{address: '', pct: '100'}]);
  const [plan, setPlan] = useState<MontraPlan | null>(saved?.plan ?? null);
  const [planFor, setPlanFor] = useState<string>(saved?.creator ?? '');
  const [progress, setProgress] = useState<StepProgress[]>(saved?.progress ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const progressRef = useRef(progress); progressRef.current = progress;

  useEffect(() => { window.scrollTo({top: 0, behavior: 'instant'}); }, []);
  useEffect(() => { if (!form.configId && options.data?.configs.length) setForm(f => ({...f, configId: options.data!.configs[0].id})); }, [options.data]);
  useEffect(() => { if (wallet && payees.length === 1 && !payees[0].address) setPayees([{address: wallet, pct: '100'}]); }, [wallet]);

  const started = progress.some(p => p && p.status !== 'waiting');
  const done = !!plan && progress.length === plan.steps.length && progress.every(p => p?.status === 'confirmed');
  const locked = busy || started;
  const issues = [...(mode === 'launch' ? coinIssues(form, options.data) : isAddress(token) ? [] : [{field: 'token', message: 'Enter the Montra coin address.'}]), ...payeeIssues(payees)];
  const show = (field: string) => tried ? issues.filter(i => i.field === field || i.field.startsWith(field + '-')).map(i => i.message)[0] : undefined;
  const config_ = options.data?.configs.find(c => c.id === form.configId);
  const edit = <T,>(fn: (v: T) => void) => (v: T) => { if (!locked) { fn(v); setPlan(null); setProgress([]); save(null); } };
  const setField = (k: keyof CoinForm) => edit<string>(v => setForm(f => ({...f, [k]: v})));

  const check = async () => {
    setTried(true); setError(null);
    if (!wallet) { openWallet(); return; }
    if (issues.length || busy) return;
    setBusy(true);
    try {
      const next = mode === 'launch' ? await post<MontraPlan>('/montra/launch/plan', launchBody(wallet, form, payees)) : await post<MontraPlan>('/montra/switch/plan', switchBody(wallet, token, payees));
      const issue = planIssue(next, wallet, config?.network.chainId, mode);
      if (issue) throw new Error(issue);
      setPlan(next); setPlanFor(wallet); setProgress([]); save({mode, creator: wallet, plan: next, progress: []});
      window.requestAnimationFrame(() => document.getElementById('montra-plan')?.focus({preventScroll: false}));
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const run = async () => {
    if (!plan || busy) return;
    const issue = !wallet ? 'Connect the wallet this plan was made for.' : wallet.toLowerCase() !== planFor.toLowerCase() ? `This plan is for ${short(planFor)}. Switch your wallet back to it.` : planIssue(plan, wallet, config?.network.chainId, mode);
    if (issue) { setError(issue); return; }
    setBusy(true); setError(null);
    try {
      await runTradeSteps(plan.steps.map(s => ({label: s.title, tx: s.tx})), progressRef.current, {
        send: sendWithWallet, confirm: confirmInWallet,
        progress: (i, state) => { const next = [...progressRef.current]; next[i] = state; progressRef.current = next; setProgress(next); save({mode, creator: planFor, plan, progress: next}); },
      });
      notify(mode === 'launch' ? 'Your coin is live on Montra, with fees going to your router.' : 'Montra fees now go to your router.');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const reset = () => { setPlan(null); setProgress([]); setError(null); setTried(false); save(null); };
  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); notify('Copied.'); } catch { notify('Select the address and copy it manually.', true); } };

  if (caps.loading) return <div className="page-shell montra-page"><p role="status">Checking Launch on Montra…</p></div>;
  if (!cap?.available) return <div className="page-shell montra-page"><a className="back-link" href="#/launch"><ArrowLeft size={15}/> Router setup</a><header className="montra-heading"><h1>Launch on Montra</h1></header><section className="panel" role="status"><h2>Not available yet</h2><p>{caps.error || cap?.reason || 'This server does not offer Launch on Montra yet.'}</p><p>You can still create a router and paste its address into Montra’s fee recipient field.</p><a className="button secondary" href="#/launch">Set up a router <ArrowRight size={15}/></a></section></div>;

  const stepStatus = (i: number) => progress[i]?.status ?? 'waiting';
  return <div className="page-shell montra-page">
    <a className="back-link" href="#/launch"><ArrowLeft size={15}/> Router setup</a>
    <header className="montra-heading">
      <h1>Launch on Montra.<br/>Pay your whole team.</h1>
      <p>Your coin launches on Montra as usual. Its creator fees go to your own Misthra router, which pays up to 16 wallets in HYPE.</p>
      <div className="router-hero-facts"><span>Montra’s fees apply</span><span>1% router protocol fee</span><span>Signed by your wallet</span></div>
    </header>

    <div className="montra-tabs" role="tablist" aria-label="What are you doing?">
      {(['launch', 'switch'] as Mode[]).map(m => <button key={m} role="tab" aria-selected={mode === m} disabled={locked} onClick={() => { setMode(m); setPlan(null); setProgress([]); setTried(false); save(null); }}>{m === 'launch' ? 'New coin' : 'Coin already on Montra'}</button>)}
    </div>

    <div className="montra-grid"><div className="montra-form">
      <fieldset disabled={locked} className="montra-section">
        <legend><span>1</span>Creator wallet</legend>
        {wallet ? <p className="montra-wallet"><Wallet size={16}/><code>{wallet}</code></p> : <button className="button secondary" onClick={openWallet}><Wallet size={15}/>Connect wallet</button>}
        <p className="router-field-hint">{mode === 'launch' ? 'This wallet launches the coin and signs every step.' : 'Use the wallet that launched the coin and receives its fees today.'}</p>
      </fieldset>

      {mode === 'launch' ? <fieldset disabled={locked} className="montra-section">
        <legend><span>2</span>Your coin</legend>
        <div className="montra-fields">
          <label>Name<input value={form.name} maxLength={64} onChange={e => setField('name')(e.target.value)} aria-invalid={!!show('name')} placeholder="Misthra Cat"/>{show('name') && <small className="error-text">{show('name')}</small>}</label>
          <label>Ticker<input value={form.symbol} maxLength={16} onChange={e => setField('symbol')(e.target.value.toUpperCase())} aria-invalid={!!show('symbol')} placeholder="MCAT"/>{show('symbol') && <small className="error-text">{show('symbol')}</small>}</label>
          <label className="wide">Description<textarea value={form.description} maxLength={1000} rows={3} onChange={e => setField('description')(e.target.value)}/></label>
          <label className="wide">Logo link<input value={form.logo} onChange={e => setField('logo')(e.target.value)} aria-invalid={!!show('logo')} placeholder="https://… or ipfs://…" spellCheck={false}/>{show('logo') ? <small className="error-text">{show('logo')}</small> : <small>A square image works best.</small>}</label>
          <label>Website<input value={form.website} onChange={e => setField('website')(e.target.value)} placeholder="https://" spellCheck={false}/></label>
          <label>X<input value={form.twitter} onChange={e => setField('twitter')(e.target.value)} placeholder="https://x.com/…" spellCheck={false}/></label>
          <label>Telegram<input value={form.telegram} onChange={e => setField('telegram')(e.target.value)} placeholder="https://t.me/…" spellCheck={false}/></label>
        </div>
        <h3 className="montra-subhead">Launch type</h3>
        {options.loading ? <p role="status">Reading Montra’s launch types…</p> : options.error ? <p className="error-text">{options.error} <button className="text-link" onClick={options.reload}>Try again</button></p> : !options.data?.launchEnabled ? <p className="notice">Montra has paused new launches. Try again later.</p> :
          <div className="montra-configs">{options.data.configs.map(c => <label key={c.id} className={'montra-config' + (form.configId === c.id ? ' selected' : '')}><input type="radio" name="config" checked={form.configId === c.id} onChange={() => edit<number>(v => setForm(f => ({...f, configId: v, firstBuy: c.native ? f.firstBuy : ''})))(c.id)}/><strong>{c.native ? 'HYPE pair' : 'Token pair'} · type {c.id}</strong><span>{c.totalFeePct}% trading fee: {c.protocolFeePct}% to Montra, {c.lpFeePct}% to liquidity, the rest to your router.</span>{c.earlyBuyFeeStartPct > 0 && <span>Early buyers pay up to {c.earlyBuyFeeStartPct}% for the first {Math.round(c.earlyBuyFeeWindowS / 60)} min.</span>}</label>)}{show('config') && <small className="error-text">{show('config')}</small>}</div>}
        <label className="montra-firstbuy">First buy (optional)<div><input inputMode="decimal" value={form.firstBuy} disabled={!config_?.native} onChange={e => setField('firstBuy')(e.target.value)} placeholder="0" aria-invalid={!!show('firstBuy')}/><span>HYPE</span></div>{show('firstBuy') ? <small className="error-text">{show('firstBuy')}</small> : <small>Bought in the same transaction as the launch, before anyone else can trade.</small>}</label>
      </fieldset> : <fieldset disabled={locked} className="montra-section">
        <legend><span>2</span>Your Montra coin</legend>
        <label className="montra-token">Coin address<input value={token} onChange={e => edit<string>(setToken)(e.target.value)} placeholder="0x…" spellCheck={false} aria-invalid={!!show('token')}/>{show('token') && <small className="error-text">{show('token')}</small>}</label>
        <p className="notice">Claim any fees Montra already owes you first. After the switch, new fees go to your router.</p>
        <p className="router-field-hint">Only coins whose fees go to one wallet can switch here. Coins that use a Montra split need that split changed first.</p>
      </fieldset>}

      <fieldset disabled={locked} className="montra-section">
        <legend><span>3</span>Who gets paid</legend>
        <p className="router-field-hint">Creator fees are paid in HYPE. Shares must add up to 100%. Wallets are fixed once the router is created.</p>
        <div className="router-recipients">{payees.map((p, i) => <div className="router-recipient" key={i}><div className="router-recipient-inputs">
          <input value={p.address} onChange={e => edit<string>(v => setPayees(ps => ps.map((x, j) => j === i ? {...x, address: v} : x)))(e.target.value)} placeholder="Wallet address · 0x…" aria-label={`Wallet ${i + 1} address`} spellCheck={false} aria-invalid={!!p.address && !isAddress(p.address)}/>
          <label><input inputMode="decimal" value={p.pct} onChange={e => edit<string>(v => setPayees(ps => ps.map((x, j) => j === i ? {...x, pct: v} : x)))(e.target.value)} aria-label={`Wallet ${i + 1} share in percent`}/><span>%</span></label>
          {payees.length > 1 && <button className="icon-button" aria-label={`Remove wallet ${i + 1}`} onClick={() => edit<number>(j => setPayees(ps => ps.filter((_, k) => k !== j)))(i)}><Trash2 size={15}/></button>}
        </div></div>)}</div>
        {payees.length < 16 && <button className="button subtle router-add-recipient" onClick={() => edit<void>(() => setPayees(ps => [...ps, {address: '', pct: '0'}]))(undefined)}><Plus size={15}/>Add wallet</button>}
        {show('payees') && <p className="error-text">{show('payees')}</p>}
        {tried && issues.some(i => i.field.startsWith('payee-')) && <p className="error-text">{issues.find(i => i.field.startsWith('payee-'))!.message}</p>}
      </fieldset>

      {!plan && <div className="montra-actions">
        <button className="button primary" disabled={busy} onClick={check}>{busy ? 'Checking…' : !wallet ? 'Connect wallet to continue' : 'Check the plan'}<ArrowRight size={15}/></button>
        <p className="router-field-hint">Checking a plan sends nothing. You review every step before signing.</p>
      </div>}
      {error && <p className="error-text" role="alert">{error}</p>}

      {plan && <section className="montra-plan" aria-live="polite">
        <h2 id="montra-plan" tabIndex={-1}><Check size={18}/>{done ? 'All done' : 'Your plan'}</h2>
        <dl className="montra-addresses">
          <div><dt>Fee router</dt><dd><code>{plan.router}</code><button className="icon-button" aria-label="Copy router address" onClick={() => void copy(plan.router)}><Copy size={14}/></button></dd></div>
          <div><dt>Montra adapter</dt><dd><code>{plan.adapter}</code></dd></div>
          <div><dt>{mode === 'launch' ? 'Your coin (predicted)' : 'Your coin'}</dt><dd><code>{plan.token}</code></dd></div>
          {mode === 'launch' && <div><dt>You pay</dt><dd>{hypeText(totalValue(plan))} HYPE <small>(Montra launch fee {hypeText(plan.launchFee)}{plan.firstBuy && plan.firstBuy !== '0' ? ` + first buy ${hypeText(plan.firstBuy)}` : ''}) plus gas</small></dd></div>}
        </dl>
        <ol className="trade-steps">{plan.steps.map((s, i) => <li key={s.id} data-status={stepStatus(i)}><span className="trade-step-number">{stepStatus(i) === 'confirmed' ? <Check size={13}/> : i + 1}</span><div><strong>{s.title}</strong>{s.note && <span>{s.note}</span>}<span>{stepStatus(i) === 'wallet' ? 'Waiting for your wallet…' : stepStatus(i) === 'submitted' ? 'Sent · waiting for confirmation' : stepStatus(i) === 'confirmed' ? 'Confirmed' : stepStatus(i) === 'failed' ? 'Failed' : 'Not sent yet'}{s.tx.value !== '0' ? ` · ${hypeText(s.tx.value)} HYPE` : ''}</span>{progress[i]?.hash && <code>{progress[i].hash}</code>}</div></li>)}</ol>
        {done ? <div className="montra-actions"><a className="button primary" href={'#/launch/' + plan.router}>View your router <ArrowRight size={15}/></a><a className="button secondary" href={'#/t/' + plan.token}>Open the coin <ArrowUpRight size={15}/></a><button className="button subtle" onClick={reset}><RotateCcw size={14}/>Start another</button></div>
          : <div className="montra-actions">
            <button className="button primary" disabled={busy} onClick={run}>{busy ? 'Working… keep this page open' : started ? 'Continue from where you stopped' : 'Start · sign step 1'}<ArrowRight size={15}/></button>
            {!started && <button className="button subtle" disabled={busy} onClick={reset}>Edit details</button>}
            {started && !busy && progress.some(p => p?.status === 'failed') && <p className="router-field-hint">A step failed. If the router step went through, continuing skips it. <button className="text-link" onClick={reset}>Start over</button></p>}
          </div>}
      </section>}
    </div>

    <aside className="montra-aside">
      <h2>How it works</h2>
      <ol>
        <li><strong>Create your router.</strong> Its address is known before it exists, so Montra can pay it from block one.</li>
        <li><strong>{mode === 'launch' ? 'Launch on Montra.' : 'Point Montra at it.'}</strong> {mode === 'launch' ? 'Your creator fees go 100% to a small Montra adapter tied to your router.' : 'Montra sends this coin’s creator fees to a small adapter tied to your router.'}</li>
        <li><strong>Connect them.</strong> The adapter checks the coin is yours, then links the two. It refuses anyone else’s coin.</li>
        <li><strong>Collect any time.</strong> Anyone can press “Collect Montra fees” on your router page to pull fees in and pay your wallets.</li>
      </ol>
      <p className="router-fixed-rules"><LockKeyhole size={15}/><span>Misthra never holds keys or funds. Contracts are unaudited, so start small.{cap.builderCode ? ` Launches carry Misthra’s Montra builder code (${cap.builderCode}).` : ''}</span></p>
    </aside></div>
  </div>;
}
