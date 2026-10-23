import test from 'node:test';
import assert from 'node:assert/strict';
const api=await import('../../lib/runtime/verification.mjs').catch(()=>({}));
const hash='sha256:'+'a'.repeat(64), other='sha256:'+'b'.repeat(64);
function fixture(scope='task',operation='check'){
 const state={mode:'plan',revision:1,targetVersion:1,scopeVersion:0,target:{realpath:'/workspace'},versions:{runtimeHash:hash},records:[],tasks:[{id:'T1',paths:['/workspace/a'],criteria:['works'],requiredChecks:[{executable:'/bin/check',args:[],cwd:'/workspace',env:{},outputs:[]}],dependencies:[],approvalRef:'approved',approvalVersion:1,documentVersion:1,scopeVersion:0,targetVersion:1,status:'pending'}],assignments:[{taskId:'T1',agentId:'coder1',status:'active',source:'operator-attested'}],checks:[],findings:[],intents:[],acceptances:[]};
 state.records.push({kind:'approval',messageRef:'approved',source:'operator-attested',scopeVersion:0,targetVersion:1,data:{approvalVersion:1,documentVersion:1}});
 const request={requestId:'verify',expectedRevision:1,actor:{id:'operator',role:'orchestrator'},taskId:scope==='task'?'T1':undefined,operation,arguments:{scope,actor:{id:operation==='review'?'reviewer1':'qa1',role:operation==='review'?'reviewer':'qa'},descriptor:operation==='review'?{kind:'source-review',paths:['/workspace/a']}:structuredClone(state.tasks[0].requiredChecks[0]),changeFingerprint:hash}};
 if(scope==='final')delete request.taskId;
 const evidence={changes:{tasks:{T1:hash},final:hash}};
 return {state,request,evidence};
}
function gate(f){assert.equal(typeof api.evaluateCooperativeVerification,'function','verification gate must exist');return api.evaluateCooperativeVerification(f);}
function prepared(f){const d=gate(f);assert.equal(d.decision,'allow',d.reason);f.state.intents.push(d.proposedTransition.intent);return d.proposedTransition.intent;}
function result(f,intent,status='succeeded',verdict='proven'){
 return gate({...f,request:{...f.request,operation:'verification-result',intentId:intent.requestId,result:{status,messageRef:'result:1',data:{actor:intent.verificationActor,descriptor:intent.descriptor,scope:intent.scope,taskId:intent.taskId,changeFingerprint:hash,verdict}}}});
}
test('changedDiffInvalidatesCheck',()=>{const f=fixture(),intent=prepared(f);f.evidence.changes.tasks.T1=other;assert.equal(result(f,intent).decision,'hold');assert.equal(f.state.checks.length,0);});
test('scopeExpansionRequiresNewApproval',()=>{const f=fixture();f.state=api.invalidateAffectedEvidence({state:f.state,changedVersions:{scopeVersion:1}});assert.equal(gate(f).decision,'hold');});
test('staleApprovalCannotAuthorizeDependentTask',()=>{const f=fixture();f.state.tasks.push({...structuredClone(f.state.tasks[0]),id:'T2',dependencies:['T1']});assert.equal(typeof api.invalidateAffectedEvidence,'function');const next=api.invalidateAffectedEvidence({state:f.state,changedVersions:{scopeVersion:1},affectedTaskIds:['T1']});assert.equal(next.tasks.find(t=>t.id==='T2').status,'held');assert.equal(f.state.scopeVersion,0);assert.equal(gate({...f,state:next}).decision,'hold');});
test('freshTaskActorsCannotCrossTasks',()=>{for(const actor of ['qa1','coder1']){const f=fixture();f.state.checks.push({scope:'task',taskId:'T0',verificationActor:{id:actor,role:'qa'}});f.request.arguments.actor.id=actor;assert.equal(gate(f).decision,'hold');}});
test('reviewerIsNotPerTaskGate',()=>{const f=fixture();assert.equal(gate(f).decision,'allow');f.request.operation='review';f.request.arguments.actor={id:'reviewer1',role:'reviewer'};assert.equal(gate(f).decision,'hold');});
test('finalReviewWaitsForAcceptedTasks',()=>{const f=fixture('final','review');assert.equal(gate(f).decision,'hold');f.state.tasks[0].status='accepted';f.state.checks.push({id:'qa',scope:'task',taskId:'T1',operation:'check',status:'passed',descriptor:f.state.tasks[0].requiredChecks[0],changeFingerprint:hash,verificationActor:{id:'qa1',role:'qa'},resultRef:'qa:passed',verdict:'proven',source:'operator-attested'});assert.equal(gate(f).decision,'allow');});
test('finalReviewerFindingUsesImplementerReviewerRecheck',()=>{const f=fixture('final','review');f.state.tasks[0].status='accepted';f.state.findings.push({id:'F1',scope:'final',origin:'final-review',status:'resolved',taskId:'T1',resolutionRef:'implementer:fix',resolutionActor:{id:'coder1',role:'implementer'},changeFingerprint:hash});f.request.arguments.findingIds=['F1'];const intent=prepared(f);const d=result(f,intent);assert.equal(d.decision,'allow');assert.equal(d.proposedTransition.findings[0].status,'closed');assert.equal(d.proposedTransition.check.verificationActor.role,'reviewer');});
test('unresolvedFindingBlocksAffectedTransition',()=>{const f=fixture();f.state.findings.push({id:'F1',scope:'task',taskId:'T1',status:'open'});assert.equal(gate(f).decision,'hold');});
test('noPlanAndOmissionRemainUnsupportedWithoutPolicyViolation',()=>{for(const mode of ['no-plan','small-task']){const f=fixture();f.state.mode=mode;const d=gate(f);assert.deepEqual(d.ruleIds,['cooperative.unsupported']);assert.deepEqual(d.requiredEvidence,[]);}});
test('exact descriptor actor result reference verdict and fingerprint bind result',()=>{for(const mutate of [r=>r.data.actor.id='coder1',r=>r.data.descriptor.args.push('extra'),r=>r.data.scope='final',r=>r.data.changeFingerprint=other,r=>r.data.verdict='unverified']){const f=fixture(),intent=prepared(f);const request={...f.request,operation:'verification-result',intentId:intent.requestId,result:{status:'succeeded',messageRef:'result',data:{actor:structuredClone(intent.verificationActor),descriptor:structuredClone(intent.descriptor),scope:'task',taskId:'T1',changeFingerprint:hash,verdict:'proven'}}};mutate(request.result);assert.equal(gate({...f,request}).decision,'hold');}const f=fixture(),intent=prepared(f),d=result(f,intent);assert.equal(d.decision,'allow');assert.equal(d.coverage.nativeVerified,false);assert.equal(d.proposedTransition.check.resultRef,'result:1');});
test('failed check requires Implementer resolution and QA recheck',()=>{const f=fixture(),intent=prepared(f),d=result(f,intent,'failed','unmet');assert.equal(d.decision,'hold');assert.equal(d.proposedTransition.findings[0].origin,'check');intent.status=d.proposedTransition.result.status;f.state.findings=d.proposedTransition.findings;assert.equal(gate(f).decision,'hold');f.state.findings[0]={...f.state.findings[0],status:'resolved',resolutionRef:'implementer:fix',resolutionActor:{id:'coder1',role:'implementer'},changeFingerprint:hash};f.request.requestId='recheck';f.request.arguments.findingIds=[f.state.findings[0].id];const retry=prepared(f);assert.equal(result(f,retry).proposedTransition.findings[0].status,'closed');});
test('affected invalidation preserves history and excludes independent task',()=>{const f=fixture();f.state.tasks.push({...structuredClone(f.state.tasks[0]),id:'T2',dependencies:[]});f.state.checks.push({taskId:'T1',scope:'task',status:'passed',changeFingerprint:hash},{taskId:'T2',scope:'task',status:'passed',changeFingerprint:hash},{scope:'final',status:'passed',changeFingerprint:hash});const next=api.invalidateAffectedEvidence({state:f.state,changedVersions:{documentVersion:2},affectedTaskIds:['T1']});assert.deepEqual(next.checks.map(c=>c.stale===true),[true,false,true]);assert.equal(next.tasks[1].status,'pending');assert.equal(f.state.checks[0].stale,undefined);});
test('task registration requires current approval and cannot manufacture acceptance',()=>{const f=fixture();f.request={requestId:'task',expectedRevision:1,actor:{id:'operator',role:'orchestrator'},operation:'verification-record',evidence:{kind:'acceptance-evidence',messageRef:'task:contract',data:{kind:'task',task:structuredClone(f.state.tasks[0])}}};f.request.evidence.data.task.id='T2';const d=gate(f);assert.equal(d.decision,'allow');assert.equal(d.proposedTransition.task.id,'T2');f.request.evidence.data.task.status='accepted';assert.equal(gate(f).decision,'hold');});
test('finding resolution requires assigned Implementer and current correction fingerprint',()=>{const f=fixture();f.state.findings.push({id:'F',scope:'task',taskId:'T1',status:'open',origin:'check'});f.request={requestId:'resolve',expectedRevision:1,actor:{id:'operator',role:'orchestrator'},operation:'verification-record',evidence:{kind:'finding',messageRef:'implementer:fix',data:{action:'resolve',id:'F',actor:{id:'coder1',role:'implementer'},changeFingerprint:hash}}};assert.equal(gate(f).decision,'allow');f.request.evidence.data.actor.id='unassigned';assert.equal(gate(f).decision,'hold');});
test('read-only snapshot separates task and final changes and includes untracked/deleted bytes',async t=>{
 const fs=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path');
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'arc-verification-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await fs.writeFile(path.join(root,'a'),'one');await fs.writeFile(path.join(root,'b'),'two');
 const f=fixture();f.state.target.realpath=root;f.state.tasks[0].paths=[path.join(root,'a')];
 assert.equal(typeof api.readCooperativeChanges,'function');
 // Reader transport supplies read-only Git file inventory; real bytes are read from disk.
 const gitRunner=({args})=>({status:0,stdout:Buffer.from(args.includes('--stage')?'':'a\0b\0')});
 const first=await api.readCooperativeChanges({state:f.state,gitRunner});await fs.writeFile(path.join(root,'b'),'changed');
 const second=await api.readCooperativeChanges({state:f.state,gitRunner});assert.equal(first.tasks.T1,second.tasks.T1);assert.notEqual(first.final,second.final);
 await fs.unlink(path.join(root,'a'));const third=await api.readCooperativeChanges({state:f.state,gitRunner});assert.notEqual(second.tasks.T1,third.tasks.T1);
});
test('initial final review requires current successful task checks even after task status says accepted',()=>{const f=fixture('final','review');f.state.tasks[0].status='accepted';assert.equal(gate(f).decision,'hold');});
test('stale task contracts cannot dispatch and Implementer result statements cannot cross tasks',async()=>{
 const {prepareCooperativeAssignment,recordCooperativeAssignmentResult}=await import('../../lib/runtime/assignment.mjs');
 const f=fixture();f.state.tasks[0].invalidated=true;
 const args={role:'implementer',paths:['/workspace/a'],operations:['edit'],documents:[],approvalRef:'approved',approvalVersion:1,documentVersion:1,correlation:'dispatch'};
 const decision=prepareCooperativeAssignment({state:f.state,request:{requestId:'assign',expectedRevision:1,operation:'assign-agent',taskId:'T1',arguments:args},observations:{target:f.state.target,git:{target:f.state.target}}});assert.deepEqual(decision.ruleIds,['cooperative.task-stale']);
 f.state.assignments.push({taskId:'T0',agentId:'reused',status:'active'});
 const intent={operation:'assign-agent',taskId:'T1',requestId:'assign',status:'prepared',correlation:'dispatch',target:f.state.target};
 const result={status:'succeeded',messageRef:'reply',data:{correlation:'dispatch',taskId:'T1',agentId:'reused'}};
 assert.equal(recordCooperativeAssignmentResult({state:f.state,intent,result,observations:{target:f.state.target}}).decision,'hold');
});
test('durable Implementer correction and QA recheck supersede failed historical checks without rewriting them',async t=>{
 const fs=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path');
 const {initializeCooperativeWorkflow}=await import('../../lib/runtime/bootstrap.mjs'),{runCooperativeCommand}=await import('../../lib/runtime/cooperative.mjs'),{workflowStatePath}=await import('../../lib/runtime/scope.mjs');
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'arc-verification-loop-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));const cwd=path.join(root,'workspace'),common=path.join(root,'common');await fs.mkdir(cwd);await fs.mkdir(common);
 const target={realpath:cwd,gitCommonDir:common,gitDir:common,head:'a'.repeat(40),branch:'main'},actor={id:'operator',role:'orchestrator'},args={cwd,workflowId:'loop',observe:async()=>target,readChanges:async()=>({tasks:{T1:hash},final:hash})};
 await initializeCooperativeWorkflow({...args,input:{mode:'plan',actor,selection:{messageRef:'target',contentHash:hash}}});
 const file=await workflowStatePath(target,'loop'),state=JSON.parse(await fs.readFile(file));const f=fixture();state.tasks=f.state.tasks;state.tasks[0].paths=[path.join(cwd,'a')];state.tasks[0].requiredChecks[0].cwd=cwd;state.assignments=f.state.assignments;state.records=f.state.records.map(r=>({...r,actor}));await fs.writeFile(file,JSON.stringify(state));
 let revision=0;const invoke=async(command,input)=>{const d=await runCooperativeCommand({...args,command,input:{requestId:'r'+revision,expectedRevision:revision,actor,...input}});revision=d.revision;return d;};
 const arguments_={scope:'task',actor:{id:'qa1',role:'qa'},descriptor:state.tasks[0].requiredChecks[0],changeFingerprint:hash};
 const prepare1=await invoke('prepare',{operation:'check',taskId:'T1',arguments:arguments_});assert.equal(prepare1.decision,'allow');
 const data={actor:arguments_.actor,descriptor:arguments_.descriptor,scope:'task',taskId:'T1',changeFingerprint:hash,verdict:'unmet'};
 assert.equal((await invoke('result',{intentId:'r0',result:{status:'failed',messageRef:'failed',data}})).decision,'hold');
 assert.equal((await invoke('record',{evidence:{kind:'finding',messageRef:'fixed',data:{action:'resolve',id:'r0:failure',actor:{id:'coder1',role:'implementer'},changeFingerprint:hash}}})).decision,'allow');
 assert.equal((await invoke('prepare',{operation:'check',taskId:'T1',arguments:{...arguments_,findingIds:['r0:failure']}})).decision,'allow');
 assert.equal((await invoke('result',{intentId:'r3',result:{status:'succeeded',messageRef:'rechecked',data:{...data,verdict:'proven'}}})).decision,'allow');
 const final=await runCooperativeCommand({...args,command:'status'});assert.equal(final.decision,'allow');assert.deepEqual(final.state.checks.map(c=>c.status),['failed','passed']);assert.equal(final.state.findings[0].status,'closed');
});
test('invalidated task cannot revive using its old approval and unrelated task remains usable',()=>{
 const f=fixture();f.state.tasks.push({...structuredClone(f.state.tasks[0]),id:'T2'});
 f.state=api.invalidateAffectedEvidence({state:f.state,changedVersions:{scopeVersion:1},affectedTaskIds:['T1']});
 const old={...structuredClone(f.state.tasks[0]),status:'pending'};delete old.invalidated;delete old.invalidatedBy;delete old.invalidatedAt;
 const r={requestId:'old',expectedRevision:1,actor:f.request.actor,operation:'verification-record',evidence:{kind:'acceptance-evidence',messageRef:'old:contract',data:{kind:'task',task:old}}};
 assert.equal(gate({...f,request:r}).decision,'hold');
 f.request.taskId='T2';f.evidence.changes.tasks.T2=hash;assert.equal(gate(f).decision,'allow');
});
test('snapshot tracks index changes independently from unchanged working bytes',async t=>{
 const fs=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path');const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'arc-verification-index-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.writeFile(path.join(root,'a'),'working');const f=fixture();f.state.target.realpath=root;f.state.tasks[0].paths=[path.join(root,'a')];
 let oid='a'.repeat(40);const gitRunner=({args})=>({status:0,stdout:Buffer.from(args.includes('--stage')?`100644 ${oid} 0\ta\0`:'a\0')});
 const first=await api.readCooperativeChanges({state:f.state,gitRunner});oid='b'.repeat(40);const second=await api.readCooperativeChanges({state:f.state,gitRunner});assert.notEqual(first.tasks.T1,second.tasks.T1);assert.notEqual(first.final,second.final);
});
test('result target drift and revision mismatch never record a passing current check',async t=>{
 const fs=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path');const {initializeCooperativeWorkflow}=await import('../../lib/runtime/bootstrap.mjs'),{runCooperativeCommand}=await import('../../lib/runtime/cooperative.mjs'),{workflowStatePath}=await import('../../lib/runtime/scope.mjs');
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'arc-verification-drift-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));const cwd=path.join(root,'workspace'),common=path.join(root,'common');await fs.mkdir(cwd);await fs.mkdir(common);
 for(const drift of ['target','revision']){
 let target={realpath:cwd,gitCommonDir:common,gitDir:common,head:'a'.repeat(40),branch:'main'};const actor={id:'operator',role:'orchestrator'},args={cwd,workflowId:drift,observe:async()=>target,readChanges:async()=>({tasks:{T1:hash},final:hash})};await initializeCooperativeWorkflow({...args,input:{mode:'plan',actor,selection:{messageRef:'target',contentHash:hash}}});
 const file=await workflowStatePath(target,drift),state=JSON.parse(await fs.readFile(file)),f=fixture();state.tasks=f.state.tasks;state.tasks[0].paths=[path.join(cwd,'a')];state.tasks[0].requiredChecks[0].cwd=cwd;state.assignments=f.state.assignments;state.records=f.state.records.map(r=>({...r,actor}));await fs.writeFile(file,JSON.stringify(state));
 const descriptor=state.tasks[0].requiredChecks[0],qa={id:'qa1',role:'qa'};assert.equal((await runCooperativeCommand({...args,command:'prepare',input:{requestId:'check',expectedRevision:0,actor,operation:'check',taskId:'T1',arguments:{scope:'task',actor:qa,descriptor,changeFingerprint:hash}}})).decision,'allow');
 if(drift==='target')target={...target,head:'b'.repeat(40)};
 const r=await runCooperativeCommand({...args,command:'result',input:{requestId:'reply',expectedRevision:drift==='revision'?0:1,actor,intentId:'check',result:{status:'succeeded',messageRef:'passed',data:{actor:qa,descriptor,scope:'task',taskId:'T1',changeFingerprint:hash,verdict:'proven'}}}});assert.equal(r.decision,'hold');const stored=JSON.parse(await fs.readFile(file));assert.equal(stored.checks.some(c=>c.status==='passed'),false);assert.equal(stored.results.length,1);assert.equal(stored.target.head,'a'.repeat(40));
 }
});
test('Implementer native actor cannot reuse a recorded QA or Reviewer identity',async()=>{
 const {recordCooperativeAssignmentResult}=await import('../../lib/runtime/assignment.mjs');const f=fixture();f.state.intents.push({operation:'check',taskId:'T0',verificationActor:{id:'qa-old',role:'qa'}});
 const intent={operation:'assign-agent',taskId:'T1',requestId:'assign',status:'prepared',correlation:'dispatch',target:f.state.target};
 const result={status:'succeeded',messageRef:'reply',data:{correlation:'dispatch',taskId:'T1',agentId:'qa-old'}};
 assert.equal(recordCooperativeAssignmentResult({state:f.state,intent,result,observations:{target:f.state.target}}).decision,'hold');
});
test('a truthful result for a changed diff preserves execution status without granting fresh evidence',()=>{const f=fixture(),intent=prepared(f);f.evidence.changes.tasks.T1=other;const d=result(f,intent);assert.equal(d.decision,'hold');assert.equal(d.proposedTransition.result.status,'succeeded');assert.equal(d.proposedTransition.check.stale,true);assert.notEqual(d.proposedTransition.check.status,'passed');});

