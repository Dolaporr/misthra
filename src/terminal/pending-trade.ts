import type {Quote,Tx} from './model';
import type {StepProgress} from './trade-flow';
export type PendingTrade={quote:Quote;progress:StepProgress[];side:'buy'|'sell';amount:string;slippage:string};
const address=(value:unknown):value is string=>typeof value==='string'&&/^0x[\da-f]{40}$/i.test(value);
const validTx=(tx:unknown,wallet:string,chain:number)=>{const t=tx as Tx|null;return Boolean(t&&address(t.to)&&t.from?.toLowerCase()===wallet.toLowerCase()&&t.chainId===chain&&typeof t.data==='string'&&/^0x[\da-f]*$/i.test(t.data)&&typeof t.value==='string'&&/^\d+$/.test(t.value))};
export function pendingTradeKey(token:string,wallet:string){return `misthra.trade.pending:${token.toLowerCase()}:${wallet.toLowerCase()}`}
export function receiptRecorder(initial:PendingTrade,key:string,storage:Pick<Storage,'setItem'|'removeItem'>){
 let progress=initial.progress.slice();
 return (index:number,state:StepProgress)=>{
  progress=progress.map((previous,i)=>i===index?state:previous);
  if(progress.some(step=>step.status==='submitted'&&step.hash))storage.setItem(key,JSON.stringify({...initial,progress}));
  else if(progress.some(step=>step.hash))storage.removeItem(key);
 };
}
export function readPendingTrade(value:unknown,wallet:string,chain:number):PendingTrade|null{
 const saved=value as PendingTrade|null,q=saved?.quote;
 if(!saved||!['buy','sell'].includes(saved.side)||typeof saved.amount!=='string'||!/^\d+(\.\d{1,18})?$/.test(saved.amount)||typeof saved.slippage!=='string'||!/^\d+(\.\d+)?$/.test(saved.slippage))return null;
 if(!q||q.source!=='live'||!validTx(q.tx,wallet,chain)||!Array.isArray(saved?.progress))return null;
 const approvals=q.approvals?.length?q.approvals:q.approveTx?[q.approveTx]:[];
 if(!Array.isArray(approvals)||approvals.length>10||approvals.some(tx=>!validTx(tx,wallet,chain))||saved.progress.length!==approvals.length+1)return null;
 if(!saved.progress.every(p=>p&&['waiting','wallet','submitted','confirmed','failed'].includes(p.status)&&(!p.hash||/^0x[\da-f]{64}$/i.test(p.hash))))return null;
 if(!saved.progress.some(p=>p.status==='submitted'&&p.hash))return null;
 return saved;
}
