export type PadSupport={id:string;name:string;recipient:'at-launch'|'after-launch'|'unconfirmed';delivery:'push'|'claim'|'unknown';buyback:'yes'|'no'|'unconfirmed';note:string;usable:boolean};
export type PadSupportResponse={checked:{at:string;by:string;onchain:boolean};pads:PadSupport[]};
export function buybackUnavailable(pads:PadSupport[],selected:string[]):boolean{
  return selected.length>0&&selected.every(id=>pads.some(p=>p.id===id&&p.buyback==='no'));
}
export function buybackUnavailableMessage(pads:PadSupport[],selected:string[]):string|null{
  if(!buybackUnavailable(pads,selected))return null;
  const names=pads.filter(p=>selected.includes(p.id)).map(p=>p.name).join(', ');
  const v4=selected.every(id=>['montra','boxa','elyspump','volta'].includes(id));
  return `Buyback-and-burn isn't available on ${names} yet${v4?' (Uniswap v4)':''}. Wallet splits work where custom fee recipients are supported.`;
}
export function percentToBps(value:string):number|null{
  const text=value.trim();if(!/^(?:\d{1,3}(?:\.\d{0,2})?|\.\d{1,2})$/.test(text))return null;
  const [whole='',fraction='']=text.split('.');const bps=Number(whole)*100+Number(fraction.padEnd(2,'0'));
  return bps>=0&&bps<=10_000?bps:null;
}
export function oneHypeBucketPreview(percent:string):string|null{
  const bps=percentToBps(percent);if(bps===null)return null;
  const units=990_000_000_000_000_000n*BigInt(bps)/10_000n;
  const whole=units/10n**18n,decimal=(units%10n**18n).toString().padStart(18,'0').replace(/0+$/,'');
  return decimal?`${whole}.${decimal}`:String(whole);
}
