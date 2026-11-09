import type {Quote,Tx} from './model';
import {Interface} from 'ethers';
const gateway=new Interface(['function buy(address token,uint24 poolFee,uint256 minTokensOut,uint256 deadline)','function sell(address token,uint24 poolFee,uint256 amountIn,uint256 minHypeOut,uint256 deadline)']);
function reviewedData(q:Quote,tx:Tx){
 if(q.via==='misthra')try{const decoded=gateway.parseTransaction({data:tx.data});if(decoded){const args=Array.from(decoded.args);args[args.length-1]=0n;return gateway.encodeFunctionData(decoded.fragment,args)}}catch{}
 return tx.data;
}
const integer=(value:unknown):value is string=>typeof value==='string'&&/^\d+$/.test(value);
const decimals=(value:unknown)=>Number.isInteger(value)&&Number(value)>=0&&Number(value)<=255;
export function liveQuoteIssue(quote:Quote,wallet:string,chain:number,now:number):string|null{
 if(quote.source!=='live'||!quote.tx)return 'A live wallet quote is required.';
 if(!Number.isFinite(quote.expiresAt)||!Number.isFinite(quote.deadline)||!Number.isFinite(quote.quotedAt)||quote.quotedAt!>now||quote.expiresAt!<=now||quote.deadline!<=quote.expiresAt!)return 'This quote expired or has no valid expiry. Get a fresh quote.';
 const units=quote.units;
 if(!units||![units.amountIn,units.amountOut,units.minOut,units.fee].every(integer)||![units.amountInDecimals,units.amountOutDecimals,units.feeDecimals].every(decimals))return 'Exact quote amounts are unavailable. Get a fresh quote.';
 if(BigInt(units.amountIn)===0n||BigInt(units.minOut)>BigInt(units.amountOut))return 'The quote amounts are invalid.';
 for(const tx of [...(quote.approvals?.length?quote.approvals:quote.approveTx?[quote.approveTx]:[]),quote.tx]){
  if(tx.from?.toLowerCase()!==wallet.toLowerCase())return 'The quote was built for a different wallet. Get a fresh quote.';
  if(!Number.isSafeInteger(chain)||chain<=0||tx.chainId!==chain)return 'Switch your wallet to the quote’s network before continuing.';
 }
 return null;
}
// Deadline/expiry refreshes are expected. Changes to the reviewed economics or
// authorization requirements must be presented again before a signature.
export function sameQuoteReview(a:Quote,b:Quote):boolean{
 const call=(tx:Tx|null)=>tx&&({from:tx.from?.toLowerCase(),to:tx.to.toLowerCase(),chainId:tx.chainId,value:tx.value});
 const key=(q:Quote)=>JSON.stringify({source:q.source,via:q.via,units:q.units,amountOut:q.amountOut,minOut:q.minOut,feeHype:q.feeHype,feeBps:q.feeBps,priceImpactBps:q.priceImpactBps,route:q.route,slippageBps:q.slippageBps,tx:q.tx&&{...call(q.tx),data:reviewedData(q,q.tx)},approvals:(q.approvals?.length?q.approvals:q.approveTx?[q.approveTx]:[]).map(tx=>({...call(tx),data:tx.data}))});
 return Boolean(a.units&&b.units)&&key(a)===key(b);
}
export async function sendReviewedTrade(quote:Quote,tx:Tx,wallet:string,configuredChain:number,io:{request:(args:{method:string;params?:unknown[]})=>Promise<unknown>;now:()=>number;isCurrent:()=>boolean;watch:(invalidate:()=>void)=>()=>void}):Promise<string>{
 const calls=[...(quote.approvals?.length?quote.approvals:quote.approveTx?[quote.approveTx]:[]),quote.tx];
 if(!calls.some(call=>call&&call.from===tx.from&&call.to===tx.to&&call.data===tx.data&&call.value===tx.value&&call.chainId===tx.chainId))throw new Error('This transaction is not part of the reviewed quote.');
 let changed=false;const stop=io.watch(()=>{changed=true});
 try{
 const accounts=await io.request({method:'eth_accounts'}) as string[];
 if(!accounts[0]||accounts[0].toLowerCase()!==wallet.toLowerCase())throw new Error('Your wallet account changed. Sign in with the account used for this quote.');
 const chain=Number(await io.request({method:'eth_chainId'}));
 if(chain!==configuredChain)throw new Error('Switch your wallet to the configured Elysium network before continuing.');
 const issue=liveQuoteIssue(quote,accounts[0],chain,io.now());
 if(issue)throw new Error(issue);
 if(changed||!io.isCurrent())throw new Error('The quote changed or your wallet changed. Request a fresh quote.');
 return await io.request({method:'eth_sendTransaction',params:[{from:wallet,to:tx.to,data:tx.data,value:'0x'+BigInt(tx.value||'0').toString(16),chainId:'0x'+configuredChain.toString(16)}]}) as string;
 }finally{stop()}
}
