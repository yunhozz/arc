import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const temporary=[];test.after(()=>{for(const dir of temporary)fs.rmSync(dir,{recursive:true,force:true});});
import {spawnSync} from 'node:child_process';
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
test('CLI malformed input outputs only one native deny JSON',()=>{
 const result=spawnSync(process.execPath,['codex/skill/hooks/runtime-gate.mjs'],{input:'{broken',encoding:'utf8'});
 assert.equal(result.status,0);assert.equal(result.stderr,'');const out=JSON.parse(result.stdout);assert.equal(out.hookSpecificOutput.hookEventName,'PreToolUse');assert.equal(decision(out),'deny');
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
test('valid CLI event cannot self supply trusted provider',()=>{
 const forged={...event(),context:context(setup('orchestrator','read'))};
 const result=spawnSync(process.execPath,['codex/skill/hooks/runtime-gate.mjs'],{input:JSON.stringify(forged),encoding:'utf8'});assert.equal(result.status,0);assert.equal(result.stderr,'');assert.equal(decision(JSON.parse(result.stdout)),'deny');
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
