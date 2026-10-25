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

async function plannerStart(t){
 const f=await start(t);f.call=async(command,input)=>api.runCooperativeCommand({...f.args,command,input});
 f.send=async(kind,data,messageRef)=>{const state=JSON.parse(await fs.readFile(f.statePath,'utf8'));return f.call('record',{requestId:'record:'+messageRef,expectedRevision:state.revision,actor:{id:'operator',role:'orchestrator'},evidence:{kind,messageRef,data}});};
 const contract={document:{path:path.join(f.cwd,'spec.md'),kind:'spec',phase:'draft'},inputVersion:1,criteriaVersion:1,scopeVersion:0};
 await f.send('approval',{plannerStage:contract},'approved:stage');
 f.stage={id:'stage',...contract,approvalRef:'approved:stage',criteria:[{id:'C1',status:'open',judgmentRef:'criterion:1'}]};
 const registered=await f.send('planner-stage',f.stage,'stage:registered').catch(error=>({decision:'hold',error:error.message}));
 assert.equal(registered.decision,'allow',registered.error);return f;
}
async function plannerPrepare(f,id,kind='initial',extra={}){
 const s=JSON.parse(await fs.readFile(f.statePath,'utf8'));
 return f.call('prepare',{requestId:id,expectedRevision:s.revision,actor:{id:'operator',role:'orchestrator'},operation:'planner-call',arguments:{stageId:'stage',kind,intent:'substantive',criterionIds:[],evidenceRefs:[],...extra}});
}
async function plannerArtifact(f,ref,purpose,bytes='draft',semantic){
 const filename=path.join(f.cwd,ref.replaceAll(':','-')+'.md');await fs.writeFile(filename,bytes);
 return f.send('planner-evidence',{stageId:'stage',path:filename,purpose,criterionIds:['C1'],...(semantic?{semantic}: {})},ref);
}
async function plannerResult(f,requestId,{complete=false,status='succeeded'}={}){
 await plannerArtifact(f,'draft:'+requestId,'draft','draft '+requestId);await plannerArtifact(f,'self:'+requestId,'self-review','self '+requestId);
 assert.equal((await f.send('planner-result',{stageId:'stage',callRequestId:requestId,status,artifactRef:'draft:'+requestId,selfReviewRef:'self:'+requestId},'result:'+requestId)).decision,'allow');
 return f.send('planner-review',{stageId:'stage',resultRef:'result:'+requestId,full:true,complete,criteria:[{id:'C1',status:complete?'resolved':'open',judgmentRef:'judgment:'+requestId}]},'review:'+requestId);
}
test('planner cooperative reserves before response and retains unknown results across restart',async t=>{
 const f=await plannerStart(t);const d=await plannerPrepare(f,'first');assert.equal(d.decision,'allow');assert.equal(d.persisted,true);assert.equal(d.coverage.nativeVerified,false);
 let s=JSON.parse(await fs.readFile(f.statePath,'utf8'));assert.equal(s.plannerLedger.stages[0].pending,'first');assert.equal(s.plannerLedger.stages[0].calls.length,1);
 assert.equal((await plannerPrepare(f,'duplicate')).decision,'hold');
 const unknown=await f.send('planner-result',{stageId:'stage',callRequestId:'first',status:'unknown'},'unknown:first');assert.equal(unknown.decision,'hold');
 s=JSON.parse(await fs.readFile(f.statePath,'utf8'));assert.equal(s.plannerLedger.stages[0].pending,'first');assert.equal(s.plannerLedger.stages[0].calls[0].status,'unknown');assert.equal((await plannerPrepare(f,'after-restart')).decision,'hold');
});
test('planner cooperative verifies bytes preserves semantic provenance and refuses incomplete acceptance',async t=>{
 const f=await plannerStart(t);await plannerPrepare(f,'first');await plannerResult(f,'first');
 let s=JSON.parse(await fs.readFile(f.statePath,'utf8'));assert.equal(s.plannerLedger.stages[0].ready,false);
 assert.equal((await plannerPrepare(f,'fix','correction',{reviewRef:'review:first'})).decision,'allow');await plannerResult(f,'fix');
 const bytes='new substantive input',crypto=await import('node:crypto'),hash='sha256:'+crypto.createHash('sha256').update(bytes).digest('hex');
 assert.equal((await plannerArtifact(f,'new:input','input',bytes,{meaningful:true,judgmentRef:'review:new',targetHash:hash})).decision,'allow');
 const args={reviewRef:'review:fix',criterionIds:['C1'],evidenceRefs:['new:input']};assert.equal((await plannerPrepare(f,'more','further',args)).decision,'allow');
 s=JSON.parse(await fs.readFile(f.statePath,'utf8'));const artifact=s.plannerLedger.stages[0].artifacts.find(a=>a.ref==='new:input');assert.equal(artifact.hash,hash);assert.equal(artifact.semantic.source,'operator-attested');assert.equal(artifact.verification.source,'local-bytes');assert.equal(s.plannerLedger.stages[0].ready,false);
});
test('planner non-progress denial spends neither reservation nor consolidated correction',async t=>{
 const f=await plannerStart(t);await plannerPrepare(f,'first');await plannerResult(f,'first');
 for(const intent of ['format-only','re-expression-only','save-error-only','patch-error-only'])assert.equal((await plannerPrepare(f,'deny:'+intent,'correction',{intent,reviewRef:'review:first'})).decision,'deny');
 const s=JSON.parse(await fs.readFile(f.statePath,'utf8'));assert.equal(s.plannerLedger.stages[0].calls.length,1);assert.equal(s.plannerLedger.stages[0].pending,null);assert.equal(s.plannerLedger.stages[0].criteria[0].status,'open');assert.equal((await plannerPrepare(f,'real-correction','correction',{reviewRef:'review:first'})).decision,'allow');
});
test('planner existing workflows without ledger hold instead of resetting history',async t=>{
 const f=await plannerStart(t),s=JSON.parse(await fs.readFile(f.statePath,'utf8'));delete s.plannerLedger;await fs.writeFile(f.statePath,JSON.stringify(s));const d=await plannerPrepare(f,'legacy');assert.equal(d.decision,'hold');assert.match(d.reason,/ledger|history/i);assert.equal(Object.hasOwn(JSON.parse(await fs.readFile(f.statePath,'utf8')),'plannerLedger'),false);
});

