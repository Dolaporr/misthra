import test from 'node:test';
import assert from 'node:assert/strict';
import {readPendingTrade,pendingTradeKey,receiptRecorder} from './pending-trade.ts';
test('receipt recovery is scoped to the original signer and chain and requires a submitted hash',()=>{
 const wallet='0x'+'a'.repeat(40),hash='0x'+'b'.repeat(64),tx={from:wallet,to:'0x'+'c'.repeat(40),chainId:99901,data:'0x1234',value:'0'};
 const saved={side:'sell',amount:'1.5',slippage:'1',quote:{source:'live',tx,approveTx:null},progress:[{status:'submitted',hash}]};
 assert.deepEqual(readPendingTrade(saved,wallet,99901),saved);
 for(const value of [null,{...saved,progress:[]},{...saved,progress:[{status:'confirmed',hash}]},{...saved,progress:[{status:'submitted',hash:'bad'}]},{...saved,quote:{...saved.quote,source:'simulated'}}])assert.equal(readPendingTrade(value,wallet,99901),null);
 assert.equal(readPendingTrade(saved,'0x'+'d'.repeat(40),99901),null);
 assert.equal(readPendingTrade(saved,wallet,99801),null);
 assert.equal(pendingTradeKey('0xAA','0xBB'),pendingTradeKey('0xaa','0xbb'));
});
test('a returned hash persists under its original context even when UI ownership changes',()=>{
 const entries=new Map(),storage={setItem:(key,value)=>entries.set(key,value),removeItem:key=>entries.delete(key)};
 const original={quote:{source:'live'},side:'sell',amount:'1.5',slippage:'1',progress:[{status:'waiting'},{status:'waiting'}]};
 const key=pendingTradeKey('tokenA','walletA'),record=receiptRecorder(original,key,storage);
 record(0,{status:'wallet'});
 // This recorder outlives the UI's current coin/wallet and retains its own key.
 record(0,{status:'submitted',hash:'hashA'});
 assert.equal(JSON.parse(entries.get(key)).progress[0].hash,'hashA');
 assert.equal(JSON.parse(entries.get(key)).side,'sell');
 assert.equal(entries.has(pendingTradeKey('tokenB','walletB')),false);
 record(0,{status:'confirmed',hash:'hashA'});assert.equal(entries.has(key),false);
});
