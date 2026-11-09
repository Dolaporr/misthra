import test from 'node:test';
import assert from 'node:assert/strict';
import {usdMarketCap,usdUnavailable,artworkUrl} from './market-display.ts';
test('market cap uses explicitly supplied USD values only, preserving unavailable rather than false zero',()=>{
 assert.equal(usdMarketCap('0'),'$0.00');
 assert.equal(usdMarketCap('12500'),'$12.5K');
 assert.equal(usdMarketCap('950.25'),'$950.25');
 assert.equal(usdMarketCap('0.00012345'),'$0.000123');
 for(const value of [undefined,null,'','NaN','Infinity','-1','12 HYPE'])assert.equal(usdMarketCap(value),'—');
});
test('artwork accepts only HTTPS without credentials and keeps absent images neutral',()=>{
 assert.equal(artworkUrl('https://ipfs.io/ipfs/token'),'https://ipfs.io/ipfs/token');
 for(const value of [null,'','http://example.com/image.png','javascript:alert(1)','data:image/svg+xml,hi','https://user:secret@example.com/image.png'])assert.equal(artworkUrl(value),null);
});
test('stale dollar values are unavailable even while the displayed feed is held',()=>{
 const rate={hypeUsd:'74.2375',source:'Hyperliquid',fetchedAt:1000,stale:false,maxAgeMs:120000,reason:null};
 assert.equal(usdUnavailable(rate,121000),null);
 assert.match(usdUnavailable(rate,121001),/stale/);
 assert.equal(usdUnavailable({...rate,hypeUsd:null,stale:true,reason:'Rate not fetched'},2000),'Rate not fetched');
 assert.equal(usdUnavailable({...rate,source:'simulated',maxAgeMs:null},999999),null);
 assert.match(usdUnavailable(null),/unavailable/);
});
