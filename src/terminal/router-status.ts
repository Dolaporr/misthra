import type { Tx } from './model';
import type { StepProgress } from './trade-flow';

export type RouterAction = { action: string; who: 'anyone'|'creator'; params?: Record<string,string|number|null>; amount?: string|null; enabled: boolean; reason: string|null };
type BaseSnapshot = { source:'live'|'simulated'; network:{chainId:number;verified:boolean|null}; asOf:{block:number;timestamp:number|null;confirmations:number}; router:string; reason:string|null };
export type ActiveRouter = BaseSnapshot & {
  status:'ok'; creator:string; bound:boolean; subject:string|null; protocolFeeBps:number;
  verification:{factory:string|null;implementation:string|null;codeMatchesClone:boolean|null;configHash:string};
  assets:Record<string,{symbol:string|null;decimals:number|null;kind:string}>;
  buckets:{id:number;bps:number;output:{kind:string;token:string};resolvedOutput:string|null;inputOwed:string|null;allocations:{id:number;destination:string;bps:number;isSink:boolean;creatorMayRepoint:boolean;owed:string|null}[]}[];
  money:{asset:string;balance:string|null;liability:string|null;unaccounted:string|null;protocolOwed:string|null;insolvent:boolean|null}[];
  wallets:{recipient:string;asset:string;owed:string|null}[];
  sinks:{bucket:number;allocation:number;destination:string;asset:string;owed:string|null}[];
  actions:RouterAction[]; whype:string;
};
export type RouterSnapshot = ActiveRouter | (BaseSnapshot & {status:'not_deployed'|'not_misthra_router'|'uninitialized'});
export type PreparedRouterAction = {ok:boolean;action:string;tx:Tx|null;amount?:string|null;steps?:string[];preconditions?:{ok:boolean;detail:string}[];reason:string|null;note?:string;preparedAt?:{block:number;timestamp:number}|null};

// Keep exact base-unit integers throughout; unreadable is different from zero.
export function exactAmount(value:string|null|undefined,decimals:number|null|undefined):string {
  if(value==null||!/^\d+$/.test(value)||typeof decimals!=='number'||!Number.isInteger(decimals)||decimals<0||decimals>255)return 'Unavailable';
  const digits=BigInt(value).toString().padStart(decimals+1,'0');
  if(decimals===0)return digits;
  const whole=digits.slice(0,-decimals),fraction=digits.slice(-decimals).replace(/0+$/,'');
  return whole+(fraction?'.'+fraction:'');
}
export function samePreparedCall(a:Tx|null,b:Tx|null){
  return !!a&&!!b&&a.chainId===b.chainId&&a.from?.toLowerCase()===b.from?.toLowerCase()&&a.to.toLowerCase()===b.to.toLowerCase()&&a.data===b.data&&a.value===b.value;
}
export function preparedIssue(prepared:PreparedRouterAction,router:string,wallet:string,chainId:number):string|null{
  if(!prepared.ok||!prepared.tx)return prepared.reason||'No transaction is available.';
  const tx=prepared.tx;
  if(tx.chainId!==chainId||tx.to.toLowerCase()!==router.toLowerCase()||tx.from?.toLowerCase()!==wallet.toLowerCase())return 'The prepared transaction does not match this router, wallet and network.';
  if(prepared.preconditions?.some(p=>!p.ok))return 'A transaction precondition is not ready.';
  return null;
}
export type PendingRouterAction={selected:RouterAction;input:string;prepared:PreparedRouterAction;progress:StepProgress&{hash:string}};
export function readPendingAction(raw:string|null,router:string,chainId:number):PendingRouterAction|null{
  try{
    const p=JSON.parse(raw||'null') as PendingRouterAction|null;
    if(!p||p.progress?.status!=='submitted'||!/^0x[0-9a-fA-F]{64}$/.test(p.progress.hash)||!p.selected?.action||typeof p.input!=='string'||!p.prepared?.tx?.from)return null;
    return preparedIssue(p.prepared,router,p.prepared.tx.from,chainId)?null:p;
  }catch{return null}
}
export async function recheckRouterAction(reviewed:PreparedRouterAction,context:{router:string;wallet:string;chainId:number},io:{prepare:()=>Promise<PreparedRouterAction>;execute:(fresh:PreparedRouterAction)=>Promise<void>}){
  const fresh=await io.prepare();
  const issue=preparedIssue(fresh,context.router,context.wallet,context.chainId);
  if(issue)return {state:'unavailable' as const,prepared:{...fresh,ok:false,tx:null,reason:issue}};
  if(!samePreparedCall(reviewed.tx,fresh.tx)||reviewed.amount!==fresh.amount)return {state:'changed' as const,prepared:fresh};
  await io.execute(fresh);
  return {state:'confirmed' as const,prepared:fresh};
}
export function actionAsset(action:RouterAction,router:Pick<ActiveRouter,'whype'|'buckets'>):string|null{
  if(action.action==='processBucket')return router.whype;
  if(action.action==='fundSink')return router.buckets.find(b=>b.id===Number(action.params?.bucket))?.resolvedOutput??null;
  return typeof action.params?.asset==='string'?action.params.asset:null;
}
export const hasAssetAmount=(action:string)=>['sync','processBucket','sendWallet','fundSink','sendProtocolFee'].includes(action);
export const actionTitle=(action:string)=>({bind:'Bind launched token',sync:'Account for new fees',processBucket:'Process bucket',sendWallet:'Send wallet payout',fundSink:'Fund destination',sendProtocolFee:'Send protocol fee',repointWallet:'Change payout address'}[action]||action);
