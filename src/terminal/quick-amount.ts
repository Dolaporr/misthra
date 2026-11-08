/** Exact decimal input only. A preference prefills a quote; it never signs a trade. */
export function validQuickAmount(value:unknown):value is string{
  return typeof value==='string'&&/^\d{1,18}(\.\d{1,18})?$/.test(value)&&/[1-9]/.test(value);
}
export function quickAmountFromHash(hash:string):string{
  const value=new URLSearchParams(hash.split('?')[1]||'').get('amount');
  return validQuickAmount(value)?value:'0.5';
}
