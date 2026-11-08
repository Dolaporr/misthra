import {percentToBps} from './router-preview.ts';
export type Kind = 'native' | 'wallets' | 'buyback-burn';
export type WalletRow = {address: string; pct: string; editable: boolean};
export type Bucket = {kind: Kind; on: boolean; pct: string; wallets: WalletRow[]};
export type RouteIssue = {step: number; message: string};
export const isAddress = (value: string) => /^0x[0-9a-fA-F]{40}$/.test(value.trim());
export const destinationLabel = (kind: Kind) => kind==='native'?'HYPE wallets':kind==='wallets'?'WHYPE wallets':'Buyback & burn';
export function createBuckets(): Bucket[] {
  return (['native','wallets','buyback-burn'] as Kind[]).map(kind=>({kind,on:kind==='native',pct:kind==='native'?'100':'0',wallets:[{address:'',pct:'100',editable:true}]}));
}
export function toggleDestination(buckets: Bucket[], kind: Kind, enabled: boolean): Bucket[] {
  const first = enabled && !buckets.some(b=>b.on);
  return buckets.map(b=>b.kind===kind?{...b,on:enabled,pct:first?'100':b.pct}:b);
}
export function routeIssues(creator: string, buckets: Bucket[]): RouteIssue[] {
  const issues: RouteIssue[]=[];
  if(!isAddress(creator)) issues.push({step:0,message:'Add a valid creator wallet address.'});
  const enabled=buckets.filter(b=>b.on);
  if(!enabled.length) {issues.push({step:1,message:'Choose at least one fee destination.'});return issues;}
  const shares=enabled.map(b=>percentToBps(b.pct));
  if(shares.some(value=>value===null||value<=0)) issues.push({step:2,message:'Each destination needs a share above 0%, at most 100%, with up to two decimal places.'});
  if(shares.some(value=>value===null)||shares.reduce<number>((sum,value)=>sum+(value??0),0)!==10_000) issues.push({step:2,message:'Destination shares must total exactly 100%.'});
  for(const b of enabled) {
    if(b.kind==='buyback-burn') continue;
    const label=destinationLabel(b.kind),walletShares=b.wallets.map(w=>percentToBps(w.pct));
    if(!b.wallets.length||b.wallets.some(w=>!isAddress(w.address))) issues.push({step:2,message:`${label}: add a valid address for every recipient.`});
    if(walletShares.some(value=>value===null||value<=0)) issues.push({step:2,message:`${label}: recipient shares must be above 0%, at most 100%, with up to two decimal places.`});
    const sum=walletShares.reduce<number>((total,value)=>total+(value??0),0);
    if(walletShares.some(value=>value===null)||sum!==10_000) issues.push({step:2,message:`${label}: recipient shares total ${sum/100}%; they must total 100% of this destination.`});
  }
  return issues;
}
