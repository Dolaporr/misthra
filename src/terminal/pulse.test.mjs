import test from 'node:test';import assert from 'node:assert/strict';
import {connectFeed} from './stream.ts';
import {loadColumnFilters,matchesLaunch,validFilters} from './pulse-filters.ts';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('SSE events coalesce into a fresh feed; errors poll and hidden pages stop transport',async()=>{
  let fetches=0,closed=0;const modes=[],timers=new Map(),events={};let id=0;
  const source={onopen:null,onerror:null,addEventListener:(type,fn)=>{events[type]=fn},close:()=>closed++};
  const controller=connectFeed({fetch:async()=>{fetches++;return fetches},data:()=>{},error:()=>{},mode:m=>modes.push(m),stream:()=>source,later:(fn,ms)=>{timers.set(++id,{fn,ms});return id},cancel:key=>timers.delete(key)});
  await flush();assert.equal(fetches,1);source.onopen();await flush();assert.equal(fetches,2);assert.equal(modes.at(-1),'stream');events.launch();events.update();assert.equal([...timers.values()].filter(t=>t.ms===350).length,1);
  const timer=[...timers.entries()][0];timers.delete(timer[0]);timer[1].fn();await flush();assert.equal(fetches,3);
  source.onerror();assert.ok([...timers.values()].some(t=>t.ms===3000));controller.setVisible(false);assert.equal(modes.at(-1),'paused');assert.equal(timers.size,0);assert.equal(closed,1);
  controller.setVisible(true);await flush();assert.equal(fetches,4);controller.close();assert.equal(closed,2);
});
test('lack of EventSource uses polling and cleanup removes it',()=>{const timers=new Set();let mode;const c=connectFeed({fetch:async()=>1,data:()=>{},error:()=>{},mode:v=>mode=v,later:fn=>{timers.add(fn);return fn},cancel:fn=>timers.delete(fn)});assert.equal(mode,'polling');assert.equal(timers.size,1);c.close();assert.equal(timers.size,0)});
test('column presets and storage normalization stay independent',()=>{
  const state=loadColumnFilters(null);state.new.presets.P1.minLiq='20';state.new.active='P2';assert.equal(state.new.presets.P2.minLiq,'');assert.equal(state.stretch.presets.P1.minLiq,'');assert.equal(loadColumnFilters({new:{active:'INVALID',presets:{P1:{hideFailed:'yes'}}}}).new.active,'P1');
});
test('filter thresholds, source data and failed-safety decisions are applied without inventing results',()=>{
  const item={symbol:'HYPE',name:'Example',address:'0x123',pad:{id:'pad'},liquidityHype:'20',holders:25,createdAt:1000,safety:{status:'fail'}};const f=loadColumnFilters(null).new.presets.P1;
  assert.equal(matchesLaunch(item,'example',{...f,minLiq:'20',minHolders:'25'},2000),true);assert.equal(matchesLaunch(item,'',{...f,hideFailed:true},2000),false);assert.equal(matchesLaunch(item,'',{...f,minLiq:'21'},2000),false);assert.equal(validFilters({...f,minHolders:'1.2'}),false);
});
