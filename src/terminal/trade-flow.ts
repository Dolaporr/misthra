import type { Quote, Tx } from './model';

export type TradeStep = { label: string; tx: Tx };
export type StepProgress = { status: 'waiting'|'wallet'|'submitted'|'confirmed'|'failed'; hash?: string };
export function quoteRoute(via: Quote['via']) { return via==='agora'?'Agora best price':via==='misthra'?'Misthra':via==='simulated'?'Simulated route':'Route unavailable'; }
export function tradeSteps(quote: Quote): TradeStep[] {
  if (!quote.tx) return [];
  const approvals=quote.approvals?.length?quote.approvals:quote.approveTx?[quote.approveTx]:[];
  return [...approvals.map((tx,i)=>({label:approvals.length>1?`Approve token use ${i+1}`:'Approve token use',tx})),{label:'Swap',tx:quote.tx}];
}
export async function runTradeSteps(steps:TradeStep[],previous:StepProgress[],io:{send:(tx:Tx)=>Promise<string>;confirm:(hash:string,tx:Tx)=>Promise<void>;progress:(index:number,state:StepProgress)=>void}){
  let last='';
  for(let i=0;i<steps.length;i++){
    const old=previous[i];if(old?.status==='confirmed'){last=old.hash||'';continue}
    if(old?.status==='failed'&&old.hash)throw new Error('A transaction reverted. Request a fresh quote before trying again.');
    let hash=old?.status==='submitted'?old.hash:undefined;
    try{
      if(!hash){io.progress(i,{status:'wallet'});hash=await io.send(steps[i].tx)}
      io.progress(i,{status:'submitted',hash});await io.confirm(hash,steps[i].tx);
      io.progress(i,{status:'confirmed',hash});last=hash;
    }catch(error){io.progress(i,{status:hash&&!(error as {reverted?:boolean}).reverted?'submitted':'failed',...(hash?{hash}:{})});throw error}
  }
  return last;
}

// Read confirmations through the user's provider; never hold or request a key.
export async function confirmInWallet(hash:string,tx:Tx){
  const eth=(window as unknown as {ethereum?:{request:(args:{method:string;params?:unknown[]})=>Promise<unknown>}}).ethereum;
  if(!eth)throw new Error('Transaction submitted. Reconnect your wallet to check confirmation.');
  const deadline=Date.now()+90_000;
  while(Date.now()<deadline){
    if(tx.chainId&&Number(await eth.request({method:'eth_chainId'}))!==tx.chainId)throw new Error('Transaction submitted. Switch back to its network to check confirmation.');
    const receipt=await eth.request({method:'eth_getTransactionReceipt',params:[hash]}) as {status?:string}|null;
    if(receipt?.status==='0x1')return;
    if(receipt?.status==='0x0')throw Object.assign(new Error('Transaction reverted. Request a fresh quote.'),{reverted:true});
    await new Promise(resolve=>window.setTimeout(resolve,1500));
  }
  throw new Error('Transaction submitted but not confirmed yet. Use “Check confirmation” to check again without resending it.');
}
