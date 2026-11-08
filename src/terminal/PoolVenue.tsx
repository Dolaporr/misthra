import type {Pool} from './model';
export function PoolVenue({pool}:{pool:Pool}){
  const v4=pool.venue==='uniswap-v4';
  return <span className="pool-venue" title={`${v4?'Uniswap v4':pool.venue==='uniswap-v3'?'Uniswap v3':pool.venue} · ${pool.quote} quote`}><span>{pool.venue.startsWith('uniswap-')?'Uniswap':pool.venue}</span><span className={'venue-version'+(v4?' v4':'')}>{v4?'v4':pool.venue==='uniswap-v3'?'v3':'v2'}</span><span className="pool-quote">{pool.quote}</span></span>;
}
