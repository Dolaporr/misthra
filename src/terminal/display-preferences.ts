export type TerminalDisplay={compact:boolean;largeMetrics:boolean;roundCaps:boolean;circleImages:boolean;showName:boolean;showVolume:boolean;showChecks:boolean;showAge:boolean;pauseOnRead:boolean;colorCaps:boolean;lowCap:number;highCap:number};
export const defaultDisplay:TerminalDisplay={compact:true,largeMetrics:false,roundCaps:false,circleImages:false,showName:true,showVolume:true,showChecks:true,showAge:true,pauseOnRead:true,colorCaps:false,lowCap:30000,highCap:150000};
export function readDisplay(value:unknown):TerminalDisplay{
 const v=(value&&typeof value==='object'?value:{}) as Partial<TerminalDisplay>,result={...defaultDisplay};
 for(const key of Object.keys(defaultDisplay) as (keyof TerminalDisplay)[])if(typeof defaultDisplay[key]==='boolean'&&typeof v[key]==='boolean')(result as Record<string,unknown>)[key]=v[key];
 if(typeof v.lowCap==='number'&&Number.isFinite(v.lowCap)&&v.lowCap>=0&&typeof v.highCap==='number'&&Number.isFinite(v.highCap)&&v.highCap>v.lowCap){result.lowCap=v.lowCap;result.highCap=v.highCap}
 return result;
}
export function capColor(value:string|null|undefined,display:TerminalDisplay){
 if(!display.colorCaps||value==null||!/^\d+(\.\d+)?$/.test(value)||!Number.isFinite(Number(value)))return undefined;
 return Number(value)<display.lowCap?'#7fa8ff':Number(value)<display.highCap?'#eed17d':'#76d4a6';
}
