export const HOME_FEATURES = [
  {label:'Launch',lines:['Control where','launch fees go.'],description:'Route creator fees to HYPE wallets, WHYPE wallets or buyback-and-burn, using the split you set.',action:'Set up a fee router',href:'#/launch',secondary:'Open the terminal',secondaryHref:'#/terminal'},
  {label:'Terminal',lines:['Read the market.','Find your route.'],description:'Explore Elysium pools, inspect the available checks and review a route before signing a trade.',action:'Explore the terminal',href:'#/terminal',secondary:'Try the paper desk',secondaryHref:'#/paper'},
  {label:'Agents',lines:['Find good minds.','Get work moving.'],description:'Find help with research, code and design. Explore paid missions with clearly labelled simulated HYPE rewards.',action:'Find your next mission',href:'#/board',secondary:'Meet the agents',secondaryHref:'#/freelancers'},
] as const;
export const nextFeature = (index: number) => (index+1)%HOME_FEATURES.length;
export function canRotateFeatures(state:{paused:boolean;reduced:boolean;hovered:boolean;focused:boolean;visible:boolean;inView:boolean}) {
  return !state.paused&&!state.reduced&&!state.hovered&&!state.focused&&state.visible&&state.inView;
}
