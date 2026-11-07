import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { api, post } from './api';
import type { Config, Identity, Stats } from './types';
type Toast={id:number;text:string;error?:boolean};
interface AppState {identity:Identity;config:Config|null;stats:Stats|null;version:number;refresh:()=>void;notify:(text:string,error?:boolean)=>void;login:(role:'poster'|'agent')=>Promise<void>;logout:()=>Promise<void>;walletOpen:boolean;openWallet:()=>void;closeWallet:()=>void;toasts:Toast[];dismiss:(id:number)=>void;initialError:string|null}
const Context=createContext<AppState|null>(null);
export function AppProvider({children}:{children:ReactNode}){
 const [identity,setIdentity]=useState<Identity>({address:null});const [config,setConfig]=useState<Config|null>(null);const [stats,setStats]=useState<Stats|null>(null);const [version,setVersion]=useState(0);const [walletOpen,setWalletOpen]=useState(false);const [toasts,setToasts]=useState<Toast[]>([]);const [initialError,setInitialError]=useState<string|null>(null);
 const refresh=useCallback(()=>setVersion(v=>v+1),[]);
 const notify=useCallback((text:string,error=false)=>{const id=Date.now()+Math.random();setToasts(t=>[...t,{id,text,error}]);window.setTimeout(()=>setToasts(t=>t.filter(x=>x.id!==id)),6500)},[]);
 useEffect(()=>{let live=true;Promise.all([api<Identity>('/auth/me'),api<Config>('/config'),api<Stats>('/stats')]).then(([i,c,s])=>{if(live){setIdentity(i);setConfig(c);setStats(s);setInitialError(null)}}).catch(e=>{if(live)setInitialError(e.message)});return()=>{live=false}},[version]);
 const login=async(role:'poster'|'agent')=>{await post('/auth/demo',{role});refresh();setWalletOpen(false);notify(`You're trying the demo as ${role==='poster'?'a poster':'an agent'}.`)};
 const logout=async()=>{await post('/auth/logout');refresh();notify('Signed out.')};
 return <Context.Provider value={{identity,config,stats,version,refresh,notify,login,logout,walletOpen,openWallet:()=>setWalletOpen(true),closeWallet:()=>setWalletOpen(false),toasts,dismiss:id=>setToasts(t=>t.filter(x=>x.id!==id)),initialError}}>{children}</Context.Provider>
}
export function useApp(){const c=useContext(Context);if(!c)throw new Error('AppProvider missing');return c}
export function useResource<T>(path:string|null){const {version}=useApp();const [data,setData]=useState<T|null>(null);const [loading,setLoading]=useState(true);const [error,setError]=useState<string|null>(null);const [retry,setRetry]=useState(0);useEffect(()=>{let live=true;if(path===null){setData(null);setLoading(false);return}setLoading(true);setError(null);api<T>(path).then(d=>{if(live)setData(d)}).catch(e=>{if(live)setError(e.message)}).finally(()=>{if(live)setLoading(false)});return()=>{live=false}},[path,version,retry]);return {data,loading,error,reload:()=>setRetry(v=>v+1),setData}}
