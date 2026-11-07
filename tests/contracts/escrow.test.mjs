import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import ganache from 'ganache';
import { AbiCoder, BrowserProvider, ContractFactory, Wallet, ZeroAddress, id, keccak256, parseEther } from 'ethers';
import { HypeEscrowClient } from '../../chain/client.mjs';

const root = new URL('../../', import.meta.url);
const source = new URL('contracts/ErrandBoard.sol', root);
const E = parseEther;
const types = { Action: [ ['actor','address'],['kind','uint8'],['id','uint256'],['amount','uint256'],['who','address'],['dataHash','bytes32'],['nonce','uint256'],['expiry','uint64'] ].map(([name,type])=>({name,type})) };

test('native HYPE escrow conserves funds and enforces its lifecycle on a disposable EVM', async (t) => {
  assert.ok(existsSync(source), 'new inspectable escrow source must exist before it can hold HYPE');
  const { compileContracts } = await import('../../scripts/compile-contracts.mjs');
  const artifacts = await compileContracts({ write: false, extraSources: { 'Attack.sol': readFileSync(new URL('Attack.sol', import.meta.url),'utf8') } });
  const rpc = ganache.provider({ logging:{quiet:true}, chain:{chainId:31337,hardfork:'shanghai'}, wallet:{totalAccounts:6}, miner:{timestampIncrement:0} });
  t.after(()=>rpc.disconnect());
  const provider = new BrowserProvider(rpc, undefined, { cacheTimeout: -1 }); provider.pollingInterval = 10;
  const signers = await Promise.all([0,1,2,3].map(i=>provider.getSigner(i)));
  const [poster,worker,other,treasury] = signers;
  const [p,w,o,tr] = await Promise.all(signers.map(s=>s.getAddress()));
  const secret = Object.values(rpc.getInitialAccounts())[1].secretKey;
  const wallet = new Wallet(secret);
  const deploy = async()=>{ const b=await new ContractFactory(artifacts.ErrandBoard.abi,artifacts.ErrandBoard.bytecode,poster).deploy(tr); await b.waitForDeployment(); return b; };
  const tx = async(promise)=> (await promise).wait();
  const now = async()=>Number((await rpc.request({method:'eth_getBlockByNumber',params:['latest',false]})).timestamp);
  const advance = async(s)=>{await rpc.request({method:'evm_increaseTime',params:[s]});await rpc.request({method:'evm_mine',params:[]});};
  const post = async(b,overrides={})=>{let n=await b.nextId(); await tx(b.post({reward:E('10'),deadline:await now()+1000,reviewWindow:100,claimTtl:200,assignee:ZeroAddress,pickOnly:false,competition:false,maxRevisions:1,specHash:id('spec'),...overrides})); return n;};
  const funded = async()=>{const b=await deploy();await tx(b.deposit({value:E('20')}));return b;};
  const invariant = async(b)=>assert.equal(BigInt(await rpc.request({method:'eth_getBalance',params:[await b.getAddress(),'latest']})),await b.totalAccountLiability()+await b.totalEscrowLiability());

  await t.test('competition selection after entry deadline preserves winner confirmation through its own TTL',async()=>{
    const b=await funded(), deadline=await now()+5, n=await post(b,{pickOnly:true,competition:true,deadline,reviewWindow:10,claimTtl:20});
    await advance(5);await assert.rejects(b.expire.staticCall(n));
    await tx(b.selectWinner(n,w,id('late winner')));assert.equal((await b.missions(n)).claimedAt,BigInt(await now()));
    await advance(11);await assert.rejects(b.expire.staticCall(n));
    await tx(b.connect(worker).confirmWinner(n,'ipfs://late-winner',id('late winner')));
    await assert.rejects(b.expire.staticCall(n));await tx(b.accept(n,0));assert.equal(await b.balanceOf(w),E('9.75'));await invariant(b);
  });
  await t.test('a selected competition winner cannot be overwritten or cancelled before confirmation',async()=>{
    const b=await funded(), n=await post(b,{pickOnly:true,competition:true});await tx(b.selectWinner(n,w,id('selected')));
    await assert.rejects(b.selectWinner.staticCall(n,o,id('replacement')));await assert.rejects(b.cancel.staticCall(n));
    assert.equal((await b.missions(n)).worker,w);await invariant(b);
  });
  await t.test('unselected competition expiry and selection meet exactly at selection-window end',async()=>{
    const b=await funded(), deadline=await now()+5,n=await post(b,{pickOnly:true,competition:true,deadline,reviewWindow:10});
    await advance(14);await assert.rejects(b.expire.staticCall(n));await b.selectWinner.staticCall(n,w,id('entry'));
    await advance(1);assert.equal(await now(),deadline+10);await assert.rejects(b.selectWinner.staticCall(n,w,id('entry')));
    await tx(b.connect(other).expire(n));assert.equal(await b.balanceOf(p),E('20'));await invariant(b);
  });
  await t.test('selected competition expires at confirmation TTL even before entry deadline',async()=>{
    const b=await funded(),n=await post(b,{pickOnly:true,competition:true,claimTtl:5});await tx(b.selectWinner(n,w,id('entry')));
    const selectedAt=await now();await advance(4);await assert.rejects(b.expire.staticCall(n));await b.connect(worker).confirmWinner.staticCall(n,'ipfs://entry',id('entry'));
    await advance(1);assert.equal(await now(),selectedAt+5);await assert.rejects(b.connect(worker).confirmWinner.staticCall(n,'ipfs://entry',id('entry')));
    await tx(b.expire(n));assert.equal(await b.balanceOf(p),E('20'));await invariant(b);
  });
  await t.test('competition revision recovery cannot reopen a previously selected winner',async()=>{
    const b=await funded(),n=await post(b,{pickOnly:true,competition:true,claimTtl:5});await tx(b.selectWinner(n,w,id('entry')));
    await tx(b.connect(worker).confirmWinner(n,'ipfs://entry',id('entry')));await tx(b.requestChanges(n,id('revise entry')));
    await advance(4);await assert.rejects(b.recoverClaim.staticCall(n));await assert.rejects(b.expire.staticCall(n));await advance(1);
    await tx(b.connect(other).recoverClaim(n));assert.equal((await b.missions(n)).phase,7n);assert.equal(await b.balanceOf(p),E('20'));await invariant(b);
  });
  await t.test('review changes after old deadline grant a full claim TTL while preserving revision cap',async()=>{
    const b=await funded(),deadline=await now()+5,n=await post(b,{deadline,claimTtl:20,reviewWindow:30,maxRevisions:1});await tx(b.connect(worker).claim(n));
    await tx(b.connect(worker).submit(n,'ipfs://initial',id('initial')));await advance(6);await tx(b.requestChanges(n,id('late changes')));
    const revisedAt=await now();assert.equal((await b.missions(n)).deadline,BigInt(revisedAt+20));assert.equal((await b.missions(n)).revisions,1n);
    await advance(19);await tx(b.connect(worker).submit(n,'ipfs://revision',id('revision')));await assert.rejects(b.requestChanges.staticCall(n,id('over cap')));
    await advance(29);await assert.rejects(b.finalize.staticCall(n));await b.reject.staticCall(n);await advance(1);
    await assert.rejects(b.reject.staticCall(n));await assert.rejects(b.requestChanges.staticCall(n,id('late')));await tx(b.connect(other).finalize(n));await invariant(b);
  });
  await t.test('ordinary submission closes exactly at claim TTL and at global deadline',async()=>{
    const b=await funded(),n=await post(b,{claimTtl:5});await tx(b.connect(worker).claim(n));await advance(4);
    await b.connect(worker).submit.staticCall(n,'ipfs://boundary',id('boundary'));await advance(1);await assert.rejects(b.connect(worker).submit.staticCall(n,'ipfs://boundary',id('boundary')));
    await tx(b.recoverClaim(n));await tx(b.cancel(n));const deadline=await now()+5,m=await post(b,{deadline,claimTtl:20});await tx(b.connect(worker).claim(m));
    await advance(4);await b.connect(worker).submit.staticCall(m,'ipfs://boundary',id('boundary'));await advance(1);assert.equal(await now(),deadline);
    await assert.rejects(b.connect(worker).submit.staticCall(m,'ipfs://boundary',id('boundary')));await tx(b.expire(m));await invariant(b);
  });
  await t.test('real client prepared post, submit and withdrawal relay correctly and failed execution preserves nonce',async()=>{
    const b=await deploy(), client=new HypeEscrowClient({contractAddress:await b.getAddress(),chainId:31337,provider});
    const otherWallet=new Wallet(Object.values(rpc.getInitialAccounts())[2].secretKey);
    const relay=async(prepared,signer)=>tx(b.connect(other).execute(prepared.value,prepared.data,await signer.signTypedData(prepared.domain,prepared.types,prepared.value),{gasLimit:1500000}));
    const preparedPost=await client.prepareMeta('post',{title:'Adapter round trip',task:'Deliver a verifiable short document',criteria:['Document delivered'],mode:'direct',assignee:o,reward:'10'},w);
    const signature=await wallet.signTypedData(preparedPost.domain,preparedPost.types,preparedPost.value);
    const failed=await b.execute(preparedPost.value,preparedPost.data,signature,{gasLimit:1500000});await assert.rejects(failed.wait());assert.equal(await b.nonces(w,preparedPost.value.nonce),false);
    await tx(b.depositFor(w,{value:E('12')}));await relay(preparedPost,wallet);assert.equal((await b.missions(1)).poster,w);assert.equal((await b.missions(1)).worker,o);assert.equal(await b.nonces(w,preparedPost.value.nonce),true);
    const preparedSubmit=await client.prepareMeta('submit',{id:1,text:'Adapter-delivered result',resultURI:'ipfs://adapter-result'},o);await relay(preparedSubmit,otherWallet);assert.equal((await b.missions(1)).resultHash,id('Adapter-delivered result'));
    await tx(b.connect(worker).accept(1,0));const before=BigInt(await rpc.request({method:'eth_getBalance',params:[p,'latest']}));
    await relay(await client.prepareMeta('withdraw',{amount:'9.75',to:p},o),otherWallet);assert.equal(BigInt(await rpc.request({method:'eth_getBalance',params:[p,'latest']}))-before,E('9.75'));await invariant(b);
  });
  await t.test('meta-action expiry is exclusive at exact equality',async()=>{
    const b=await funded(),n=await post(b),domain={name:'ErrandBoard',version:'1',chainId:31337,verifyingContract:await b.getAddress()};
    const action={actor:w,kind:1,id:n,amount:0,who:ZeroAddress,dataHash:keccak256('0x'),nonce:123,expiry:await now()+5},sig=await wallet.signTypedData(domain,types,action);
    await advance(4);await b.execute.staticCall(action,'0x',sig);await advance(1);await assert.rejects(b.execute.staticCall(action,'0x',sig));assert.equal(await b.nonces(w,action.nonce),false);await invariant(b);
  });

  await t.test('acceptance credits a 2.5% fee, fee-free tip and exactly one worker payout',async()=>{
    const b=await funded(), n=await post(b);
    await tx(b.connect(worker).claim(n));await tx(b.connect(worker).submit(n,'ipfs://result',id('result')));
    await assert.rejects(b.connect(other).accept.staticCall(n,0));
    await tx(b.accept(n,E('1')));
    assert.equal(await b.balanceOf(w),E('10.75'));assert.equal(await b.balanceOf(tr),E('.25'));assert.equal(await b.balanceOf(p),E('9'));
    await assert.rejects(b.accept.staticCall(n,0));await assert.rejects(b.finalize.staticCall(n));await invariant(b);
    const before=BigInt(await rpc.request({method:'eth_getBalance',params:[o,'latest']}));
    await tx(b.connect(worker).withdraw(E('10.75'),o));
    assert.equal(BigInt(await rpc.request({method:'eth_getBalance',params:[o,'latest']}))-before,E('10.75'));await invariant(b);
  });
  await t.test('cancel, reject and expiry refund principal without a fee',async()=>{
    const b=await funded();let n=await post(b);await assert.rejects(b.connect(other).cancel.staticCall(n));await tx(b.cancel(n));
    n=await post(b);await tx(b.connect(worker).claim(n));await assert.rejects(b.cancel.staticCall(n));await tx(b.connect(worker).submit(n,'ipfs://r',id('r')));await tx(b.reject(n));
    n=await post(b,{deadline:await now()+5});await advance(6);await tx(b.connect(other).expire(n));
    assert.equal(await b.balanceOf(p),E('20'));assert.equal(await b.balanceOf(tr),0n);assert.equal((await b.missions(n)).phase,7n);await invariant(b);
  });
  await t.test('expired claims reopen before the deadline and refund after it',async()=>{
    const b=await funded(), n=await post(b,{claimTtl:5,deadline:await now()+30});await tx(b.connect(worker).claim(n));await advance(6);
    await assert.rejects(b.connect(worker).submit.staticCall(n,'ipfs://late',id('late')));await tx(b.connect(other).recoverClaim(n));assert.equal((await b.missions(n)).phase,1n);
    await tx(b.connect(other).claim(n));await advance(31);await tx(b.recoverClaim(n));assert.equal(await b.balanceOf(p),E('20'));await invariant(b);
  });
  await t.test('revision limit and elapsed review protect public finalization, including after global deadline',async()=>{
    const b=await funded(), n=await post(b,{deadline:await now()+50});await tx(b.connect(worker).claim(n));await assert.rejects(b.connect(other).submit.staticCall(n,'x',id('x')));
    await tx(b.connect(worker).submit(n,'ipfs://r',id('r')));await assert.rejects(b.connect(other).requestChanges.staticCall(n,id('note')));await tx(b.requestChanges(n,id('note')));
    await tx(b.raise(n,E('2')));await tx(b.connect(worker).submit(n,'ipfs://r2',id('r2')));await assert.rejects(b.requestChanges.staticCall(n,id('again')));await assert.rejects(b.finalize.staticCall(n));
    await advance(201);await assert.rejects(b.expire.staticCall(n));await assert.rejects(b.reject.staticCall(n));await tx(b.connect(other).finalize(n));
    assert.equal(await b.balanceOf(w),E('11.7'));assert.equal(await b.balanceOf(tr),E('.3'));await invariant(b);
  });
  await t.test('only poster assigns; competition winner must confirm the selected result before review',async()=>{
    const b=await funded(), direct=await post(b,{assignee:w});assert.equal((await b.missions(direct)).worker,w);await assert.rejects(b.connect(other).claim.staticCall(direct));
    const n=await post(b,{pickOnly:true,competition:true});await assert.rejects(b.connect(worker).selectWinner.staticCall(n,w,id('winning')));await assert.rejects(b.selectWinner.staticCall(n,p,id('winning')));
    await tx(b.selectWinner(n,w,id('winning')));await assert.rejects(b.connect(other).confirmWinner.staticCall(n,'ipfs://win',id('winning')));await assert.rejects(b.connect(worker).confirmWinner.staticCall(n,'ipfs://bad',id('other')));
    await tx(b.connect(worker).confirmWinner(n,'ipfs://win',id('winning')));assert.equal((await b.missions(n)).phase,4n);assert.equal(await b.balanceOf(w),0n);await tx(b.accept(n,0));assert.equal(await b.balanceOf(w),E('9.75'));await invariant(b);
  });
  await t.test('ordinary picking requires a poster assignment and expired direct offers return to picking',async()=>{
    const b=await funded(), n=await post(b,{pickOnly:true,claimTtl:5});
    await assert.rejects(b.connect(worker).claim.staticCall(n));await assert.rejects(b.connect(other).assign.staticCall(n,w));
    await tx(b.assign(n,w));await advance(6);await tx(b.connect(other).recoverClaim(n));assert.equal((await b.missions(n)).phase,2n);
    await tx(b.assign(n,o));await tx(b.connect(other).submit(n,'ipfs://assigned',id('assigned')));await tx(b.accept(n,0));assert.equal(await b.balanceOf(o),E('9.75'));await invariant(b);
  });
  await t.test('claim recovery preserves the mission revision cap across workers',async()=>{
    const b=await funded(), n=await post(b,{claimTtl:5,maxRevisions:1});await tx(b.connect(worker).claim(n));
    await tx(b.connect(worker).submit(n,'ipfs://first',id('first')));await tx(b.requestChanges(n,id('note')));await advance(6);await tx(b.recoverClaim(n));
    await tx(b.connect(other).claim(n));await tx(b.connect(other).submit(n,'ipfs://second',id('second')));
    await assert.rejects(b.requestChanges.staticCall(n,id('over cap')));assert.equal((await b.missions(n)).revisions,1n);await invariant(b);
  });
  await t.test('typed meta-actions reject replay, wrong chain/contract, expired signatures and modified data',async()=>{
    const b=await funded(), n=await post(b), address=await b.getAddress();
    const domain={name:'ErrandBoard',version:'1',chainId:31337,verifyingContract:address};
    const action={actor:w,kind:1,id:n,amount:0,who:ZeroAddress,dataHash:id(''),nonce:7,expiry:await now()+100};
    const sig=await wallet.signTypedData(domain,types,action);
    await assert.rejects(b.execute.staticCall(action,'0x12',sig));
    const wrong=await wallet.signTypedData({...domain,chainId:1},types,action);await assert.rejects(b.execute.staticCall(action,'0x',wrong));
    const wrongContract=await wallet.signTypedData({...domain,verifyingContract:o},types,action);await assert.rejects(b.execute.staticCall(action,'0x',wrongContract));
    const expired={...action,nonce:8,expiry:await now()-1};await assert.rejects(b.execute.staticCall(expired,'0x',await wallet.signTypedData(domain,types,expired)));
    await tx(b.connect(other).execute(action,'0x',sig));assert.equal((await b.missions(n)).worker,w);await assert.rejects(b.execute.staticCall(action,'0x',sig));
    const data=AbiCoder.defaultAbiCoder().encode(['string','bytes32'],['ipfs://meta',id('meta')]);
    const submit={...action,kind:3,nonce:9,dataHash:keccak256(data)};
    await tx(b.connect(other).execute(submit,data,await wallet.signTypedData(domain,types,submit)));assert.equal((await b.missions(n)).phase,4n);await invariant(b);
  });
  await t.test('typed post and withdraw use only the signed account and destination; insufficient balance cannot create liabilities',async()=>{
    const b=await deploy();await tx(b.depositFor(w,{value:E('12')}));
    const domain={name:'ErrandBoard',version:'1',chainId:31337,verifyingContract:await b.getAddress()};
    const p={reward:E('10'),deadline:await now()+1000,reviewWindow:50,claimTtl:100,assignee:o,pickOnly:false,competition:false,maxRevisions:0,specHash:id('signed spec')};
    const data=AbiCoder.defaultAbiCoder().encode(['tuple(uint256 reward,uint64 deadline,uint64 reviewWindow,uint64 claimTtl,address assignee,bool pickOnly,bool competition,uint8 maxRevisions,bytes32 specHash)'],[p]);
    const action={actor:w,kind:0,id:0,amount:0,who:ZeroAddress,dataHash:keccak256(data),nonce:30,expiry:await now()+100};
    await tx(b.execute(action,data,await wallet.signTypedData(domain,types,action)));
    assert.equal((await b.missions(1)).poster,w);assert.equal((await b.missions(1)).worker,o);
    const withdraw={...action,kind:9,amount:E('2'),who:o,dataHash:keccak256('0x'),nonce:31};
    const before=BigInt(await rpc.request({method:'eth_getBalance',params:[o,'latest']}));
    await tx(b.execute(withdraw,'0x',await wallet.signTypedData(domain,types,withdraw)));
    assert.equal(BigInt(await rpc.request({method:'eth_getBalance',params:[o,'latest']}))-before,E('2'));
    await assert.rejects(b.connect(worker).withdraw.staticCall(1,o));await assert.rejects(b.connect(worker).post.staticCall(p));await invariant(b);
  });
  await t.test('withdrawal reentry cannot take another account or duplicate liabilities',async()=>{
    const b=await funded();const attacker=await new ContractFactory(artifacts.Attack.abi,artifacts.Attack.bytecode,other).deploy(await b.getAddress());await attacker.waitForDeployment();
    await tx(attacker.fund({value:E('1')}));await tx(attacker.attack());assert.equal(await b.balanceOf(await attacker.getAddress()),0n);assert.equal(await attacker.blocked(),true);await invariant(b);
  });
});
