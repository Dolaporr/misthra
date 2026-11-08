import {useEffect,useRef,useState} from 'react';
import {api} from '../api';
import type {Feed} from './model';
import {connectFeed,type Transport} from './stream';
export function useLaunchFeed(){
  const [data,setData]=useState<Feed|null>(null),[error,setError]=useState<string|null>(null),[transport,setTransport]=useState<Transport>('connecting');
  const connection=useRef<ReturnType<typeof connectFeed<Feed>>|null>(null);
  useEffect(()=>{
    const feed=connectFeed<Feed>({visible:!document.hidden,fetch:()=>api<Feed>('/launches?limit=200&sort=age'),data:setData,error:setError,mode:setTransport,stream:typeof EventSource==='undefined'?undefined:()=>new EventSource('/api/stream',{withCredentials:true}),later:(fn,ms)=>window.setTimeout(fn,ms),cancel:id=>window.clearTimeout(id as number|undefined)});
    connection.current=feed;const visibility=()=>feed.setVisible(!document.hidden);visibility();document.addEventListener('visibilitychange',visibility);
    return()=>{document.removeEventListener('visibilitychange',visibility);feed.close();connection.current=null};
  },[]);
  return {data,error,transport,reload:()=>connection.current?.refresh()};
}
