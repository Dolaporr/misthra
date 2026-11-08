export const CONFIRMED_FEE_RECIPIENT_PADS:readonly {name:string;url:string}[]=[];
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
