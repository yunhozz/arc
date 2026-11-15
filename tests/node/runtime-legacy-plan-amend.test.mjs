import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {initializeCooperativeWorkflow} from '../../lib/runtime/bootstrap.mjs';
import {runCooperativeCommand} from '../../lib/runtime/cooperative.mjs';
import {evaluateCooperative} from '../../lib/runtime/evaluate.mjs';

const actor={id:'operator',role:'orchestrator'};
const fingerprint='sha256:'+'a'.repeat(64);
const legacy=status=>({requestId:'legacy',status,fingerprint,operation:'plan-amend',arguments:{}});
const removedReason='Legacy plan-amend intent is no longer supported; inspect Git history and any refs/arc/recovery/* refs manually, then start a new workflow';
const actions=['inspect-legacy-plan-amend','start-new-workflow'];
function request(command,revision=0){
 if(command==='status')return {command};
 const input={requestId:'request',expectedRevision:revision,actor};
 if(command==='record')input.evidence={kind:'note',messageRef:'note',data:{}};
 if(command==='prepare')Object.assign(input,{operation:'accept',arguments:{}});
 if(['result','reconcile'].includes(command))Object.assign(input,{intentId:'legacy',result:{status:'succeeded',messageRef:'result',data:{}}});
 return {command,input};
}
async function fixture(t){
 const cwd=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'arc-legacy-plan-')));
 t.after(()=>fs.rm(cwd,{recursive:true,force:true}));
 const common=path.join(cwd,'.git');await fs.mkdir(common);
 const target={realpath:cwd,gitCommonDir:common,gitDir:common,head:'a'.repeat(40),branch:'main'};
 const args={cwd,workflowId:'legacy',observe:async()=>({...target})};
 await initializeCooperativeWorkflow({...args,input:{mode:'plan',actor,selection:{messageRef:'target',contentHash:fingerprint}}});
 const file=path.join(common,'arc/workflows/legacy/state.json');
 const read=async()=>JSON.parse(await fs.readFile(file,'utf8'));
 const write=state=>fs.writeFile(file,JSON.stringify(state,null,2)+'\n');
 return {args,target,file,read,write,call:req=>runCooperativeCommand({...args,...req})};
}
function assertRemoved(out){
 assert.equal(out.decision,'hold');assert.deepEqual(out.ruleIds,['cooperative.plan-amend-removed']);
 assert.equal(out.reason,removedReason);assert.deepEqual(out.nextActions,actions);
}

