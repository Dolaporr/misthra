type Availability={misthra:boolean;reason?:string|null;venueUrl?:string|null};
export function externalVenueUrl(value:string|null|undefined):string|null{
  try{const url=new URL(value||'');return url.protocol==='https:'||url.protocol==='http:'?url.href:null}catch{return null}
}
export function tradeAccess(source:string|undefined,trade:Availability|undefined){
  const paper=source==='simulated';
  const wallet=source==='live'&&trade?.misthra===true;
  return {paper,wallet,quote:paper||wallet,reason:paper?'Simulated launch: paper trading only.':wallet?null:trade?.reason||'Trading availability has not been confirmed for this pool.',venueUrl:paper?null:externalVenueUrl(trade?.venueUrl)};
}
export function quoteMatchesSource(source:string|undefined,quote:{source:string;tx:unknown}){
  return source==='live'?quote.source==='live':source==='simulated'&&quote.source==='simulated'&&!quote.tx;
}
