import test from 'node:test';
import assert from 'node:assert/strict';
import {usdMarketCap,usdUnavailable,usdExpiresAt,artworkUrl} from './market-display.ts';
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
test('server age plus elapsed receipt time expires held prices without the device wall clock',()=>{
 const rate={hypeUsd:'74.2375',source:'Hyperliquid',fetchedAt:1000,stale:false,maxAgeMs:120000,reason:null};
 // Response is 30 seconds old on the server; its receipt uses a monotonic clock.
 const expiry=usdExpiresAt(rate,31000,500);
 assert.equal(expiry,90500);
 assert.equal(usdUnavailable(rate,expiry,90499),null);
 assert.match(usdUnavailable(rate,expiry,90500),/stale/);
 const original=Date.now;
 try{for(const skew of [-300000,300000]){Date.now=()=>31000+skew;assert.equal(usdExpiresAt(rate,31000,500),expiry);assert.equal(usdUnavailable(rate,expiry,600),null)}}finally{Date.now=original}
 assert.equal(usdExpiresAt(rate,200000,500),500);
 assert.equal(usdUnavailable({...rate,hypeUsd:null,stale:true,reason:'Rate not fetched'},expiry,600),'Rate not fetched');
 assert.equal(usdExpiresAt({...rate,source:'simulated',maxAgeMs:null},31000,500),null);
 assert.equal(usdUnavailable({...rate,source:'simulated',maxAgeMs:null},null,999999),null);
 assert.equal(usdUnavailable(rate),null); // No server timing: trust the response, never guess from Date.now().
 assert.match(usdUnavailable(null),/unavailable/);
});
