import test from 'node:test';
import assert from 'node:assert/strict';
import {tradeSteps,quoteRoute,runTradeSteps} from './trade-flow.ts';
const tx=n=>({to:`target${n}`,data:'0x',value:'0',chainId:99801});
const quote={via:'agora',approvals:[tx(1),tx(2)],tx:tx(3),approveTx:tx(9)};
test('route labels and approvals preserve API order without duplicating legacy approval',()=>{
  assert.equal(quoteRoute('agora'),'Agora best price');assert.equal(quoteRoute('misthra'),'Misthra');assert.equal(quoteRoute('simulated'),'Simulated route');assert.equal(quoteRoute(undefined),'Route unavailable');
  assert.deepEqual(tradeSteps(quote).map(s=>s.tx.to),['target1','target2','target3']);assert.deepEqual(tradeSteps({...quote,tx:null}),[]);
});
test('each approval confirms before the next signature or swap',async()=>{
  const calls=[],states=[];
  await runTradeSteps(tradeSteps(quote),[],{send:async tx=>{calls.push(`send:${tx.to}`);return tx.to},confirm:async hash=>{calls.push(`confirm:${hash}`)},progress:(i,s)=>states.push([i,s.status])});
  assert.deepEqual(calls,['send:target1','confirm:target1','send:target2','confirm:target2','send:target3','confirm:target3']);assert.equal(states.at(-1)[1],'confirmed');
});
test('wallet rejection stops the sequence and never submits the swap',async()=>{
  const calls=[],states=[];
  await assert.rejects(runTradeSteps(tradeSteps(quote),[],{send:async tx=>{calls.push(tx.to);throw Error('Rejected')},confirm:async()=>{},progress:(i,s)=>states.push(s)}),/Rejected/);
  assert.deepEqual(calls,['target1']);assert.deepEqual(states.at(-1),{status:'failed'});
});
test('checking a submitted transaction never resends it or a confirmed approval',async()=>{
  const calls=[];
  await runTradeSteps(tradeSteps(quote),[{status:'confirmed',hash:'h1'},{status:'submitted',hash:'h2'}],{send:async tx=>{calls.push(`send:${tx.to}`);return 'swap'},confirm:async hash=>{calls.push(`confirm:${hash}`)},progress:()=>{}});
  assert.deepEqual(calls,['confirm:h2','send:target3','confirm:swap']);
});
test('reverted transactions require a fresh quote',async()=>{
  await assert.rejects(runTradeSteps(tradeSteps(quote),[{status:'failed',hash:'reverted'}],{send:async()=>{assert.fail('must not send')},confirm:async()=>{},progress:()=>{}}),/fresh quote/);
});
