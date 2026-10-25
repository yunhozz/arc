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
 assert.equal((await api.transactWorkflow({...args,decide:()=>({decision:'allow',proposedTransition:null})})).replayed,true);
 await assert.rejects(api.transactWorkflow({...args,...input('stale')}),/revision/i);
 await fs.writeFile(statePath+'.lock','lock');await assert.rejects(api.transactWorkflow({...args,expectedRevision:1,...input('locked')}),/lock|exist/i);await fs.unlink(statePath+'.lock');
 const before=await fs.readFile(statePath,'utf8');await assert.rejects(api.transactWorkflow({...args,expectedRevision:1,...input('failed'),decide:()=>{throw Error('write failure');}}),/failure/);assert.equal(await fs.readFile(statePath,'utf8'),before);
 assert.equal((await api.transactWorkflow({...args,...input('r')})).state.revision,1);
});
test('store rejects identity rebinding retired revival and failed serialization without partial writes',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'arc-store-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const statePath=path.join(dir,'state.json');const s=state();s.identities=[{actorRef:'actor',role:'implementer',taskId:'T1',observationRef:'obs'}];s.leases=[{actorRef:'actor',taskId:'T1',status:'retired'}];await fs.writeFile(statePath,JSON.stringify(s));const before=await fs.readFile(statePath,'utf8');
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
 const replay=await api.transactWorkflow({...args,decide:()=>({decision:'allow',proposedTransition:null})});assert.equal(replay.replayed,true);assert.equal(replay.decision.decision,'allow');
 await assert.rejects(api.transactWorkflow({...args,requestFingerprint:undefined}),/fingerprint/i);
});
test('request fingerprint uses explicit SHA-256 over canonical complete JSON inputs',()=>{
 assert.equal(typeof api.fingerprintRequest,'function');assert.match(api.fingerprintRequest({request:{operation:'read'},evidence:{revision:0}}),/^sha256:[a-f0-9]{64}$/);
 assert.equal(api.fingerprintRequest({b:2,a:1}),api.fingerprintRequest({a:1,b:2}));assert.notEqual(api.fingerprintRequest({operation:'read'}),api.fingerprintRequest({operation:'write'}));
 assert.throws(()=>api.fingerprintRequest({request:undefined}));
});

test('replay rechecks current authority without persisting or executing transitions',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'arc-recheck-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const statePath=path.join(dir,'state.json');await fs.writeFile(statePath,JSON.stringify(state()));
 const args={statePath,expectedRevision:0,...input('recheck'),decide:()=>({decision:'allow',proposedTransition:null})};await api.transactWorkflow(args);const before=await fs.readFile(statePath,'utf8');let checked=false;
 const replay=await api.transactWorkflow({...args,decide:s=>{checked=true;return {decision:'deny',reason:'retired',proposedTransition:null};}});assert.equal(checked,true);assert.equal(replay.decision.decision,'deny');assert.equal(await fs.readFile(statePath,'utf8'),before);
});

