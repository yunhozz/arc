import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const temporary=[];test.after(()=>{for(const dir of temporary)fs.rmSync(dir,{recursive:true,force:true});});
import {spawnSync} from 'node:child_process';
const api=await import('../../lib/runtime/adapters/claude.mjs').catch(()=>({}));
const state = () => ({schemaVersion:1,workflowId:'workflow',revision:0,versions:{policy:'1',runtime:'1',adapter:'1',policyHash:'sha256:'+ 'a'.repeat(64),runtimeHash:'sha256:'+ 'b'.repeat(64),adapterHash:'sha256:'+ 'c'.repeat(64)},target:{realpath:'/workspace',repository:'repo',worktree:'wt',branch:'main',baseHead:'base',head:'head'},documents:[],approvals:[],tasks:[{id:'T1',status:'pending',paths:['/workspace/file'],dependencies:[],baseCommit:'head',criteria:['criterion'],requiredChecks:[]}],assignments:[],identities:[],leases:[],checks:[],findings:[],acceptances:[],commits:[],audit:[],capabilities:[],requests:[],mode:'plan'});
const request = () => ({requestId:'request',platform:'claude',operation:'read',actorRef:'actor',taskId:'T1',cwd:'/workspace',toolName:'Read',arguments:{},paths:['/workspace/file'],descriptor:{}});

const policy=JSON.parse(fs.readFileSync(new URL('../../lib/policy/role-policy.json',import.meta.url)));
function setup(role,operation){const s=state();s.identities=[{actorRef:'actor',role,taskId:'T1',observationRef:'obs'}];s.leases=[{actorRef:'actor',taskId:'T1',status:'active'}];s.assignments=[{actorRef:'actor',taskId:'T1',role,paths:['/workspace/file'],operations:[operation],approvalRef:'approval'}];s.approvals=[{id:'approval',source:'user-message',messageRef:'message',contentHash:'sha256:'+'a'.repeat(64),scope:{taskId:'T1',target:'/workspace',operations:[operation],paths:['/workspace/file']}}];return {s,r:{...request(),operation},e:{observedAt:'2026-10-20T00:00:00Z',target:s.target,revision:s.revision,versions:s.versions,resolvedPaths:[{path:'/workspace',realpath:'/workspace'},{path:'/workspace/file',realpath:'/workspace/file'}],provenance:[{id:'obs',source:'platform-event',eventRef:'event',actorRef:'actor',platform:'claude',verification:{status:'verified',verifierRef:'platform-provider',sourceRef:'event'}},{id:'approval',source:'user-message',messageRef:'message',contentHash:'sha256:'+'a'.repeat(64),verification:{status:'verified',verifierRef:'message-provider',sourceRef:'message'}}]}};}

