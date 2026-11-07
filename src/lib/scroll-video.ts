const clamp=(value:number)=>Math.min(1,Math.max(0,value));
export function videoUnavailable(readyState:number,networkState:number,hasError:boolean):boolean{
  return hasError||(readyState===0&&networkState===3);
}

export function scrollVideoProgress(sceneTop:number,sceneHeight:number,viewportHeight:number):number {
  if(!Number.isFinite(sceneTop)||!Number.isFinite(sceneHeight)||!Number.isFinite(viewportHeight)||viewportHeight<=0||sceneHeight<=viewportHeight)return 0;
  return clamp(-sceneTop/(sceneHeight-viewportHeight));
}

export function scrollVideoTime(progress:number,duration:number):number {
  if(!Number.isFinite(progress)||!Number.isFinite(duration)||duration<=0)return 0;
  return Math.min(clamp(progress)*duration,Math.max(0,duration-1/30));
}
