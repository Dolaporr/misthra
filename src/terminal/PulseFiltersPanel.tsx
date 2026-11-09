import {useState} from 'react';
import {Modal} from '../components/ui';
import {STAGES,type Feed,type Stage} from './model';
import {blankFilters,loadColumnFilters,PRESETS,validFilters,type ColumnFilters,type Filters} from './pulse-filters';
export function PulseFiltersPanel({initialStage,columns,pads,onApply,onClose}:{initialStage:Stage;columns:ColumnFilters;pads:Feed['pads'];onApply:(value:ColumnFilters)=>void;onClose:()=>void}){
 const [stage,setStage]=useState(initialStage),[draft,setDraft]=useState(()=>loadColumnFilters(columns));
 const column=draft[stage],filters=column.presets[column.active];
 const valid=Object.values(draft).every(c=>Object.values(c.presets).every(validFilters));
 const update=(patch:Partial<Filters>)=>setDraft({...draft,[stage]:{...column,presets:{...column.presets,[column.active]:{...filters,...patch}}}});
 return <Modal title="Pulse filters" onClose={onClose}><div className="terminal-settings-panel"><div className="settings-tabs" role="group" aria-label="Filter stage">{STAGES.map(s=><button key={s.key} aria-pressed={s.key===stage} onClick={()=>setStage(s.key)}>{s.label}</button>)}</div><div className="settings-tabs presets" role="group" aria-label="Filter preset">{PRESETS.map(p=><button key={p} aria-pressed={column.active===p} onClick={()=>setDraft({...draft,[stage]:{...column,active:p}})}>{p}</button>)}</div><form className="terminal-filter-fields" onSubmit={e=>{e.preventDefault();if(valid){onApply(draft);onClose()}}}>
 <label>Launchpad<select value={filters.pad} onChange={e=>update({pad:e.target.value})}><option value="">All pads</option>{pads.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
 <label>Minimum liquidity · HYPE<input value={filters.minLiq} inputMode="decimal" placeholder="Any" onChange={e=>update({minLiq:e.target.value})}/></label>
 <label>Minimum holders<input value={filters.minHolders} inputMode="numeric" placeholder="Any" onChange={e=>update({minHolders:e.target.value})}/></label>
 <label>Maximum age · hours<input value={filters.maxAgeH} inputMode="decimal" placeholder="Any" onChange={e=>update({maxAgeH:e.target.value})}/></label>
 <label className="terminal-setting"><span>Hide failed safety checks</span><input type="checkbox" checked={filters.hideFailed} onChange={e=>update({hideFailed:e.target.checked})}/></label>
 {!valid&&<p className="error-text" role="alert">Each preset needs non-negative numbers and whole-number holders. Check any edited stage before applying.</p>}<div className="settings-footer"><button type="button" className="button secondary" onClick={()=>update({...blankFilters})}>Reset {column.active}</button><button className="button primary" disabled={!valid}>Apply filters</button></div><p className="settings-note">Each stage has its own three presets, saved on this device.</p></form></div></Modal>;
}