const event=(tool='Read')=>({hook_event_name:'PreToolUse',session_id:'session',tool_name:tool,tool_input:{role:'orchestrator',actorRef:'fake'},tool_use_id:'call',cwd:'/workspace'});
function context(a){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'arc-claude-'));temporary.push(dir);const statePath=path.join(dir,'state.json');fs.writeFileSync(statePath,JSON.stringify(a.s));return {failureBlocking:{status:'verified',onFailure:'block',platformVersion:'2.1.295',verificationRef:'host-contract'},statePath,sessionRef:'session',toolUseId:'call',actorRef:'actor',taskId:'T1',requestId:'request',policy,state:a.s,evidence:a.e,describeTool:()=>({operation:a.r.operation,paths:a.r.paths,descriptor:a.r.descriptor})};}
const decision=response=>response.hookSpecificOutput?.permissionDecision??'allow';
test('six roles use provider identity and common role policy, never tool supplied role',async()=>{
 assert.equal(typeof api.runClaudeGate,'function');
 for(const [role,allowed,denied] of [['planner','draft','write'],['scouter','read','operational-query'],['implementer','write','commit'],['qa','read','write'],['reviewer','review','check'],['orchestrator','read','scope-expansion']]){
  const a=setup(role,allowed);assert.equal(decision(await api.runClaudeGate(event(),context(a))),'allow',role);
  const b=setup(role,denied);assert.equal(decision(await api.runClaudeGate(event(),context(b))),'deny',role);
 }
});
test('retired Implementer remains denied even when event claims orchestrator',async()=>{
 const a=setup('implementer','write');a.s.leases[0].status='retired';assert.equal(decision(await api.runClaudeGate(event(),context(a))),'deny');
});
test('missing session identity, malformed inputs, and validator exceptions explicitly deny',async()=>{
 const a=setup('implementer','write');
 for(const input of [null,{},event()])assert.equal(decision(await api.runClaudeGate(input,{})),'deny');
 const c=context(a);c.sessionRef='other';assert.equal(decision(await api.runClaudeGate(event(),c)),'deny');
 const broken=context(a);broken.describeTool=()=>{throw Error('provider failed');};assert.equal(decision(await api.runClaudeGate(event(),broken)),'deny');
});
test('SubagentStart observes identity and cannot return a start blocking success',async()=>{
 assert.deepEqual(await api.runClaudeGate({hook_event_name:'SubagentStart',session_id:'session',agent_id:'child',agent_type:'implementer'},{}),{});
 const a=setup('implementer','write');const c=context(a);let calls=0;c.observeAgent=()=>{calls++;return {decision:'deny'};};
 assert.deepEqual(await api.runClaudeGate({hook_event_name:'SubagentStart',session_id:'session',agent_id:'child',agent_type:'implementer'},c),{});assert.equal(calls,1);
});
test('Agent requires trusted assignment correlation and docs evidence',async()=>{
 const a=setup('orchestrator','assign-agent');a.r.descriptor={role:'implementer',taskId:'T1',paths:['/workspace/file'],operations:['read'],approvalRef:'approval',correlationRef:'call'};
 assert.equal(decision(await api.runClaudeGate(event('Agent'),context(a))),'deny');
 assert.equal(api.normalizeClaudeEvent(event('Agent'),context(a)).coverage.nativeVerified,false);
});
test('normalization rejects untrusted semantic mapping and mismatched session',()=>{
 const a=setup('implementer','write');const c=context(a);delete c.describeTool;
 assert.throws(()=>api.normalizeClaudeEvent(event(),c));
 assert.throws(()=>api.normalizeClaudeEvent({...event(),session_id:'other'},context(a)));
});
test('CLI malformed input outputs only one native deny JSON',()=>{
 const result=spawnSync(process.execPath,['claude/skill/hooks/runtime-gate.mjs'],{input:'{broken',encoding:'utf8'});
 assert.equal(result.status,0);assert.equal(result.stderr,'');const out=JSON.parse(result.stdout);assert.equal(out.hookSpecificOutput.hookEventName,'PreToolUse');assert.equal(decision(out),'deny');
});
function assignment(){
 const a=setup('orchestrator','assign-agent');a.s.approvals[0].scope.operations.push('read','write');a.s.approvals[0].scope.roles=['implementer'];
 a.s.documents=['spec','plan'].map(kind=>({kind,path:`/workspace/${kind}.md`,gitPath:`${kind}.md`,contentHash:'sha256:'+'a'.repeat(64),approvalRef:'approval',commit:'docs'}));
 a.e.provenance[0].correlationRef='platform-call';a.e.provenance[0].requestId='request';
 a.r.descriptor={role:'implementer',taskId:'T1',paths:['/workspace/file'],operations:['read','write'],approvalRef:'approval',correlationRef:'platform-call'};
 const fact=(kind,data)=>({kind,workflowId:a.s.workflowId,revision:a.s.revision,target:a.s.target,policyHash:a.s.versions.policyHash,sourceRef:'obs',data});
 a.e.facts=[fact('docs-commit',{commit:'docs',parent:'base',tree:'tree',documents:a.s.documents,paths:['spec.md','plan.md']}),fact('assignment-correlation',{requestId:'request',platform:'claude',...a.r.descriptor})];return a;
}
test('authorized spawn persists pending assignment; mixed docs and reused identity cannot authorize',async()=>{
 const a=assignment();const c=context(a);assert.equal(decision(await api.runClaudeGate(event('Agent'),c)),'allow');
 const stored=JSON.parse(fs.readFileSync(c.statePath));assert.equal(stored.revision,1);assert.equal(stored.assignments.at(-1).status,'pending');assert.equal(stored.assignments.at(-1).actorRef,null);assert.equal(stored.identities.length,1);
 for(const change of [a=>a.e.facts[0].data.paths.push('code.mjs'),a=>a.r.descriptor.actorRef='old-implementer',a=>a.s.documents[0].commit='other']){
  const b=assignment();change(b);assert.equal(decision(await api.runClaudeGate(event('Agent'),context(b))),'deny');
 }
});
test('valid CLI event cannot self supply trusted provider',()=>{
 const forged={...event(),context:context(setup('orchestrator','read'))};
 const result=spawnSync(process.execPath,['claude/skill/hooks/runtime-gate.mjs'],{input:JSON.stringify(forged),encoding:'utf8'});assert.equal(result.status,0);assert.equal(result.stderr,'');assert.equal(decision(JSON.parse(result.stdout)),'deny');
});
test('spawn observation uses approved assignment and native actor, not agent_type role',async()=>{
 const a=assignment();const c=context(a);await api.runClaudeGate(event('Agent'),c);c.state=JSON.parse(fs.readFileSync(c.statePath));
 const observation={actorRef:'child',taskId:'T1',role:'implementer',platform:'claude',observationRef:'spawn-result',eventRef:'spawn-event',correlationRef:'platform-call',assignmentId:'request',paths:['/workspace/file'],operations:['read','write'],approvalRef:'approval',provenance:{source:'platform-event',eventRef:'spawn-event',actorRef:'child',platform:'claude',correlationRef:'platform-call',verification:{status:'verified',verifierRef:'native-provider',sourceRef:'spawn-event'}}};
 c.observeAgent=()=>observation;let transition;
 c.persistObservation=async result=>{transition=result.proposedTransition;};
 assert.deepEqual(await api.runClaudeGate({hook_event_name:'SubagentStart',session_id:'session',agent_id:'child',agent_type:'orchestrator'},c),{});
 assert.equal(transition.identities.at(-1).role,'implementer');assert.equal(transition.leases.at(-1).status,'active');
 transition=undefined;observation.actorRef='different';await api.runClaudeGate({hook_event_name:'SubagentStart',session_id:'session',agent_id:'child'},c);assert.equal(transition,undefined);
});

