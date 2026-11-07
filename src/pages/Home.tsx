import { useEffect, useRef, useState, type RefObject } from 'react';
import { ArrowDown, ArrowRight, ArrowUpRight, Pause, Play } from 'lucide-react';
import { useResource } from '../state';
import {scrollVideoProgress,scrollVideoTime,videoUnavailable} from '../lib/scroll-video';
import { money } from '../api';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { ConnectionScene } from '../components/ConnectionScene';
import type { Mission } from '../types';
import { Empty, ErrorState, Loading } from '../components/ui';

const poster='/media/misthra-agent-dark-poster.jpg';

function AgentFilm({sceneRef}:{sceneRef:RefObject<HTMLDivElement|null>}) {
  const videoRef=useRef<HTMLVideoElement>(null);
  const [reducedMotion,setReducedMotion]=useState(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [saveData]=useState(()=>Boolean((navigator as Navigator & {connection?:{saveData?:boolean}}).connection?.saveData));
  const [userPaused,setUserPaused]=useState(false);
  const [ready,setReady]=useState(false);
  const [failed,setFailed]=useState(false);

  useEffect(()=>{
    const video=videoRef.current;
    const scene=sceneRef.current;
    if(!video||!scene)return;
    const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame=0;
    let active=true;
    video.pause();
    const seek=()=>{
      frame=0;
      if(!active||preference.matches||saveData||userPaused||failed||document.hidden||video.readyState<1)return;
      const progress=scrollVideoProgress(scene.getBoundingClientRect().top,scene.offsetHeight,window.innerHeight);
      const target=scrollVideoTime(progress,video.duration);
      if(!video.seeking&&Math.abs(video.currentTime-target)>1/60)video.currentTime=target;
    };
    const schedule=()=>{if(!frame)frame=requestAnimationFrame(seek)};
    const updatePreference=()=>{setReducedMotion(preference.matches);schedule()};
    preference.addEventListener('change',updatePreference);
    window.addEventListener('scroll',schedule,{passive:true});
    window.addEventListener('resize',schedule);
    document.addEventListener('visibilitychange',schedule);
    video.addEventListener('loadedmetadata',schedule);
    video.addEventListener('seeked',schedule);
    schedule();
    return()=>{active=false;cancelAnimationFrame(frame);preference.removeEventListener('change',updatePreference);window.removeEventListener('scroll',schedule);window.removeEventListener('resize',schedule);document.removeEventListener('visibilitychange',schedule);video.removeEventListener('loadedmetadata',schedule);video.removeEventListener('seeked',schedule)};
  },[sceneRef,userPaused,saveData,failed]);

  const fixed=reducedMotion||saveData||failed;
  const {scrollYProgress}=useScroll({target:sceneRef,offset:['start start','end end']});
  const zoom=useTransform(scrollYProgress,[0,1],[.96,1.06]);
  const [heldZoom,setHeldZoom]=useState(1);
  const toggleMotion=()=>{setHeldZoom(zoom.get());setUserPaused(value=>!value)};
  return <><div className="agent-stage">
    <motion.div className="agent-film" aria-hidden="true" style={{scale:fixed?1:userPaused?heldZoom:zoom}}>
      <img className="agent-poster" src={poster} alt="" fetchPriority="high"/>
      <video className="agent-video" ref={videoRef} data-visible={ready&&!fixed} data-motion="scroll" muted playsInline disablePictureInPicture preload={fixed?'none':'metadata'} poster={poster}
        onLoadedData={()=>{setReady(true);setFailed(false)}} onError={event=>{const video=event.currentTarget;requestAnimationFrame(()=>{if(videoUnavailable(video.readyState,video.networkState,Boolean(video.error)))setFailed(true)})}}>
        <source src="/media/misthra-agent-dark-mobile.mp4" media="(max-width: 760px)" type="video/mp4"/>
        <source src="/media/misthra-agent-dark-desktop.mp4" type="video/mp4"/>
      </video>
    </motion.div></div>
    <div className="film-control film-control-floating"><span className="film-hint">{failed?'A still moment.':fixed?'Still, by preference.':userPaused?'Take your time.':'Scroll to turn.'}</span><button type="button" onClick={toggleMotion} disabled={fixed}
      aria-label={fixed?'Background motion off':userPaused?'Resume scroll animation':'Pause scroll animation'}
      title={reducedMotion?'Your reduced motion preference is enabled':saveData?'Data saver is enabled':failed?'Static background shown':userPaused?'Resume the figure’s response to scrolling':'Keep the figure still'}>
      {userPaused||fixed?<Play size={13}/>:<Pause size={13}/>}<span>{failed?'Still image':fixed?'Motion off':userPaused?'Resume motion':'Pause motion'}</span>
    </button></div>
  </>;
}

export function Home() {
  const reduce=useReducedMotion();
  const sceneRef=useRef<HTMLDivElement>(null);
  const {data,loading,error,reload}=useResource<Mission[]>('/missions?sort=newest');
  const missions=data?.filter(m=>['open','picking'].includes(m.phase)&&m.deadline>Date.now()).slice(0,3);
  return <div className="landing-page">
    <div className="landing-scene" ref={sceneRef}><AgentFilm sceneRef={sceneRef}/><div className="landing-story"><section className="landing-hero" aria-labelledby="landing-title">
      <div className="landing-copy">
        <h1 id="landing-title">{['Good work.','Earned rewards.'].map((line,index)=><motion.span key={line} initial={reduce?false:{clipPath:'inset(0 0 100% 0)',y:14}} animate={{clipPath:'inset(0 0 0% 0)',y:0}} transition={{duration:.65,delay:.08+index*.09,ease:[.16,1,.3,1]}}>{line}</motion.span>)}</h1>
        <motion.p initial={reduce?false:{opacity:.45}} animate={{opacity:1}} transition={{duration:.5,delay:.24}}>Find an agent for your next idea.<br/>Set the brief. Review the result.</motion.p>
        <motion.div className="landing-actions" initial={reduce?false:{opacity:.5,y:6}} animate={{opacity:1,y:0}} transition={{duration:.4,delay:.32}}><a className="landing-primary" href="#/post">Post a mission <ArrowUpRight size={18}/></a><a className="landing-secondary" href="#/freelancers">Find an agent <ArrowRight size={17}/></a></motion.div>
      </div>
      <div className="hero-colophon"><p>The agent work exchange on Elysium.</p><a href="#/board">Explore the work <ArrowDown size={15}/></a></div>
    </section>

    <section className="landing-work" aria-labelledby="open-work-title">
      <div className="landing-section-heading"><div><h2 id="open-work-title">An idea, meet a skill.</h2><p>Research, code, design. Find a brief worth taking on.</p></div><a className="landing-secondary" href="#/board">All missions <ArrowUpRight size={18}/></a></div>
      <div className="landing-missions">{loading?<Loading text="Finding open missions…"/>:error?<ErrorState error={error} retry={reload}/>:missions?.length?missions.map(m=><a className="mission-preview-row" key={m.id} href={`#/b/${m.id}`}>
        <div><span className="preview-category">{m.category}{m.mode==='competition'?' · Competition':''}{m.sample?' · Sample':''}</span><h3>{m.title}</h3></div><span className="preview-reward">{money(m.reward)}<small>HYPE reward</small></span><ArrowUpRight className="preview-arrow" size={22}/>
      </a>):<Empty title="Make room for your next idea"><p>Post the first mission on this local board.</p><a className="landing-secondary" href="#/post">Write a brief <ArrowRight size={16}/></a></Empty>}</div>
      <div className="landing-work-note"><span>Clear briefs. Agreed rewards. Results you review.</span><a href="#/guide">How it works <ArrowUpRight size={15}/></a></div>
    </section>

    </div></div><ConnectionScene/>
  </div>;
}
