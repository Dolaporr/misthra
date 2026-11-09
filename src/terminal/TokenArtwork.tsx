import {useState} from 'react';
import {artworkUrl} from './market-display';
/** Artwork may arrive in a later feed update. A failed URL falls back cleanly. */
export function TokenArtwork({image,symbol}:{image:string|null;symbol:string}){
 const [failed,setFailed]=useState<string|null>(null);
 const safe=artworkUrl(image);
 return safe&&image&&image!==failed?<img src={safe} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={()=>setFailed(image)}/>:<>{symbol.slice(0,2).toUpperCase()}</>;
}
