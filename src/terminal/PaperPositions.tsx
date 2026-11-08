import {ArrowUpRight} from 'lucide-react';
import {useApp} from '../state';
import {RequireAuth} from '../components/ui';
import {SourceBadge} from '../pages/Terminal';
import {hype,usePoll} from './model';
import {paperTotals,type PaperResponse} from './paper';
import './paper.css';
const value=(amount:number|null)=>amount===null||!Number.isFinite(amount)?'Unavailable':hype(amount,5);
export function PaperDesk(){const {identity}=useApp();return <div className="page-shell paper-page"><div className="paper-heading"><h1>Paper desk</h1><SourceBadge source="simulated"/></div><p className="paper-intro">Practice with simulated fills. These positions and balances are not real assets or spendable HYPE.</p><RequireAuth><Positions key={identity.address}/></RequireAuth></div>}
export function CoinPaperPosition({token}:{token:string}){const {identity}=useApp();return identity.address?<Positions token={token} key={identity.address}/>:<section className="panel"><h2>Your paper position</h2><p className="muted small">Sign in to track simulated fills for this token.</p><a href="#/paper" className="paper-link">Open the paper desk <ArrowUpRight size={14}/></a></section>}
function Positions({token}:{token?:string}){
  const {identity}=useApp();const {data,error,reload}=usePoll<PaperResponse>('/paper/positions',4000,identity.address);
  const positions=(data?.positions||[]).filter(p=>!token||p.token.toLowerCase()===token.toLowerCase());const totals=paperTotals(positions);
  return <section className={token?'panel paper-positions compact':'panel paper-positions'}><div className="paper-section-heading"><h2>{token?'Your paper position':'Your positions'}</h2>{data&&<SourceBadge source={data.source}/>}</div>
    {error&&<p className="error-text" role="alert">{error} <button className="text-link" onClick={reload}>Retry positions</button></p>}
    {!data&&!error?<p className="muted">Loading paper positions…</p>:data&&!positions.length?<div className="paper-empty"><h3>No paper position{token?'':'s'} yet.</h3><p>Open a simulated quote and choose “Paper fill” to practice. Your wallet will not sign a transaction.</p><a href="#/terminal">Explore the terminal <ArrowUpRight size={14}/></a></div>:!!positions.length&&<><dl className="paper-totals"><div><dt>Marked value · simulated</dt><dd>{value(totals.value)} HYPE</dd></div><div><dt>Net PnL · simulated</dt><dd className={totals.pnl===null?'':totals.pnl>=0?'up':'down'}>{totals.pnl!==null&&totals.pnl>0?'+':''}{value(totals.pnl)} HYPE</dd></div></dl><div className="paper-table-wrap"><table className="mini-table paper-table"><caption className="sr-only">Simulated positions and profit or loss in HYPE</caption><thead><tr><th scope="col">Token</th><th scope="col">Tokens held</th><th scope="col">Value (HYPE)</th><th scope="col">Net PnL (HYPE)</th></tr></thead><tbody>{positions.map(p=><tr key={p.token}><th scope="row"><a href={`#/t/${p.token}`}>{p.symbol}<ArrowUpRight size={12}/></a></th><td>{value(p.tokens)}</td><td>{value(p.valueHype)}</td><td className={p.pnlHype>=0?'up':'down'}>{p.pnlHype>0?'+':''}{value(p.pnlHype)}</td></tr>)}</tbody></table></div><p className="paper-calculation">Net PnL is marked value plus sale proceeds minus buy spend. Marked value uses the indexed price and does not estimate exit slippage or a future sale fee. All figures here are simulated.</p></>}
    {token&&<a href="#/paper" className="paper-link">All paper positions <ArrowUpRight size={14}/></a>}
  </section>;
}
