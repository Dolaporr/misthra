import { formatUnits, parseUnits } from 'ethers';
export class ApiError extends Error { constructor(message:string,public status:number){super(message)} }
const receipts=new WeakMap<object,{receivedAt:number;serverAt:number}>();
export const apiReceipt=(value:object)=>receipts.get(value);
export async function api<T>(path:string, options:RequestInit={}):Promise<T>{
  const response=await fetch(`/api${path}`,{credentials:'include',...options,headers:{...(options.body instanceof FormData?{}:{'Content-Type':'application/json'}),...options.headers}});
  const data=await response.json().catch(()=>({error:'The service returned an unreadable response.'}));
  if(!response.ok) throw new ApiError(data.error||`Request failed (${response.status}).`,response.status);
  if(data&&typeof data==='object')receipts.set(data,{receivedAt:performance.now(),serverAt:Date.parse(response.headers.get('Date')||'')});
  return data as T;
}
export const post=<T,>(path:string,body:unknown={})=>api<T>(path,{method:'POST',body:JSON.stringify(body)});
export const short=(address:string|null|undefined)=>address?`${address.slice(0,6)}…${address.slice(-4)}`:'Not connected';
export function money(value:string|undefined,precision=4){if(!value)return '0';const [whole,fraction='']=value.split('.');const f=fraction.slice(0,precision).replace(/0+$/,'');if(!f&&/^0+$/.test(whole)&&/[1-9]/.test(fraction))return `<${precision>0?'0.'+'0'.repeat(precision-1)+'1':'1'}`;return `${whole}${f?'.'+f:''}`}
export function netOf(value:string,feeBps:number){try{const reward=parseUnits(value||'0',18);return formatUnits(reward-reward*BigInt(feeBps)/10000n,18)}catch{return '0'}}
export function isAmount(value:string){try{return parseUnits(value,18)>0n}catch{return false}}
export const date=(value:number)=>new Date(value).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
export function remaining(deadline:number){const h=Math.ceil((deadline-Date.now())/3600000);return h<=0?'Deadline reached':h<24?`${h}h left`:`${Math.ceil(h/24)}d left`}
