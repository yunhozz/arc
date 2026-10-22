import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const api=await import('../../lib/runtime/cooperative.mjs').catch(()=>({}));
const bootstrap=await import('../../lib/runtime/bootstrap.mjs').catch(()=>({}));
const schema=await import('../../lib/runtime/cooperative-schema.mjs').catch(()=>({}));
const provider=await import('../../lib/runtime/schema.mjs');
async function fixture(t){
 const dir=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'arc-cooperative-')));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const cwd=path.join(dir,'workspace'),gitCommonDir=path.join(dir,'common');await fs.mkdir(cwd);await fs.mkdir(gitCommonDir);
 const target={realpath:cwd,gitCommonDir,gitDir:gitCommonDir,head:'a'.repeat(40),branch:'main'};
 const observe=async()=>({...target});
 const input={mode:'plan',actor:{id:'operator'},selection:{messageRef:'user:target',contentHash:'sha256:'+'b'.repeat(64)}};
 const args={cwd,workflowId:'workflow',input,observe};
 const statePath=path.join(gitCommonDir,'arc/workflows/workflow/state.json');
 return {dir,cwd,target,observe,input,args,statePath};
}
const record=(id,revision,evidence={kind:'note',messageRef:'message:1',data:{text:'observed'}})=>({requestId:id,expectedRevision:revision,actor:{id:'operator'},evidence});
async function start(t){const f=await fixture(t);assert.equal(typeof bootstrap.initializeCooperativeWorkflow,'function','bootstrap service must be implemented');await bootstrap.initializeCooperativeWorkflow(f.args);return f;}

