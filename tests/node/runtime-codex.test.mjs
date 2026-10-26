import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const temporary=[];test.after(()=>{for(const dir of temporary)fs.rmSync(dir,{recursive:true,force:true});});
const api=await import('../../lib/runtime/adapters/codex.mjs').catch(()=>({}));
const state = () => ({schemaVersion:1,workflowId:'workflow',revision:0,versions:{policy:'1',runtime:'1',adapter:'1',policyHash:'sha256:'+ 'a'.repeat(64),runtimeHash:'sha256:'+ 'b'.repeat(64),adapterHash:'sha256:'+ 'c'.repeat(64)},target:{realpath:'/workspace',repository:'repo',worktree:'wt',branch:'main',baseHead:'base',head:'head'},documents:[],approvals:[],tasks:[{id:'T1',status:'pending',paths:['/workspace/file'],dependencies:[],baseCommit:'head',criteria:['criterion'],requiredChecks:[]}],assignments:[],identities:[],leases:[],checks:[],findings:[],acceptances:[],commits:[],audit:[],capabilities:[],requests:[],mode:'plan'});
const request = () => ({requestId:'request',platform:'codex',operation:'read',actorRef:'actor',taskId:'T1',cwd:'/workspace',toolName:'Read',arguments:{},paths:['/workspace/file'],descriptor:{}});

const policy=JSON.parse(fs.readFileSync(new URL('../../lib/policy/role-policy.json',import.meta.url)));
function setup(role,operation){const s=state();s.identities=[{actorRef:'actor',role,taskId:'T1',observationRef:'obs'}];s.leases=[{actorRef:'actor',taskId:'T1',status:'active'}];s.assignments=[{actorRef:'actor',taskId:'T1',role,paths:['/workspace/file'],operations:[operation],approvalRef:'approval'}];s.approvals=[{id:'approval',source:'user-message',messageRef:'message',contentHash:'sha256:'+'a'.repeat(64),scope:{taskId:'T1',target:'/workspace',operations:[operation],paths:['/workspace/file']}}];return {s,r:{...request(),operation},e:{observedAt:'2026-10-20T00:00:00Z',target:s.target,revision:s.revision,versions:s.versions,resolvedPaths:[{path:'/workspace',realpath:'/workspace'},{path:'/workspace/file',realpath:'/workspace/file'}],provenance:[{id:'obs',source:'platform-event',eventRef:'event',actorRef:'actor',platform:'codex',verification:{status:'verified',verifierRef:'platform-provider',sourceRef:'event'}},{id:'approval',source:'user-message',messageRef:'message',contentHash:'sha256:'+'a'.repeat(64),verification:{status:'verified',verifierRef:'message-provider',sourceRef:'message'}}]}};}

