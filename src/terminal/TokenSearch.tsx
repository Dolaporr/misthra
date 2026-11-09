import {useEffect,useRef,useState} from 'react';
import {ArrowUpRight,Search} from 'lucide-react';
import {api} from '../api';
import {Modal} from '../components/ui';
import {MarketCap,UsdProvider} from './MarketCap';
import {TokenArtwork} from './TokenArtwork';
import type {Feed} from './model';
import './token-search.css';

export const openTokenSearch=()=>window.dispatchEvent(new Event('misthra:search-launches'));
export function TokenSearch({onClose}:{onClose:()=>void}){
 const [query,setQuery]=useState(''),[data,setData]=useState<Feed|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[retry,setRetry]=useState(0);
 const input=useRef<HTMLInputElement>(null),term=query.trim();
 useEffect(()=>{input.current?.focus()},[]);
 useEffect(()=>{
  setData(null);setError(null);setBusy(Boolean(term));
  if(!term)return;
  let active=true;const controller=new AbortController();
  const timer=window.setTimeout(async()=>{
   try{const value=await api<Feed>(`/launches?limit=30&q=${encodeURIComponent(term)}`,{signal:controller.signal});if(active)setData(value)}
   catch(e){if(active)setError((e as Error).message)}finally{if(active)setBusy(false)}
  },250);
  return()=>{active=false;window.clearTimeout(timer);controller.abort()};
 },[term,retry]);
 return <Modal title="Search launches" onClose={onClose}><div className="token-search">
  <label className="search-input"><Search size={18}/><span className="sr-only">Token name, symbol or contract address</span><input ref={input} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Name, symbol or contract address" autoComplete="off" autoCapitalize="off" spellCheck={false} maxLength={160}/>{query&&<button type="button" onClick={()=>{setQuery('');input.current?.focus()}}>Clear</button>}</label>
  <p className="token-search-note">Search results open here. The live board keeps updating.</p>
  <div className="token-search-results" aria-busy={busy}>
   {!term?<p className="token-search-state">Find an indexed Elysium token by name, symbol or address.</p>:busy?<p className="token-search-state" role="status">Searching launches…</p>:error?<div className="token-search-state" role="alert"><p>{error}</p><button className="button secondary" onClick={()=>setRetry(n=>n+1)}>Try again</button></div>:data&&<UsdProvider snapshot={data}>
    <p className="token-search-count" role="status">{data.launches.length?`${data.launches.length}${data.launches.length===30?'+':''} results`:'No indexed launches found'} <span>{data.source==='live'?'Live':data.source==='simulated'?'Simulated':'Source unavailable'}</span></p>
    {!data.launches.length&&<p className="token-search-state">Check the contract address or try another name. Only tokens indexed by Misthra appear here.</p>}
    {data.launches.map(l=><a key={l.address} href={`#/t/${l.address}`} className="token-search-result" onClick={onClose}>
     <span className="launch-avatar" aria-hidden="true"><TokenArtwork image={l.image} symbol={l.symbol}/></span>
     <span className="token-search-identity"><strong>{l.symbol}</strong><span>{l.name}</span><small title={l.address}>{l.address.slice(0,8)}…{l.address.slice(-6)} · {l.pad?.name||'Pad not detected'}</small></span>
     <span className="token-search-cap"><small>Market cap · USD</small><MarketCap value={l.mcapUsd}/></span><ArrowUpRight size={16}/>
    </a>)}
   </UsdProvider>}
  </div>
 </div></Modal>;
}
