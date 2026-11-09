export type UsdRate={hypeUsd:string|null;source:string;fetchedAt:number|null;stale:boolean;maxAgeMs:number|null;reason:string|null};
export function artworkUrl(value:string|null):string|null{
 try{const url=new URL(value||'');return url.protocol==='https:'&&!url.username&&!url.password?url.href:null}catch{return null}
}
export function usdExpiresAt(rate:UsdRate|null|undefined,serverAt:number|undefined,receivedAt:number|undefined):number|null{
 if(!rate||rate.source==='simulated')return null;
 if(!Number.isFinite(serverAt)||!Number.isFinite(receivedAt)||!Number.isFinite(rate.fetchedAt)||!Number.isFinite(rate.maxAgeMs)||rate.maxAgeMs!<=0)return null;
 return receivedAt!+Math.max(0,rate.maxAgeMs!-Math.max(0,serverAt!-rate.fetchedAt!));
}
export function usdUnavailable(rate:UsdRate|null|undefined,expiresAt:number|null=null,now=performance.now()):string|null{
 if(!rate)return 'USD pricing is unavailable.';
 if(rate.stale||rate.hypeUsd===null)return rate.reason||'USD pricing is unavailable.';
 if(!/^\d+(\.\d+)?$/.test(rate.hypeUsd)||!(Number(rate.hypeUsd)>0))return 'USD pricing is unavailable.';
 if(rate.source==='simulated')return null;
 if(expiresAt!==null&&now>=expiresAt)return 'HYPE/USD price is stale.';
 return null;
}
// Format the API's dollars directly; never reinterpret HYPE or fix a conversion rate.
export function usdMarketCap(value:string|null|undefined):string{
 if(typeof value!=='string'||!/^\d+(\.\d+)?$/.test(value)||!Number.isFinite(Number(value)))return '—';
 const amount=Number(value);
 if(amount>0&&amount<1)return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumSignificantDigits:3}).format(amount);
 return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',notation:amount>=1000?'compact':'standard',...(amount>=1000?{minimumFractionDigits:0}:{}),maximumFractionDigits:2}).format(amount);
}
