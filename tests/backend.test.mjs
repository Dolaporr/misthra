import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Wallet } from 'ethers';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../server/app.mjs';

const baseMission = {title:'Research the Elysium testnet',task:'Write a sourced report on testnet architecture.',criteria:['Cite primary sources'],category:'research',output:'markdown',mode:'open',reward:'4',deadlineHours:24,reviewHours:2,claimHours:4,maxRevisions:1};
async function fixture(t, options={}) {
  const directory = await mkdtemp(join(tmpdir(),'errand-test-'));
  let clock = 1_800_000_000_000;
  const app = createApp({ dbPath:join(directory,'test.sqlite'),seed:false,now:()=>clock,...options });
  const server=app.listen(0,'127.0.0.1'); await new Promise(r=>server.once('listening',r));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const req=async(path,body,token,method=body===undefined?'GET':'POST')=>{
    const response=await fetch(origin+path,{method,headers:{...(body!==undefined&&!(body instanceof FormData)?{'Content-Type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body)});
    const json=await response.json(); return {status:response.status,body:json,headers:response.headers};
  };
  t.after(async()=>{await new Promise(r=>server.close(r));app.locals.close();await rm(directory,{recursive:true,force:true});});
  const demo=async role=>(await req('/api/auth/demo',{role})).body;
  const wallet=async()=>{const w=Wallet.createRandom();const c=await req('/api/auth/challenge',{address:w.address});const a=await req('/api/auth/verify',{address:w.address,nonce:c.body.nonce,signature:await w.signMessage(c.body.message)});return {...a.body,w,challenge:c.body};};
  return {app,req,demo,wallet,origin,advance:ms=>clock+=ms,directory};
}
async function setup(t,overrides={}) {const f=await fixture(t);const poster=await f.demo('poster');const agent=await f.demo('agent');await f.req('/api/account/faucet',{},poster.token);const m=await f.req('/api/missions',{...baseMission,...overrides},poster.token);assert.equal(m.status,200,JSON.stringify(m.body));return {...f,poster,agent,m:m.body,action:(action,actor=agent,extra={})=>f.req(`/api/missions/${m.body.id}/actions`,{action,...extra},actor.token)};}

test('auth is required, demo accounts are explicit, faucet is bounded',async t=>{const f=await fixture(t);assert.equal((await f.req('/api/account')).status,401);const p=await f.demo('poster');assert.equal(p.role,'poster');assert.equal((await f.req('/api/auth/me',undefined,p.token)).body.address,p.address);assert.equal((await f.req('/api/account/faucet',{},p.token)).body.balance,'10');assert.equal((await f.req('/api/account/faucet',{},p.token)).status,429);});

test('escrow settlement conserves funds, charges exact fee and cannot repeat',async t=>{const f=await setup(t);assert.equal((await f.req('/api/account',undefined,f.poster.token)).body.locked,'4');assert.equal((await f.action('claim')).status,200);assert.equal((await f.action('submit',f.agent,{text:'A sourced architecture report.'})).status,200);assert.equal((await f.action('accept',f.poster)).body.phase,'paid');assert.equal((await f.action('accept',f.poster)).status,409);const p=(await f.req('/api/account',undefined,f.poster.token)).body;const a=(await f.req('/api/account',undefined,f.agent.token)).body;assert.equal(p.balance,'6');assert.equal(p.locked,'0');assert.equal(p.spent,'4');assert.equal(a.balance,'3.9');assert.equal(a.earned,'3.9');assert.equal((await f.req('/api/stats')).body.paid,'3.9');});

test('unauthorized claims, submissions and reviews are denied',async t=>{const f=await setup(t);assert.equal((await f.action('claim',f.poster)).status,403);await f.action('claim');assert.equal((await f.action('submit',f.poster,{text:'No'})).status,403);await f.action('submit',f.agent,{text:'Work'});assert.equal((await f.action('accept',f.agent)).status,403);assert.equal((await f.action('cancel',f.poster)).status,409);});

test('concurrent claims have exactly one winner',async t=>{const f=await setup(t);const other=await f.wallet();const results=await Promise.all([f.action('claim'),f.req(`/api/missions/${f.m.id}/actions`,{action:'claim'},other.token)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);});

test('direct hiring starts the assigned worker immediately and enforces their address',async t=>{const f=await fixture(t);const p=await f.demo('poster');const a=await f.demo('agent');const outsider=await f.wallet();await f.req('/api/account/faucet',{},p.token);const m=await f.req('/api/missions',{...baseMission,mode:'direct',assignee:a.address},p.token);assert.equal(m.body.phase,'claimed');assert.equal(m.body.worker,a.address);assert.equal(typeof m.body.claimedAt,'number');assert.equal((await f.req(`/api/missions/${m.body.id}/actions`,{action:'submit',text:'Intrusion'},outsider.token)).status,403);assert.equal((await f.req(`/api/missions/${m.body.id}/actions`,{action:'submit',text:'Direct deliverable'},a.token)).body.phase,'submitted');});

test('claim TTL releases stale worker without paying and deadline refunds once',async t=>{const f=await setup(t);await f.action('claim');f.advance(5*3600000);assert.equal((await f.req(`/api/missions/${f.m.id}`)).body.phase,'open');const other=await f.wallet();assert.equal((await f.req(`/api/missions/${f.m.id}/actions`,{action:'claim'},other.token)).status,200);f.advance(24*3600000);assert.equal((await f.action('finalize',f.poster)).body.phase,'expired');assert.equal((await f.action('finalize',f.poster)).status,409);assert.equal((await f.req('/api/account',undefined,f.poster.token)).body.balance,'10');});

test('review window permits worker finalization and revision count is bounded',async t=>{const f=await setup(t);await f.action('claim');await f.action('submit',f.agent,{text:'First draft'});assert.equal((await f.action('finalize')).status,409);assert.equal((await f.action('revise',f.poster,{note:'Add source links'})).body.revisions,1);await f.action('submit',f.agent,{text:'Sources added'});assert.equal((await f.action('revise',f.poster,{note:'Again'})).status,409);f.advance(3*3600000);assert.equal((await f.action('finalize')).body.phase,'paid');});

test('rejection refunds escrow and tips debit poster without charging a second fee',async t=>{const f=await setup(t);await f.action('claim');await f.action('submit',f.agent,{text:'Work'});assert.equal((await f.action('accept',f.poster,{tip:'1'})).body.phase,'paid');assert.equal((await f.req('/api/account',undefined,f.agent.token)).body.balance,'4.9');const m=await f.req('/api/missions',{...baseMission,reward:'2'},f.poster.token);await f.req(`/api/missions/${m.body.id}/actions`,{action:'claim'},f.agent.token);await f.req(`/api/missions/${m.body.id}/actions`,{action:'submit',text:'Deliverable'},f.agent.token);assert.equal((await f.req(`/api/missions/${m.body.id}/actions`,{action:'reject',note:'Does not meet criteria'},f.poster.token)).body.phase,'refunded');});

test('raise and cancellation track exact escrow and reject unsafe money inputs',async t=>{const f=await setup(t);assert.equal((await f.action('raise',f.poster,{amount:'1.000000000000000001'})).body.reward,'5.000000000000000001');assert.equal((await f.action('cancel',f.poster)).body.phase,'refunded');assert.equal((await f.req('/api/account',undefined,f.poster.token)).body.balance,'10');for(const reward of ['-1','NaN','1e2','0.0000000000000000001',1])assert.equal((await f.req('/api/missions',{...baseMission,reward},f.poster.token)).status,400);});

test('competitions accept entries, keep scoring pending, require pick and winner confirmation',async t=>{const f=await setup(t,{mode:'competition',deadlineHours:1});const e=await f.req(`/api/missions/${f.m.id}/entries`,{text:'Competition deliverable'},f.agent.token);assert.equal(e.status,200);assert.equal(e.body.score,null);f.advance(3600001);assert.equal((await f.req(`/api/missions/${f.m.id}`)).body.phase,'picking');assert.equal((await f.action('pick',f.poster,{entryId:e.body.id})).body.selectedEntryId,e.body.id);assert.equal((await f.action('confirm',f.poster)).status,403);assert.equal((await f.action('confirm')).body.phase,'submitted');assert.equal((await f.action('confirm')).status,409);assert.equal((await f.action('accept',f.poster)).body.phase,'paid');});

test('signed wallet challenges are bound to address, single use, and expiring',async t=>{const f=await fixture(t);const w=await f.wallet();assert.equal(w.role,'wallet');assert.equal((await f.req('/api/auth/verify',{address:w.address,nonce:w.challenge.nonce,signature:await w.w.signMessage(w.challenge.message)})).status,401);const c=await f.req('/api/auth/challenge',{address:w.w.address});f.advance(6*60000);assert.equal((await f.req('/api/auth/verify',{address:w.w.address,nonce:c.body.nonce,signature:await w.w.signMessage(c.body.message)})).status,401);});

test('session cookies are HttpOnly and logout invalidates bearer token',async t=>{const f=await fixture(t);const r=await f.req('/api/auth/demo',{role:'poster'});assert.match(r.headers.get('set-cookie'),/HttpOnly/);await f.req('/api/auth/logout',{},r.body.token);assert.equal((await f.req('/api/account',undefined,r.body.token)).status,401);});

test('profile draft pairing is owner bound and consumed exactly once',async t=>{const f=await fixture(t);const p=await f.demo('poster');const a=await f.demo('agent');const d=await f.req('/api/connect/drafts',{name:'Research Owl',tagline:'Source-first research',skills:['research'],rate:'1',kind:'agent'},p.token);assert.equal(d.status,200);assert.equal((await f.req('/api/connect/claim',{code:d.body.code},p.token)).status,403);const c=await f.req('/api/connect/claim',{code:d.body.code},a.token);assert.equal(c.body.owner,p.address);assert.equal(c.body.address,a.address);assert.equal((await f.req('/api/connect/claim',{code:d.body.code},a.token)).status,409);assert.equal((await f.req('/api/agents',{name:'Impersonation',address:p.address},a.token)).body.address,a.address);});

test('private threads are visible only to poster and relevant agent',async t=>{const f=await setup(t);await f.action('claim');const outsider=await f.wallet();const msg=await f.req('/api/messages',{missionId:f.m.id,text:'Can you include sources?'},f.poster.token);assert.equal(msg.status,200);assert.equal((await f.req('/api/threads',undefined,outsider.token)).body.length,0);assert.equal((await f.req(`/api/threads/${msg.body.threadId}/messages`,undefined,outsider.token)).status,403);assert.equal((await f.req('/api/messages',{missionId:f.m.id,agent:f.agent.address,text:'Intrusion'},outsider.token)).status,403);assert.equal((await f.req(`/api/threads/${msg.body.threadId}/messages`,undefined,f.agent.token)).body[0].text,'Can you include sources?');});

test('simulated deposit and withdrawal conserve account and wallet funds',async t=>{const f=await fixture(t);const p=await f.demo('poster');assert.equal((await f.req('/api/account/deposit',{amount:'3'},p.token)).body.balance,'3');assert.equal((await f.req('/api/account/withdraw',{amount:'4'},p.token)).status,409);assert.equal((await f.req('/api/account/withdraw',{amount:'3'},p.token)).body.balance,'0');assert.equal((await f.req('/api/account/deposit',{amount:'101'},p.token)).status,409);});

test('chain mode exposes configured testnet and refuses simulated finances',async t=>{const f=await fixture(t,{mode:'chain'});assert.equal((await f.req('/api/auth/demo',{role:'poster'})).status,403);const w=await f.wallet();assert.equal((await f.req('/api/account/faucet',{},w.token)).status,409);assert.equal((await f.req('/api/missions',baseMission,w.token)).status,409);assert.equal((await f.req('/api/config')).body.network.chainId,99801);});

test('upload rejects executable payloads, spoofed magic and oversize files',async t=>{const f=await fixture(t);const a=await f.demo('agent');for(const [name,type,bytes] of [['attack.svg','image/svg+xml','<svg/>'],['fake.png','image/png','not a png'],['large.jpg','image/jpeg',new Uint8Array(1_500_001)]]) {const data=new FormData();data.append('file',new Blob([bytes],{type}),name);assert.equal((await f.req('/api/uploads',data,a.token)).status,400);}});

test('ledger persists across app instances and invalid origins cannot mutate',async t=>{const f=await setup(t);const second=createApp({dbPath:join(f.directory,'test.sqlite'),seed:false});assert.equal(second.locals.snapshot().missions.length,1);assert.equal(second.locals.snapshot().accounts[f.poster.address].balance,'6000000000000000000');second.locals.close();const r=await fetch(f.origin+'/api/auth/demo',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:JSON.stringify({role:'poster'})});assert.equal(r.status,403);});

test('competition winner gets a full confirmation TTL after the entry deadline',async t=>{const f=await setup(t,{mode:'competition',deadlineHours:1,claimHours:4});const e=await f.req(`/api/missions/${f.m.id}/entries`,{text:'Final design'},f.agent.token);f.advance(3600001);await f.action('pick',f.poster,{entryId:e.body.id});assert.equal((await f.req(`/api/missions/${f.m.id}`)).body.phase,'claimed');f.advance(3*3600000);assert.equal((await f.action('confirm')).body.phase,'submitted');});

test('claim and submission TTL boundaries use server time',async t=>{const f=await setup(t,{claimHours:1});await f.action('claim');f.advance(3600000);assert.equal((await f.action('submit',f.agent,{text:'Too late'})).status,409);});

test('competition may be picked before deadline and confirmation expiry refunds once',async t=>{const f=await setup(t,{mode:'competition',deadlineHours:24,claimHours:1});const e=await f.req(`/api/missions/${f.m.id}/entries`,{text:'Early deliverable'},f.agent.token);assert.equal((await f.action('pick',f.poster,{entryId:e.body.id})).status,200);f.advance(3600000);assert.equal((await f.action('confirm')).status,409);assert.equal((await f.action('finalize',f.poster)).body.phase,'expired');assert.equal((await f.req('/api/account',undefined,f.poster.token)).body.balance,'10');});

test('upload accepts a real PNG and rejects attachments owned by a different account',async t=>{const f=await setup(t);const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7r8AAAAASUVORK5CYII=','base64');const data=new FormData();data.append('file',new Blob([image],{type:'image/png'}),'pixel.png');const upload=await f.req('/api/uploads',data,f.poster.token);assert.equal(upload.status,200);await f.action('claim');assert.equal((await f.action('submit',f.agent,{text:'Work',attachments:[upload.body]})).status,400);const own=new FormData();own.append('file',new Blob([image],{type:'image/png'}),'own.png');const asset=await f.req('/api/uploads',own,f.agent.token);assert.equal((await f.action('submit',f.agent,{attachments:[asset.body]})).status,200);const download=await fetch(f.origin+asset.body.url);assert.equal(download.headers.get('content-type'),'image/png');assert.deepEqual(Buffer.from(await download.arrayBuffer()),image);});

test('failed funding is atomic and signature cannot authenticate another wallet',async t=>{const f=await fixture(t);const a=await f.wallet();assert.equal((await f.req('/api/missions',baseMission,a.token)).status,409);assert.equal((await f.req('/api/missions')).body.length,0);const other=Wallet.createRandom();const c=await f.req('/api/auth/challenge',{address:other.address});assert.equal((await f.req('/api/auth/verify',{address:other.address,nonce:c.body.nonce,signature:await a.w.signMessage(c.body.message)})).status,401);});

test('sample fixtures identify themselves and never fabricate paid work',async t=>{const f=await fixture(t,{seed:true});assert.equal((await f.req('/api/missions')).body.every(m=>m.sample),true);assert.equal((await f.req('/api/agents')).body.every(a=>a.sample),true);assert.equal((await f.req('/api/stats')).body.paid,'0');assert.equal((await f.req('/api/stats')).body.completed,0);});

test('competition confirmation cannot bypass a requested revision',async t=>{
  const f=await setup(t,{mode:'competition'});
  const entry=await f.req(`/api/missions/${f.m.id}/entries`,{text:'Initial entry'},f.agent.token);
  await f.action('pick',f.poster,{entryId:entry.body.id});
  await f.action('confirm');
  await f.action('revise',f.poster,{note:'Include the missing sources'});
  assert.equal((await f.action('confirm')).status,409);
  assert.equal((await f.req(`/api/missions/${f.m.id}`)).body.phase,'claimed');
  assert.equal((await f.action('submit',f.agent,{text:'Revised entry with sources'})).status,200);
  assert.equal((await f.action('accept',f.poster)).body.phase,'paid');
});

test('competitions advertise picking while accepting entries and appear in its filter',async t=>{
  const f=await setup(t,{mode:'competition'});
  assert.equal(f.m.phase,'picking');
  assert.equal((await f.req('/api/missions?status=picking')).body[0].id,f.m.id);
  assert.equal((await f.req(`/api/missions/${f.m.id}/entries`,{text:'Open entry'},f.agent.token)).status,200);
});

test('empty competitions retain their selection window before refund',async t=>{
  const f=await setup(t,{mode:'competition',deadlineHours:1,reviewHours:2});
  f.advance(3600000);
  assert.equal((await f.req(`/api/missions/${f.m.id}`)).body.phase,'picking');
  assert.equal((await f.action('finalize',f.poster)).status,409);
  f.advance(2*3600000);
  assert.equal((await f.action('finalize',f.poster)).body.phase,'expired');
  assert.equal((await f.req('/api/account',undefined,f.poster.token)).body.balance,'10');
});

test('profile avatars require an existing image uploaded by the profile editor',async t=>{
  const f=await fixture(t),poster=await f.demo('poster'),agent=await f.demo('agent');
  const data=new FormData();
  data.append('file',new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7r8AAAAASUVORK5CYII=','base64')],{type:'image/png'}),'avatar.png');
  const asset=(await f.req('/api/uploads',data,poster.token)).body;
  assert.equal((await f.req('/api/agents',{name:'Agent',avatar:asset.url},agent.token)).status,400);
  assert.equal((await f.req('/api/agents',{name:'Poster',avatar:'/api/uploads/'+ '0'.repeat(40)},poster.token)).status,400);
  assert.equal((await f.req('/api/agents',{name:'Poster',avatar:asset.url},poster.token)).body.avatar,asset.url);
  assert.equal((await f.req('/api/connect/drafts',{name:'Borrowed avatar',avatar:asset.url},agent.token)).status,400);
  const draft=await f.req('/api/connect/drafts',{name:'Paired image',avatar:asset.url},poster.token);
  assert.equal((await f.req('/api/connect/claim',{code:draft.body.code},agent.token)).body.avatar,asset.url);
});

test('fractional wei rewards round only the reward fee and keep every tip wei',async t=>{
  const f=await setup(t,{reward:'0.00000000000000004'});
  await f.action('claim');
  await f.action('submit',f.agent,{text:'A tiny funded task'});
  const paid=await f.action('accept',f.poster,{tip:'0.000000000000000001'});
  assert.equal(paid.body.fee,'0.000000000000000001');
  assert.equal((await f.req('/api/account',undefined,f.agent.token)).body.balance,'0.00000000000000004');
  assert.equal((await f.req('/api/account',undefined,f.poster.token)).body.balance,'9.999999999999999959');
  assert.equal(f.app.locals.snapshot().treasury,'1');
});

test('submitted escrow survives the global deadline and outsiders cannot finalize it',async t=>{
  const f=await setup(t,{deadlineHours:1,reviewHours:2}),outsider=await f.wallet();
  await f.action('claim');
  await f.action('submit',f.agent,{text:'On-time work'});
  f.advance(3600000);
  assert.equal((await f.action('finalize',outsider)).status,403);
  assert.equal((await f.req('/api/account',undefined,f.poster.token)).body.locked,'4');
  f.advance(3600000);
  assert.equal((await f.action('reject',f.poster,{note:'Too late'})).status,409);
  assert.equal((await f.action('finalize')).body.phase,'paid');
  assert.equal((await f.action('finalize')).status,409);
});

test('revisions remain consumed when an expired claim is taken by a new worker',async t=>{
  const f=await setup(t),other=await f.wallet();
  await f.action('claim');await f.action('submit',f.agent,{text:'Initial work'});
  await f.action('revise',f.poster,{note:'Add citations'});
  f.advance(4*3600000);
  assert.equal((await f.action('claim',other)).body.revisions,1);
  await f.action('submit',other,{text:'Replacement work'});
  assert.equal((await f.action('revise',f.poster,{note:'Another round'})).status,409);
});

test('insufficient tips roll back settlement without unlocking escrow',async t=>{
  const f=await setup(t);await f.action('claim');await f.action('submit',f.agent,{text:'Work'});
  assert.equal((await f.action('accept',f.poster,{tip:'7'})).status,409);
  assert.equal((await f.req('/api/account',undefined,f.poster.token)).body.locked,'4');
  assert.equal((await f.req('/api/account',undefined,f.agent.token)).body.balance,'0');
  assert.equal((await f.action('accept',f.poster,{tip:'6'})).body.phase,'paid');
  assert.equal((await f.req('/api/account',undefined,f.agent.token)).body.balance,'9.9');
});

test('mission windows reject numeric strings, invalid ranges and noninteger revision limits',async t=>{
  const f=await setup(t);
  for(const fields of [{deadlineHours:'24'},{reviewHours:0},{claimHours:721},{deadlineHours:-1},{maxRevisions:1.5}])
    assert.equal((await f.req('/api/missions',{...baseMission,...fields},f.poster.token)).status,400);
  assert.equal((await f.req('/api/missions')).body.length,1);
});

test('production startup refuses implicit simulated payments before binding a server',()=>{
  const result=spawnSync(process.execPath,['server/index.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,NODE_ENV:'production',ERRAND_MODE:'demo',ALLOW_DEMO_PRODUCTION:'0'},encoding:'utf8'});
  assert.equal(result.status,1);
  assert.match(result.stderr,/Production disables simulated payments/);
});

test('pairing instructions name the implemented MCP connection tool',async t=>{
  const f=await fixture(t),poster=await f.demo('poster');
  const draft=await f.req('/api/connect/drafts',{name:'Runnable connector'},poster.token);
  assert.match(draft.body.snippet,/errand_connect/);
  assert.ok(draft.body.snippet.includes(draft.body.code));
});

test('persisted demo and chain histories reject a switch of execution mode',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'errand-mode-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  for(const [initial,other] of [['demo','chain'],['chain','demo']]){
    const dbPath=join(directory,initial+'.sqlite');
    const app=createApp({dbPath,mode:initial,seed:false});
    assert.equal(app.locals.snapshot().executionMode,initial);
    app.locals.close();
    assert.throws(()=>createApp({dbPath,mode:other,seed:false}),/execution mode.*separate database/i);
    const reopened=createApp({dbPath,mode:initial,seed:false});
    assert.equal(reopened.locals.snapshot().executionMode,initial);
    reopened.locals.close();
  }
});

test('legacy simulated history cannot become chain balances and can adopt demo mode',async t=>{
  const f=await setup(t);
  const stored=f.app.locals.snapshot();
  delete stored.executionMode;
  const dbPath=join(f.directory,'legacy.sqlite'),db=new DatabaseSync(dbPath);
  db.exec('CREATE TABLE state (id INTEGER PRIMARY KEY, payload TEXT NOT NULL)');
  db.prepare('INSERT INTO state VALUES(1,?)').run(JSON.stringify(stored));
  db.close();
  assert.throws(()=>createApp({dbPath,mode:'chain',seed:false}),/legacy.*demo.*separate database/i);
  const adopted=createApp({dbPath,mode:'demo',seed:false});
  const state=adopted.locals.snapshot();
  assert.equal(state.executionMode,'demo');
  assert.equal(state.accounts[f.poster.address].locked,'4000000000000000000');
  assert.equal(state.accounts[f.poster.address].balance,'6000000000000000000');
  assert.equal(state.missions[0].id,f.m.id);
  adopted.locals.close();
});
