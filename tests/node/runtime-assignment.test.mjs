import test from 'node:test';
import assert from 'node:assert/strict';
const api=await import('../../lib/runtime/assignment.mjs').catch(()=>({}));
const hash='sha256:'+'a'.repeat(64),commit='b'.repeat(40);
function fixture(){
 const target={realpath:'/workspace',gitCommonDir:'/common',gitDir:'/common',head:commit,branch:'main'};
 const documents=['spec','plan'].map(kind=>({kind,path:'/workspace/'+kind+'.md',gitPath:kind+'.md',contentHash:hash,approvalRef:'approved',commit}));
 const arguments_={role:'coder',paths:['/workspace/code.mjs'],operations:['edit'],documents,approvalRef:'approved',approvalVersion:1,documentVersion:1,correlation:'native:1'};
 const state={mode:'plan',target,targetVersion:1,scopeVersion:0,revision:1,tasks:[{id:'T1',paths:['/workspace/code.mjs'],status:'pending',criteria:['works'],requiredChecks:[],dependencies:[],approvalRef:'approved',approvalVersion:1,documentVersion:1,scopeVersion:0,targetVersion:1}],intents:[],assignments:[],records:[{kind:'approval',messageRef:'approved',source:'operator-attested',targetVersion:1,scopeVersion:0,data:{approvalVersion:1,documentVersion:1,documents}}]};
 const request={requestId:'assign1',expectedRevision:1,actor:{id:'operator'},operation:'assign-agent',taskId:'T1',arguments:arguments_};
 const observations={target,git:{target,documents:documents.map(d=>({...d,observedHash:hash,currentHash:hash})),docsCommit:{commit,paths:['spec.md','plan.md'],documents}}};
 return {state,request,observations};
}
const prepare=f=>{assert.equal(typeof api.prepareCooperativeAssignment,'function','assignment gate must exist');return api.prepareCooperativeAssignment(f);};
test('uncommittedDocumentsHold',()=>{const f=fixture();delete f.observations.git.docsCommit;assert.equal(prepare(f).decision,'hold');});
test('approvedHashesMustMatchObjectsAndCurrentFiles',()=>{for(const key of ['observedHash','currentHash']){const f=fixture();f.observations.git.documents[0][key]='sha256:'+'c'.repeat(64);assert.equal(prepare(f).decision,'hold');}const f=fixture();assert.equal(prepare(f).decision,'allow');});
test('docsCommitContainsExactSet',()=>{const f=fixture();f.observations.git.docsCommit.paths.push('code.mjs');assert.equal(prepare(f).decision,'hold');});
test('lateDocsNeverValidateEarlierStart',()=>{const f=fixture();f.state.records.push({kind:'note',data:{priorExecution:true}});assert.equal(prepare(f).decision,'hold');});
test('existingAgentHistoryRemainsUnverified',()=>{const f=fixture();f.request.arguments.existingAgentId='old-agent';assert.equal(prepare(f).decision,'hold');assert.deepEqual(f.state.assignments,[]);});
test('unknownDispatchBlocksDuplicateAssignment',()=>{for(const status of ['prepared','unknown','mismatch','succeeded']){const f=fixture();f.state.intents.push({operation:'assign-agent',taskId:'T1',status});assert.equal(prepare(f).decision,'hold');}});
test('intent binds documents approval scope target task and request; native statements remain attestations',()=>{const f=fixture();const prepared=prepare(f);assert.equal(prepared.decision,'allow');const intent=prepared.proposedTransition.intent;assert.equal(intent.requestId,'assign1');assert.equal(intent.docsCommit,commit);assert.equal(intent.taskId,'T1');assert.deepEqual(intent.target,f.state.target);assert.equal(intent.approvalVersion,1);assert.equal(intent.documentVersion,1);assert.equal(intent.status,'prepared');for(const status of ['succeeded','failed','unknown','mismatch']){const result={status,messageRef:'native:reply',data:{correlation:'native:1',taskId:'T1',agentId:'claimed'}};const decision=api.recordCooperativeAssignmentResult({state:f.state,intent,result,observations:f.observations});assert.equal(decision.coverage.nativeVerified,false);assert.equal(decision.decision,status==='succeeded'||status==='failed'?'allow':'hold');assert.equal(decision.proposedTransition.result.source,'operator-attested');}});
test('mismatched native response and target drift never rebind intent',()=>{const f=fixture();const intent=prepare(f).proposedTransition.intent;for(const data of [{correlation:'wrong',taskId:'T1',agentId:'x'},{correlation:'native:1',taskId:'wrong',agentId:'x'}]){const r=api.recordCooperativeAssignmentResult({state:f.state,intent,result:{status:'succeeded',messageRef:'reply',data},observations:f.observations});assert.equal(r.decision,'hold');assert.equal(r.proposedTransition.result.status,'mismatch');}f.observations={...f.observations,target:{...f.state.target,head:'d'.repeat(40)}};assert.equal(prepare(f).decision,'hold');assert.equal(intent.target.head,commit);});
test('approval versions document hashes and operator fabricated Git facts are rejected',()=>{for(const mutate of [f=>f.request.arguments.approvalVersion++,f=>f.request.arguments.documents[0].contentHash='sha256:'+'c'.repeat(64),f=>f.request.arguments.gitEvidence=f.observations.git]){const f=fixture();mutate(f);assert.equal(prepare(f).decision,'hold');}});
test('durable command saves intent before native result and never accepts Git facts from JSON',async t=>{
 const fs=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path');
 const {initializeCooperativeWorkflow}=await import('../../lib/runtime/bootstrap.mjs');const {runCooperativeCommand}=await import('../../lib/runtime/cooperative.mjs');
 const dir=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'arc-assignment-')));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const cwd=path.join(dir,'workspace'),common=path.join(dir,'common');await fs.mkdir(cwd);await fs.mkdir(common);
 const f=fixture();f.state.target={...f.state.target,realpath:cwd,gitCommonDir:common,gitDir:common};
 f.request.arguments.paths=[path.join(cwd,'code.mjs')];for(const d of f.request.arguments.documents)d.path=path.join(cwd,d.gitPath);
 const observe=async()=>({...f.state.target}),args={cwd,workflowId:'assignment',observe,readChanges:async()=>({tasks:{T1:hash},final:hash})};
 await initializeCooperativeWorkflow({...args,input:{mode:'plan',actor:{id:'operator'},selection:{messageRef:'target',contentHash:hash}}});
 await runCooperativeCommand({...args,command:'record',input:{requestId:'approval',expectedRevision:0,actor:{id:'operator'},evidence:{kind:'approval',messageRef:'approved',data:f.state.records[0].data}}});
 const {workflowStatePath}=await import('../../lib/runtime/scope.mjs');const stateFile=await workflowStatePath(f.state.target,'assignment');const saved=JSON.parse(await fs.readFile(stateFile));saved.tasks=f.state.tasks; saved.tasks[0].paths=f.request.arguments.paths;await fs.writeFile(stateFile,JSON.stringify(saved));
 const readGit=async()=>({...f.observations.git,target:f.state.target,documents:f.request.arguments.documents.map(d=>({...d,observedHash:hash,currentHash:hash}))});
 let prepared=await runCooperativeCommand({...args,command:'prepare',input:f.request,readGit});assert.equal(prepared.decision,'allow');assert.equal(prepared.persisted,true);
 const status=await runCooperativeCommand({...args,command:'status',input:undefined});assert.equal(status.state.intents[0].status,'prepared');assert.deepEqual(status.state.assignments,[]);
 const response=await runCooperativeCommand({...args,command:'result',input:{requestId:'response',expectedRevision:2,actor:{id:'operator'},intentId:'assign1',result:{status:'succeeded',messageRef:'native:reply',data:{taskId:'T1',correlation:'native:1',agentId:'claimed'}}}});
 assert.equal(response.decision,'allow');const final=await runCooperativeCommand({...args,command:'status',input:undefined});assert.equal(final.state.assignments[0].identityVerified,false);assert.equal(final.state.results[0].source,'operator-attested');
 const forged={...f.request,requestId:'forged',expectedRevision:3,taskId:'T2',arguments:{...f.request.arguments,gitEvidence:f.observations.git}};
 prepared=await runCooperativeCommand({...args,command:'prepare',input:forged,readGit});assert.equal(prepared.decision,'hold');
});
test('terminal native response cannot be overwritten by a later claim',()=>{const f=fixture();const intent=prepare(f).proposedTransition.intent;intent.status='succeeded';const decision=api.recordCooperativeAssignmentResult({state:f.state,intent,result:{status:'failed',messageRef:'later',data:{taskId:'T1',correlation:'native:1'}},observations:f.observations});assert.equal(decision.decision,'hold');assert.equal(decision.proposedTransition,null);assert.equal(intent.status,'succeeded');});
test('conflicting active path ownership and reused native correlation block a different task',()=>{for(const override of [{paths:['/workspace/code.mjs'],correlation:'other'},{paths:['/workspace/other.mjs'],correlation:'native:1'}]){const f=fixture();f.state.intents.push({operation:'assign-agent',taskId:'T0',status:'prepared',...override});assert.equal(prepare(f).decision,'hold');}});
test('runtime drift holds assignment results without renewing versions or creating authority',async t=>{
 const fs=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path');
 const {initializeCooperativeWorkflow}=await import('../../lib/runtime/bootstrap.mjs');
 const {runCooperativeCommand}=await import('../../lib/runtime/cooperative.mjs');
 const {workflowStatePath}=await import('../../lib/runtime/scope.mjs');
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'arc-assignment-drift-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const cwd=path.join(root,'workspace'),common=path.join(root,'common');await fs.mkdir(cwd);await fs.mkdir(common);
 const target={realpath:cwd,gitCommonDir:common,gitDir:common,head:commit,branch:'main'};
 const args={cwd,workflowId:'drift',observe:async()=>({...target})};
 await initializeCooperativeWorkflow({...args,input:{mode:'plan',actor:{id:'operator'},selection:{messageRef:'target',contentHash:hash}}});
 const filename=await workflowStatePath(target,'drift');
 const state=JSON.parse(await fs.readFile(filename,'utf8'));
 state.versions.runtimeHash='sha256:'+'0'.repeat(64);
 state.intents.push({...prepare(fixture()).proposedTransition.intent,requestId:'prepared',target:structuredClone(target)});
 await fs.writeFile(filename,JSON.stringify(state));
 const recorded=await runCooperativeCommand({...args,command:'result',input:{requestId:'reply',expectedRevision:0,actor:{id:'operator'},intentId:'prepared',result:{status:'succeeded',messageRef:'native:reply',data:{taskId:'T1',correlation:'native:1',agentId:'claimed'}}}});
 assert.equal(recorded.decision,'hold');assert.deepEqual(recorded.ruleIds,['cooperative.versions']);
 const status=await runCooperativeCommand({...args,command:'status'});
 assert.equal(status.decision,'hold');assert.deepEqual(status.state.versions,state.versions);
 assert.deepEqual(status.state.assignments,[]);assert.deepEqual(status.state.approvals,[]);
 assert.deepEqual(status.state.intents[0].target,target);
 assert.equal(status.state.results[0].source,'operator-attested');
 assert.ok(status.state.unresolved.some(entry=>entry.kind==='versions-changed'));
});
test('unsupported cancellation cannot release a durable prepared assignment',async t=>{
 const fs=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path');
 const {initializeCooperativeWorkflow}=await import('../../lib/runtime/bootstrap.mjs');
 const {runCooperativeCommand}=await import('../../lib/runtime/cooperative.mjs');
 const {workflowStatePath}=await import('../../lib/runtime/scope.mjs');
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'arc-assignment-cancel-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const cwd=path.join(root,'workspace'),common=path.join(root,'common');await fs.mkdir(cwd);await fs.mkdir(common);
 const target={realpath:cwd,gitCommonDir:common,gitDir:common,head:commit,branch:'main'};
 const args={cwd,workflowId:'cancel',observe:async()=>({...target})};
 await initializeCooperativeWorkflow({...args,input:{mode:'plan',actor:{id:'operator'},selection:{messageRef:'target',contentHash:hash}}});
 const filename=await workflowStatePath(target,'cancel');
 const state=JSON.parse(await fs.readFile(filename,'utf8'));
 const intent={...prepare(fixture()).proposedTransition.intent,target:structuredClone(target)};
 state.intents.push(intent);await fs.writeFile(filename,JSON.stringify(state));
 const result=await runCooperativeCommand({...args,command:'result',input:{requestId:'cancel',expectedRevision:0,actor:{id:'operator'},intentId:intent.requestId,result:{status:'cancelled',messageRef:'operator:cancel',data:{taskId:'T1',correlation:'native:1'},notExecutedEvidence:{messageRef:'operator:claim'}}}});
 assert.equal(result.decision,'hold');
 const status=await runCooperativeCommand({...args,command:'status'});
 assert.equal(status.state.intents[0].status,'prepared');assert.deepEqual(status.state.assignments,[]);
 assert.equal(status.decision,'hold');
});