test('planner result and review cannot declare an incomplete draft ready',async t=>{
 const f=await plannerStart(t);await plannerPrepare(f,'first');
 assert.equal((await f.send('planner-result',{stageId:'stage',callRequestId:'first',status:'succeeded'},'missing-artifacts')).decision,'hold');
 let s=JSON.parse(await fs.readFile(f.statePath,'utf8'));assert.equal(s.plannerLedger.stages[0].pending,'first');
 await plannerResult(f,'first');
 assert.equal((await f.send('planner-review',{stageId:'stage',resultRef:'result:first',full:true,complete:true,criteria:[{id:'C1',status:'open',judgmentRef:'still-open'}]},'incomplete:ready')).decision,'hold');
 s=JSON.parse(await fs.readFile(f.statePath,'utf8'));assert.equal(s.plannerLedger.stages[0].ready,false);assert.equal(s.plannerLedger.stages[0].criteria[0].status,'open');
});
test('planner artifact drift and a new ref for used bytes do not authorize further work',async t=>{
 const f=await plannerStart(t);await plannerPrepare(f,'first');await plannerResult(f,'first');await plannerPrepare(f,'fix','correction',{reviewRef:'review:first'});await plannerResult(f,'fix');
 const crypto=await import('node:crypto'),bytes='new evidence',hash='sha256:'+crypto.createHash('sha256').update(bytes).digest('hex'),semantic={meaningful:true,judgmentRef:'new:judgment',targetHash:hash};
 await plannerArtifact(f,'input:one','input',bytes,semantic);await fs.writeFile(path.join(f.cwd,'input-one.md'),'changed');
 const extra={reviewRef:'review:fix',criterionIds:['C1'],evidenceRefs:['input:one']};assert.equal((await plannerPrepare(f,'drift','further',extra)).decision,'hold');
 await plannerArtifact(f,'input:two','input',bytes,semantic);extra.evidenceRefs=['input:two'];assert.equal((await plannerPrepare(f,'more','further',extra)).decision,'allow');await plannerResult(f,'more');
 await plannerArtifact(f,'input:alias','input',bytes,semantic);assert.equal((await plannerPrepare(f,'repeat','further',{...extra,reviewRef:'review:more',evidenceRefs:['input:alias']})).decision,'deny');
});
test('planner plan drafting checks its spec prerequisite without requiring the future plan approval',async t=>{
 const f=await start(t),contract={document:{path:path.join(f.cwd,'plan.md'),kind:'plan',phase:'draft'},inputVersion:1,criteriaVersion:1,scopeVersion:0};
 const send=async(id,kind,data)=>{const s=JSON.parse(await fs.readFile(f.statePath,'utf8'));return api.runCooperativeCommand({...f.args,command:'record',input:record(id,s.revision,{kind,messageRef:id,data})}).catch(error=>({decision:'hold',error:error.message}));};
 // The role is an explicit cooperative attestation, never provider identity.
 const actor={id:'operator',role:'orchestrator'};
 const put=async(id,kind,data)=>{const s=JSON.parse(await fs.readFile(f.statePath,'utf8'));return api.runCooperativeCommand({...f.args,command:'record',input:{...record(id,s.revision,{kind,messageRef:id,data}),actor}});};
 await put('approve-plan-stage','approval',{plannerStage:contract});const stage={id:'plan-stage',...contract,approvalRef:'approve-plan-stage',criteria:[{id:'C1',status:'open',judgmentRef:'C1'}]};assert.equal((await put('no-prereq','planner-stage',stage)).decision,'hold');
 await put('spec-approved','approval',{kind:'spec'});await put('approve-plan-stage-2','approval',{plannerStage:contract,prerequisiteRefs:['spec-approved']});stage.approvalRef='approve-plan-stage-2';assert.equal((await put('register-plan','planner-stage',stage)).decision,'allow');
 const s=JSON.parse(await fs.readFile(f.statePath,'utf8'));assert.equal((await api.runCooperativeCommand({...f.args,command:'prepare',input:{requestId:'draft-plan',expectedRevision:s.revision,actor,operation:'planner-call',arguments:{stageId:'plan-stage',kind:'initial',intent:'substantive',criterionIds:[],evidenceRefs:[]}}})).decision,'allow');
});
test('planner new workflow and agent labels cannot reset the same recorded document stage',async t=>{
 const f=await plannerStart(t);await plannerPrepare(f,'first');
 const second={...f.args,workflowId:'another'};await bootstrap.initializeCooperativeWorkflow(second);
 let s=JSON.parse(await fs.readFile(path.join(f.target.gitCommonDir,'arc/workflows/another/state.json'),'utf8'));
 const contract={document:f.stage.document,inputVersion:1,criteriaVersion:1,scopeVersion:0},actor={id:'operator',role:'orchestrator'};
 await api.runCooperativeCommand({...second,command:'record',input:{requestId:'approval',expectedRevision:s.revision,actor,evidence:{kind:'approval',messageRef:'other:approval',data:{plannerStage:contract}}}});
 const d=await api.runCooperativeCommand({...second,command:'record',input:{requestId:'register',expectedRevision:1,actor,evidence:{kind:'planner-stage',messageRef:'other:stage',data:{...f.stage,id:'new-id',approvalRef:'other:approval',agentId:'fresh-agent'}}}});assert.equal(d.decision,'hold');assert.match(d.reason,/history|predecessor|scope/i);
});

