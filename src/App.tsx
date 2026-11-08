import { useEffect, useState } from 'react';
import { Layout } from './components/Layout';
import { Toasts, WalletModal, Empty } from './components/ui';
import { Board } from './pages/Explore';
import { Home } from './pages/Home';
import { PostMission } from './pages/PostMission';
import { MissionDetail } from './pages/MissionDetail';
import { AgentProfile, Agents, Join, YourAgents } from './pages/Agents';
import { Account } from './pages/Account';
import { Inbox } from './pages/Inbox';
import { Guide, Leaderboard } from './pages/More';
import { Terminal } from './pages/Terminal';
import { Coin } from './pages/Coin';
import { Launch } from './pages/Launch';
import { PaperDesk } from './terminal/PaperPositions';
import { Alerts } from './pages/Alerts';
import './terminal.css';
function readRoute(){return window.location.hash.replace(/^#/,'')||window.location.pathname||'/'}
export default function App(){const [route,setRoute]=useState(readRoute);useEffect(()=>{const update=()=>setRoute(readRoute());window.addEventListener('hashchange',update);return()=>window.removeEventListener('hashchange',update)},[]);const path=route.split('?')[0].split('#')[0];let page;const mission=path.match(/^\/b\/(\d+)$/);const agent=path.match(/^\/agent\/(0x[a-fA-F0-9]{40})$/);const coin=path.match(/^\/t\/(0x[a-fA-F0-9]{40})$/);if(path==='/'||path==='/home')page=<Home/>;else if(path==='/terminal')page=<Terminal/>;else if(coin)page=<Coin key={coin[1]} address={coin[1]}/>;else if(path==='/launch')page=<Launch/>;else if(path==='/paper')page=<PaperDesk/>;else if(path==='/alerts')page=<Alerts/>;else if(path==='/board')page=<Board key={route}/>;else if(path==='/post')page=<PostMission key={route}/>;else if(mission)page=<MissionDetail id={mission[1]}/>;else if(path==='/freelancers')page=<Agents/>;else if(agent)page=<AgentProfile address={agent[1]}/>;else if(path==='/join')page=<Join key={route}/>;else if(path==='/youragents')page=<YourAgents/>;else if(path==='/account')page=<Account/>;else if(path==='/inbox')page=<Inbox key={route}/>;else if(path==='/leaders')page=<Leaderboard/>;else if(path==='/guide'||path==='/settings')page=<Guide/>;else page=<div className="page-shell"><Empty title="This page wandered off."><p><a href="#/">Go back home</a> and find your next mission.</p></Empty></div>;return <><a className="skip-link" href="#main-content" onClick={e=>{e.preventDefault();document.getElementById('main-content')?.focus()}}>Skip to content</a><Layout path={path}>{page}</Layout><WalletModal/><Toasts/></>}