const event=(tool='Read')=>({hook_event_name:'PreToolUse',session_id:'session',tool_name:tool,tool_input:{role:'orchestrator',actorRef:'fake'},tool_use_id:'call',cwd:'/workspace'});
function context(a){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'arc-codex-'));temporary.push(dir);const statePath=path.join(dir,'state.json');fs.writeFileSync(statePath,JSON.stringify(a.s));return {statePath,sessionRef:'session',toolUseId:'call',actorRef:'actor',taskId:'T1',requestId:'request',policy,state:a.s,evidence:a.e,describeTool:()=>({operation:a.r.operation,paths:a.r.paths,descriptor:a.r.descriptor})};}
const decision=response=>response.hookSpecificOutput.permissionDecision;
test('six roles use provider identity and common role policy, never tool supplied role',async()=>{
 assert.equal(typeof api.runCodexGate,'function');
 for(const [role,allowed,denied] of [['planner','draft','write'],['scouter','read','operational-query'],['implementer','write','commit'],['qa','read','write'],['reviewer','review','check'],['orchestrator','read','scope-expansion']]){
  const a=setup(role,allowed);assert.equal(decision(await api.runCodexGate(event(),context(a))),'allow',role);
  const b=setup(role,denied);assert.equal(decision(await api.runCodexGate(event(),context(b))),'deny',role);
 }
});
test('retired Implementer remains denied even when event claims orchestrator',async()=>{
 const a=setup('implementer','write');a.s.leases[0].status='retired';assert.equal(decision(await api.runCodexGate(event(),context(a))),'deny');
});
test('missing session identity, malformed inputs, and validator exceptions explicitly deny',async()=>{
 const a=setup('implementer','write');
 for(const input of [null,{},event()])assert.equal(decision(await api.runCodexGate(input,{})),'deny');
 const c=context(a);c.sessionRef='other';assert.equal(decision(await api.runCodexGate(event(),c)),'deny');
 const broken=context(a);broken.describeTool=()=>{throw Error('provider failed');};assert.equal(decision(await api.runCodexGate(event(),broken)),'deny');
});
test('SubagentStart observes identity and cannot return a start blocking success',async()=>{
 assert.deepEqual(await api.runCodexGate({hook_event_name:'SubagentStart',session_id:'session',agent_id:'child',agent_type:'implementer'},{}),{});
 const a=setup('implementer','write');const c=context(a);let calls=0;c.observeAgent=()=>{calls++;return {decision:'deny'};};
 assert.deepEqual(await api.runCodexGate({hook_event_name:'SubagentStart',session_id:'session',agent_id:'child',agent_type:'implementer'},c),{});assert.equal(calls,1);
});
test('followup and existing sessions have no unsupported enforcement claim',async()=>{
 for(const tool of ['followup_task','write_stdin','specialized_tool']){
  const a=setup('orchestrator','read');const normalized=api.normalizeCodexEvent(event(tool),context(a));assert.equal(normalized.coverage.verifiedDeny,false);assert.notEqual(normalized.coverage.status,'supported');
  assert.equal(decision(await api.runCodexGate(event(tool),context(a))),'deny');
 }
});
test('spawn requires Agent matcher, trusted assignment correlation and docs evidence',async()=>{
 const a=setup('orchestrator','assign-agent');a.r.descriptor={role:'implementer',taskId:'T1',paths:['/workspace/file'],operations:['read'],approvalRef:'approval',correlationRef:'call'};
 assert.equal(decision(await api.runCodexGate(event('Agent'),context(a))),'deny');
 assert.equal(api.normalizeCodexEvent(event('spawn_agent'),context(a)).coverage.status,'unknown');
});
test('normalization rejects untrusted semantic mapping and mismatched session',()=>{
 const a=setup('implementer','write');const c=context(a);delete c.describeTool;
 assert.throws(()=>api.normalizeCodexEvent(event(),c));
 assert.throws(()=>api.normalizeCodexEvent({...event(),session_id:'other'},context(a)));
});

function assignment(){
 const a=setup('orchestrator','assign-agent');a.s.approvals[0].scope.operations.push('read','write');a.s.approvals[0].scope.roles=['implementer'];
 a.s.documents=['spec','plan'].map(kind=>({kind,path:`/workspace/${kind}.md`,gitPath:`${kind}.md`,contentHash:'sha256:'+'a'.repeat(64),approvalRef:'approval',commit:'docs'}));
 a.e.provenance[0].correlationRef='platform-call';a.e.provenance[0].requestId='request';
 a.r.descriptor={role:'implementer',taskId:'T1',paths:['/workspace/file'],operations:['read','write'],approvalRef:'approval',correlationRef:'platform-call'};
 const fact=(kind,data)=>({kind,workflowId:a.s.workflowId,revision:a.s.revision,target:a.s.target,policyHash:a.s.versions.policyHash,sourceRef:'obs',data});
 a.e.facts=[fact('docs-commit',{commit:'docs',parent:'base',tree:'tree',documents:a.s.documents,paths:['spec.md','plan.md']}),fact('assignment-correlation',{requestId:'request',platform:'codex',...a.r.descriptor})];return a;
}
test('authorized spawn persists pending assignment; mixed docs and reused identity cannot authorize',async()=>{
 const a=assignment();const c=context(a);assert.equal(decision(await api.runCodexGate(event('Agent'),c)),'allow');
 const stored=JSON.parse(fs.readFileSync(c.statePath));assert.equal(stored.revision,1);assert.equal(stored.assignments.at(-1).status,'pending');assert.equal(stored.assignments.at(-1).actorRef,null);assert.equal(stored.identities.length,1);
 for(const change of [a=>a.e.facts[0].data.paths.push('code.mjs'),a=>a.r.descriptor.actorRef='old-implementer',a=>a.s.documents[0].commit='other']){
  const b=assignment();change(b);assert.equal(decision(await api.runCodexGate(event('Agent'),context(b))),'deny');
 }
});

