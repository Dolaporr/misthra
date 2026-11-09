import {createContext,useContext,useEffect,useState,type ReactNode} from 'react';
import {usdMarketCap,usdUnavailable,type UsdRate} from './market-display';
const Pricing=createContext<{rate:UsdRate|null|undefined;now:number}>({rate:null,now:0});
export function UsdProvider({usd,children}:{usd:UsdRate|null|undefined;children:ReactNode}){
 const [now,setNow]=useState(Date.now());
 useEffect(()=>{
  const update=()=>setNow(Date.now());update();document.addEventListener('visibilitychange',update);
  const expires=usd?.source!=='simulated'&&usd?.fetchedAt!=null&&usd.maxAgeMs!=null?usd.fetchedAt+usd.maxAgeMs+1:null;
  const timer=expires!=null&&expires>Date.now()?setTimeout(update,Math.min(2147483647,expires-Date.now())):null;
  return()=>{if(timer!==null)clearTimeout(timer);document.removeEventListener('visibilitychange',update)};
 },[usd]);
 return <Pricing.Provider value={{rate:usd,now}}>{children}</Pricing.Provider>;
}
export function MarketCap({value}:{value:string|null|undefined}){
 const {rate,now}=useContext(Pricing),reason=usdUnavailable(rate,now);
 const text=reason?'—':usdMarketCap(value),simulated=!reason&&text!=='—'&&rate?.source==='simulated';
 return <span className="market-cap-value" title={reason|| (text==='—'?'No trade price for this token yet.':rate?.source)} aria-label={text==='—'?(reason||'No trade price for this token yet.'):`${text}${simulated?' simulated':''}`}>{text}{simulated&&<small className="market-cap-sim" aria-hidden="true">sim</small>}</span>;
}
