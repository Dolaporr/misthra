import {createContext,useContext,useEffect,useState,type ReactNode} from 'react';
import {usdMarketCap,usdUnavailable,usdExpiresAt,type UsdRate} from './market-display';
import {apiReceipt} from '../api';
const Pricing=createContext<{rate:UsdRate|null|undefined;expiresAt:number|null;now:number}>({rate:null,expiresAt:null,now:0});
export function UsdProvider({snapshot,children}:{snapshot:{usd:UsdRate;updatedAt?:number}|null;children:ReactNode}){
 const usd=snapshot?.usd,receipt=snapshot?apiReceipt(snapshot):undefined;
 // Feed updatedAt and rate fetchedAt share the server clock. Detail responses
 // use HTTP Date (rounded to seconds, so add 1s conservatively) instead.
 const serverAt=snapshot?.updatedAt??(receipt?receipt.serverAt+1000:undefined);
 const expiresAt=usdExpiresAt(usd,serverAt,receipt?.receivedAt);
 const [now,setNow]=useState(performance.now());
 useEffect(()=>{
  const update=()=>setNow(performance.now());update();document.addEventListener('visibilitychange',update);
  const remaining=expiresAt!==null?expiresAt-performance.now():0;
  const timer=remaining>0?setTimeout(update,Math.min(2147483647,Math.ceil(remaining))):null;
  return()=>{if(timer!==null)clearTimeout(timer);document.removeEventListener('visibilitychange',update)};
 },[expiresAt]);
 return <Pricing.Provider value={{rate:usd,expiresAt,now:Math.max(now,performance.now())}}>{children}</Pricing.Provider>;
}
export function MarketCap({value}:{value:string|null|undefined}){
 const {rate,expiresAt,now}=useContext(Pricing),reason=usdUnavailable(rate,expiresAt,now);
 const text=reason?'—':usdMarketCap(value),simulated=!reason&&text!=='—'&&rate?.source==='simulated';
 return <span className="market-cap-value" title={reason|| (text==='—'?'No trade price for this token yet.':rate?.source)} aria-label={text==='—'?(reason||'No trade price for this token yet.'):`${text}${simulated?' simulated':''}`}>{text}{simulated&&<small className="market-cap-sim" aria-hidden="true">sim</small>}</span>;
}
