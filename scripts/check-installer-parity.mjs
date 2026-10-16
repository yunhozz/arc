import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const arg=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const root=path.resolve(arg('--root',fileURLToPath(new URL('../',import.meta.url))));
const complete=process.argv.includes('--complete');
// Frozen before the legacy files were removed: test bodies, assertion expressions,
// and helper assertion sites. Coverage mappings may change; this inventory may not.
const inventorySha='b21f21cb1786d8400914f6f1837e8c3dddc51e4629fbdc4e091567a99f3825de';
try{
 const ledger=JSON.parse(fs.readFileSync(path.join(root,'tests/installer-parity.json'),'utf8'));
 const inventory={tests:ledger.legacyInventory,helpers:ledger.legacyHelpers?.map(({id,assertions})=>({id,assertions}))};
 if(crypto.createHash('sha256').update(JSON.stringify(inventory)).digest('hex')!==inventorySha)throw Error('Original assertion inventory changed');
 if(inventory.tests.length!==236||inventory.tests.reduce((n,t)=>n+t.assertions.length,0)!==739||inventory.helpers.reduce((n,t)=>n+t.assertions.length,0)!==14)throw Error('Original assertion inventory count changed');
 const entryIds=ledger.entries.map(e=>e.legacy);if(new Set(entryIds).size!==entryIds.length)throw Error('Duplicate legacy assertion ID');if(entryIds.length!==236)throw Error('Original inventory ID count changed');
 const original=new Map(inventory.tests.map(t=>[t.id,t])),seen=new Set(),destinations=new Map();
 const addDestination=(destination,owner)=>{
  if(!/^tests\/(?:node\/[^/]+\.test\.mjs|test_[a-z_]+\.py)$/.test(destination?.file)||typeof destination.test!=='string'||!destination.test.trim())throw Error(`Invalid destination: ${owner}`);
  if(!fs.existsSync(path.join(root,destination.file)))throw Error(`Missing mapped test file: ${destination.file} (${owner})`);
  destinations.set(JSON.stringify(destination),destination);
 };
 for(const entry of ledger.entries){
  if(seen.has(entry.legacy))throw Error(`Duplicate legacy assertion: ${entry.legacy}`);seen.add(entry.legacy);
  const before=original.get(entry.legacy);if(!before)throw Error(`Unknown original inventory ID: ${entry.legacy}`);
  if(entry.status!=='verified')throw Error(`Unverified legacy assertion: ${entry.legacy}`);
  const coverage=entry.assertionLines;if(!coverage||coverage.length!==before.assertions.length||!entry.destinations?.length)throw Error(`Incomplete assertion coverage: ${entry.legacy}`);
  for(const assertion of before.assertions)if(!coverage.includes(assertion.line))throw Error(`Missing assertion destination: ${entry.legacy}:${assertion.line}`);
  for(const destination of entry.destinations)addDestination(destination,entry.legacy);
 }
 for(const id of original.keys())if(!seen.has(id))throw Error(`Missing original inventory ID: ${id}`);
 for(const helper of ledger.legacyHelpers){
  if(!helper.destinations?.length)throw Error(`Missing helper assertion coverage: ${helper.id}`);
  for(const destination of helper.destinations)addDestination(destination,helper.id);
 }
 // While the originals exist, detect a source inventory change as well.
 const sourceIds=new Set();for(const filename of ['tests/test_install.py','tests/test_target_install.py']){const file=path.join(root,filename);if(!fs.existsSync(file))continue;let group;for(const line of fs.readFileSync(file,'utf8').split('\n')){const cls=/^class (\w+)/.exec(line);if(cls)group=cls[1];const method=/^    def (test_\w+)\(/.exec(line);if(method)sourceIds.add(`${filename}::${group}::${method[1]}`);}}for(const id of sourceIds)if(!original.has(id))throw Error(`Uninventoried legacy test: ${id}`);
 if(complete){
  const all=[...destinations.values()],nodeFiles=[...new Set(all.filter(d=>d.file.endsWith('.mjs')).map(d=>d.file))];
  const escape=text=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  for(const file of nodeFiles){
   const selected=all.filter(d=>d.file===file),pattern='^(?:'+selected.map(d=>escape(d.test)).join('|')+')$';
   const result=spawnSync(process.execPath,['--test','--test-reporter=tap','--test-name-pattern',pattern,file],{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024});
   if(result.status!==0)throw Error(`Mapped Node tests failed: ${file}\n${result.stdout}\n${result.stderr}`);
   const passed=new Set([...result.stdout.matchAll(/^ok \d+ - (.+)$/gm)].map(m=>m[1]));
   for(const d of selected)if(!passed.has(d.test))throw Error(`Mapped Node destination did not execute: ${file}: ${d.test}`);
  }
  const pythonFiles=[...new Set(all.filter(d=>d.file.endsWith('.py')).map(d=>d.file))];
  for(const file of pythonFiles){const result=spawnSync('python3',['-B','-m','unittest','discover','-v','-s','tests','-p',path.basename(file)],{cwd:root,encoding:'utf8',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});if(result.status!==0)throw Error(`Preserved Python suite failed: ${file}\n${result.stderr}`);for(const d of all.filter(d=>d.file===file))if(!result.stderr.includes(`.${d.class}.${d.test}) ... ok`))throw Error(`Preserved destination did not execute: ${file}: ${d.class}.${d.test}`);}
 }
 console.log(`Parity verified: 236 original test IDs, 739 test assertions, 14 helper assertions${complete?'; every mapped Node and preserved Python test passed':''}`);
}catch(error){console.error(error.message);process.exitCode=1;}
