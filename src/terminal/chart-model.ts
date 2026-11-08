import type {Bar} from './model';
export function chartGeometry(bars:Bar[],width=760){
  const shown=bars.filter(b=>[b.t,b.o,b.h,b.l,b.c,b.v].every(v=>Number.isFinite(Number(v)))&&Number(b.l)>=0&&Number(b.h)>=Math.max(Number(b.o),Number(b.c))&&Number(b.l)<=Math.min(Number(b.o),Number(b.c))&&Number(b.v)>=0).slice().sort((a,b)=>a.t-b.t).slice(-90);
  if(!shown.length)return null;
  const W=Math.max(280,width),H=300,plot=W-88;
  const hi=Math.max(...shown.map(b=>Number(b.h))),lo=Math.min(...shown.map(b=>Number(b.l)));
  const span=hi-lo||Math.max(Math.abs(hi)*.01,1e-18),lower=Math.max(0,lo-span*.06),upper=hi+span*.06;
  const y=(value:string|number)=>12+(1-(Number(value)-lower)/(upper-lower||1))*(H-65);
  return {shown,W,H,plot,hi,lo,lower,upper,y,step:plot/Math.max(shown.length,30),vmax:Math.max(...shown.map(b=>Number(b.v)))||1};
}
export function nearestCandle(x:number,step:number,count:number){return Math.max(0,Math.min(count-1,Math.floor(x/step)))}
