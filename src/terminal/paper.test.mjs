import test from 'node:test';import assert from 'node:assert/strict';import {paperTotals} from './paper.ts';
test('paper totals use only returned values and preserve losses',()=>assert.deepEqual(paperTotals([{valueHype:2,pnlHype:-.2},{valueHype:3,pnlHype:.1}]),{value:5,pnl:-.1}));
test('missing paper values remain unavailable rather than invented zeroes',()=>{assert.deepEqual(paperTotals([{valueHype:NaN,pnlHype:1}]),{value:null,pnl:1});assert.deepEqual(paperTotals([]),{value:0,pnl:0})});
