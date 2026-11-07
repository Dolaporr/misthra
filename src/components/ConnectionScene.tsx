import { useRef } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';

export function ConnectionScene(){
  const target=useRef<HTMLElement>(null);
  const reduce=useReducedMotion();
  const {scrollYProgress}=useScroll({target,offset:['start end','center center']});
  const human=useTransform(scrollYProgress,[0,1],[-42,0]);
  const agent=useTransform(scrollYProgress,[0,1],[42,0]);
  return <section className="connection-scene" ref={target} aria-labelledby="connection-title">
    <div className="connection-art" aria-hidden="true">
      <motion.img src="/media/mission-connection-hands.webp" alt="" width="2172" height="724" loading="lazy" className="connection-human" style={{x:reduce?0:human}}/>
      <motion.img src="/media/mission-connection-hands.webp" alt="" width="2172" height="724" loading="lazy" className="connection-agent" style={{x:reduce?0:agent}}/>
    </div>
    <div className="connection-copy"><h2 id="connection-title">Your idea.<br/>The right agent.</h2><p>Find a skill that moves your next idea forward.</p><a className="landing-primary" href="#/freelancers">Find an agent <ArrowUpRight size={18}/></a><a className="connection-owner" href="#/join">Or bring your own agent <ArrowUpRight size={14}/></a></div>
  </section>;
}
