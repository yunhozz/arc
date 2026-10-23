import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const state = () => ({schemaVersion:1,workflowId:'workflow',revision:0,versions:{policy:'1',runtime:'1',adapter:'1',policyHash:'sha256:'+ 'a'.repeat(64),runtimeHash:'sha256:'+ 'b'.repeat(64),adapterHash:'sha256:'+ 'c'.repeat(64)},target:{realpath:'/workspace',repository:'repo',worktree:'wt',branch:'main',baseHead:'base',head:'head'},documents:[],approvals:[],tasks:[{id:'T1',status:'pending',paths:['/workspace/file'],dependencies:[],baseCommit:'head',criteria:['criterion'],requiredChecks:[]}],assignments:[],identities:[],leases:[],checks:[],findings:[],acceptances:[],commits:[],audit:[],capabilities:[],requests:[],mode:'plan'});
const request = () => ({requestId:'request',platform:'codex',operation:'read',actorRef:'actor',taskId:'T1',cwd:'/workspace',toolName:'Read',arguments:{},paths:['/workspace/file'],descriptor:{}});

const api=await import('../../lib/runtime/evaluate.mjs').catch(()=>({}));
const identity=await import('../../lib/runtime/identity.mjs').catch(()=>({}));
const policy=JSON.parse(fs.readFileSync(new URL('../../lib/policy/role-policy.json',import.meta.url)));
function setup(role,operation){const s=state();s.identities=[{actorRef:'actor',role,taskId:'T1',observationRef:'obs'}];s.leases=[{actorRef:'actor',taskId:'T1',status:'active'}];s.assignments=[{actorRef:'actor',taskId:'T1',role,paths:['/workspace/file'],operations:[operation],approvalRef:'approval'}];s.approvals=[{id:'approval',source:'user-message',messageRef:'message',contentHash:'sha256:'+'a'.repeat(64),scope:{taskId:'T1',target:'/workspace',operations:[operation],paths:['/workspace/file']}}];return {s,r:{...request(),operation},e:{observedAt:'2026-10-20T00:00:00Z',target:s.target,revision:s.revision,versions:s.versions,resolvedPaths:[{path:'/workspace',realpath:'/workspace'},{path:'/workspace/file',realpath:'/workspace/file'}],provenance:[{id:'obs',source:'platform-event',eventRef:'event',actorRef:'actor',platform:'codex',verification:{status:'verified',verifierRef:'platform-provider',sourceRef:'event'}},{id:'approval',source:'user-message',messageRef:'message',contentHash:'sha256:'+'a'.repeat(64),verification:{status:'verified',verifierRef:'message-provider',sourceRef:'message'}}]}};}
test('six roles allow assigned operations and deny independent role violations',()=>{
 assert.equal(typeof api.evaluate,'function');
 for(const [role,allowed,denied] of [['planner','draft','write'],['scouter','read','operational-query'],['implementer','write','commit'],['qa','check','write'],['reviewer','review','check'],['orchestrator','read','scope-expansion']]) {
  const a=setup(role,allowed);if(allowed==='check'){a.s.assignments[0].checks=[{executable:'/bin/check',args:[],cwd:'/workspace',env:{},outputs:[]}];a.r.descriptor=a.s.assignments[0].checks[0];}assert.equal(api.evaluate(policy,a.s,a.r,a.e).decision,'allow',role);
  const d=setup(role,denied);assert.equal(api.evaluate(policy,d.s,d.r,d.e).decision,'deny',role);
  assert.equal(api.evaluate(policy,a.s,a.r,{provenance:[]}).decision,'hold',role+' missing proof');
 }
});
test('self asserted role or approval cannot grant authority and docs commit gates first Implementer',()=>{
 const a=setup('orchestrator','assign-agent');a.r.descriptor={role:'implementer',actorRef:'new',taskId:'T1'};
 assert.equal(api.evaluate(policy,a.s,a.r,a.e).decision,'hold');
 const b=setup('implementer','commit');b.r.role='orchestrator';b.r.approved=true;assert.equal(api.evaluate(policy,b.s,b.r,b.e).decision,'deny');
});
test('temporary QA output is scoped and acceptance Git external actions require evidence',()=>{
 const a=setup('qa','temporary-write');assert.equal(api.evaluate(policy,a.s,a.r,a.e).decision,'hold');a.s.assignments[0].temporary={paths:['/workspace/file'],cleanupOwner:'actor',expiresAt:'2030-01-01T00:00:00Z'};assert.equal(api.evaluate(policy,a.s,a.r,a.e).decision,'allow');
 for(const op of ['accept','commit','push']){const b=setup('orchestrator',op);assert.equal(api.evaluate(policy,b.s,b.r,b.e).decision,'hold');}
 for(const mode of ['small-task','no-plan']){const b=setup('orchestrator','assign-agent');b.s.mode=mode;b.r.descriptor={role:'implementer',actorRef:'new',taskId:'T1'};assert.equal(api.evaluate(policy,b.s,b.r,b.e).decision,'hold');}
});
test('identity never rebinds another task or revives a retired lease',()=>{
 assert.equal(typeof identity.registerAgentObservation,'function');const a=setup('implementer','write');
 assert.equal(identity.registerAgentObservation(a.s,{actorRef:'actor',taskId:'T2',role:'implementer',observationRef:'new'}).decision,'deny');
 a.s.leases[0].status='retired';assert.equal(identity.registerAgentObservation(a.s,{actorRef:'actor',taskId:'T1',role:'implementer',observationRef:'new'}).decision,'deny');
});
function fact(a,kind,data){a.e.facts=[{kind,workflowId:a.s.workflowId,revision:a.s.revision,target:a.s.target,policyHash:a.s.versions.policyHash,sourceRef:'obs',data}];}
test('Orchestrator acceptance and Git allow only exact observed registered evidence',()=>{
 const a=setup('orchestrator','accept');a.s.tasks[0].criteria=['criterion'];a.s.tasks[0].requiredChecks=['check'];a.s.identities.push({actorRef:'qa-agent',role:'qa',taskId:'T1',observationRef:'qa-obs'});a.s.checks=[{id:'check',taskId:'T1',status:'passed',fingerprint:'diff',actorRef:'qa-agent',resultRef:'obs'}];a.r.descriptor={fingerprint:'diff',criteria:['criterion'],checkIds:['check'],findingIds:[]};fact(a,'acceptance',a.r.descriptor);assert.equal(api.evaluate(policy,a.s,a.r,a.e).decision,'allow');
 const b=setup('orchestrator','commit');b.s.acceptances=[{taskId:'T1',actorRef:'actor',fingerprint:'diff',criteria:['criterion'],checkIds:['check'],findingIds:[]}];b.s.tasks[0].status='accepted';b.r.descriptor={fingerprint:'diff',parent:'head',indexTree:'tree',kind:'task',paths:['file']};fact(b,'git-index',b.r.descriptor);assert.equal(api.evaluate(policy,b.s,b.r,b.e).decision,'allow');b.e.facts[0].revision=9;assert.equal(api.evaluate(policy,b.s,b.r,b.e).decision,'hold');
});
test('first Implementer assignment needs complete document hashes approvals and docs-only Git fact',()=>{
 const a=assign();assert.equal(api.evaluate(policy,a.s,a.r,a.e).decision,'allow');
 a.e.facts[0].data.paths.push('implementation.mjs');assert.equal(api.evaluate(policy,a.s,a.r,a.e).decision,'hold');
});
test('unverified provenance and escaped realpaths never grant authority',()=>{
 const a=setup('implementer','write');delete a.e.provenance[0].verification;assert.equal(api.evaluate(policy,a.s,a.r,a.e).decision,'hold');
 const b=setup('implementer','write');b.e.resolvedPaths[1].realpath='/workspace-other/file';assert.equal(api.evaluate(policy,b.s,b.r,b.e).decision,'deny');
});
test('expired temporary assignments and invalid policy cannot allow requests',()=>{
 const a=setup('qa','temporary-write');a.s.assignments[0].temporary={paths:['/workspace/file'],cleanupOwner:'actor',expiresAt:'2000-01-01T00:00:00Z'};a.e.observedAt='2026-10-20T00:00:00Z';assert.equal(api.evaluate(policy,a.s,a.r,a.e).decision,'hold');
 const b=setup('implementer','write');assert.equal(api.evaluate({...policy,runtime:{schemaVersion:1}},b.s,b.r,b.e).decision,'hold');
});