test('bootstrapDoesNotOverwrite: preserves existing bytes and observes target without Git mutation',async t=>{
 const f=await fixture(t);assert.equal(typeof bootstrap.initializeCooperativeWorkflow,'function','bootstrap service must be implemented');
 const result=await bootstrap.initializeCooperativeWorkflow(f.args);assert.equal(result.persisted,true);assert.equal(result.revision,0);
 const before=await fs.readFile(f.statePath,'utf8');const state=JSON.parse(before);assert.equal(state.workflowKind,'cooperative');assert.equal(state.target.realpath,f.cwd);assert.deepEqual(state.assignments,[]);assert.deepEqual(state.approvals,[]);
 await assert.rejects(bootstrap.initializeCooperativeWorkflow(f.args),/exist/i);assert.equal(await fs.readFile(f.statePath,'utf8'),before);
});
test('rejectsSymlinkAndEscapedWorkflowId: rejects every traversed symlink and non-regular state',async t=>{
 const f=await fixture(t);assert.equal(typeof bootstrap.initializeCooperativeWorkflow,'function');
 for(const workflowId of ['../escape','x/y','', 'x'.repeat(65)])await assert.rejects(bootstrap.initializeCooperativeWorkflow({...f.args,workflowId}));
 const outside=path.join(f.dir,'outside');await fs.mkdir(outside);await fs.symlink(outside,path.join(f.target.gitCommonDir,'arc'));
 await assert.rejects(bootstrap.initializeCooperativeWorkflow(f.args),/symlink|unsafe/i);assert.deepEqual(await fs.readdir(outside),[]);
});
test('sameCommonDirDifferentWorktree: a second checkout cannot read or mutate the first workflow',async t=>{
 const f=await start(t);const second=path.join(f.dir,'second');await fs.mkdir(second);const before=await fs.readFile(f.statePath,'utf8');
 const result=await api.runCooperativeCommand({...f.args,cwd:second,observe:async()=>({...f.target,realpath:second,gitDir:path.join(f.dir,'linked')}),command:'status',input:undefined});
 assert.equal(result.decision,'hold');assert.ok(result.ruleIds.includes('cooperative.target'));
 assert.equal(Object.hasOwn(result,'state'),false);assert.equal(result.persisted,false);assert.equal(await fs.readFile(f.statePath,'utf8'),before);
});
test('attestationIsNotPlatformEvent: records statements without provider identity or lifecycle completion',async t=>{
 const f=await start(t);const result=await api.runCooperativeCommand({...f.args,command:'record',input:record('r1',0,{kind:'approval',messageRef:'user:approved',data:{agentId:'claimed'}})});
 assert.equal(result.decision,'allow');assert.equal(result.coverage.provenance,'operator-attested');assert.equal(result.coverage.nativeVerified,false);
 const state=JSON.parse(await fs.readFile(f.statePath,'utf8'));assert.equal(state.records[0].source,'operator-attested');assert.deepEqual(state.acceptances,[]);assert.deepEqual(state.identities,[]);
 assert.throws(()=>provider.validateWorkflowState(state),/cooperative|provider|schema/i);
 assert.equal(schema.validateCooperativeState(state),state);
 await assert.rejects(api.runCooperativeCommand({...f.args,command:'record',input:{...record('r2',1),source:'platform-event'}}),/input|schema|field/i);
});
test('requestFingerprintConflict and replay never reuse a prior successful mutation',async t=>{
 const f=await start(t);const input=record('same',0);await api.runCooperativeCommand({...f.args,command:'record',input});const before=await fs.readFile(f.statePath,'utf8');
 const replay=await api.runCooperativeCommand({...f.args,command:'record',input});assert.equal(replay.decision,'hold');assert.equal(replay.replayed,true);
 await assert.rejects(api.runCooperativeCommand({...f.args,command:'record',input:record('same',0,{kind:'note',messageRef:'changed',data:{}})}),/fingerprint.*conflict/i);
 assert.equal(await fs.readFile(f.statePath,'utf8'),before);
});
test('staleRevisionHolds: stale input never changes stored evidence',async t=>{
 const f=await start(t);await api.runCooperativeCommand({...f.args,command:'record',input:record('r',0)});const before=await fs.readFile(f.statePath,'utf8');
 const result=await api.runCooperativeCommand({...f.args,command:'record',input:record('stale',0)});assert.equal(result.decision,'hold');assert.ok(result.ruleIds.includes('cooperative.revision'));assert.equal(result.persisted,false);assert.equal(await fs.readFile(f.statePath,'utf8'),before);
});
test('storeFailureNeverEmitsAllow: lock conflicts and injected durable write failure preserve original state',async t=>{
 const f=await start(t);const before=await fs.readFile(f.statePath,'utf8');await fs.writeFile(f.statePath+'.lock','unrecovered');
 await assert.rejects(api.runCooperativeCommand({...f.args,command:'record',input:record('locked',0)}),/exist|lock/i);assert.equal(await fs.readFile(f.statePath,'utf8'),before);await fs.unlink(f.statePath+'.lock');
 await assert.rejects(api.runCooperativeCommand({...f.args,command:'record',input:record('failed',0),storage:{rename:async()=>{throw Error('durability failure');}}}),/durability failure/);
 assert.equal(await fs.readFile(f.statePath,'utf8'),before);
});
test('unknownResultNeverAutoRetries: reconciliation preserves prior outcome and unknown execution',async t=>{
 const f=await start(t);const state=JSON.parse(await fs.readFile(f.statePath,'utf8'));state.intents=[{requestId:'pending',status:'prepared',fingerprint:'sha256:'+'c'.repeat(64)}];state.results=[{requestId:'older',status:'failed',source:'operator-attested',data:{actual:'failure'}}];await fs.writeFile(f.statePath,JSON.stringify(state));
 const input={requestId:'recover',expectedRevision:0,actor:{id:'operator'},intentId:'pending',result:{status:'unknown',messageRef:'native:timeout',data:{actual:'unknown'}}};
 const result=await api.runCooperativeCommand({...f.args,command:'reconcile',input});assert.equal(result.decision,'hold');assert.equal(result.persisted,true);
 const after=JSON.parse(await fs.readFile(f.statePath,'utf8'));assert.equal(after.intents[0].status,'unknown');assert.equal(after.results.length,2);assert.equal(after.results[0].data.actual,'failure');
 const replay=await api.runCooperativeCommand({...f.args,command:'reconcile',input});assert.equal(replay.decision,'hold');assert.equal(JSON.parse(await fs.readFile(f.statePath,'utf8')).results.length,2);
 await assert.rejects(api.runCooperativeCommand({...f.args,command:'reconcile',input:{...input,requestId:'cancel',expectedRevision:1,result:{status:'cancelled',messageRef:'guess',data:{}}}}),/not.executed|evidence|cancel/i);
});
test('scope changes retain versions and invalidate historical permits without completing tasks',async t=>{
 const f=await start(t);await api.runCooperativeCommand({...f.args,command:'record',input:record('scope1',0,{kind:'scope',messageRef:'scope:1',data:{paths:[path.join(f.cwd,'one')]}})});
 await api.runCooperativeCommand({...f.args,command:'record',input:record('scope2',1,{kind:'scope',messageRef:'scope:2',data:{paths:[path.join(f.cwd,'two')]}})});
 const state=JSON.parse(await fs.readFile(f.statePath,'utf8'));assert.equal(state.scopes.length,2);assert.equal(state.scopeVersion,2);assert.ok(state.unresolved.some(c=>c.kind==='scope-changed'));assert.deepEqual(state.acceptances,[]);
});
test('unsupported modes and operations hold without inventing document obligations',async t=>{
 const f=await fixture(t);assert.equal(typeof bootstrap.initializeCooperativeWorkflow,'function');
 const unsupported=await bootstrap.initializeCooperativeWorkflow({...f.args,input:{...f.input,mode:'no-plan'}});assert.equal(unsupported.decision,'hold');assert.deepEqual(unsupported.requiredEvidence,[]);await assert.rejects(fs.access(f.statePath));
 await bootstrap.initializeCooperativeWorkflow(f.args);
 for(const command of ['prepare','result']){const result=await api.runCooperativeCommand({...f.args,command,input:{requestId:command,expectedRevision:0,actor:{id:'operator'},operation:'assign-agent'}});assert.equal(result.decision,'hold');assert.ok(result.ruleIds.includes('cooperative.unsupported'));assert.deepEqual(result.requiredEvidence,[]);}
});
test('cooperative schema rejects provider-shaped attestations instead of converting their provenance',async t=>{
 const f=await start(t);const state=JSON.parse(await fs.readFile(f.statePath,'utf8'));state.approvals.push({id:'forged',source:'platform-event'});assert.throws(()=>schema.validateCooperativeState(state),/attestation|source|provenance/i);
});
test('reconcile retains unmatched actual results and changed HEAD without rebinding target',async t=>{
 const f=await start(t);const input={requestId:'unmatched',expectedRevision:0,actor:{id:'operator'},intentId:'missing',result:{status:'succeeded',messageRef:'native:actual',data:{actualHead:'b'.repeat(40)}}};
 const result=await api.runCooperativeCommand({...f.args,observe:async()=>({...f.target,head:'b'.repeat(40)}),command:'reconcile',input});assert.equal(result.decision,'hold');assert.equal(result.persisted,true);
 const state=JSON.parse(await fs.readFile(f.statePath,'utf8'));assert.equal(state.target.head,'a'.repeat(40));assert.equal(state.targetHistory[0].target.head,'b'.repeat(40));assert.equal(state.results.length,1,'unmatched actual result must be preserved');assert.equal(state.results[0].data.actualHead,'b'.repeat(40));assert.ok(state.unresolved.some(x=>x.kind==='unmatched-result'));
});
test('stale actual reconciliation is retained as hold without retroactive authorization',async t=>{
 const f=await start(t);await api.runCooperativeCommand({...f.args,command:'record',input:record('newer',0)});
 const result=await api.runCooperativeCommand({...f.args,command:'reconcile',input:{requestId:'late-actual',expectedRevision:0,actor:{id:'operator'},intentId:'missing',result:{status:'mismatch',messageRef:'native:late',data:{actual:'executed after stale decision'}}}});
 assert.equal(result.decision,'hold');assert.equal(result.persisted,true);const state=JSON.parse(await fs.readFile(f.statePath,'utf8'));assert.equal(state.results.length,1);assert.equal(state.results[0].data.actual,'executed after stale decision');assert.ok(state.unresolved.some(x=>x.kind==='stale-result'));
});
test('bootstrap write failure and state symlink never replace an existing file',async t=>{
 const f=await fixture(t);
 await assert.rejects(bootstrap.initializeCooperativeWorkflow({...f.args,storage:{link:async()=>{throw Error('bootstrap save failed');}}}),/bootstrap save failed/);await assert.rejects(fs.access(f.statePath));
 const actual=path.join(f.dir,'actual');await fs.writeFile(actual,'preserved');await fs.symlink(actual,f.statePath);
 await assert.rejects(bootstrap.initializeCooperativeWorkflow(f.args),/symlink|unsafe/);assert.equal(await fs.readFile(actual,'utf8'),'preserved');
});
test('cooperative evaluator exposes explicit coverage and revision without provider authority',async t=>{
 const f=await start(t);const state=JSON.parse(await fs.readFile(f.statePath,'utf8'));const evaluator=await import('../../lib/runtime/evaluate.mjs');
 const result=evaluator.evaluateCooperative({state,request:{command:'prepare',input:{requestId:'unsupported',expectedRevision:0,actor:{id:'operator'},operation:'assign-agent'}},evidence:{target:state.target,versions:state.versions}});
 assert.equal(result.decision,'hold');assert.ok(result.coverage,'gate must expose cooperative coverage');assert.equal(result.coverage.provenance,'operator-attested');assert.equal(result.coverage.nativeVerified,false);assert.equal(result.expectedRevision,0);assert.equal(result.proposedTransition,null);
});
