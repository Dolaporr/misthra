export type Partner={id:string;name:string;url:string;returnHosts:string[]};
type DeployTx={from?:string;to:string;data:string;value:string;chainId:number|null};
export async function sendCreatorDeployment(tx:DeployTx,creator:string,connected:string|null|undefined,chain:number,io:{request:(args:{method:string;params?:unknown[]})=>Promise<unknown>;isCurrent:()=>boolean;watch:(invalidate:()=>void)=>()=>void}){
 const issue=creatorWalletIssue(creator,connected);if(issue)throw new Error(issue);
 if(tx.from?.toLowerCase()!==creator.trim().toLowerCase()||tx.chainId!==chain)throw new Error('The deployment plan does not match this creator and network. Check the plan again.');
 let changed=false;const stop=io.watch(()=>{changed=true});
 try{
  const accounts=await io.request({method:'eth_accounts'}) as string[];
  if(creatorWalletIssue(creator,accounts[0]))throw new Error(creatorWalletIssue(creator,accounts[0])!);
  if(Number(await io.request({method:'eth_chainId'}))!==chain)throw new Error('Switch to the configured Elysium network before deploying.');
  if(changed||!io.isCurrent())throw new Error('This setup or wallet changed. Review the deployment again.');
  return await io.request({method:'eth_sendTransaction',params:[{from:creator.trim(),to:tx.to,data:tx.data,value:'0x'+BigInt(tx.value||'0').toString(16),chainId:'0x'+chain.toString(16)}]}) as string;
 }finally{stop()}
}
export type PartnerLink={ref:string;creator:string;pad:string;returnUrl:string};
export function readPartnerLink(hash:string):PartnerLink{
 const query=new URLSearchParams(hash.split('?')[1]||'');
 const creator=query.get('creator')||'';
 return {ref:query.get('ref')||'',creator:/^0x[\da-f]{40}$/i.test(creator)?creator:'',pad:query.get('pad')||'',returnUrl:query.get('returnUrl')||''};
}
export function partnerPlanFields(link:PartnerLink,partners:Partner[]){
 const partner=partners.find(p=>p.id===link.ref);
 return partner?{ref:partner.id,...(link.returnUrl?{returnUrl:link.returnUrl}:{})}:{};
}
export function creatorWalletIssue(creator:string,wallet:string|null|undefined){
 if(!wallet)return 'Connect the creator wallet to deploy.';
 return creator.trim().toLowerCase()===wallet.toLowerCase()?null:`This setup is for ${creator.slice(0,6)}…${creator.slice(-4)}. Connect that wallet to deploy.`;
}
// Call with the server plan's returnUrl only. Never pass the raw deep-link URL.
export function confirmedPartnerReturn(plan:{returnUrl?:string|null;predictedAddress:string|null;ref?:{id:string;name:string}|null},partner:Partner|undefined,confirmed:boolean):string|null{
 if(!confirmed||!partner||plan.ref?.id!==partner.id||!plan.returnUrl||!/^0x[\da-f]{40}$/i.test(plan.predictedAddress||''))return null;
 try{const url=new URL(plan.returnUrl);if(url.protocol!=='https:'||url.username||url.password||url.port||!partner.returnHosts.includes(url.hostname))return null;url.searchParams.set('router',plan.predictedAddress!);return url.href}catch{return null}
}
