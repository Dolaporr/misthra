import express from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp } from './app.mjs';

const mode=process.env.ERRAND_MODE||'demo';
if(process.env.NODE_ENV==='production'&&mode==='demo'&&process.env.ALLOW_DEMO_PRODUCTION!=='1')throw new Error('Production disables simulated payments. Set ERRAND_MODE=chain, or explicitly ALLOW_DEMO_PRODUCTION=1 for a labeled demo deployment.');
const app=createApp({dbPath:process.env.DB_PATH||'data/errand.sqlite',mode});
const dist=resolve('dist');
if(existsSync(dist)){app.use(express.static(dist));app.get('/{*path}',(req,res)=>res.sendFile(resolve(dist,'index.html')));}
const host=process.env.HOST||'127.0.0.1',port=Number(process.env.PORT||4317);
const server=app.listen(port,host,()=>console.log(`Errand for Elysium: http://${host}:${port} (${mode==='demo'?'simulated HYPE demo':'chain mode; requires escrow reconciliation for financial writes'})`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{app.locals.close();process.exit(0);}));