test('verified reconciliation persists and rereads commit while forged or mutated decisions cannot change HEAD',async t=>{
 const {runGate}=await import('../../lib/runtime/gate.mjs');const {validateWorkflowState}=await import('../../lib/runtime/schema.mjs');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'arc-reconcile-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const statePath=path.join(dir,'state.json');const s=state();const oid=c=>c.repeat(40);const fingerprint='sha256:'+'d'.repeat(64);
 s.target={...s.target,gitCommonDir:'/repo/.git',head:oid('a')};s.tasks[0].status='accepted';s.identities=[{actorRef:'actor',role:'orchestrator',taskId:'T1',observationRef:'obs'}];s.leases=[{actorRef:'actor',taskId:'T1',status:'active'}];s.acceptances=[{actorRef:'actor',taskId:'T1',fingerprint,criteria:['criterion'],checkIds:[],findingIds:[]}];await fs.writeFile(statePath,JSON.stringify(s));
 const r={...request(),operation:'commit',descriptor:{kind:'task',parent:oid('a'),indexTree:oid('b'),fingerprint,paths:['file']}};const args={statePath,expectedRevision:0,requestId:r.requestId,request:r,requestFingerprint:api.fingerprintRequest(r)};
 const pre=await runGate({phase:'preflight',state:s,request:r,gitEvidence:{target:s.target,indexTree:oid('b'),stagedFingerprint:fingerprint,stagedPaths:['file'],workingPaths:[],untrackedPaths:[]}});assert.equal(pre.decision,'allow');
 const reconcile=state=>runGate({phase:'reconcile',state,request:r,expectedCommit:pre.expectedCommit,result:{commit:oid('c'),parent:oid('a'),tree:oid('b'),paths:['file'],head:oid('c'),target:{...s.target,head:oid('c')},remainingPaths:[]}});
 await assert.rejects(api.transactWorkflow({...args,decide:async state=>{const d=await reconcile(state);return structuredClone(d);}}),/target/);
 await assert.rejects(api.transactWorkflow({...args,decide:async state=>{const d=await reconcile(state);d.proposedTransition.target.branch='forged';return d;}}),/target/);
 const preflight=await api.transactWorkflow({...args,decide:()=>({...pre,proposedTransition:null})});assert.equal(preflight.state.revision,1);assert.deepEqual(preflight.state.requests[0].decision.expectedCommit,pre.expectedCommit);
 const repeated=await api.transactWorkflow({...args,decide:()=>({...pre,proposedTransition:null})});assert.equal(repeated.decision.decision,'hold');assert.equal(repeated.state.revision,1);
 args.expectedRevision=1;
 const journaled=await fs.readFile(statePath,'utf8');
 const copied=await api.transactWorkflow({...args,decide:async state=>structuredClone(await reconcile(state))});assert.equal(copied.decision.decision,'hold');assert.equal(await fs.readFile(statePath,'utf8'),journaled);
 const changed=JSON.parse(journaled);changed.requests[0].decision.expectedCommit.tree=oid('f');await fs.writeFile(statePath,JSON.stringify(changed));
 const mismatch=await api.transactWorkflow({...args,decide:reconcile});assert.equal(mismatch.decision.decision,'hold');assert.equal(mismatch.state.target.head,oid('a'));await fs.writeFile(statePath,journaled);
 await assert.rejects(api.transactWorkflow({...args,expectedRevision:0,decide:reconcile}),/revision/);assert.equal(await fs.readFile(statePath,'utf8'),journaled);
 const saved=await api.transactWorkflow({...args,decide:reconcile});assert.equal(saved.state.target.head,oid('c'));assert.equal(saved.state.commits[0].expectedParent,oid('a'));assert.equal(validateWorkflowState(JSON.parse(await fs.readFile(statePath))).commits.length,1);
 const replay=await api.transactWorkflow({...args,decide:reconcile});assert.notEqual(replay.decision.decision,'allow');assert.equal(replay.state.commits.length,1);assert.equal(replay.state.revision,2);
});

test('current authority cannot reauthorize a repeated side-effecting request',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'arc-effect-replay-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 for(const operation of ['write','temporary-write','check','qa','operational-query','install','prepare-target','request-approval','stage','rebase','reset','branch-create','branch-switch','worktree-create','worktree-remove','external-message']){
  const statePath=path.join(dir,operation+'.json');await fs.writeFile(statePath,JSON.stringify(state()));const r={...request(),operation};let checks=0;
  const args={statePath,expectedRevision:0,requestId:r.requestId,request:r,requestFingerprint:api.fingerprintRequest(r),decide:()=>{checks++;return {decision:'allow',proposedTransition:null};}};
  assert.equal((await api.transactWorkflow(args)).decision.decision,'allow');const before=await fs.readFile(statePath,'utf8');const replay=await api.transactWorkflow(args);
  assert.equal(checks,2,operation+' authority must still be checked');assert.equal(replay.decision.decision,'hold',operation);assert.equal(replay.decision.proposedTransition,null);assert.equal(await fs.readFile(statePath,'utf8'),before);
 }
});

