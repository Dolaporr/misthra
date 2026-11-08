import test from 'node:test';
import assert from 'node:assert/strict';
import {validQuickAmount,quickAmountFromHash} from './quick-amount.ts';
test('quick amounts preserve exact decimals and reject invalid or excessive input',()=>{
 for(const value of ['0.000000000000000001','1','12.50'])assert.equal(validQuickAmount(value),true);
 for(const value of ['0','0.00','-1','1e3','Infinity','0.0000000000000000001','9'.repeat(19),null])assert.equal(validQuickAmount(value),false);
 assert.equal(quickAmountFromHash('#/t/coin?buy=1&amount=0.125'),'0.125');
 assert.equal(quickAmountFromHash('#/t/coin?amount=-3'),'0.5');
});