test('native call correlation mismatch cannot reuse an approved request ID',async()=>{
 const a=setup('implementer','write');const c=context(a);assert.equal(decision(await api.runClaudeGate(event(),c)),'allow');
 assert.equal(decision(await api.runClaudeGate({...event(),tool_use_id:'other-call'},c)),'deny');
});

test('failure blocking must be verified for the installed version, never inferred from JSON alone',async()=>{
 for(const failureBlocking of [undefined,{status:'unknown',onFailure:'block'},{status:'unsupported',onFailure:'block',platformVersion:'old',verificationRef:'old'},{status:'verified',platformVersion:'current',verificationRef:'proof'},{status:'verified',onFailure:'block'}]){
  const a=setup('implementer','write');const c=context(a);c.failureBlocking=failureBlocking;assert.equal(decision(await api.runClaudeGate(event(),c)),'deny');
 }
});
test('tool result recording remains observation and does not authorize a request',async()=>{
 const a=setup('implementer','write');const c=context(a);let seen=0;c.recordToolResult=()=>{seen++;};
 assert.deepEqual(await api.runClaudeGate({...event(),hook_event_name:'PostToolUse'},c),{});assert.equal(seen,1);
 assert.deepEqual(JSON.parse(fs.readFileSync(c.statePath)).requests,[]);
 assert.deepEqual(await api.runClaudeGate({...event(),hook_event_name:'PostToolUse',session_id:'forged'},c),{});assert.equal(seen,1);
});
test('rendering allow preserves the host permission flow; hold and failure explicitly deny',()=>{
 assert.deepEqual(api.renderClaudeDecision({decision:'allow'}),{});
 for(const value of [null,{decision:'hold'},{decision:'deny'}])assert.equal(decision(api.renderClaudeDecision(value)),'deny');
});