// Catches reintroducing legacy field validation or dropping opaque state on save.
test('H-1: opaque legacy fields survive an allowed state-changing command',async t=>{
 const f=await fixture(t),state=await f.read();
 state.planAmendments={malformed:true};state.planAmendObservations='opaque';await f.write(state);
 const out=await f.call(request('record'));assert.equal(out.decision,'allow');
 const after=await f.read();assert.equal(after.revision,1);
 assert.deepEqual(after.planAmendments,state.planAmendments);assert.deepEqual(after.planAmendObservations,state.planAmendObservations);
});
// Catches both legacy-specific argument validation and weakened common validation.
test('H-2: legacy intents use common validation including fingerprint',async t=>{
 const f=await fixture(t),state=await f.read();state.intents.push(legacy('succeeded'));
 const args={state,request:request('status'),evidence:{target:state.target,versions:state.versions}};
 assert.equal(evaluateCooperative(args).decision,'allow');
 delete state.intents[0].fingerprint;assert.deepEqual(evaluateCooperative(args).ruleIds,['cooperative.schema']);
});
// Catches a legacy hold placed after policy, target, version or command gates.
for(const status of ['prepared','unknown','mismatch','failed'])for(const command of ['status','record','prepare','result','reconcile']){
 test(`H-3: ${status} intent holds ${command} before policy target and versions`,async t=>{
  const f=await fixture(t),state=await f.read();state.intents.push(legacy(status));
  for(const drift of ['none','policy','target','versions','all']){
   const evidence={target:state.target,versions:state.versions};
   if(['target','all'].includes(drift))evidence.target={...state.target,head:'b'.repeat(40)};
   if(['versions','all'].includes(drift))evidence.versions={...state.versions,runtimeHash:'sha256:'+'0'.repeat(64)};
   const policy=['policy','all'].includes(drift)?{}:undefined;
   assertRemoved(evaluateCooperative({policy,state,request:request(command),evidence}));
  }
  await f.write(state);const before=await fs.readFile(f.file,'utf8');
  assertRemoved(await f.call(request(command)));
  assert.equal(await fs.readFile(f.file,'utf8'),before,'legacy holds must preserve state bytes');
 });
}
// Catches terminal legacy intents being treated as unresolved or executable.
for(const status of ['succeeded','cancelled'])test(`H-4: ${status} legacy intent does not affect normal commands`,async t=>{
 const f=await fixture(t),state=await f.read();state.intents.push(legacy(status));await f.write(state);
 assert.equal((await f.call(request('status'))).decision,'allow');
 assert.equal((await f.call(request('record'))).decision,'allow');
 assert.deepEqual((await f.read()).intents,state.intents);
});
// Catches removed operations throwing during validation or preparing an intent.
for(const args of [undefined,{}])test(`H-5: prepare plan-amend with ${args===undefined?'undefined':'empty'} arguments holds without throwing`,async t=>{
 const f=await fixture(t);let out;
 await assert.doesNotReject(async()=>{out=await f.call({command:'prepare',input:{requestId:'removed',expectedRevision:0,actor,operation:'plan-amend',arguments:args}});});
 assert.notEqual(out.decision,'allow');assert.deepEqual(out.ruleIds,['cooperative.plan-amend-removed']);
 assert.equal(out.reason,'Plan-amend operation is no longer supported');assert.deepEqual(out.nextActions,[]);
 assert.deepEqual((await f.read()).intents,[]);
});
// The temporary Git repository is constructed from bytes; no Git mutation command runs.
test('H-6: commands preserve a real recovery ref and legacy intent and state bytes',async t=>{
 const f=await fixture(t),git=f.target.gitDir;
 await fs.mkdir(path.join(git,'objects'),{recursive:true});await fs.mkdir(path.join(git,'refs/arc/recovery'),{recursive:true});
 await fs.writeFile(path.join(git,'HEAD'),'ref: refs/heads/main\n');
 await fs.writeFile(path.join(git,'config'),'[core]\nrepositoryformatversion = 0\nbare = false\n');
 const content=Buffer.from('legacy recovery\n'),object=Buffer.concat([Buffer.from(`blob ${content.length}\0`),content]);
 const oid=crypto.createHash('sha1').update(object).digest('hex');
 await fs.mkdir(path.join(git,'objects',oid.slice(0,2)));await fs.writeFile(path.join(git,'objects',oid.slice(0,2),oid.slice(2)),deflateSync(object));
 const ref=path.join(git,'refs/arc/recovery/legacy');await fs.writeFile(ref,oid+'\n');
 const observed=()=>execFileSync('git',['show-ref','--verify','refs/arc/recovery/legacy'],{cwd:f.args.cwd,encoding:'utf8'});
 assert.equal(observed(),oid+' refs/arc/recovery/legacy\n');
 const state=await f.read();state.intents.push(legacy('prepared'));await f.write(state);const before=await fs.readFile(f.file,'utf8');
 for(const command of ['status','record','prepare','result','reconcile'])assertRemoved(await f.call(request(command)));
 assert.equal(observed(),oid+' refs/arc/recovery/legacy\n');assert.equal(await fs.readFile(ref,'utf8'),oid+'\n');
 assert.equal(await fs.readFile(f.file,'utf8'),before);assert.deepEqual((await f.read()).intents,state.intents);
});
test('H-6: runtime sources contain no rewrite observer or ref mutation code',async()=>{
 async function inspect(dir){
  for(const entry of await fs.readdir(dir,{withFileTypes:true})){
   const filename=path.join(dir,entry.name);if(entry.isDirectory()){await inspect(filename);continue;}
   const source=await fs.readFile(filename,'utf8');assert.doesNotMatch(source,/update-ref|planAmend|PlanAmend/,filename);
   for(const line of source.split('\n').filter(line=>line.includes('refs/arc/recovery')))assert.ok(line.includes(removedReason),filename+': '+line);
  }
 }
 await inspect(new URL('../../lib/runtime/',import.meta.url).pathname);await inspect(new URL('../../shared/skill/runtime/',import.meta.url).pathname);
});