function assign(){
 const a=setup('orchestrator','assign-agent');a.s.approvals[0].scope.operations.push('read','write');a.s.approvals[0].scope.roles=['implementer'];
 a.s.documents=['spec','plan'].map(kind=>({kind,path:`/workspace/${kind}.md`,gitPath:`${kind}.md`,contentHash:'sha256:'+'a'.repeat(64),approvalRef:'approval',commit:'docs'}));
 a.e.provenance[0].correlationRef='platform-call';a.e.provenance[0].requestId=a.r.requestId;
 a.r.descriptor={role:'implementer',taskId:'T1',paths:['/workspace/file'],operations:['read','write'],approvalRef:'approval',correlationRef:'platform-call'};
 fact(a,'docs-commit',{commit:'docs',parent:'base',tree:'tree',documents:a.s.documents,paths:['spec.md','plan.md']});
 a.e.facts.push({kind:'assignment-correlation',workflowId:a.s.workflowId,revision:a.s.revision,target:a.s.target,policyHash:a.s.versions.policyHash,sourceRef:'obs',data:{requestId:a.r.requestId,platform:'codex',...a.r.descriptor}});
 return a;
}
function observed(pending){return {actorRef:'spawned-agent',taskId:'T1',role:'implementer',platform:'codex',observationRef:'spawn-result',eventRef:'host-spawn-event',correlationRef:'platform-call',assignmentId:'request',paths:['/workspace/file'],operations:['read','write'],approvalRef:'approval',provenance:{source:'platform-event',eventRef:'host-spawn-event',actorRef:'spawned-agent',platform:'codex',correlationRef:'platform-call',verification:{status:'verified',verifierRef:'native-provider',sourceRef:'host-spawn-event'}}};}
test('authorized assignment records pending only and matching host observation activates identity and lease',()=>{
 const a=assign();const decision=api.evaluate(policy,a.s,a.r,a.e);assert.equal(decision.decision,'allow');assert.ok(decision.proposedTransition);
 const pending=decision.proposedTransition.assignments.find(x=>x.assignmentId==='request');assert.equal(pending.status,'pending');assert.equal(pending.actorRef,null);assert.equal(decision.proposedTransition.identities.length,1);assert.equal(decision.proposedTransition.leases.length,1);
 const result=identity.registerAgentObservation(decision.proposedTransition,observed());assert.equal(result.decision,'allow');assert.equal(result.state.identities.find(x=>x.actorRef==='spawned-agent').taskId,'T1');assert.equal(result.state.leases.find(x=>x.actorRef==='spawned-agent').status,'active');assert.equal(result.state.assignments.find(x=>x.assignmentId==='request').status,'active');
});
test('missing correlation or mismatched approved assignment scope never creates authority',()=>{
 for(const mutate of [a=>a.e.facts.pop(),a=>a.e.provenance[0].correlationRef='wrong',a=>delete a.e.provenance[0].requestId,a=>a.r.descriptor.actorRef='arbitrary',a=>a.r.descriptor.paths=['/workspace/other'],a=>a.r.descriptor.operations=['commit'],a=>a.r.descriptor.approvalRef='other',a=>a.r.descriptor.role='qa']){const a=assign();mutate(a);const result=api.evaluate(policy,a.s,a.r,a.e);assert.notEqual(result.decision,'allow');assert.equal(result.proposedTransition,null);}
 const a=assign();const pending=api.evaluate(policy,a.s,a.r,a.e).proposedTransition;assert.ok(pending);
 for(const mutate of [o=>delete o.provenance,o=>o.correlationRef='wrong',o=>o.assignmentId='wrong',o=>o.taskId='T2',o=>o.role='qa',o=>o.paths=['/workspace/other'],o=>o.operations=['commit'],o=>o.approvalRef='other',o=>o.platform='claude',o=>delete o.eventRef]){const o=observed();mutate(o);assert.notEqual(identity.registerAgentObservation(pending,o).decision,'allow');assert.equal(pending.identities.length,1);}
});
test('document approval provenance must match both issuing source and message verification',()=>{
 for(const mutate of [p=>p.source='human-confirmation',p=>p.verification.sourceRef='another-message']){const a=assign();a.s.approvals.push({...a.s.approvals[0],id:'doc-approval',messageRef:'doc-message'});for(const d of a.s.documents)d.approvalRef='doc-approval';a.e.facts[0].data.documents=a.s.documents;const p={...structuredClone(a.e.provenance[1]),id:'doc-approval',messageRef:'doc-message',verification:{status:'verified',verifierRef:'message-provider',sourceRef:'doc-message'}};mutate(p);a.e.provenance.push(p);assert.equal(api.evaluate(policy,a.s,a.r,a.e).decision,'hold');}
});
test('assignment correlation provenance verification must reference its exact platform event',()=>{
 const a=assign();
 const unrelated={...structuredClone(a.e.provenance[0]),id:'unrelated-correlation',eventRef:'different-platform-event',verification:{status:'verified',verifierRef:'platform-provider',sourceRef:'unrelated-verification-event'}};
 a.e.provenance.push(unrelated);
 a.e.facts.find(f=>f.kind==='assignment-correlation').sourceRef=unrelated.id;
 const decision=api.evaluate(policy,a.s,a.r,a.e);
 assert.equal(decision.decision,'hold');assert.equal(decision.proposedTransition,null);
});

