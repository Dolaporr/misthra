export type PaperPosition={token:string;symbol:string;tokens:number;spentHype:number;receivedHype:number;valueHype:number;pnlHype:number};
export type PaperResponse={source:'simulated';positions:PaperPosition[]};
export function paperTotals(positions:PaperPosition[]){const sum=(key:'valueHype'|'pnlHype')=>positions.every(p=>Number.isFinite(p[key]))?positions.reduce((total,p)=>total+p[key],0):null;return {value:sum('valueHype'),pnl:sum('pnlHype')}}
