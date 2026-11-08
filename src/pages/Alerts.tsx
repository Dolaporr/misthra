import { useEffect, useState } from 'react';
import { Bell, Trash2 } from 'lucide-react';
import { api, post } from '../api';
import { useApp } from '../state';
import { RequireAuth } from '../components/ui';
import { age, shortAddr, type AlertEvent, type AlertRule } from '../terminal/model';

type Form = { kind: 'launch' | 'stage' | 'wallet'; pad: string; minVolumeHype: string; maxAgeMin: string; minHolders: string; token: string; wallet: string };
const empty: Form = { kind: 'launch', pad: '', minVolumeHype: '', maxAgeMin: '', minHolders: '', token: '', wallet: '' };

function describe(r: AlertRule) {
  if (r.kind === 'stage') return `Stage change on ${shortAddr(r.token!)}`;
  if (r.kind === 'wallet') return `Trades by ${shortAddr(r.wallet!)}`;
  const parts = [r.pad && `pad ${r.pad}`, r.maxAgeMin != null && `under ${r.maxAgeMin} min old`, r.minVolumeHype != null && `≥ ${r.minVolumeHype} HYPE volume`, r.minHolders != null && `≥ ${r.minHolders} holders`].filter(Boolean);
  return `New launch${parts.length ? `: ${parts.join(', ')}` : ''}`;
}

export function Alerts() {
  return <RequireAuth><AlertsInner /></RequireAuth>;
}

function AlertsInner() {
  const { notify } = useApp();
  const [data, setData] = useState<{ rules: AlertRule[]; events: AlertEvent[] } | null>(null);
  const [form, setForm] = useState<Form>(empty);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => api<{ rules: AlertRule[]; events: AlertEvent[] }>('/alerts').then(setData).catch((e) => setError(e.message));
  useEffect(() => {
    load();
    // New alerts arrive over the stream; only this session's alerts are sent to it.
    const stream = new EventSource('/api/stream', { withCredentials: true });
    stream.addEventListener('alert', () => load());
    return () => stream.close();
  }, []);

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const num = (v: string) => (v.trim() === '' ? undefined : Number(v));
  const create = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    const body = form.kind === 'launch' ? { kind: 'launch', pad: form.pad || undefined, minVolumeHype: num(form.minVolumeHype), maxAgeMin: num(form.maxAgeMin), minHolders: num(form.minHolders) }
      : form.kind === 'stage' ? { kind: 'stage', token: form.token.trim() } : { kind: 'wallet', wallet: form.wallet.trim() };
    try { await post('/alerts', body); setForm(empty); notify('Alert created.'); load(); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  const remove = async (id: string) => { try { await api(`/alerts/${id}`, { method: 'DELETE' }); load(); } catch (err) { setError((err as Error).message); } };

  return <div className="page-shell alerts-page">
    <header className="page-heading"><h1><Bell size={22} /> Alerts</h1><p className="muted">Alerts appear here and arrive live while this page is open. Discord and Telegram delivery are not connected yet.</p></header>
    <div className="alerts-grid">
      <form className="panel alert-form" onSubmit={create}>
        <h2>New alert</h2>
        <label className="field-label">When<select value={form.kind} onChange={set('kind')}><option value="launch">A new launch matches</option><option value="stage">A token changes stage</option><option value="wallet">A wallet trades</option></select></label>
        {form.kind === 'launch' && <>
          <label className="field-label">Pad id (optional)<input value={form.pad} onChange={set('pad')} placeholder="e.g. citadel" /></label>
          <label className="field-label">Younger than (minutes)<input inputMode="numeric" value={form.maxAgeMin} onChange={set('maxAgeMin')} /></label>
          <label className="field-label">At least this much 24h volume (HYPE)<input inputMode="decimal" value={form.minVolumeHype} onChange={set('minVolumeHype')} /></label>
          <label className="field-label">At least this many holders<input inputMode="numeric" value={form.minHolders} onChange={set('minHolders')} /></label>
        </>}
        {form.kind === 'stage' && <label className="field-label">Token address<input value={form.token} onChange={set('token')} placeholder="0x…" spellCheck={false} /></label>}
        {form.kind === 'wallet' && <label className="field-label">Wallet address<input value={form.wallet} onChange={set('wallet')} placeholder="0x…" spellCheck={false} /></label>}
        <button className="button primary" disabled={busy}>Create alert</button>
        {error && <p className="error-text" role="alert">{error}</p>}
      </form>
      <section className="panel">
        <h2>Your rules</h2>
        {!data ? <p className="muted small">Loading…</p> : !data.rules.length ? <p className="muted small">No alert rules yet.</p> : <ul className="rules">{data.rules.map((r) => <li key={r.id}><span>{describe(r)}</span><button className="icon-button" aria-label={`Delete alert: ${describe(r)}`} onClick={() => remove(r.id)}><Trash2 size={15} /></button></li>)}</ul>}
        <h2>Recent alerts</h2>
        {!data ? null : !data.events.length ? <p className="muted small">Nothing has fired yet.</p> : <ul className="events">{data.events.map((ev) => <li key={ev.id}><strong>{ev.token ? <a href={`#/t/${ev.token}`}>{ev.title}</a> : ev.title}</strong><span className="muted small">{ev.detail} · {age(ev.at)} ago</span></li>)}</ul>}
      </section>
    </div>
  </div>;
}
