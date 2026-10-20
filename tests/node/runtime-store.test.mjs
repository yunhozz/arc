import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const state = () => ({schemaVersion:1,workflowId:'workflow',revision:0,versions:{policy:'1',runtime:'1',adapter:'1',policyHash:'sha256:'+ 'a'.repeat(64),runtimeHash:'sha256:'+ 'b'.repeat(64),adapterHash:'sha256:'+ 'c'.repeat(64)},target:{realpath:'/workspace',repository:'repo',worktree:'wt',branch:'main',baseHead:'base',head:'head'},documents:[],approvals:[],tasks:[{id:'T1',status:'pending',paths:['/workspace/file'],dependencies:[],baseCommit:'head',criteria:['criterion'],requiredChecks:[]}],assignments:[],identities:[],leases:[],checks:[],findings:[],acceptances:[],commits:[],audit:[],capabilities:[],requests:[],mode:'plan'});
const request = () => ({requestId:'request',platform:'codex',operation:'read',actorRef:'actor',taskId:'T1',cwd:'/workspace',toolName:'Read',arguments:{},paths:['/workspace/file'],descriptor:{}});

const api=await import('../../lib/runtime/store.mjs').catch(()=>({}));
const input=(id,descriptor={})=>{const normalized={...request(),requestId:id,descriptor};return {requestId:id,request:normalized,requestFingerprint:api.fingerprintRequest(normalized)};};
test('transactions serialize revisions replay safely survive restart and retain state on failure',async t=>{
 assert.equal(typeof api.transactWorkflow,'function');const dir=await fs.mkdtemp(path.join(os.tmpdir(),'arc-store-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const statePath=path.join(dir,'state.json');await fs.writeFile(statePath,JSON.stringify(state()));
 const args={statePath,expectedRevision:0,...input('r'),decide:s=>({decision:'allow',proposedTransition:{...s,revision:s.revision+1}})};
 const result=await api.transactWorkflow(args);assert.equal(result.state.revision,1);
 assert.equal((await api.transactWorkflow({...args,decide:()=>{throw Error('must not replay');}})).replayed,true);
 await assert.rejects(api.transactWorkflow({...args,...input('stale')}),/revision/i);
 await fs.writeFile(statePath+'.lock','lock');await assert.rejects(api.transactWorkflow({...args,expectedRevision:1,...input('locked')}),/lock|exist/i);await fs.unlink(statePath+'.lock');
 const before=await fs.readFile(statePath,'utf8');await assert.rejects(api.transactWorkflow({...args,expectedRevision:1,...input('failed'),decide:()=>{throw Error('write failure');}}),/failure/);assert.equal(await fs.readFile(statePath,'utf8'),before);
 assert.equal((await api.transactWorkflow({...args,...input('r')})).state.revision,1);
});
test('store rejects identity rebinding retired revival and failed serialization without partial writes',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'arc-store-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const statePath=path.join(dir,'state.json');const s=state();s.identities=[{actorRef:'actor',role:'coder',taskId:'T1',observationRef:'obs'}];s.leases=[{actorRef:'actor',taskId:'T1',status:'retired'}];await fs.writeFile(statePath,JSON.stringify(s));const before=await fs.readFile(statePath,'utf8');
 for(const change of [s=>s.identities[0].taskId='T2',s=>s.leases[0].status='active',s=>s.extra=1n]){await assert.rejects(api.transactWorkflow({statePath,expectedRevision:0,...input('bad'),decide:s=>{change(s);return {decision:'allow',proposedTransition:s};}}));assert.equal(await fs.readFile(statePath,'utf8'),before);}
});

test('replay fingerprint conflict never reuses prior allow or changes state bytes',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'arc-store-replay-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const statePath=path.join(dir,'state.json');await fs.writeFile(statePath,JSON.stringify(state()));
 const args={statePath,expectedRevision:0,...input('same-id',{intent:'allow-A'}),decide:()=>({decision:'allow',proposedTransition:null})};
 await api.transactWorkflow(args);const before=await fs.readFile(statePath,'utf8');
 await assert.rejects(api.transactWorkflow({...args,...input('same-id',{intent:'deny-B'}),decide:()=>({decision:'deny',proposedTransition:null})}),/fingerprint.*conflict/i);
 await assert.rejects(api.transactWorkflow({...args,request:{...args.request,operation:'write'}}),/fingerprint/i);
 await assert.rejects(api.transactWorkflow({...args,request:undefined}),/request|schema/i);
 assert.equal(await fs.readFile(statePath,'utf8'),before);assert.equal(JSON.parse(before).revision,1);
 const replay=await api.transactWorkflow({...args,decide:()=>{throw Error('must not decide twice');}});assert.equal(replay.replayed,true);assert.equal(replay.decision.decision,'allow');
 await assert.rejects(api.transactWorkflow({...args,requestFingerprint:undefined}),/fingerprint/i);
});
test('request fingerprint uses explicit SHA-256 over canonical complete JSON inputs',()=>{
 assert.equal(typeof api.fingerprintRequest,'function');assert.match(api.fingerprintRequest({request:{operation:'read'},evidence:{revision:0}}),/^sha256:[a-f0-9]{64}$/);
 assert.equal(api.fingerprintRequest({b:2,a:1}),api.fingerprintRequest({a:1,b:2}));assert.notEqual(api.fingerprintRequest({operation:'read'}),api.fingerprintRequest({operation:'write'}));
 assert.throws(()=>api.fingerprintRequest({request:undefined}));
});
