export type UsdRate={hypeUsd:string|null;source:string;fetchedAt:number|null;stale:boolean;maxAgeMs:number|null;reason:string|null};
export function artworkUrl(value:string|null):string|null{
 try{const url=new URL(value||'');return url.protocol==='https:'&&!url.username&&!url.password?url.href:null}catch{return null}
}
export function usdUnavailable(rate:UsdRate|null|undefined,now=Date.now()):string|null{
 if(!rate)return 'USD pricing is unavailable.';
 if(rate.stale||rate.hypeUsd===null)return rate.reason||'USD pricing is unavailable.';
 if(!/^\d+(\.\d+)?$/.test(rate.hypeUsd)||!(Number(rate.hypeUsd)>0))return 'USD pricing is unavailable.';
 if(rate.source==='simulated')return null;
 if(!Number.isFinite(rate.fetchedAt)||!Number.isFinite(rate.maxAgeMs)||rate.maxAgeMs!<=0||now-rate.fetchedAt!>rate.maxAgeMs!)return 'HYPE/USD price is stale.';
 return null;
}
// Format the API's dollars directly; never reinterpret HYPE or fix a conversion rate.
export function usdMarketCap(value:string|null|undefined):string{
 if(typeof value!=='string'||!/^\d+(\.\d+)?$/.test(value)||!Number.isFinite(Number(value)))return '—';
 const amount=Number(value);
 if(amount>0&&amount<1)return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumSignificantDigits:3}).format(amount);
 return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',notation:amount>=1000?'compact':'standard',maximumFractionDigits:2}).format(amount);
}