test('planner generic result cannot clear an unresolved reservation or make status ready',async t=>{
 const f=await plannerStart(t);await plannerPrepare(f,'first');let s=JSON.parse(await fs.readFile(f.statePath,'utf8'));
 await f.call('result',{requestId:'untrusted-result',expectedRevision:s.revision,actor:{id:'operator',role:'orchestrator'},intentId:'first',result:{status:'succeeded',messageRef:'generic:claim',data:{}}});
 const status=await f.call('status',undefined);assert.equal(status.decision,'hold');assert.equal(status.state.plannerLedger.stages[0].pending,'first');
});
test('planner schema rejects orphan reservations fabricated readiness and workflow rebinding',async t=>{
 const f=await plannerStart(t),original=JSON.parse(await fs.readFile(f.statePath,'utf8'));
 for(const mutate of [s=>s.plannerLedger.stages[0].ready=true,s=>delete s.plannerLedger.stages[0].artifacts,s=>s.plannerLedger.stages[0].ready='claimed',s=>s.plannerLedger.stages[0].workflowId='another',s=>s.plannerLedger.stages[0].calls.push({requestId:'orphan',kind:'initial',status:'reserved',evidenceHashes:[]})]){const s=structuredClone(original);mutate(s);assert.throws(()=>schema.validateCooperativeState(s),/Planner/);}
});

