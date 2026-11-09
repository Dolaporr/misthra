import test from 'node:test';
import assert from 'node:assert/strict';
import {readPulseView,sortLaunches,toggleWatch} from './pulse-view.ts';
test('device preferences sanitize corrupt data and public addresses',()=>{
 const a='0x'+'A'.repeat(40);
 assert.deepEqual(readPulseView(null),{compact:false,sort:'age',watched:[]});
 assert.deepEqual(readPulseView({compact:true,sort:'volume',watched:[a,a.toLowerCase(),'bad',42]}),{compact:true,sort:'volume',watched:[a.toLowerCase()]});
 assert.equal(readPulseView({sort:'profit',compact:'yes'}).sort,'age');
 assert.equal(readPulseView({compact:'yes'}).compact,false);
});
test('watch toggling is case-insensitive, immutable and rejects malformed addresses',()=>{
 const a='0x'+'a'.repeat(40),b='0x'+'b'.repeat(40),input=[a];
 assert.deepEqual(toggleWatch(input,a.toUpperCase().replace('0X','0x')),[]);
 assert.deepEqual(toggleWatch(input,b),[a,b]);assert.deepEqual(input,[a]);
 assert.deepEqual(toggleWatch(input,'not-an-address'),[a]);
});
test('scanning sorts use returned values, keep unknown amounts last and do not mutate the feed',()=>{
 const items=[{address:'a',createdAt:10,volume5mHype:'2',mcapHype:'10'},{address:'b',createdAt:20,volume5mHype:'10',mcapHype:'2'},{address:'c',createdAt:30,volume5mHype:null,mcapHype:'invalid'}];
 assert.deepEqual(sortLaunches(items,'age').map(x=>x.address),['c','b','a']);
 assert.deepEqual(sortLaunches(items,'volume').map(x=>x.address),['b','a','c']);
 assert.deepEqual(sortLaunches(items,'mcap').map(x=>x.address),['a','b','c']);
 assert.deepEqual(items.map(x=>x.address),['a','b','c']);
});
