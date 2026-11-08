import test from 'node:test';
import assert from 'node:assert/strict';
import {tradeAccess, externalVenueUrl, quoteMatchesSource} from './trade-access.ts';
test('only explicit live trade availability permits a wallet route',()=>{
  assert.equal(tradeAccess('live',{misthra:true,reason:null,venueUrl:null}).wallet,true);
  const v4=tradeAccess('live',{misthra:false,reason:'Use Montra for this v4 pool.',venueUrl:'https://montra.example/trade'});
  assert.equal(v4.wallet,false);assert.equal(v4.quote,false);assert.equal(v4.paper,false);
  assert.equal(v4.reason,'Use Montra for this v4 pool.');assert.equal(v4.venueUrl,'https://montra.example/trade');
  assert.equal(tradeAccess('live',undefined).wallet,false);
  assert.equal(tradeAccess(undefined,{misthra:true}).quote,false);
});
test('simulated source allows paper quotes but never a wallet transaction or venue link',()=>{
  const access=tradeAccess('simulated',{misthra:true,venueUrl:'https://example.com'});
  assert.equal(access.wallet,false);assert.equal(access.quote,true);assert.equal(access.paper,true);assert.equal(access.venueUrl,null);
  assert.equal(quoteMatchesSource('simulated',{source:'live',tx:{}}),false);
  assert.equal(quoteMatchesSource('live',{source:'simulated',tx:null}),false);
  assert.equal(quoteMatchesSource('simulated',{source:'simulated',tx:null}),true);
});
test('external venue links accept only http and https URLs',()=>{
  for(const value of [null,'','javascript:alert(1)','data:text/html,hello','/relative'])assert.equal(externalVenueUrl(value),null);
  assert.equal(externalVenueUrl('https://montra.example/token/abc'),'https://montra.example/token/abc');
});
