import test from 'node:test';
import assert from 'node:assert/strict';
import {readDisplay,defaultDisplay,capColor} from './display-preferences.ts';
test('display preferences reject malformed booleans and invalid ranges',()=>{
 assert.deepEqual(readDisplay(null),defaultDisplay);
 assert.deepEqual(readDisplay({compact:'yes',lowCap:Infinity,highCap:-1}),defaultDisplay);
 assert.equal(readDisplay({showAge:false}).showAge,false);
 assert.equal(readDisplay({lowCap:5,highCap:10}).highCap,10);
});
test('metric colors use USD ranges and never assign a color to missing or invalid values',()=>{
 const display={...defaultDisplay,colorCaps:true};
 assert.equal(capColor('29999',display),'#7fa8ff');assert.equal(capColor('30000',display),'#eed17d');assert.equal(capColor('150000',display),'#76d4a6');
 for(const n of [null,undefined,'','NaN','-1'])assert.equal(capColor(n,display),undefined);
 assert.equal(capColor('100',defaultDisplay),undefined);
});
