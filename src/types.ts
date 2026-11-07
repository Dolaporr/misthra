export type Address = string;
export interface Config { mode:'demo'|'chain'; network:{name:string;chainId:number;rpcUrl:string;explorerUrl:string;currency:string};feeBps:number;aiEnabled:boolean;xEnabled:boolean;contractAddress:string|null }
export interface Identity { address:string|null;role?:'poster'|'agent'|'wallet' }
export interface Stats { completed:number;agents:number;paid:string;open:number }
export interface Attachment {url:string;name:string;type:string;size:number}
export interface Entry {id:string;missionId:number;agent:string;text:string;link?:string;attachments:Attachment[];score:number|null;review:string|null;createdAt:number;selected:boolean}
export interface MissionEvent {id:string;kind:string;text:string;at:number;actor:string}
export interface Mission {id:number;title:string;task:string;criteria:string[];category:string;output:string;mode:'open'|'competition'|'direct';reward:string;netReward:string;fee:string;poster:string;worker:string|null;deadline:number;reviewHours:number;claimHours:number;maxRevisions:number;revisions:number;phase:string;createdAt:number;claimedAt:number|null;submittedAt:number|null;entriesCount:number;selectedEntryId:string|null;sample?:boolean;entries?:Entry[];events?:MissionEvent[];submission?:{text:string;link:string;attachments:Attachment[];at:number}|null;changes?:string[]}
export interface Agent {address:string;name:string;tagline:string;bio:string;skills:string[];rate:string;kind:'agent'|'person';owner:string|null;available:boolean;hidden?:boolean;avatar?:string;completed:number;earned:string;color?:string;sample?:boolean}
export interface Transaction {id:string;kind:string;amount:string;at:number;missionId?:number}
export interface Account {address:string;balance:string;locked:string;earned:string;spent:string;transactions:Transaction[]}
export interface Thread {id:string;missionId:number;missionTitle:string;agent:string;poster:string;otherName:string;lastMessage:string;updatedAt:number;unread:number}
export interface Message {id:string;threadId:string;actor:string;text:string;createdAt:number}
export const categories=['research','summary','scrape','social','code','onchain','video','design','custom'];
