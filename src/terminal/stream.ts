export type Transport='connecting'|'stream'|'polling'|'paused';
type Stream={onopen:((event:Event)=>unknown)|null;onerror:((event:Event)=>unknown)|null;addEventListener:(type:string,fn:()=>void)=>void;close:()=>void};
export function connectFeed<T>(io:{fetch:()=>Promise<T>;data:(value:T)=>void;error:(message:string|null)=>void;mode:(value:Transport)=>void;stream?:()=>Stream;visible?:boolean;later:(fn:()=>void,ms:number)=>unknown;cancel:(id:unknown)=>void}){
  let stopped=false,visible=io.visible??true,source:Stream|null=null,mode:Transport='connecting',poll:unknown,debounce:unknown,loading=false,queued=false,generation=0;
  const change=(value:Transport)=>{mode=value;io.mode(value)};
  const clear=()=>{io.cancel(poll);io.cancel(debounce);poll=debounce=undefined};
  const refresh=async()=>{
    if(stopped||!visible)return;if(loading){queued=true;return}loading=true;const ticket=generation;
    try{const value=await io.fetch();if(!stopped&&visible&&ticket===generation){io.data(value);io.error(null)}}catch(e){if(!stopped&&visible&&ticket===generation)io.error((e as Error).message)}finally{loading=false;if(queued&&!stopped&&visible){queued=false;void refresh()}}
  };
  const pollNext=()=>{io.cancel(poll);if(!stopped&&visible&&mode==='polling')poll=io.later(()=>{void refresh();pollNext()},3000)};
  const event=()=>{if(stopped||!visible||debounce!==undefined)return;debounce=io.later(()=>{debounce=undefined;void refresh()},350)};
  const start=()=>{
    if(stopped||!visible)return;change('connecting');void refresh();
    if(!io.stream){change('polling');pollNext();return}
    try{source=io.stream();const current=source;source.onopen=()=>{if(stopped||!visible||source!==current)return;change('stream');io.cancel(poll);poll=undefined;void refresh()};source.onerror=()=>{if(stopped||!visible||source!==current)return;change('polling');pollNext()};source.addEventListener('launch',event);source.addEventListener('update',event)}catch{change('polling');pollNext()}
  };
  if(visible)start();else change('paused');
  return {refresh:()=>void refresh(),setVisible(value:boolean){if(visible===value)return;visible=value;generation++;queued=false;clear();source?.close();source=null;if(visible)start();else change('paused')},close(){stopped=true;generation++;clear();source?.close();source=null}};
}
