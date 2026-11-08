import {useEffect,useState} from 'react';
import {api} from '../api';
import type {PadSupportResponse} from './router-preview';
export function usePadSupport(){
 const [data,setData]=useState<PadSupportResponse|null>(null),[error,setError]=useState<string|null>(null),[attempt,setAttempt]=useState(0);
 useEffect(()=>{const controller=new AbortController();setError(null);api<PadSupportResponse>('/router/pads',{signal:controller.signal}).then(value=>{if(!controller.signal.aborted)setData(value)}).catch(e=>{if(!controller.signal.aborted)setError((e as Error).message)});return()=>controller.abort()},[attempt]);
 return {data,error,reload:()=>setAttempt(value=>value+1)};
}
export function PadSupport({data,error,reload,selected,onSelect}:{data:PadSupportResponse|null;error:string|null;reload:()=>void;selected:string[];onSelect:(ids:string[])=>void}){
 const usable=data?.pads.filter(p=>p.usable)||[],pending=data?.pads.filter(p=>!p.usable)||[];
 const recipient={ 'at-launch':'Recipient set at launch','after-launch':'Redirect future fees after launch',unconfirmed:'Custom recipient unconfirmed'};
 return <section className="launch-support-note" aria-labelledby="launchpad-support-title"><h2 id="launchpad-support-title">Which launchpads support this?</h2>
 {!data&&!error&&<p>Loading launchpad support…</p>}{error&&<p role="alert">Launchpad support could not be loaded. <button className="text-link" onClick={reload}>Retry support list</button></p>}
 {data&&<><p>{data.checked.onchain?'This list has on-chain confirmation.':'This list comes from launchpad documentation and is not yet confirmed on-chain.'} Checked {data.checked.at}. Fee delivery and buyback support still need to be checked for your launch.</p><p>Select the pads you plan to use to check bucket compatibility. This does not create a launch.</p>
 <ul className="pad-support-list">{usable.map(p=><li key={p.id}><label><input type="checkbox" checked={selected.includes(p.id)} onChange={e=>onSelect(e.target.checked?[...selected,p.id]:selected.filter(id=>id!==p.id))}/><strong>{p.name}</strong><span>{recipient[p.recipient]}</span></label><p>{p.note}</p><p className="pad-capability">Fee delivery: {p.delivery==='unknown'?'unconfirmed':p.delivery==='claim'?'must be claimed':'sent to recipient'} · Buyback: {p.buyback==='no'?'not supported':p.buyback==='yes'?'supported':'unconfirmed'}</p></li>)}</ul>
 {!!pending.length&&<details className="pad-unconfirmed"><summary>Custom recipient still unconfirmed · {pending.length} pads</summary><ul>{pending.map(p=><li key={p.id}><strong>{p.name}</strong><p>{p.note}</p></li>)}</ul></details>}
 {!data.pads.length&&<p>The support list is being confirmed.</p>}</>}
 </section>;
}