test('spawn observation uses approved assignment and native actor, not agent_type role',async()=>{
 const a=assignment();const c=context(a);await api.runCodexGate(event('Agent'),c);c.state=JSON.parse(fs.readFileSync(c.statePath));
 const observation={actorRef:'child',taskId:'T1',role:'implementer',platform:'codex',observationRef:'spawn-result',eventRef:'spawn-event',correlationRef:'platform-call',assignmentId:'request',paths:['/workspace/file'],operations:['read','write'],approvalRef:'approval',provenance:{source:'platform-event',eventRef:'spawn-event',actorRef:'child',platform:'codex',correlationRef:'platform-call',verification:{status:'verified',verifierRef:'native-provider',sourceRef:'spawn-event'}}};
 c.observeAgent=()=>observation;let transition;
 c.persistObservation=async result=>{transition=result.proposedTransition;};
 assert.deepEqual(await api.runCodexGate({hook_event_name:'SubagentStart',session_id:'session',agent_id:'child',agent_type:'orchestrator'},c),{});
 assert.equal(transition.identities.at(-1).role,'implementer');assert.equal(transition.leases.at(-1).status,'active');
 transition=undefined;observation.actorRef='different';await api.runCodexGate({hook_event_name:'SubagentStart',session_id:'session',agent_id:'child'},c);assert.equal(transition,undefined);
});

test('native call correlation mismatch cannot reuse an approved request ID',async()=>{
 const a=setup('implementer','write');const c=context(a);assert.equal(decision(await api.runCodexGate(event(),c)),'allow');
 assert.equal(decision(await api.runCodexGate({...event(),tool_use_id:'other-call'},c)),'deny');
});

