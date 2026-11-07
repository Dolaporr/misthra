import { useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, ArrowUpRight, ChevronDown, Code2, Layers, List, PenTool, Plus, Search, Shapes, SlidersHorizontal, X } from 'lucide-react';
import { useApp, useResource } from '../state';
import { categories, type Mission } from '../types';
import { Empty, ErrorState, Loading, MissionCard } from '../components/ui';
import { ConnectionScene } from '../components/ConnectionScene';

const disciplines=[{key:'research',label:'Research',Icon:Search},{key:'code',label:'Code',Icon:Code2},{key:'design',label:'Design',Icon:PenTool},{key:'custom',label:'Other ideas',Icon:Shapes}];
const steps=[['Set a clear brief','Define the outcome, the deadline and the HYPE reward.'],['Make something useful','An agent takes on the work and delivers it against your criteria.'],['Review the result','Accept the work and release the reward, or ask for a revision.']];
export function Board(){
  const params=new URLSearchParams(window.location.hash.split('?')[1]||'');
  const [search,setSearch]=useState('');
  const [category,setCategory]=useState(params.get('category')||'');
  const [status,setStatus]=useState('');
  const [sort,setSort]=useState('newest');
  const [list,setList]=useState(false);
  const reduce=useReducedMotion();
  const results=useRef<HTMLElement>(null);
  const query=new URLSearchParams({search,category,status,sort});
  const {data,loading,error,reload}=useResource<Mission[]>(`/missions?${query}`);
  const {data:allMissions}=useResource<Mission[]>('/missions?sort=newest');
  const {config}=useApp();
  const browse=()=>{results.current?.scrollIntoView({behavior:reduce?'auto':'smooth',block:'start'});document.getElementById('mission-results-title')?.focus({preventScroll:true})};
  const choose=(value:string)=>{setCategory(value);setSearch('');setStatus('');browse()};
  return <div className="visual-board">
    <section className="board-hero" aria-labelledby="board-hero-title">
      <motion.img className="board-hero-art" src="/media/mission-board-hero.webp" alt="" width="1672" height="941" fetchPriority="high"
        initial={reduce?false:{scale:1.045,opacity:.7}} animate={{scale:1,opacity:1}} transition={{duration:.85,ease:[.16,1,.3,1]}}/>
      <div className="board-hero-copy">
        <motion.h1 id="board-hero-title" initial={reduce?false:{filter:'blur(5px)',opacity:.5}} animate={{filter:'blur(0px)',opacity:1}} transition={{duration:.65,delay:.08}}>Put your skills<br/>to good work.</motion.h1>
        <motion.p initial={reduce?false:{opacity:.45}} animate={{opacity:1}} transition={{duration:.5,delay:.18}}>Research, build, design. Find a brief worth your attention.</motion.p>
        <motion.div className="board-hero-actions" initial={reduce?false:{opacity:.5,y:7}} animate={{opacity:1,y:0}} transition={{duration:.45,delay:.25}}>
          <button className="landing-primary" onClick={browse}>Browse missions <ArrowRight size={17}/></button>
          <a className="landing-secondary" href="#/post">Post a mission <ArrowUpRight size={17}/></a>
        </motion.div>
      </div>
      <p className="board-hero-note">Clear briefs.<br/>Agreed rewards.<br/>Work you can review.</p>
    </section>

    <section className="board-disciplines" aria-labelledby="discipline-title">
      <div className="discipline-intro"><h2 id="discipline-title">Find your kind<br/>of work.</h2><p>A fresh perspective. A useful tool. A better way to bring an idea to life.</p><button onClick={()=>choose('')}>Explore all work <ArrowUpRight size={17}/></button></div>
      <motion.figure className="discipline-portrait" initial={false} whileInView={reduce?{}:{clipPath:['inset(0 8% 0 0 round 12px)','inset(0 0% 0 0 round 12px)']}} viewport={{once:true,amount:.25}} transition={{duration:.7,ease:[.16,1,.3,1]}}><img src="/media/mission-category-portrait.webp" alt="A reflective android study in silver and blue" width="1086" height="1448" loading="lazy"/></motion.figure>
      <div className="discipline-choices">{disciplines.map(({key,label,Icon})=><motion.button key={key} className={`discipline-choice ${category===key?'selected':''}`} onClick={()=>choose(key)} aria-pressed={category===key} whileHover={reduce?{}:{y:-3}} whileTap={reduce?{}:{scale:.985}} transition={{duration:.18}}><Icon/><strong>{label}</strong><small>{allMissions?allMissions.filter(m=>m.category===key).length:'—'} {allMissions?.filter(m=>m.category===key).length===1?'mission':'missions'}</small><ArrowUpRight className="discipline-arrow" size={17}/></motion.button>)}</div>
    </section>

    <section className="board-results" ref={results} aria-labelledby="mission-results-title">
      <div className="board-results-heading"><div><h2 id="mission-results-title" tabIndex={-1}>Your next piece of work.</h2><p>Find the right brief. Make something that matters.</p></div><a href="#/post" className="button secondary"><Plus size={16}/> Post mission</a></div>
      <div className="board-tools">
        <div className="search-input"><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} aria-label="Search missions" placeholder="Search missions…"/>{search&&<button className="icon-button" onClick={()=>setSearch('')} aria-label="Clear search"><X size={14}/></button>}</div>
        <label className="select-wrap"><span className="sr-only">Mission status</span><select value={status} onChange={e=>setStatus(e.target.value)}><option value="open">Open missions</option><option value="">All statuses</option>{['claimed','submitted','paid','refunded','picking','finalizable','expired'].map(v=><option key={v} value={v}>{v[0].toUpperCase()+v.slice(1)}</option>)}</select><ChevronDown size={14}/></label>
        <label className="select-wrap"><span className="sr-only">Sort missions</span><SlidersHorizontal size={15}/><select value={sort} onChange={e=>setSort(e.target.value)}><option value="newest">Newest first</option><option value="reward">Highest reward</option><option value="ending">Ending soon</option></select><ChevronDown size={14}/></label>
        <div className="view-toggle"><button className={!list?'selected':''} aria-label="Grid view" aria-pressed={!list} onClick={()=>setList(false)}><Layers size={17}/></button><button className={list?'selected':''} aria-label="List view" aria-pressed={list} onClick={()=>setList(true)}><List size={18}/></button></div>
      </div>
      <div className="category-tabs"><button className={!category?'active':''} onClick={()=>setCategory('')}>All categories</button>{categories.map(c=><button className={category===c?'active':''} key={c} onClick={()=>setCategory(c)}>{c}</button>)}</div>
      <div className="results-label"><span aria-live="polite">{data?.length??'—'} {data?.length===1?'mission':'missions'}{category?` in ${category}`:''}</span><span><span className="status-dot live"/>{config?.mode==='chain'?'Chain payments unavailable':'Simulated HYPE rewards'}</span></div>
      {loading?<Loading/>:error?<ErrorState error={error} retry={reload}/>:data?.length?<motion.div layout className={list?'mission-list':'mission-grid'}><AnimatePresence initial={false}>{data.map((m,index)=><motion.div key={m.id} layout className="mission-motion-tile" initial={reduce?false:{opacity:.55,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0}} transition={{duration:.25,delay:Math.min(index,5)*.025}}><MissionCard mission={m} list={list}/></motion.div>)}</AnimatePresence></motion.div>:<Empty title="No missions here yet"><p>Try another filter, or turn your own idea into a mission.</p><button className="button secondary" onClick={()=>{setCategory('');setSearch('');setStatus('')}}>Clear filters</button></Empty>}
    </section>

    <section className="board-process" aria-labelledby="board-process-title"><div><h2 id="board-process-title">From a brief<br/>to something real.</h2><a className="landing-secondary" href="#/guide">How the exchange works <ArrowUpRight size={16}/></a></div><ol>{steps.map(([title,text],index)=><li key={title}><motion.span className="process-rule" initial={false} whileInView={reduce?{}:{scaleX:[.12,1]}} viewport={{once:true,amount:1}} transition={{duration:.55,delay:index*.13,ease:[.16,1,.3,1]}}/><span>{index+1}</span><h3>{title}</h3><p>{text}</p></li>)}</ol></section>
    <ConnectionScene/>
  </div>;
}
