import test from 'node:test';
import assert from 'node:assert/strict';
import {scrollVideoProgress,scrollVideoTime,videoUnavailable} from '../src/lib/scroll-video.ts';

test('figure completes its turn over the sticky scene, not over the whole document',()=>{
  assert.equal(scrollVideoProgress(28,1500,900),0);
  assert.equal(scrollVideoProgress(-300,1500,900),0.5);
  assert.equal(scrollVideoProgress(-600,1500,900),1);
  assert.equal(scrollVideoProgress(-1500,1500,900),1);
});
test('scrolling back reverses the turn without playing the film',()=>{
  const forward=scrollVideoTime(scrollVideoProgress(-450,1500,900),4);
  const back=scrollVideoTime(scrollVideoProgress(-150,1500,900),4);
  assert.equal(forward,3);assert.equal(back,1);
});
test('the final scroll position stays inside the last decodable frame',()=>{
  assert.equal(scrollVideoTime(1,4),4-1/30);
  assert.equal(scrollVideoTime(4,4),4-1/30);
  assert.equal(scrollVideoTime(-1,4),0);
});
test('unloaded film or a scene without scroll travel stays at the poster',()=>{
  for(const duration of [NaN,Infinity,0,-3])assert.equal(scrollVideoTime(.5,duration),0);
  assert.equal(scrollVideoProgress(-100,800,900),0);
  assert.equal(scrollVideoProgress(NaN,1500,900),0);
  assert.equal(scrollVideoTime(NaN,4),0);
});

test('all unavailable video sources show a still-image state even without a MediaError',()=>{
  assert.equal(videoUnavailable(0,3,false),true);
  assert.equal(videoUnavailable(0,2,true),true);
});
test('a rejected source does not disable a valid fallback that is still loading',()=>{
  assert.equal(videoUnavailable(0,2,false),false);
  assert.equal(videoUnavailable(4,1,false),false);
});
