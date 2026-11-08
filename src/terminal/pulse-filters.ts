import type {Launch,Stage} from './model';
export type Filters={pad:string;minLiq:string;minHolders:string;maxAgeH:string;hideFailed:boolean};
export const PRESETS=['P1','P2','P3'] as const;
export type Preset=typeof PRESETS[number];
export const blankFilters:Filters={pad:'',minLiq:'',minHolders:'',maxAgeH:'',hideFailed:false};
export type ColumnFilters=Record<Stage,{active:Preset;presets:Record<Preset,Filters>}>;
function sanitize(value:unknown):Filters{const v=(value&&typeof value==='object'?value:{}) as Partial<Filters>;return {pad:typeof v.pad==='string'?v.pad:'',minLiq:typeof v.minLiq==='string'?v.minLiq:'',minHolders:typeof v.minHolders==='string'?v.minHolders:'',maxAgeH:typeof v.maxAgeH==='string'?v.maxAgeH:'',hideFailed:v.hideFailed===true}}
export function loadColumnFilters(value:unknown):ColumnFilters{
  const source=(value&&typeof value==='object'?value:{}) as Partial<ColumnFilters>;
  return Object.fromEntries((['new','stretch','migrated'] as const).map(stage=>{const item=source[stage];return [stage,{active:PRESETS.includes(item?.active as Preset)?item!.active:'P1',presets:Object.fromEntries(PRESETS.map(p=>[p,sanitize(item?.presets?.[p])]))}]})) as ColumnFilters;
}
export function validFilters(filters:Filters){return [filters.minLiq,filters.minHolders,filters.maxAgeH].every(value=>value===''||/^\d+(?:\.\d+)?$/.test(value))&&(filters.minHolders===''||/^\d+$/.test(filters.minHolders))}
export function hasFilters(filters:Filters){return Object.entries(filters).some(([key,value])=>value!==blankFilters[key as keyof Filters])}
export function matchesLaunch(l:Launch,query:string,filters:Filters,now=Date.now()){
  if(!validFilters(filters))return false;const needle=query.trim().toLowerCase();
  return (!needle||[l.symbol,l.name,l.address].some(value=>value.toLowerCase().includes(needle)))&&(!filters.pad||l.pad?.id===filters.pad)&&(!filters.minLiq||Number(l.liquidityHype)>=Number(filters.minLiq))&&(!filters.minHolders||l.holders>=Number(filters.minHolders))&&(!filters.maxAgeH||now-l.createdAt<=Number(filters.maxAgeH)*3_600_000)&&(!filters.hideFailed||l.safety.status!=='fail');
}
