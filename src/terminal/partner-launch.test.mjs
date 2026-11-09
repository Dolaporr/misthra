import test from 'node:test';
import assert from 'node:assert/strict';
import {readPartnerLink,partnerPlanFields,creatorWalletIssue,confirmedPartnerReturn,sendCreatorDeployment} from './partner-launch.ts';
const creator='0x'+'a'.repeat(40),router='0x'+'b'.repeat(40),partner={id:'agora',name:'Agora',url:'https://agoradex.app',returnHosts:['agoradex.app','www.agoradex.app']};
test('hash deep link preserves valid prefill and sends attribution only for known partners',()=>{
 const link=readPartnerLink('#/launch?ref=agora&creator='+creator+'&pad=montra&returnUrl='+encodeURIComponent('https://agoradex.app/launch?step=fees'));
 assert.equal(link.creator,creator);assert.equal(link.pad,'montra');assert.deepEqual(partnerPlanFields(link,[partner]),{ref:'agora',returnUrl:'https://agoradex.app/launch?step=fees'});
 assert.deepEqual(partnerPlanFields({...link,ref:'unknown'},[partner]),{});
 assert.equal(readPartnerLink('#/launch?creator=bad').creator,'');
});
test('deployment checks plan sender, actual wallet, network and navigation before sending',async()=>{
 const tx={from:creator,to:router,data:'0x1234',value:'0',chainId:99901},calls=[];
 const io={request:async args=>{calls.push(args);return args.method==='eth_accounts'?[creator]:args.method==='eth_chainId'?'0x1863d':'hash'},isCurrent:()=>true,watch:()=>()=>{}};
 assert.equal(await sendCreatorDeployment(tx,creator,creator,99901,io),'hash');
 assert.equal(calls.at(-1).params[0].from,creator);
 await assert.rejects(sendCreatorDeployment(tx,creator,router,99901,io),/setup is for/);
 await assert.rejects(sendCreatorDeployment({...tx,from:router},creator,creator,99901,io),/plan does not match/);
 await assert.rejects(sendCreatorDeployment(tx,creator,creator,99901,{...io,isCurrent:()=>false}),/setup or wallet changed/);
 await assert.rejects(sendCreatorDeployment(tx,creator,creator,99901,{...io,request:async args=>args.method==='eth_accounts'?[router]:assert.fail('must not send')}),/setup is for/);
});
test('provider account or chain events invalidate an attempt during pending wallet reads',async()=>{
 const tx={from:creator,to:router,data:'0x1234',value:'0',chainId:99901};
 let invalidate=()=>{},stopped=false,sends=0;
 await assert.rejects(sendCreatorDeployment(tx,creator,creator,99901,{watch:fn=>{invalidate=fn;return()=>{stopped=true}},isCurrent:()=>true,request:async args=>{if(args.method==='eth_accounts')return [creator];if(args.method==='eth_chainId'){invalidate();return '0x1863d'}sends++;return 'hash'}}),/wallet changed/);
 assert.equal(sends,0);assert.equal(stopped,true);
});
test('only a confirmed deployment and validated server return URL produce a partner link',()=>{
 const plan={ref:{id:'agora',name:'Agora'},returnUrl:'https://agoradex.app/launch?step=fees&router=old',predictedAddress:router};
 assert.equal(new URL(confirmedPartnerReturn(plan,partner,true)).searchParams.get('router'),router);
 assert.equal(confirmedPartnerReturn(plan,partner,false),null);
 for(const value of [null,'javascript:alert(1)','https://agoradex.app.evil.example','http://agoradex.app','https://evil.example','https://user@agoradex.app'])assert.equal(confirmedPartnerReturn({...plan,returnUrl:value},partner,true),null);
 assert.equal(confirmedPartnerReturn({...plan,ref:null},partner,true),null);
 assert.equal(confirmedPartnerReturn({...plan,returnUrl:null},partner,true),null);
});
test('deployment requires the creator wallet, case-insensitively',()=>{
 assert.equal(creatorWalletIssue(creator,creator.toUpperCase()),null);
 assert.match(creatorWalletIssue(creator,undefined),/Connect/);
 assert.match(creatorWalletIssue(creator,router),/setup is for/);
});