test('specialist Bash cannot bypass shared Git query restrictions through a read descriptor',async()=>{
 for(const command of ['git commit -m x','git -C /elsewhere status','git $(echo status)','git diff --no-index a b']){
  const a=setup('implementer','read');assert.equal(decision(await api.runClaudeGate({...event('Bash'),tool_input:{command}},context(a))),'deny');
 }
 const a=setup('implementer','read');assert.equal(decision(await api.runClaudeGate({...event('Bash'),tool_input:{command:'git status --short'}},context(a))),'allow');
});
test('failure blocking rejects versions older than the documented onFailure contract',()=>{
 assert.equal(api.claudeFailureBlockingReady({status:'verified',onFailure:'block',platformVersion:'2.1.294',verificationRef:'fixture'}),false);
 assert.equal(api.claudeFailureBlockingReady({status:'verified',onFailure:'block',platformVersion:'2.1.295',verificationRef:'fixture'}),true);
 assert.equal(api.claudeFailureBlockingReady({status:'verified',onFailure:'block',platformVersion:'unknown',verificationRef:'fixture'}),false);
});

function plannerAssignment(kind='initial',intent='substantive'){
 const a=assignment(),stage={id:'spec-draft',workflowId:'workflow',document:{path:'/workspace/file',kind:'spec',phase:'draft'},approvalRef:'approval',inputVersion:1,criteriaVersion:1,scopeVersion:0,criteria:[{id:'C1',status:'open',judgmentRef:'criterion'}],calls:[],pending:null,result:null,review:null,artifacts:[],ready:false};
 a.s.plannerLedger={version:1,stages:[stage]};a.s.approvals[0].scope.roles=['planner'];a.s.approvals[0].scope.operations.push('draft');a.s.approvals[0].scope.plannerStage={document:stage.document,inputVersion:1,criteriaVersion:1,scopeVersion:0};
 a.r.descriptor={role:'planner',taskId:'T1',paths:['/workspace/file'],operations:['draft'],approvalRef:'approval',correlationRef:'platform-call',plannerCall:{stageId:stage.id,kind,intent,criterionIds:[],evidenceRefs:[]}};
 a.e.facts.find(f=>f.kind==='assignment-correlation').data={requestId:'request',platform:'claude',...a.r.descriptor};
 a.e.facts.push({kind:'planner-call',workflowId:'workflow',revision:0,target:a.s.target,policyHash:a.s.versions.policyHash,sourceRef:'obs',data:{stageId:stage.id,inputVersion:1,criteriaVersion:1,scopeVersion:0,artifacts:[]}});return a;
}


