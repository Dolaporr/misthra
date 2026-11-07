import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import solc from 'solc';

const root = fileURLToPath(new URL('../', import.meta.url));

export async function compileContracts({ write = true, extraSources = {} } = {}) {
  const sources = { 'contracts/ErrandBoard.sol': {content: await readFile(path.join(root,'contracts/ErrandBoard.sol'),'utf8')} };
  for (const [name,content] of Object.entries(extraSources)) sources[name]={content};
  const input = {language:'Solidity',sources,settings:{optimizer:{enabled:true,runs:200},viaIR:true,evmVersion:'paris',outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object']}}}};
  const output=JSON.parse(solc.compile(JSON.stringify(input), {import: name=>{
    try { return {contents:readFileSync(path.join(root,'node_modules',name),'utf8')}; }
    catch { return {error:`Import not found: ${name}`}; }
  }}));
  const errors=(output.errors??[]).filter(e=>e.severity==='error');
  if(errors.length) throw new Error(errors.map(e=>e.formattedMessage).join('\n'));
  const artifacts={};
  for(const [sourceName,contracts] of Object.entries(output.contracts)) {
    for(const [name,c] of Object.entries(contracts)) {
      if(!c.evm.bytecode.object) continue;
      artifacts[name]={contractName:name,sourceName,compiler:solc.version(),evmVersion:'paris',abi:c.abi,bytecode:`0x${c.evm.bytecode.object}`,deployedBytecode:`0x${c.evm.deployedBytecode.object}`};
    }
  }
  if(write) {
    await mkdir(path.join(root,'artifacts'),{recursive:true});
    await writeFile(path.join(root,'artifacts/ErrandBoard.json'),`${JSON.stringify(artifacts.ErrandBoard,null,2)}\n`);
  }
  return artifacts;
}

// ---- Misthra fee router (ported from Sinjoh; see NOTICE) ----
// Compiled with the exact compiler Sinjoh pins (0.8.28) and its production
// settings: viaIR, 20,000 optimizer runs, no metadata hash. Elysium runs ArbOS
// 51, so production targets Cancun; the local test EVM supports Shanghai.
import { keccak256 as hashCode } from 'ethers';
import { readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
const solc0828 = createRequire(import.meta.url)('solc0828');
const routerDir = path.join(root, 'contracts/router');
function routerSourceFiles(dir = routerDir) {
  return readdirSync(dir).flatMap(name => { const full = path.join(dir, name); return statSync(full).isDirectory() ? routerSourceFiles(full) : name.endsWith('.sol') ? [full] : []; });
}
function solcRun(sources, evmVersion) {
  const input = { language: 'Solidity', sources, settings: { optimizer: { enabled: true, runs: 20000 }, viaIR: true, evmVersion, metadata: { bytecodeHash: 'none', appendCBOR: false }, outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } } } };
  const output = JSON.parse(solc0828.compile(JSON.stringify(input), { import: name => { try { return { contents: readFileSync(path.join(root, 'node_modules', name), 'utf8') }; } catch { return { error: `Import not found: ${name}` }; } } }));
  const errors = (output.errors ?? []).filter(e => e.severity === 'error');
  if (errors.length) throw new Error(errors.map(e => e.formattedMessage).join('\n'));
  const artifacts = {};
  for (const [sourceName, contracts] of Object.entries(output.contracts)) for (const [name, c] of Object.entries(contracts)) {
    if (!c.evm.bytecode.object) continue;
    artifacts[name] = { contractName: name, sourceName, compiler: solc0828.version(), evmVersion, abi: c.abi, bytecode: `0x${c.evm.bytecode.object}`, deployedBytecode: `0x${c.evm.deployedBytecode.object}` };
  }
  return artifacts;
}
const CODEHASH_RE = /(IMPLEMENTATION_CODEHASH =\s*)0x[0-9a-fA-F]{64}/;
export function compileRouter({ evmVersion = 'cancun', write = false, extraSources = {} } = {}) {
  const sources = {};
  for (const file of routerSourceFiles()) sources[path.relative(root, file)] = { content: readFileSync(file, 'utf8') };
  const typesKey = 'contracts/router/RouterTypes.sol';
  // Pass 1: the router alone. It never reads the pinned hash, so its code is stable.
  const first = solcRun({ 'contracts/router/MisthraFeeRouter.sol': sources['contracts/router/MisthraFeeRouter.sol'], [typesKey]: sources[typesKey], ...Object.fromEntries(Object.entries(sources).filter(([k]) => k.includes('/interfaces/') || k.includes('/libraries/'))) }, evmVersion);
  const codehash = hashCode(first.MisthraFeeRouter.deployedBytecode);
  // Pass 2: everything, with the factory pinned to that exact runtime.
  sources[typesKey] = { content: sources[typesKey].content.replace(CODEHASH_RE, `$1${codehash}`) };
  for (const [name, content] of Object.entries(extraSources)) sources[name] = { content };
  const artifacts = solcRun(sources, evmVersion);
  if (hashCode(artifacts.MisthraFeeRouter.deployedBytecode) !== codehash) throw new Error('Router runtime changed between passes');
  if (write) {
    writeFileSync(path.join(routerDir, 'RouterTypes.sol'), sources[typesKey].content);
    mkdirSync(path.join(root, 'artifacts/router'), { recursive: true });
    for (const name of ['MisthraFeeRouter', 'MisthraFeeRouterFactory', 'MisthraV3SwapAdapter', 'MisthraV3TwapPriceGuard'])
      writeFileSync(path.join(root, `artifacts/router/${name}.json`), `${JSON.stringify(artifacts[name], null, 2)}\n`);
  }
  return { artifacts, codehash };
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const artifacts=await compileContracts();
  console.log(`Compiled ErrandBoard with ${solc.version()} (Paris EVM): ${artifacts.ErrandBoard.deployedBytecode.slice(2).length/2} runtime bytes; ABI and new bytecode in artifacts/ErrandBoard.json.`);
  const router=compileRouter({write:true});
  for(const [n,a] of Object.entries(router.artifacts)) if(n.startsWith('Misthra')) console.log(`${n}: ${a.deployedBytecode.slice(2).length/2} runtime bytes`);
  console.log(`Router implementation codehash ${router.codehash} pinned in contracts/router/RouterTypes.sol (Cancun, solc 0.8.28).`);
}
