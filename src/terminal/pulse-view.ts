import type {Launch} from './model';
export type PulseSort='age'|'volume'|'mcap';
export type PulseView={compact:boolean;sort:PulseSort;watched:string[]};
const address=(value:unknown):value is string=>typeof value==='string'&&/^0x[0-9a-fA-F]{40}$/.test(value);
export function readPulseView(value:unknown):PulseView{
  const input=(value&&typeof value==='object'?value:{}) as Partial<PulseView>;
  return {compact:input.compact===true,sort:input.sort==='volume'||input.sort==='mcap'?input.sort:'age',watched:Array.isArray(input.watched)?[...new Set(input.watched.filter(address).map(value=>value.toLowerCase()))].slice(0,500):[]};
}
export function toggleWatch(watched:string[],value:string):string[]{
  if(!address(value))return watched;
  const key=value.toLowerCase();return watched.includes(key)?watched.filter(a=>a!==key):watched.length<500?[...watched,key]:watched;
}
const amount=(value:unknown)=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?Number(value):-Infinity;
export function sortLaunches<T extends Pick<Launch,'address'|'createdAt'|'volume5mHype'|'mcapHype'>>(items:T[],sort:PulseSort):T[]{
  return [...items].sort((a,b)=>{
    const av=sort==='age'?a.createdAt:amount(sort==='volume'?a.volume5mHype:a.mcapHype),bv=sort==='age'?b.createdAt:amount(sort==='volume'?b.volume5mHype:b.mcapHype);
    return (av===bv?0:av>bv?-1:1)||b.createdAt-a.createdAt||a.address.localeCompare(b.address);
  });
}
