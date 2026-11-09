import test from 'node:test';
import assert from 'node:assert/strict';
import {liveQuoteIssue,sameQuoteReview,sendReviewedTrade} from './quote-review.ts';
import {Interface} from 'ethers';
const gateway=new Interface(['function buy(address,uint24,uint256,uint256)']);
const wallet='0x'+'a'.repeat(40),tx={from:wallet,to:'0x'+'b'.repeat(40),chainId:99901,value:'1',data:gateway.encodeFunctionData('buy',[wallet,3000,90071992547409930000n,121])};
const quote={source:'live',via:'misthra',tx,approveTx:null,quotedAt:1000,expiresAt:21000,deadline:121000,units:{amountIn:'1',amountInDecimals:18,amountOut:'90071992547409930001',minOut:'90071992547409930000',amountOutDecimals:18,fee:'0',feeDecimals:18},amountOut:'90.071992547409930001',minOut:'90.07199254740993',feeHype:'0',feeBps:75,priceImpactBps:0,route:'v3',slippageBps:100};
test('live quote requires exact amounts, current expiry, sender and chain on every step',()=>{
 assert.equal(liveQuoteIssue(quote,wallet,99901,2000),null);
 assert.match(liveQuoteIssue(quote,wallet,99901,21000),/expired/);
 assert.match(liveQuoteIssue({...quote,expiresAt:undefined},wallet,99901,2000),/expiry/);
 assert.match(liveQuoteIssue({...quote,units:undefined},wallet,99901,2000),/Exact/);
 assert.match(liveQuoteIssue({...quote,units:{...quote.units,minOut:'90071992547409930002'}},wallet,99901,2000),/invalid/);
 assert.match(liveQuoteIssue({...quote,approveTx:{...tx,from:'other'}},wallet,99901,2000),/different wallet/);
 assert.match(liveQuoteIssue(quote,wallet,99801,2000),/network/);
});
test('send checks expiry after wallet reads and never submits on wrong account or chain',async()=>{
 const calls=[];
 const io={request:async args=>{calls.push(args);return args.method==='eth_accounts'?[wallet]:args.method==='eth_chainId'?'0x1863d':'hash'},now:()=>2000,isCurrent:()=>true};
 assert.equal(await sendReviewedTrade(quote,tx,wallet,99901,io),'hash');
 assert.equal(calls.at(-1).params[0].value,'0x1');
 await assert.rejects(sendReviewedTrade(quote,{...tx,to:wallet},wallet,99901,io),/not part/);
 for(const overrides of [{now:()=>21000},{request:async a=>a.method==='eth_accounts'?['other']:assert.fail('must stop')},{request:async a=>a.method==='eth_accounts'?[wallet]:a.method==='eth_chainId'?'0x1':assert.fail('must not send')}])await assert.rejects(sendReviewedTrade(quote,tx,wallet,99901,{...io,...overrides}));
});
test('navigation during an asynchronous wallet read cancels before opening a signature',async()=>{
 let current=true,sends=0;
 await assert.rejects(sendReviewedTrade(quote,tx,wallet,99901,{request:async args=>{if(args.method==='eth_accounts')return [wallet];if(args.method==='eth_chainId'){current=false;return '0x1863d'}sends++;return 'hash'},now:()=>2000,isCurrent:()=>current}),/quote changed/);
 assert.equal(sends,0);
});
test('refreshes preserve review only when exact economics and authorization match',()=>{
 assert.equal(sameQuoteReview(quote,{...quote,quotedAt:2000,expiresAt:22000,deadline:122000,tx:{...tx,data:gateway.encodeFunctionData('buy',[wallet,3000,90071992547409930000n,122])}}),true);
 for(const patch of [{units:{...quote.units,minOut:'90071992547409929999'}},{tx:{...tx,to:wallet}},{tx:{...tx,data:gateway.encodeFunctionData('buy',[wallet,100,90071992547409930000n,121])}},{approveTx:tx},{route:'other'},{slippageBps:200}])assert.equal(sameQuoteReview(quote,{...quote,...patch}),false);
});