test('assignment paths must fit the approved task and recorded scope with component boundaries',()=>{
 for(const outside of ['/workspace/other.mjs','/workspace/app-sibling/a']){const f=fixture();f.state.tasks=[{...f.state.tasks[0],paths:['/workspace/app']}];f.request.arguments.paths=[outside];assert.equal(prepare(f).decision,'hold');}
 const f=fixture();f.state.tasks=[{...f.state.tasks[0],paths:['/workspace/app']}];f.request.arguments.paths=['/workspace/app/a'];f.state.scopes=[{scopeVersion:0,data:{paths:['/workspace/other']}}];assert.equal(prepare(f).decision,'hold');f.state.scopes[0].data.paths=['/workspace/app'];assert.equal(prepare(f).decision,'allow');f.state.tasks=[];assert.equal(prepare(f).decision,'hold');
});

test('verified committed predecessor releases paths but unresolved and merely succeeded assignments retain them',()=>{
 const f=fixture();f.state.tasks.push({id:'T0',status:'committed',paths:f.request.arguments.paths});f.state.commits=[{taskId:'T0',observationSource:'local-git',requestId:'commit0'}];f.state.intents.push({operation:'commit',requestId:'commit0',status:'succeeded',taskId:'T0'},{operation:'assign-agent',taskId:'T0',status:'succeeded',correlation:'old',paths:f.request.arguments.paths});assert.equal(prepare(f).decision,'allow');f.state.commits=[];assert.equal(prepare(f).decision,'hold');f.state.commits=[{taskId:'T0',observationSource:'local-git',requestId:'commit0'}];f.state.intents[1].status='unknown';assert.equal(prepare(f).decision,'hold');
});

test('task-specific approval cannot authorize another task and contract versions bind assignment',()=>{
 const f=fixture(),other=structuredClone(f.state.records[0]);other.messageRef='approved:T2';other.data.affectedTaskIds=['T2'];other.data.approvalVersion=2;other.data.documentVersion=2;other.data.documents.forEach(d=>d.approvalRef=other.messageRef);f.state.records.push(other);
 f.request.arguments={...f.request.arguments,approvalRef:other.messageRef,approvalVersion:2,documentVersion:2,documents:structuredClone(other.data.documents)};f.observations.git.docsCommit.documents=structuredClone(other.data.documents);f.observations.git.documents=other.data.documents.map(d=>({...d,observedHash:hash,currentHash:hash}));assert.equal(prepare(f).decision,'hold');
 const valid=fixture();valid.state.records.push(other);assert.equal(prepare(valid).decision,'allow','unrelated approval does not invalidate the task approval');
 for(const key of ['approvalRef','approvalVersion','documentVersion','scopeVersion','targetVersion']){const f=fixture();f.state.tasks[0][key]=key==='approvalRef'?'other':9;assert.equal(prepare(f).decision,'hold',key);}
});
