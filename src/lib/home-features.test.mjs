import test from 'node:test';
import assert from 'node:assert/strict';
import {canRotateFeatures, nextFeature, HOME_FEATURES} from './home-features.ts';
test('features cycle Launch, Terminal and Agents with their own actions',()=>{
  assert.deepEqual(HOME_FEATURES.map(feature=>feature.label),['Launch','Terminal','Agents']);
  assert.deepEqual(HOME_FEATURES.map(feature=>feature.href),['#/launch','#/terminal','#/board']);
  assert.deepEqual([nextFeature(0),nextFeature(1),nextFeature(2)],[1,2,0]);
});
test('automatic feature motion stops for every user and visibility constraint',()=>{
  const state={paused:false,reduced:false,hovered:false,focused:false,visible:true,inView:true};
  assert.equal(canRotateFeatures(state),true);
  for(const flag of ['paused','reduced','hovered','focused'])assert.equal(canRotateFeatures({...state,[flag]:true}),false);
  for(const flag of ['visible','inView'])assert.equal(canRotateFeatures({...state,[flag]:false}),false);
});