function plannerAssignment(kind='initial',intent='substantive'){
 const a=assignment(),stage={id:'spec-draft',workflowId:'workflow',document:{path:'/workspace/file',kind:'spec',phase:'draft'},approvalRef:'approval',inputVersion:1,criteriaVersion:1,scopeVersion:0,criteria:[{id:'C1',status:'open',judgmentRef:'criterion'}],calls:[],pending:null,result:null,review:null,artifacts:[],ready:false};
 a.s.plannerLedger={version:1,stages:[stage]};a.s.approvals[0].scope.roles=['planner'];a.s.approvals[0].scope.operations.push('draft');a.s.approvals[0].scope.plannerStage={document:stage.document,inputVersion:1,criteriaVersion:1,scopeVersion:0};
 a.r.descriptor={role:'planner',taskId:'T1',paths:['/workspace/file'],operations:['draft'],approvalRef:'approval',correlationRef:'platform-call',plannerCall:{stageId:stage.id,kind,intent,criterionIds:[],evidenceRefs:[]}};
 a.e.facts.find(f=>f.kind==='assignment-correlation').data={requestId:'request',platform:'codex',...a.r.descriptor};
 a.e.facts.push({kind:'planner-call',workflowId:'workflow',revision:0,target:a.s.target,policyHash:a.s.versions.policyHash,sourceRef:'obs',data:{stageId:stage.id,inputVersion:1,criteriaVersion:1,scopeVersion:0,artifacts:[]}});return a;
}
test('planner local hook atomically reserves its ledger and native assignment',async()=>{
 const a=plannerAssignment(),c=context(a);assert.equal(decision(await api.runCodexGate(event('spawn_agent'),c)),'allow');
 const saved=JSON.parse(fs.readFileSync(c.statePath));assert.equal(saved.plannerLedger.stages[0].pending,'request');assert.equal(saved.plannerLedger.stages[0].calls.length,1);assert.equal(saved.assignments.at(-1).plannerStageId,'spec-draft');
 assert.equal(decision(await api.runCodexGate(event('spawn_agent'),c)),'deny');assert.equal(JSON.parse(fs.readFileSync(c.statePath)).plannerLedger.stages[0].calls.length,1);
});
test('planner native spawn cannot bypass missing history, stale evidence or non-progress intent',async()=>{
 for(const mutate of [a=>delete a.s.plannerLedger,a=>a.e.facts=a.e.facts.filter(f=>f.kind!=='planner-call'),a=>a.e.facts.find(f=>f.kind==='planner-call').data.criteriaVersion=2,a=>delete a.s.approvals[0].scope.plannerStage,a=>a.r.descriptor.plannerCall.intent='format-only']){
  const a=plannerAssignment();mutate(a);a.e.facts.find(f=>f.kind==='assignment-correlation').data={requestId:'request',platform:'codex',...a.r.descriptor};const c=context(a);assert.equal(decision(await api.runCodexGate(event('Agent'),c)),'deny');assert.equal(JSON.parse(fs.readFileSync(c.statePath)).assignments.length,1);
 }
});
test('planner observer correlates exact provider assignment while replay preserves the call reservation',async()=>{
 const a=plannerAssignment(),c=context(a);await api.runCodexGate(event('Agent'),c);c.state=JSON.parse(fs.readFileSync(c.statePath));
 const observation={actorRef:'child',taskId:'T1',role:'planner',platform:'codex',observationRef:'spawn-result',eventRef:'spawn-event',correlationRef:'platform-call',assignmentId:'request',paths:['/workspace/file'],operations:['draft'],approvalRef:'approval',provenance:{source:'platform-event',eventRef:'spawn-event',actorRef:'child',platform:'codex',correlationRef:'platform-call',verification:{status:'verified',verifierRef:'native-provider-fixture',sourceRef:'spawn-event'}}};
 c.observeAgent=()=>observation;const input={hook_event_name:'SubagentStart',session_id:'session',agent_id:'child',agent_type:'orchestrator'};
 assert.deepEqual(await api.runCodexGate(input,c),{});const saved=JSON.parse(fs.readFileSync(c.statePath));assert.equal(saved.assignments.at(-1).status,'active');assert.equal(saved.plannerObservations[0].classification,'correlated');assert.equal(saved.identities.at(-1).role,'planner');assert.equal(saved.plannerLedger.stages[0].pending,'request');assert.equal(saved.plannerLedger.stages[0].ready,false);
 assert.deepEqual(await api.runCodexGate(input,c),{});assert.equal(JSON.parse(fs.readFileSync(c.statePath)).plannerObservations.length,1);
});
test('planner observer audits missing and forged correlation without inferring the only pending assignment',async()=>{
 for(const proof of [undefined,{actorRef:'child',role:'planner',platform:'codex',provenance:{source:'platform-event'}}]){
  const a=plannerAssignment(),c=context(a);await api.runCodexGate(event('Agent'),c);c.state=JSON.parse(fs.readFileSync(c.statePath));c.observeAgent=()=>proof;
  assert.deepEqual(await api.runCodexGate({hook_event_name:'SubagentStart',session_id:'session',agent_id:'child',agent_type:'planner'},c),{});const saved=JSON.parse(fs.readFileSync(c.statePath));assert.equal(saved.assignments.at(-1).status,'pending');assert.equal(saved.plannerObservations[0].classification,'uncorrelated');assert.equal(saved.plannerObservations[0].identityVerified,false);assert.equal(saved.identities.length,1);
 }
});


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
  c.evidence.facts.push(fact('assignment-correlation',{requestId:id,platform:'codex',...structuredClone(a.r.descriptor)}),fact('planner-call',{stageId:'spec-draft',inputVersion:1,criteriaVersion:1,scopeVersion:0,artifacts:c.state.plannerLedger.stages[0].artifacts}));
  const response=await api.runCodexGate({...event('Agent'),tool_use_id:id},c);return decision(response);
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
