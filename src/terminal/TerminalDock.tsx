import {useEffect,useState} from 'react';
import {Activity,ChartNoAxesCombined,ScanLine,ListOrdered,Wallet,Zap} from 'lucide-react';
export const terminalSections=['pulse','new','trending','tracker','orders','portfolio'] as const;
export function readTerminalSection(){const value=new URLSearchParams(window.location.hash.split('?')[1]||'').get('view');return terminalSections.includes(value as typeof terminalSections[number])?value as typeof terminalSections[number]:'pulse'}
export function TerminalDock(){
 const [selected,setSelected]=useState(readTerminalSection);
 useEffect(()=>{const update=()=>setSelected(readTerminalSection());window.addEventListener('hashchange',update);return()=>window.removeEventListener('hashchange',update)},[]);
 const onCoin=window.location.hash.startsWith('#/t/');
 return <nav className="terminal-bottom-dock" aria-label="Terminal shortcuts">{([['new','New pairs',Zap],['trending','Trending',ChartNoAxesCombined],['pulse','Pulse',Activity],['tracker','Track',ScanLine],['orders','Orders',ListOrdered],['portfolio','Portfolio',Wallet]] as const).map(([key,label,Icon])=><a key={key} href={`#/terminal?view=${key}`} aria-current={!onCoin&&selected===key?'page':undefined}><Icon size={21}/><span>{label}</span></a>)}</nav>;
}
