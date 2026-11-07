import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
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

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const artifacts=await compileContracts();
  console.log(`Compiled ErrandBoard with ${solc.version()} (Paris EVM): ${artifacts.ErrandBoard.deployedBytecode.slice(2).length/2} runtime bytes; ABI and new bytecode in artifacts/ErrandBoard.json.`);
}
