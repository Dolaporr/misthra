import {useEffect,useRef,useState} from 'react';
import {motion,useInView,useReducedMotion} from 'framer-motion';
import {ArrowRight,ArrowUpRight,Pause,Play} from 'lucide-react';
import {canRotateFeatures,HOME_FEATURES,nextFeature} from '../lib/home-features';

export function HomeFeatures(){
  const ref=useRef<HTMLDivElement>(null);
  const inView=useInView(ref,{amount:.25});
  const reduced=Boolean(useReducedMotion());
  const [index,setIndex]=useState(0),[paused,setPaused]=useState(false);
  const [hovered,setHovered]=useState(false),[focused,setFocused]=useState(false);
  const [visible,setVisible]=useState(()=>!document.hidden);
  useEffect(()=>{const change=()=>setVisible(!document.hidden);document.addEventListener('visibilitychange',change);return()=>document.removeEventListener('visibilitychange',change)},[]);
  const rotating=canRotateFeatures({paused,reduced,hovered,focused,visible,inView});
  useEffect(()=>{if(!rotating)return;const timer=window.setTimeout(()=>setIndex(nextFeature),6500);return()=>window.clearTimeout(timer)},[rotating,index]);
  const feature=HOME_FEATURES[index];
  return <div ref={ref} className="landing-copy home-feature-copy" onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)} onFocusCapture={()=>setFocused(true)} onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setFocused(false)}}>
    <div className="home-feature-content" id="home-feature-content">
      <h1 id="landing-title" key={feature.label}>{feature.lines.map((line,i)=><motion.span key={line} initial={reduced?false:{clipPath:'inset(0 0 100% 0)',y:12}} animate={{clipPath:'inset(0 0 0% 0)',y:0}} transition={{duration:.55,delay:i*.08,ease:[.16,1,.3,1]}}>{line}</motion.span>)}</h1>
      <p>{feature.description}</p>
      <div className="landing-actions"><a className="landing-primary" href={feature.href}>{feature.action}<ArrowUpRight size={18}/></a><a className="landing-secondary" href={feature.secondaryHref}>{feature.secondary}<ArrowRight size={17}/></a></div>
    </div>
    <div className="home-feature-controls"><div className="home-feature-options" role="group" aria-label="Explore Misthra features">{HOME_FEATURES.map((item,i)=><button key={item.label} aria-pressed={index===i} aria-controls="home-feature-content" onClick={()=>{setIndex(i);setPaused(true)}}><span className="home-feature-indicator" aria-hidden="true"/>{item.label}</button>)}</div><button className="home-feature-pause" aria-label={reduced?'Automatic feature rotation off by motion preference':paused?'Resume feature rotation':'Pause feature rotation'} disabled={reduced} onClick={()=>setPaused(value=>!value)}>{paused||reduced?<Play size={13}/>:<Pause size={13}/>}<span>{reduced?'Manual':paused?'Play':'Pause'}</span></button></div>
  </div>;
}