test('docs preflight precedes implementation acceptance and rejects unsafe or mixed paths',()=>{
 const a=setup('orchestrator','commit');a.s.documents=['spec','plan'].map(kind=>({kind,path:`/workspace/${kind}.md`,gitPath:`${kind}.md`,contentHash:'sha256:'+'a'.repeat(64),approvalRef:'approval'}));
 a.r.paths=a.s.documents.map(d=>d.path);a.s.assignments[0].paths=['/workspace'];a.s.approvals[0].scope.paths=['/workspace'];a.e.resolvedPaths.push(...a.r.paths.map(p=>({path:p,realpath:p})));
 a.r.descriptor={kind:'documents',parent:'head',indexTree:'tree',fingerprint:'diff',paths:['spec.md','plan.md']};fact(a,'git-index',a.r.descriptor);assert.equal(api.evaluate(policy,a.s,a.r,a.e).decision,'allow');
 for(const paths of [['spec.md','file'],['../spec.md','plan.md'],['/workspace/spec.md','plan.md']]){a.r.descriptor.paths=paths;assert.notEqual(api.evaluate(policy,a.s,a.r,a.e).decision,'allow');}
});

test('durable replay uses current evaluator lease task policy scope and evidence',async t=>{
 const fsp=await import('node:fs/promises');const os=await import('node:os');const path=await import('node:path');const {transactWorkflow,fingerprintRequest}=await import('../../lib/runtime/store.mjs');
 const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'arc-authority-replay-'));t.after(()=>fsp.rm(dir,{recursive:true,force:true}));
 for(const [name,mutate] of [['retired',a=>a.s.leases[0].status='retired'],['accepted task',a=>a.s.tasks[0].status='accepted'],['policy',a=>a.p={runtime:{schemaVersion:2}}],['scope',a=>a.s.approvals[0].scope.paths=['/workspace/other']],['evidence',a=>a.e.provenance=[]]]){
  const a=setup('implementer','write');a.p=policy;const statePath=path.join(dir,name+'.json');await fsp.writeFile(statePath,JSON.stringify(a.s));
  const args={statePath,expectedRevision:0,requestId:a.r.requestId,request:a.r,requestFingerprint:fingerprintRequest(a.r),decide:s=>api.evaluate(a.p,s,a.r,{...a.e,target:s.target,revision:s.revision,versions:s.versions})};
  assert.equal((await transactWorkflow(args)).decision.decision,'allow');a.s=JSON.parse(await fsp.readFile(statePath));mutate(a);await fsp.writeFile(statePath,JSON.stringify(a.s));const before=await fsp.readFile(statePath,'utf8');
  const replay=await transactWorkflow(args);assert.notEqual(replay.decision.decision,'allow',name);assert.equal(replay.replayed,true);assert.equal(await fsp.readFile(statePath,'utf8'),before);
 }
});

