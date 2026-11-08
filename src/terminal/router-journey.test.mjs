import test from 'node:test';
import assert from 'node:assert/strict';
import {createBuckets, routeIssues, toggleDestination, destinationLabel} from './router-journey.ts';
const creator='0x'+'1'.repeat(40);
const valid=()=>createBuckets().map(b=>({...b,wallets:b.wallets.map(w=>({...w,address:creator}))}));

test('new routes select native HYPE only, with separate wallet state per bucket',()=>{
  const buckets=createBuckets();
  assert.deepEqual(buckets.filter(b=>b.on).map(b=>[b.kind,b.pct]),[['native','100']]);
  buckets[0].wallets[0].address=creator;
  assert.equal(buckets[1].wallets[0].address,'');
  assert.equal(destinationLabel('native'),'HYPE wallets');
  assert.equal(destinationLabel('wallets'),'WHYPE wallets');
});
test('first replacement destination receives the full share without losing existing edits',()=>{
  let buckets=toggleDestination(createBuckets(),'native',false);
  buckets=toggleDestination(buckets,'wallets',true);
  assert.equal(buckets.find(b=>b.kind==='wallets').pct,'100');
  buckets=buckets.map(b=>b.kind==='wallets'?{...b,pct:'65'}:b);
  buckets=toggleDestination(buckets,'buyback-burn',true);
  assert.equal(buckets.find(b=>b.kind==='buyback-burn').pct,'0');
  assert.equal(buckets.find(b=>b.kind==='wallets').pct,'65');
});
test('review issues link creator, destination and allocation problems to the correct step',()=>{
  assert.deepEqual(routeIssues(creator,valid()),[]);
  assert.equal(routeIssues('',valid())[0].step,0);
  assert.equal(routeIssues(creator,valid().map(b=>({...b,on:false})))[0].step,1);
  const invalid=valid().map(b=>b.kind==='native'?{...b,pct:'100.001',wallets:[{address:'bad',pct:'90',editable:false}]}:b);
  const issues=routeIssues(creator,invalid);
  assert.ok(issues.every(i=>i.step===2));
  assert.ok(issues.some(i=>/address/.test(i.message)));
  assert.ok(issues.some(i=>/100%/.test(i.message)));
});
test('nested wallet percentages must total exactly 100 independently of bucket allocation',()=>{
  const buckets=valid().map(b=>b.kind==='native'?{...b,wallets:[{address:creator,pct:'33.33',editable:true},{address:creator,pct:'66.67',editable:false}]}:b);
  assert.deepEqual(routeIssues(creator,buckets),[]);
  buckets[0].wallets[1].pct='66.66';
  assert.match(routeIssues(creator,buckets).map(i=>i.message).join(' '),/99.99%/);
});
