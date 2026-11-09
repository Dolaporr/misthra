import {createContext,useContext,useEffect,useState,type ReactNode} from 'react';
import {Modal} from '../components/ui';
import {defaultDisplay,readDisplay,type TerminalDisplay} from './display-preferences';
const DisplayContext=createContext<{display:TerminalDisplay;setDisplay:(value:TerminalDisplay)=>void}>({display:defaultDisplay,setDisplay:()=>{}});
export const useTerminalDisplay=()=>useContext(DisplayContext);
export function TerminalDisplayProvider({children}:{children:ReactNode}){
 const [display,setDisplay]=useState(()=>{try{return readDisplay(JSON.parse(localStorage.getItem('misthra.terminal.display')||'null'))}catch{return {...defaultDisplay}}});
 useEffect(()=>{try{localStorage.setItem('misthra.terminal.display',JSON.stringify(display))}catch{}},[display]);
 return <DisplayContext.Provider value={{display,setDisplay}}><div className={`terminal-display ${display.compact?'density-compact':''} ${display.largeMetrics?'metrics-large':''} ${display.circleImages?'images-circle':''} ${!display.showName?'hide-token-name':''} ${!display.showVolume?'hide-token-volume':''} ${!display.showChecks?'hide-token-checks':''} ${!display.showAge?'hide-token-age':''}`}>{children}</div></DisplayContext.Provider>;
}
export function DisplayPanel({onClose}:{onClose:()=>void}){
 const {display,setDisplay}=useTerminalDisplay(),[tab,setTab]=useState('Layout');
 const update=(patch:Partial<TerminalDisplay>)=>setDisplay({...display,...patch});
 const toggle=(key:keyof TerminalDisplay,label:string,note?:string)=><label className="terminal-setting"><span>{label}{note&&<small>{note}</small>}</span><input type="checkbox" role="switch" checked={Boolean(display[key])} onChange={e=>update({[key]:e.target.checked})}/></label>;
 return <Modal title="Terminal display" onClose={onClose}><div className="terminal-settings-panel"><div className="settings-tabs" role="group" aria-label="Display settings">{['Layout','Row elements','Metric colors','Reading'].map(t=><button key={t} aria-pressed={tab===t} onClick={()=>setTab(t)}>{t}</button>)}</div>
 {tab==='Layout'&&<>{toggle('compact','Compact rows','Reduce the space between tokens.')}{toggle('largeMetrics','Larger metrics','Enlarge market cap and volume figures.')}{toggle('circleImages','Circular images','Use circles instead of square token images.')}{toggle('roundCaps','Round market caps','Whole-number compact dollar values.')}</>}
 {tab==='Row elements'&&<>{toggle('showName','Token name')}{toggle('showAge','Launch age')}{toggle('showVolume','Trading volume')}{toggle('showChecks','Checks and holder signals')}</>}
 {tab==='Reading'&&<>{toggle('pauseOnRead','Hold lists while reading','Hover or keyboard focus holds the visible list. Manual freeze is always available.')}<p className="settings-note">Search results stay separate from the live board. Quick amounts always open a quote for review.</p></>}
 {tab==='Metric colors'&&<>{toggle('colorCaps','Color market cap ranges','Uses returned USD values only. Missing prices stay blank.')}<div className="metric-range-inputs"><label>First threshold · USD<input type="number" min="0" value={display.lowCap} onChange={e=>{const n=Number(e.target.value);if(n>=0&&n<display.highCap)update({lowCap:n})}}/></label><label>Second threshold · USD<input type="number" min={display.lowCap+1} value={display.highCap} onChange={e=>{const n=Number(e.target.value);if(n>display.lowCap)update({highCap:n})}}/></label></div><div className="metric-range-legend"><span>Below first</span><span>Middle range</span><span>Above second</span></div></>}
 <div className="settings-footer"><button className="button secondary" onClick={()=>setDisplay({...defaultDisplay})}>Reset display</button><button className="button primary" onClick={onClose}>Done</button></div><p className="settings-note">Applies to this device.</p></div></Modal>;
}