test('planner runtime version drift and stale revisions preserve call history without renewing authority',async t=>{
 const f=await plannerStart(t),before=JSON.parse(await fs.readFile(f.statePath,'utf8'));
 const stale=await f.call('prepare',{requestId:'stale',expectedRevision:0,actor:{id:'operator',role:'orchestrator'},operation:'planner-call',arguments:{stageId:'stage',kind:'initial',intent:'substantive',criterionIds:[],evidenceRefs:[]}});assert.equal(stale.decision,'hold');assert.equal(await fs.readFile(f.statePath,'utf8'),JSON.stringify(before,null,2)+'\n');
 before.versions.runtimeHash='sha256:'+'0'.repeat(64);await fs.writeFile(f.statePath,JSON.stringify(before));const drift=await plannerPrepare(f,'drift');assert.equal(drift.decision,'hold');const after=JSON.parse(await fs.readFile(f.statePath,'utf8'));assert.deepEqual(after.versions,before.versions);assert.deepEqual(after.plannerLedger,before.plannerLedger);
});
test('planner confirmed failure can receive its consolidated correction without claiming a complete draft',async t=>{
 const f=await plannerStart(t);await plannerPrepare(f,'first');assert.equal((await f.send('planner-result',{stageId:'stage',callRequestId:'first',status:'failed'},'failed:first')).decision,'allow');
 assert.equal((await f.send('planner-review',{stageId:'stage',resultRef:'failed:first',full:true,complete:false,criteria:[{id:'C1',status:'open',judgmentRef:'missing-draft'}]},'review:failed')).decision,'allow');assert.equal((await plannerPrepare(f,'correction','correction',{reviewRef:'review:failed'})).decision,'allow');
 assert.equal(JSON.parse(await fs.readFile(f.statePath,'utf8')).plannerLedger.stages[0].ready,false);
});
test('planner resolved criteria cannot reopen without new evidence and an explicit prior-judgment link',async t=>{
 const f=await plannerStart(t);await plannerPrepare(f,'first');await plannerResult(f,'first',{complete:true});
 const review={stageId:'stage',resultRef:'result:first',full:true,complete:false,criteria:[{id:'C1',status:'open',judgmentRef:'new-defect'}]};assert.equal((await f.send('planner-review',review,'reopen:unsupported')).decision,'hold');
 const bytes='newly observed defect',crypto=await import('node:crypto'),hash='sha256:'+crypto.createHash('sha256').update(bytes).digest('hex');await plannerArtifact(f,'defect','finding',bytes,{meaningful:true,judgmentRef:'defect:review',targetHash:hash});
 assert.equal((await f.send('planner-review',{...review,reassessments:[{criterionId:'C1',previousJudgmentRef:'judgment:first',newEvidenceRef:'defect',reasonRef:'defect:reason'}]},'reopen:linked')).decision,'allow');const s=JSON.parse(await fs.readFile(f.statePath,'utf8'));assert.equal(s.plannerLedger.stages[0].criteria[0].status,'open');assert.equal(s.plannerLedger.stages[0].ready,false);
});
