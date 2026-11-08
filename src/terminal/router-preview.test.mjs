import test from 'node:test';import assert from 'node:assert/strict';
import {buybackUnavailable,buybackUnavailableMessage,percentToBps,oneHypeBucketPreview} from './router-preview.ts';
test('buyback is disabled only when every selected pad explicitly cannot support it',()=>{
 const pads=[{id:'a',buyback:'no'},{id:'b',buyback:'no'},{id:'c',buyback:'unconfirmed'}];
 assert.equal(buybackUnavailable(pads,[]),false);assert.equal(buybackUnavailable(pads,['a','b']),true);assert.equal(buybackUnavailable(pads,['a','c']),false);assert.equal(buybackUnavailable(pads,['missing']),false);
});
test('fee examples distribute exactly 0.99 HYPE after the fixed protocol fee',()=>{
  assert.equal(oneHypeBucketPreview('100'),'0.99');assert.equal(oneHypeBucketPreview('50'),'0.495');assert.equal(oneHypeBucketPreview('33.33'),'0.329967');assert.equal(oneHypeBucketPreview('0.01'),'0.000099');assert.equal(oneHypeBucketPreview('0'),'0');
});
test('percent shares reject invalid precision, negative and out-of-range values',()=>{
  assert.equal(percentToBps('.5'),50);assert.equal(percentToBps('12.34'),1234);
  for(const value of ['','-1','101','100.01','1.001','NaN','Infinity','1e2']){assert.equal(percentToBps(value),null);assert.equal(oneHypeBucketPreview(value),null)}
});
test('Montra buyback explanation keeps wallet splits available without calling other venues v4',()=>{
 const pads=[{id:'montra',name:'Montra',buyback:'no'},{id:'ascend',name:'Ascend',buyback:'no'},{id:'pangea',name:'Pangea',buyback:'unconfirmed'}];
 assert.match(buybackUnavailableMessage(pads,['montra']),/Montra.*Uniswap v4.*Wallet splits work/);
 assert.doesNotMatch(buybackUnavailableMessage(pads,['ascend']),/v4/);
 assert.equal(buybackUnavailableMessage(pads,['montra','pangea']),null);
});