// Host result/review fixtures are trusted provider inputs; raw hook JSON never supplies them.
test('local Planner hook drives initial correction further and rejects non-progress work durably',async()=>{
 const crypto=await import('node:crypto'),a=plannerAssignment(),c=context(a),hash=bytes=>'sha256:'+crypto.createHash('sha256').update(bytes).digest('hex');
 const stored=()=>JSON.parse(fs.readFileSync(c.statePath));
 const invoke=async(id,kind,extra={})=>{
  c.state=stored();c.requestId=id;c.toolUseId=id;
  a.r.descriptor.correlationRef='correlation:'+id;a.r.descriptor.plannerCall={stageId:'spec-draft',kind,intent:'substantive',criterionIds:[],evidenceRefs:[],...extra};
  c.evidence=structuredClone(a.e);c.evidence.revision=c.state.revision;
  c.evidence.provenance[0].correlationRef=a.r.descriptor.correlationRef;c.evidence.provenance[0].requestId=id;
  c.evidence.facts=c.evidence.facts.filter(f=>f.kind!=='assignment-correlation'&&f.kind!=='planner-call');
  const fact=(kind,data)=>({kind,workflowId:'workflow',revision:c.state.revision,target:c.state.target,policyHash:c.state.versions.policyHash,sourceRef:'obs',data});
  c.evidence.facts.push(fact('assignment-correlation',{requestId:id,platform:'claude',...structuredClone(a.r.descriptor)}),fact('planner-call',{stageId:'spec-draft',inputVersion:1,criteriaVersion:1,scopeVersion:0,artifacts:c.state.plannerLedger.stages[0].artifacts}));
  const response=await api.runClaudeGate({...event('Agent'),tool_use_id:id},c);return decision(response);
 };
 const confirmIncomplete=id=>{
  const s=stored(),stage=s.plannerLedger.stages[0],call=stage.calls.find(call=>call.requestId===id);call.status='succeeded';stage.pending=null;
  for(const purpose of ['draft','self-review'])stage.artifacts.push({ref:purpose+':'+id,stageId:stage.id,path:'/workspace/'+purpose+'-'+id+'.md',purpose,hash:hash(purpose+id),criterionIds:['C1'],verification:{status:'verified',source:'local-bytes'}});
  stage.result={ref:'result:'+id,requestId:id,status:'succeeded',artifactRef:'draft:'+id,selfReviewRef:'self-review:'+id,source:'operator-attested'};
  stage.review={ref:'review:'+id,resultRef:'result:'+id,criteriaVersion:1,full:true,complete:false,source:'operator-attested'};stage.ready=false;fs.writeFileSync(c.statePath,JSON.stringify(s));return stage.review.ref;
 };
 assert.equal(await invoke('first','initial'),'allow');assert.equal(stored().plannerLedger.stages[0].pending,'first');const firstReview=confirmIncomplete('first');
 for(const intent of ['format-only','re-expression-only','save-error-only','patch-error-only']){assert.equal(await invoke('reject:'+intent,'correction',{intent,reviewRef:firstReview}),'deny');assert.equal(stored().plannerLedger.stages[0].calls.length,1);assert.equal(stored().plannerLedger.stages[0].pending,null);}
 assert.equal(await invoke('fix','correction',{reviewRef:firstReview}),'allow');assert.equal(stored().plannerLedger.stages[0].pending,'fix');const reviewRef=confirmIncomplete('fix');
 assert.equal(await invoke('second-correction','correction',{reviewRef}),'deny');assert.equal(await invoke('no-progress','further',{reviewRef,criterionIds:['C1']}),'deny');
 const inputFile=path.join(path.dirname(c.statePath),'meaningful-input.md');fs.writeFileSync(inputFile,'new evidence for the unresolved criterion');const bytes=fs.readFileSync(inputFile),inputHash=hash(bytes),s=stored();
 s.plannerLedger.stages[0].artifacts.push({ref:'input:new',stageId:'spec-draft',path:inputFile,purpose:'input',hash:inputHash,criterionIds:['C1'],verification:{status:'verified',source:'local-bytes'},semantic:{meaningful:true,source:'operator-attested',judgmentRef:'review:new-input',targetHash:inputHash}});fs.writeFileSync(c.statePath,JSON.stringify(s));
 assert.equal(await invoke('more','further',{reviewRef,criterionIds:['C1'],evidenceRefs:['input:new']}),'allow');const final=stored().plannerLedger.stages[0];assert.deepEqual(final.calls.map(call=>call.kind),['initial','correction','further']);assert.deepEqual(final.calls[2].evidenceHashes,[inputHash]);assert.equal(final.pending,'more');assert.equal(final.ready,false);assert.equal(final.criteria[0].status,'open');
});
