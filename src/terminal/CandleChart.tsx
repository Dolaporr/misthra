import {useEffect,useMemo,useRef,useState} from 'react';
import {ChevronLeft,ChevronRight} from 'lucide-react';
import {hype,type Bar} from './model';
import {chartGeometry,nearestCandle} from './chart-model';
import './chart.css';
export function CandleChart({bars}:{bars:Bar[]}){
  const [width,setWidth]=useState(760),[active,setActive]=useState<number|null>(null),[keyboard,setKeyboard]=useState(false);
  const area=useRef<HTMLDivElement>(null);
  useEffect(()=>{const node=area.current;if(!node)return;const measure=()=>setWidth(node.clientWidth);measure();const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(measure);observer?.observe(node);window.addEventListener('resize',measure);return()=>{observer?.disconnect();window.removeEventListener('resize',measure)}},[bars.length>0]);
  const geo=useMemo(()=>chartGeometry(bars,width),[bars,width]);
  if(!geo)return <p className="muted small chart-empty">No valid candles in this window yet.</p>;
  const {shown,W,H,plot,step,y}=geo,index=active===null?shown.length-1:Math.min(active,shown.length-1),bar=shown[index],x=index*step+step/2;
  const move=(value:number)=>{setKeyboard(true);setActive(Math.max(0,Math.min(shown.length-1,value)))};
  const select=(clientX:number)=>{const rect=area.current?.getBoundingClientRect();if(rect){setKeyboard(false);setActive(nearestCandle((clientX-rect.left)*W/rect.width,step,shown.length))}};
  const time=new Date(bar.t).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
  return <figure className="candle-workspace"><div className="candle-interaction" ref={area} tabIndex={0} role="group" aria-label="Interactive candle chart" aria-describedby="chart-help chart-readout" onFocus={()=>{setKeyboard(true);setActive(shown.length-1)}} onKeyDown={e=>{if(['ArrowLeft','ArrowRight','Home','End','Escape'].includes(e.key)){e.preventDefault();if(e.key==='Escape')setActive(null);else move(e.key==='Home'?0:e.key==='End'?shown.length-1:index+(e.key==='ArrowRight'?1:-1))}}} onPointerMove={e=>{if(e.pointerType==='mouse')select(e.clientX)}} onPointerDown={e=>select(e.clientX)} onPointerLeave={()=>{if(!keyboard)setActive(null)}}>
    <svg className="candles" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${shown.length} candles, high ${hype(geo.hi,5)} and low ${hype(geo.lo,5)} HYPE`}>
      {[0,.25,.5,.75,1].map(t=>{const price=geo.upper-(geo.upper-geo.lower)*t,py=y(price);return <g className="chart-axis" key={t}><line x1={0} x2={plot} y1={py} y2={py}/><text x={W-4} y={py+4} textAnchor="end">{hype(price,4)}</text></g>})}
      {shown.map((b,i)=>{const cx=i*step+step/2,up=Number(b.c)>=Number(b.o),top=y(up?b.c:b.o),bottom=y(up?b.o:b.c),vh=Number(b.v)/geo.vmax*34;return <g key={b.t} className={up?'up':'down'}><rect x={cx-step*.35} y={H-vh-4} width={step*.7} height={vh} className="vol"/><line x1={cx} x2={cx} y1={y(b.h)} y2={y(b.l)}/><rect x={cx-step*.35} y={top} width={step*.7} height={Math.max(1,bottom-top)}/></g>})}
      {active!==null&&<g className="chart-crosshair"><line x1={x} x2={x} y1={10} y2={H-40}/><line x1={0} x2={plot} y1={y(bar.c)} y2={y(bar.c)}/><circle cx={x} cy={y(bar.c)} r={3}/></g>}
      <text className="chart-unit" x={W-4} y={H-15} textAnchor="end">HYPE</text>
    </svg>
  </div><figcaption><div className="chart-readout-heading"><span>{active===null?'Latest candle':'Selected candle'} · {time}</span><div><button className="icon-button" aria-label="Previous candle" onClick={()=>move(index-1)} disabled={index===0}><ChevronLeft size={17}/></button><button className="icon-button" aria-label="Next candle" onClick={()=>move(index+1)} disabled={index===shown.length-1}><ChevronRight size={17}/></button></div></div><dl id="chart-readout" className="chart-ohlc" aria-live={keyboard?'polite':'off'}>{[['Open',bar.o],['High',bar.h],['Low',bar.l],['Close',bar.c],['Volume',bar.v]].map(([label,amount])=><div key={label}><dt>{label}</dt><dd>{hype(amount,5)} HYPE</dd></div>)}</dl><p id="chart-help" className="chart-instructions">Point at a candle, tap it, or focus the chart and use ← / →. Home and End select the first and last candle.</p></figcaption></figure>;
}
