import test from 'node:test';import assert from 'node:assert/strict';import {chartGeometry,nearestCandle} from './chart-model.ts';
const bar=t=>({t,o:'1',h:'2',l:'.5',c:'1.5',v:'10'});
test('chart geometry stays finite for flat candles and different viewport widths',()=>{for(const width of [280,360,1000]){const g=chartGeometry([{t:1,o:'1',h:'1',l:'1',c:'1',v:'0'}],width);assert.ok(Number.isFinite(g.y('1')));assert.equal(g.W,width);assert.ok(g.plot>0)}});
test('chart drops invalid candles, sorts without mutation and caps the window',()=>{const bars=Array.from({length:100},(_,i)=>bar(100-i));const g=chartGeometry([...bars,{...bar(101),h:'NaN'}]);assert.equal(g.shown.length,90);assert.equal(g.shown[0].t,11);assert.equal(bars[0].t,100);assert.equal(chartGeometry([]),null)});
test('pointer selection clamps to the visible candle range',()=>{assert.equal(nearestCandle(-10,5,30),0);assert.equal(nearestCandle(1000,5,30),29);assert.equal(nearestCandle(12,5,30),2)});