test('task snapshot survives verified HEAD advancement but tracks branch and bytes',async t=>{
 const fs=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path');const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'arc-head-snapshot-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.writeFile(path.join(root,'a'),'one');const f=fixture();f.state.target.realpath=root;f.state.tasks[0].paths=[path.join(root,'a')];const gitRunner=({args})=>({status:0,stdout:Buffer.from(args.includes('--stage')?'':'a\0')});
 const first=await api.readCooperativeChanges({state:f.state,gitRunner});f.state.target.head='b'.repeat(40);const advanced=await api.readCooperativeChanges({state:f.state,gitRunner});assert.equal(first.tasks.T1,advanced.tasks.T1);assert.notEqual(first.final,advanced.final);f.state.target.branch='other';assert.notEqual((await api.readCooperativeChanges({state:f.state,gitRunner})).tasks.T1,first.tasks.T1);
});

test('legacy finding correction emits a canonical actor and preserves its original statement',()=>{
 const f=fixture();f.state.findings.push({id:'F',scope:'task',taskId:'T1',status:'open',origin:'check'});
 f.request={requestId:'resolve',expectedRevision:1,actor:{id:'operator',role:'orchestrator'},operation:'verification-record',evidence:{kind:'finding',messageRef:'coder:fix',data:{action:'resolve',id:'F',actor:{id:'coder1',role:'coder'},changeFingerprint:hash}}};
 const before=structuredClone(f.request),d=gate(f);assert.equal(d.decision,'allow');assert.equal(d.proposedTransition.finding.resolutionActor.role,'implementer');assert.deepEqual(f.request,before);
});
