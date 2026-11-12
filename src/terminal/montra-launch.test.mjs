import test from 'node:test';
import assert from 'node:assert/strict';
import {payeeIssues, coinIssues, launchBody, switchBody, planIssue, hypeText, totalValue, collectTx, COLLECT_SELECTOR} from './montra-launch.ts';
import {id} from 'ethers';

const A='0x'+'1'.repeat(40), B='0x'+'2'.repeat(40), C='0x'+'3'.repeat(40);
const options={launchEnabled:true,launchFee:'10000000000000000',builderCode:'misthra',configs:[{id:0,quote:'0x0000000000000000000000000000000000000000',native:true,baseSupply:'1',totalFeePct:1,protocolFeePct:.4,lpFeePct:.2,earlyBuyFeeStartPct:0,earlyBuyFeeWindowS:0},{id:3,quote:B,native:false,baseSupply:'1',totalFeePct:1,protocolFeePct:.4,lpFeePct:.2,earlyBuyFeeStartPct:0,earlyBuyFeeWindowS:0}]};
const form=(p={})=>({name:'Test',symbol:'TST',description:'',logo:'',website:'',twitter:'',telegram:'',configId:0,firstBuy:'',...p});

test('payees: up to 16 distinct wallets whose shares total exactly 100%',()=>{
  assert.deepEqual(payeeIssues([{address:A,pct:'60'},{address:B,pct:'40'}]),[]);
  assert.match(payeeIssues([{address:A,pct:'60'},{address:B,pct:'30'}])[0].message,/90%/);
  assert.match(payeeIssues([{address:A,pct:'50'},{address:A.toUpperCase().replace('0X','0x'),pct:'50'}])[0].message,/twice/);
  assert.match(payeeIssues([{address:'0x000000000000000000000000000000000000dEaD',pct:'100'}])[0].message,/burn/);
  assert.ok(payeeIssues(Array.from({length:17},(_,i)=>({address:'0x'+(i+1).toString(16).padStart(40,'0'),pct:'1'}))).some(i=>/16/.test(i.message)));
  assert.match(payeeIssues([{address:A,pct:'0'}])[0].message,/above 0/);
});

test('coin form: ticker, link, launch type and first buy are checked',()=>{
  assert.deepEqual(coinIssues(form(),options),[]);
  assert.ok(coinIssues(form({symbol:'two words'}),options).some(i=>i.field==='symbol'));
  assert.ok(coinIssues(form({logo:'http://x.png'}),options).some(i=>i.field==='logo'));
  assert.ok(coinIssues(form({configId:9}),options).some(i=>i.field==='config'));
  assert.ok(coinIssues(form({configId:3,firstBuy:'1'}),options).some(i=>i.field==='firstBuy'),'no first buy on non-HYPE configs');
  assert.ok(coinIssues(form({firstBuy:'abc'}),options).some(i=>i.field==='firstBuy'));
  assert.deepEqual(coinIssues(form({firstBuy:'0.5'}),options),[]);
});

test('bodies: one native bucket, wallets fixed, first buy only when above zero',()=>{
  const b=launchBody(` ${A} `,form({firstBuy:'0'}),[{address:B,pct:'100'}]);
  assert.equal(b.creator,A);assert.equal('firstBuy' in b,false);
  assert.deepEqual(b.buckets,[{kind:'native',bps:10000,wallets:[{address:B,bps:10000,editable:false}]}]);
  assert.equal(launchBody(A,form({firstBuy:'0.25'}),[{address:B,pct:'100'}]).firstBuy,'0.25');
  assert.equal(switchBody(A,C,[{address:B,pct:'100'}]).token,C);
});

test('plans are refused unless they match the wallet, network and flow',()=>{
  const tx=(v='0')=>({from:A,to:B,data:'0x',value:v,chainId:99901});
  const plan={router:B,adapter:C,token:A,routerSalt:'0x',buckets:[],steps:[{id:'router',title:'',tx:tx()},{id:'launch',title:'',tx:tx('510000000000000000')},{id:'activate',title:'',tx:tx()}]};
  assert.equal(planIssue(plan,A,99901,'launch'),null);
  assert.match(planIssue(plan,B,99901,'launch'),/another wallet/);
  assert.match(planIssue(plan,A,99801,'launch'),/another network/);
  assert.match(planIssue(plan,A,99901,'switch'),/unexpected steps/);
  assert.equal(totalValue(plan),'510000000000000000');
  assert.equal(hypeText(totalValue(plan)),'0.51');
  assert.equal(hypeText('10000000000000000'),'0.01');
  assert.equal(hypeText(null),'—');
});

test('collect button calls collectAndForward() on the adapter',()=>{
  assert.equal(COLLECT_SELECTOR,id('collectAndForward()').slice(0,10));
  assert.deepEqual(collectTx(C,99901),{to:C,data:COLLECT_SELECTOR,value:'0',chainId:99901});
});