test('cooperative store rejects target mutation without a verified reconciliation decision',async()=>{
 const {applyCooperativeCommitTransition}=await import('../../lib/runtime/store.mjs');
 assert.equal(typeof applyCooperativeCommitTransition,'function');
 const before={target:{head:'a'.repeat(40)},tasks:[],commits:[]};
 assert.throws(()=>applyCooperativeCommitTransition({state:before,decision:{decision:'allow',proposedTransition:{target:{head:'b'.repeat(40)},commit:{commit:'b'.repeat(40)}}}}),/verified/i);
 assert.equal(before.target.head,'a'.repeat(40));
});

async function plannerStore(t){
 const {initializeCooperativeWorkflow}=await import('../../lib/runtime/bootstrap.mjs'),{runCooperativeCommand}=await import('../../lib/runtime/cooperative.mjs');
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'arc-planner-store-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));const cwd=path.join(root,'workspace'),common=path.join(root,'common');await fs.mkdir(cwd);await fs.mkdir(common);
 const target={realpath:cwd,gitCommonDir:common,gitDir:common,head:'a'.repeat(40),branch:'main'},args={cwd,workflowId:'planner',observe:async()=>({...target})};
 await initializeCooperativeWorkflow({...args,input:{mode:'plan',actor:{id:'operator'},selection:{messageRef:'target',contentHash:'sha256:'+'a'.repeat(64)}}});
 const statePath=path.join(common,'arc/workflows/planner/state.json'),actor={id:'operator',role:'orchestrator'},contract={document:{path:path.join(cwd,'spec.md'),kind:'spec',phase:'draft'},inputVersion:1,criteriaVersion:1,scopeVersion:0};
 for(const [revision,kind,ref,data] of [[0,'approval','approval',{plannerStage:contract}],[1,'planner-stage','stage',{id:'stage',...contract,approvalRef:'approval',criteria:[{id:'C1',status:'open',judgmentRef:'criterion'}]}]])assert.equal((await runCooperativeCommand({...args,command:'record',input:{requestId:ref,expectedRevision:revision,actor,evidence:{kind,messageRef:ref,data}}})).decision,'allow');
 const prepare=id=>({requestId:id,expectedRevision:2,actor,operation:'planner-call',arguments:{stageId:'stage',kind:'initial',intent:'substantive',criterionIds:[],evidenceRefs:[]}});
 return {args,statePath,run:runCooperativeCommand,prepare};
}
test('planner reservations serialize concurrency and exact replay never issues another permit',async t=>{
 const f=await plannerStore(t),results=await Promise.allSettled(['one','two'].map(id=>f.run({...f.args,command:'prepare',input:f.prepare(id)})));
 assert.equal(results.filter(r=>r.status==='fulfilled'&&r.value.decision==='allow').length,1);
 const s=JSON.parse(await fs.readFile(f.statePath,'utf8'));assert.equal(s.plannerLedger.stages[0].calls.length,1);const id=s.plannerLedger.stages[0].pending,before=await fs.readFile(f.statePath,'utf8');
 const replay=await f.run({...f.args,command:'prepare',input:f.prepare(id)});assert.equal(replay.decision,'hold');assert.equal(replay.replayed,true);assert.equal(await fs.readFile(f.statePath,'utf8'),before);
 await assert.rejects(f.run({...f.args,command:'prepare',input:{...f.prepare(id),arguments:{...f.prepare(id).arguments,intent:'format-only'}}}),/fingerprint conflict/);
});
test('planner write failure cannot return allow and a post-rename uncertainty survives restart',async t=>{
 const f=await plannerStore(t),before=await fs.readFile(f.statePath,'utf8');await assert.rejects(f.run({...f.args,command:'prepare',input:f.prepare('failed-write'),storage:{rename:async()=>{throw Error('injected write failure');}}}),/write failure/);assert.equal(await fs.readFile(f.statePath,'utf8'),before);
 await assert.rejects(f.run({...f.args,command:'prepare',input:f.prepare('uncertain'),storage:{rename:async(from,to)=>{await fs.rename(from,to);throw Error('post-rename uncertain');}}}),/post-rename/);
 const s=JSON.parse(await fs.readFile(f.statePath,'utf8'));assert.equal(s.plannerLedger.stages[0].pending,'uncertain');assert.equal((await f.run({...f.args,command:'prepare',input:f.prepare('uncertain')})).decision,'hold');
});