test('cooperative evaluator does not accept free-form check/review claims or broaden omission support',async()=>{
 const {initializeCooperativeWorkflow}=await import('../../lib/runtime/bootstrap.mjs');
 const {runCooperativeCommand}=await import('../../lib/runtime/cooperative.mjs');
 const fs=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path');
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'arc-verification-evaluate-')));
 try{const cwd=path.join(root,'workspace'),common=path.join(root,'common');await fs.mkdir(cwd);await fs.mkdir(common);
 const target={realpath:cwd,gitCommonDir:common,gitDir:common,head:'a'.repeat(40),branch:'main'},args={cwd,workflowId:'claims',observe:async()=>target};
 await initializeCooperativeWorkflow({...args,input:{mode:'plan',actor:{id:'operator'},selection:{messageRef:'target',contentHash:'sha256:'+'a'.repeat(64)}}});
 for(const [index,kind] of ['check','review'].entries()){
 const r=await runCooperativeCommand({...args,command:'record',input:{requestId:'claim'+index,expectedRevision:index,actor:{id:'operator',role:'orchestrator'},evidence:{kind,messageRef:'claim',data:{verdict:'proven'}}}});assert.equal(r.decision,'hold');assert.deepEqual(r.ruleIds,['cooperative.unsupported']);
 }
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('cooperative external authorization never changes trusted external provenance requirements',()=>{
 const a=setup('orchestrator','push');a.r.descriptor={repository:'repo',destination:'origin'};a.s.records=[{kind:'external-approval',source:'operator-attested',messageRef:'operator',data:{operation:'push'}}];
 assert.equal(api.evaluate(policy,a.s,a.r,a.e).decision,'hold');
});

test('unsupported implementation identity cannot gain authority',()=>{
 const a=setup('unknown','write');const before=structuredClone(a.s);
 assert.notEqual(api.evaluate(policy,a.s,a.r,a.e).decision,'allow');assert.deepEqual(a.s,before);
});
test('unsupported pending assignment cannot bind a canonical identity',()=>{
 const a=assign(),pending=api.evaluate(policy,a.s,a.r,a.e).proposedTransition;pending.assignments.at(-1).role='unknown';
 const observation=observed();observation.role='implementer';const before=structuredClone(pending);
 assert.throws(()=>identity.registerAgentObservation(pending,observation),/Runtime schema: assignment/);assert.deepEqual(pending,before);
});
