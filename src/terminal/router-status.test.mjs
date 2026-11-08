import test from 'node:test';
import assert from 'node:assert/strict';
import { exactAmount, samePreparedCall, preparedIssue, readPendingAction, recheckRouterAction, actionAsset, hasAssetAmount } from './router-status.ts';

test('router balances preserve exact units, tiny amounts and large integers',()=>{
  assert.equal(exactAmount('990000000000000000',18),'0.99');
  assert.equal(exactAmount('1',18),'0.000000000000000001');
  assert.equal(exactAmount('9007199254740993123456',6),'9007199254740993.123456');
  assert.equal(exactAmount('123',0),'123');
});
test('unreadable values never become zero',()=>{
  assert.equal(exactAmount(null,18),'Unavailable');
  assert.equal(exactAmount('0',18),'0');
  assert.equal(exactAmount('100',undefined),'Unavailable');
  assert.equal(exactAmount('oops',18),'Unavailable');
});
test('signing requires review again when a fresh prepared transaction changes',()=>{
  const tx={chainId:99901,from:'0xabc',to:'0xdef',data:'0x1234',value:'0'};
  assert.equal(samePreparedCall(tx,{...tx}),true);
  for(const change of [{chainId:1},{from:'0xother'},{to:'0xother'},{data:'0xab'},{value:'1'}])assert.equal(samePreparedCall(tx,{...tx,...change}),false);
  assert.equal(samePreparedCall(tx,null),false);
});
test('prepared actions must match the reviewed router, sender and chain',()=>{
  const result={ok:true,tx:{to:'0xrouter',from:'0xwallet',chainId:99901,data:'0x',value:'0'},preconditions:[{ok:true,detail:'Ready'}]};
  assert.equal(preparedIssue(result,'0xrouter','0xwallet',99901),null);
  assert.match(preparedIssue(result,'0xother','0xwallet',99901),/does not match/);
  assert.match(preparedIssue(result,'0xrouter','0xother',99901),/does not match/);
  assert.match(preparedIssue(result,'0xrouter','0xwallet',1),/does not match/);
  assert.match(preparedIssue({...result,preconditions:[{ok:false}]},'0xrouter','0xwallet',99901),/not ready/);
});
test('a pending transaction can recover for confirmation without preparing or sending again',()=>{
  const record={selected:{action:'sync'},input:'',prepared:{ok:true,tx:{to:'0xrouter',from:'0xwallet',chainId:99901,data:'0x',value:'0'}},progress:{status:'submitted',hash:'0x'+'a'.repeat(64)}};
  assert.equal(readPendingAction(JSON.stringify(record),'0xrouter',99901).progress.hash,record.progress.hash);
  assert.equal(readPendingAction(JSON.stringify(record),'0xother',99901),null);
  assert.equal(readPendingAction(JSON.stringify(record),'0xrouter',1),null);
  assert.equal(readPendingAction('{broken','0xrouter',99901),null);
  assert.equal(readPendingAction(JSON.stringify({...record,progress:{status:'confirmed'}}),'0xrouter',99901),null);
});
test('fresh preparation happens before execution, and changed/rejected calls never reach the wallet',async()=>{
  const reviewed={ok:true,amount:'10',tx:{to:'0xrouter',from:'0xwallet',chainId:99901,data:'0x1234',value:'0'}};
  const context={router:'0xrouter',wallet:'0xwallet',chainId:99901};
  for(const [fresh,state] of [[reviewed,'confirmed'],[{...reviewed,amount:'11'},'changed'],[{...reviewed,tx:{...reviewed.tx,data:'0x5678'}},'changed'],[{...reviewed,ok:false,tx:null,reason:'Guard not ready'},'unavailable']]){
    const calls=[];
    const result=await recheckRouterAction(reviewed,context,{prepare:async()=>{calls.push('prepare');return fresh},execute:async()=>{calls.push('wallet-and-confirm')}});
    assert.equal(result.state,state);
    assert.deepEqual(calls,state==='confirmed'?['prepare','wallet-and-confirm']:['prepare']);
  }
});
test('action amount units distinguish WHYPE input, output funding and configuration changes',()=>{
  const router={whype:'0xwhype',buckets:[{id:2,resolvedOutput:'0xsubject'}]};
  assert.equal(actionAsset({action:'processBucket',params:{bucket:2}},router),'0xwhype');
  assert.equal(actionAsset({action:'fundSink',params:{bucket:2}},router),'0xsubject');
  for(const action of ['sync','sendWallet','sendProtocolFee'])assert.equal(actionAsset({action,params:{asset:'0xnative'}},router),'0xnative');
  assert.equal(hasAssetAmount('bind'),false);assert.equal(hasAssetAmount('repointWallet'),false);
  assert.equal(actionAsset({action:'fundSink',params:{bucket:99}},router),null);
});
