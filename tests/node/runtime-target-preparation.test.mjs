import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as api from '../../lib/runtime/cooperative.mjs';
import * as bootstrap from '../../lib/runtime/bootstrap.mjs';
import {evaluateTargetPreparation} from '../../lib/runtime/target-preparation.mjs';
import * as preparation from '../../lib/runtime/target-preparation.mjs';
import {readCooperativeChanges} from '../../lib/runtime/verification.mjs';

test('preservation snapshot uses relative paths, indexed modes and observed working bytes',async t=>{
 const f=await fixture(t);await fs.writeFile(path.join(f.cwd,'spec.md'),'draft');
 const gitRunner=async({args})=>({status:0,stdout:Buffer.from(args.includes('--stage')?'100644 '+'a'.repeat(40)+' 0\tspec.md\0':'spec.md\0')});
 const result=await readCooperativeChanges({state:{target:f.target,tasks:[]},gitRunner});
 assert.deepEqual(result.transitionSnapshot,{index:[{path:'spec.md',mode:'100644',blob:'a'.repeat(40),stage:0}],files:[{path:'spec.md',mode:0o644,hash:'sha256:7743ce348d9284d677a185f33295b92266cc435a5b5f775029b300066d26693a'}]});
});
test('branch preservation is established by matching stored content snapshot, not target fingerprint',async t=>{
 const f=await fixture(t),snapshot={index:[],files:[]},changed={index:[],files:[{path:'other',deleted:true}]};
 const state={target:f.target,tasks:[]},destination={...f.target,branch:'feature'};
 const options={state,targetIntent:{sourceFingerprint:'sha256:'+'c'.repeat(64),sourceSnapshot:snapshot},destination:{realpath:f.cwd},observe:async()=>destination,readChanges:async()=>({final:'different',transitionSnapshot:snapshot})};
 assert.equal((await preparation.readTargetPreparationEvidence(options)).source.preserved,true);
 options.readChanges=async()=>({final:'different',transitionSnapshot:changed});
 assert.equal((await preparation.readTargetPreparationEvidence(options)).source.preserved,false);
});
test('worktree registration and operator attachment are independently required',async t=>{
 const f=await fixture(t),worktree=path.join(f.dir,'worktree');await fs.mkdir(worktree);
 const target={...f.target,realpath:worktree,gitDir:path.join(f.dir,'git-worktree'),branch:'feature'},snapshot={index:[],files:[]};
 const state={target:f.target,targetVersion:1,tasks:[],records:[{kind:'note',messageRef:'attachment',targetVersion:1,source:'operator-attested',data:{type:'worktree-attachment',realpath:worktree,gitDir:target.gitDir,gitCommonDir:target.gitCommonDir}}]};
 const opts={state,targetIntent:{sourceSnapshot:snapshot},destination:{realpath:worktree,attachmentRef:'attachment'},observe:async cwd=>cwd===f.cwd?f.target:target,readChanges:async()=>({final:'hash',transitionSnapshot:snapshot}),gitRunner:async()=>({status:0,stdout:Buffer.from(`worktree ${f.cwd}\0HEAD ${f.target.head}\0branch refs/heads/main\0\0worktree ${worktree}\0HEAD ${target.head}\0branch refs/heads/feature\0\0`)})};
 let evidence=await preparation.readTargetPreparationEvidence(opts);
 assert.equal(evidence.destination.registered,true);assert.equal(evidence.destination.attachmentRef,'attachment');
 opts.gitRunner=async()=>({status:0,stdout:Buffer.from(`worktree ${f.cwd}\0HEAD ${f.target.head}\0branch refs/heads/main\0\0`)});
 evidence=await preparation.readTargetPreparationEvidence(opts);assert.equal(evidence.destination.registered,false);
 opts.state=structuredClone(state);opts.state.records=[];
 evidence=await preparation.readTargetPreparationEvidence(opts);assert.equal(evidence.destination.attachmentRef,undefined);
});
test('worktree snapshot remaps task scopes to destination checkout',async t=>{
 const f=await fixture(t),worktree=path.join(f.dir,'worktree');await fs.mkdir(worktree);
 const target={...f.target,realpath:worktree,gitDir:path.join(f.dir,'git-worktree'),branch:'feature'},snapshot={index:[],files:[]};
 const state={target:f.target,targetVersion:1,tasks:[{id:'task',paths:[path.join(f.cwd,'src')]}],records:[]};
 const readChanges=async({state:s})=>{if(s.target.realpath===worktree)assert.deepEqual(s.tasks[0].paths,[path.join(worktree,'src')]);return {final:'hash',transitionSnapshot:snapshot};};
 await preparation.readTargetPreparationEvidence({state,targetIntent:{sourceSnapshot:snapshot},destination:{realpath:worktree},observe:async cwd=>cwd===f.cwd?f.target:target,readChanges,gitRunner:async()=>({status:0,stdout:Buffer.alloc(0)})});
});

test('all preparation records reject missing required fields and unsafe paths',()=>{
 const records={
  checkpoint:{type:'checkpoint',intentId:'i',stageId:'s',resultRef:'r',selfReviewRef:'review'},
  transition:{type:'transition',intentId:'i',checkpointRef:'c',expectedRevision:1},
  destination:{type:'destination',intentId:'i',transitionRef:'t',stageId:'s',resultRef:'r',selfReviewRef:'self',path:'docs/spec.md',hash:'sha256:'+'a'.repeat(64),mode:0o100644,reviewRef:'review',approvalRef:'approval',targetVersion:2},
 };
 for(const [kind,record] of Object.entries(records)){
  assert.doesNotThrow(()=>preparation.validateTargetPreparationRecord(kind,record));
  const invalid={...record};delete invalid.intentId;
  assert.throws(()=>preparation.validateTargetPreparationRecord(kind,invalid));
 }
 for(const invalid of ['../spec.md','/spec.md','docs/../spec.md','docs//spec.md'])assert.throws(()=>preparation.validateTargetPreparationRecord('destination',{...records.destination,path:invalid}));
 const intent={type:'intent',id:'i',workflowId:'w',sourceTarget:{realpath:'/source',gitCommonDir:'/common',gitDir:'/common',head:'a'.repeat(40),branch:'main'},sourceTargetVersion:1,selectionRef:'selection',kind:'branch',candidate:'feature',base:'a'.repeat(40),firstStageId:'s',documents:[{kind:'spec',path:'spec.md'}]};
 assert.doesNotThrow(()=>preparation.validateTargetPreparationRecord('intent',intent));
 for(const invalid of [{...intent,sourceTarget:{}},{...intent,sourceTargetVersion:0},{...intent,documents:[{kind:'spec',path:'same'},{kind:'plan',path:'same'}]}])assert.throws(()=>preparation.validateTargetPreparationRecord('intent',invalid));
});
test('destination document requires observed bytes and current full review and approval',()=>{
 const hash='sha256:'+'a'.repeat(64),target={realpath:'/dest',gitCommonDir:'/common',gitDir:'/common',head:'b'.repeat(40),branch:'feature'};
 const request={type:'destination',intentId:'i',transitionRef:'transition',stageId:'s',resultRef:'result',selfReviewRef:'self',path:'spec.md',hash,mode:0o100644,reviewRef:'review',approvalRef:'approval',targetVersion:2};
 const state={target,targetVersion:2,targetIntents:[{id:'i',firstStageId:'s',documents:[{kind:'spec',path:'spec.md'}]}],targetCheckpoints:[{intentId:'i',messageRef:'checkpoint',stageId:'s',resultRef:'result',selfReviewRef:'self'}],targetTransitions:[{intentId:'i',checkpointRef:'checkpoint',messageRef:'transition',targetVersion:2,target}],plannerLedger:{stages:[{id:'s',targetIntentId:'i',criteria:[{id:'C1'}],result:{ref:'result',status:'succeeded',chatDraft:{intentId:'i',complete:true,selfReviewRef:'self'}}}]},records:[{kind:'planner-review',messageRef:'review',targetVersion:2,source:'operator-attested',data:{resultRef:'result',full:true,complete:true,hash,criteria:[{id:'C1',status:'resolved',judgmentRef:'judgment'}]}},{kind:'approval',messageRef:'approval',targetVersion:2,source:'operator-attested',data:{kind:'spec',contentHash:hash,path:'spec.md'}}]};
 const evidence={destination:{target,document:{path:'spec.md',hash,mode:0o100644,verification:{status:'verified',source:'local-bytes'}}}};
 state.scopeVersion=0;state.records.forEach(r=>r.scopeVersion=0);state.plannerLedger.stages[0].scopeVersion=0;
 const decision=evaluateTargetPreparation({state,request,evidence});assert.equal(decision.decision,'allow');assert.equal(decision.proposedTransition.destination.sourceLink,'operator-attested');assert.equal(decision.proposedTransition.destination.bytesEqual,undefined);
 const absoluteApproval=structuredClone(state);absoluteApproval.records[1].data.path='/dest/spec.md';assert.equal(evaluateTargetPreparation({state:absoluteApproval,request,evidence}).decision,'allow');
 const staleScope=structuredClone(state);staleScope.scopeVersion=1;assert.equal(evaluateTargetPreparation({state:staleScope,request,evidence}).decision,'hold');
 for(const mutate of [e=>e.destination.document.hash='sha256:'+'b'.repeat(64),e=>e.destination.document.mode=0o100755,e=>e.destination.document.verification.status='unverified']){const copy=structuredClone(evidence);mutate(copy);assert.equal(evaluateTargetPreparation({state,request,evidence:copy}).decision,'hold');}
 for(const mutate of [s=>s.records[0].data.full=false,s=>s.records[1].targetVersion=1,s=>s.plannerLedger.stages[0].result.chatDraft.complete=false]){const copy=structuredClone(state);mutate(copy);assert.equal(evaluateTargetPreparation({state:copy,request,evidence}).decision,'hold');}
});

test('applying a branch transition clones state once and replay has no authority',()=>{
 const source={realpath:'/source',gitCommonDir:'/common',gitDir:'/common',head:'a'.repeat(40),branch:'main'};
 const target={...source,branch:'feature'};
 const state={target,targetVersion:2,targetTransitions:[{intentId:'i'}],plannerLedger:{stages:[{id:'s',ready:false,calls:[{requestId:'c'}]}]},approvals:[{ref:'a'}]};
 const before=structuredClone(state);
 assert.deepEqual(preparation.applyTargetPreparationTransition({state,decision:{decision:'hold'}}),before);
 assert.deepEqual(state,before);
 const stale={decision:'allow',proposedTransition:{target,intentId:'i',checkpointRef:'c',sourceTargetVersion:1}};
 assert.deepEqual(preparation.applyTargetPreparationTransition({state,decision:stale}),before);
 const initial={...structuredClone(state),revision:4,target:source,targetVersion:1,targetTransitions:[],targetIntents:[{id:'i',sourceTargetVersion:1,sourceTarget:source,kind:'branch',candidate:'feature',base:source.head}],targetCheckpoints:[{intentId:'i',messageRef:'c'}]};
 stale.proposedTransition.expectedRevision=4;
 const initialBefore=structuredClone(initial);
 const next=preparation.applyTargetPreparationTransition({state:initial,decision:stale});
 assert.deepEqual(next,initial,'a fabricated allow without observation cannot change target');
 assert.deepEqual(next.plannerLedger,initial.plannerLedger);assert.deepEqual(next.approvals,initial.approvals);
 assert.deepEqual(initial,initialBefore);
});
test('evidence independently observes both workspaces and reads destination bytes',async t=>{
 const f=await fixture(t),destinationDir=path.join(f.dir,'destination');await fs.mkdir(destinationDir);
 const dest={...f.target,realpath:destinationDir,gitDir:path.join(f.dir,'dest-git'),branch:'feature'};
 await fs.writeFile(path.join(destinationDir,'spec.md'),'draft');
 const state={target:f.target,targetVersion:1,tasks:[]};
 const evidence=await preparation.readTargetPreparationEvidence({state,targetIntent:{sourceFingerprint:'sha256:'+'c'.repeat(64)},destination:{realpath:destinationDir,path:'spec.md'},observe:async cwd=>cwd===f.cwd?f.target:dest,readChanges:async()=>({final:'sha256:'+'c'.repeat(64)}),gitRunner:async()=>({status:0,stdout:Buffer.alloc(0)})});
 assert.deepEqual(evidence.source.target,f.target);assert.deepEqual(evidence.destination.target,dest);
 assert.equal(evidence.destination.document.hash,'sha256:7743ce348d9284d677a185f33295b92266cc435a5b5f775029b300066d26693a');
 assert.equal(evidence.destination.document.mode,0o100644);
});
test('destination observation rejects escaping and symlink document paths',async t=>{
 const f=await fixture(t);await fs.writeFile(path.join(f.dir,'outside.md'),'outside');await fs.symlink(path.join(f.dir,'outside.md'),path.join(f.cwd,'link.md'));
 const args={state:{target:f.target,tasks:[]},targetIntent:{},observe:async()=>f.target,readChanges:async()=>({final:'hash'})};
 for(const invalid of ['../outside.md','link.md'])await assert.rejects(preparation.readTargetPreparationEvidence({...args,destination:{realpath:f.cwd,path:invalid}}));
});
async function fixture(t){
 const dir=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'arc-cooperative-')));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const cwd=path.join(dir,'workspace'),gitCommonDir=path.join(dir,'common');await fs.mkdir(cwd);await fs.mkdir(gitCommonDir);
 const target={realpath:cwd,gitCommonDir,gitDir:gitCommonDir,head:'a'.repeat(40),branch:'main'};
 const observe=async()=>({...target});
 const input={mode:'plan',actor:{id:'operator'},selection:{messageRef:'user:target',contentHash:'sha256:'+'b'.repeat(64)}};
 const args={cwd,workflowId:'workflow',input,observe,readChanges:async()=>({final:'sha256:'+'c'.repeat(64),tasks:{},transitionSnapshot:{index:[],files:[]}})};
 const statePath=path.join(gitCommonDir,'arc/workflows/workflow/state.json');
 return {dir,cwd,target,observe,input,args,statePath};
}
async function start(t){const f=await fixture(t);assert.equal(typeof bootstrap.initializeCooperativeWorkflow,'function','bootstrap service must be implemented');await bootstrap.initializeCooperativeWorkflow(f.args);return f;}

test('intent without an approved document set cannot authorize a draft',async t=>{
 const f=await start(t),state=JSON.parse(await fs.readFile(f.statePath,'utf8'));
 const intent={type:'intent',id:'unapproved',workflowId:'workflow',sourceTarget:state.target,sourceTargetVersion:1,selectionRef:'user:target',kind:'branch',candidate:'feature',base:f.target.head,firstStageId:'stage',documents:[{kind:'plan',path:'plan.md'}]};
 const result=await api.runCooperativeCommand({...f.args,command:'record',input:{requestId:'intent:unapproved',expectedRevision:state.revision,actor:{id:'operator',role:'orchestrator'},evidence:{kind:'target-preparation',messageRef:'intent:unapproved',data:intent}}});
 assert.equal(result.decision,'hold');
});

test('intent must match the current approval depth and complete document set',async t=>{
 const f=await start(t),state=JSON.parse(await fs.readFile(f.statePath,'utf8'));
 const documents=[{kind:'spec',path:'spec.md'},{kind:'plan',path:'plan.md'}];
 const send=async(messageRef,data)=>{const s=JSON.parse(await fs.readFile(f.statePath,'utf8'));return api.runCooperativeCommand({...f.args,command:'record',input:{requestId:messageRef,expectedRevision:s.revision,actor:{id:'operator',role:'orchestrator'},evidence:{kind:messageRef==='scope-approval'?'approval':'target-preparation',messageRef,data}}});};
 await send('scope-approval',{targetPreparation:{depth:'Architectural',documents,selectionRef:'user:target',kind:'branch',candidate:'feature',base:f.target.head,workflowId:'workflow',firstStageId:'stage',sourceTarget:state.target,sourceTargetVersion:1}});
 const intent={type:'intent',id:'intent',workflowId:'workflow',sourceTarget:state.target,sourceTargetVersion:1,selectionRef:'user:target',approvalRef:'scope-approval',depth:'Architectural',kind:'branch',candidate:'feature',base:f.target.head,firstStageId:'stage',documents};
 assert.equal((await send('incomplete',{...intent,documents:[documents[1]]})).decision,'hold');
 assert.equal((await send('wrong-depth',{...intent,depth:'Bounded'})).decision,'hold');
 assert.equal((await send('valid',intent)).decision,'allow');
});

test('architectural approval cannot omit the required spec',async t=>{
 const f=await start(t),state=JSON.parse(await fs.readFile(f.statePath,'utf8'));
 const documents=[{kind:'plan',path:'plan.md'}];
 const send=async(kind,messageRef,data)=>{const s=JSON.parse(await fs.readFile(f.statePath,'utf8'));return api.runCooperativeCommand({...f.args,command:'record',input:{requestId:messageRef,expectedRevision:s.revision,actor:{id:'operator',role:'orchestrator'},evidence:{kind,messageRef,data}}});};
 await send('approval','scope-approval',{targetPreparation:{depth:'Architectural',documents,selectionRef:'user:target',kind:'branch',candidate:'feature',base:f.target.head,workflowId:'workflow',firstStageId:'stage',sourceTarget:state.target,sourceTargetVersion:1}});
 const intent={type:'intent',id:'intent',workflowId:'workflow',sourceTarget:state.target,sourceTargetVersion:1,selectionRef:'user:target',approvalRef:'scope-approval',depth:'Architectural',kind:'branch',candidate:'feature',base:f.target.head,firstStageId:'stage',documents};
 assert.equal((await send('target-preparation','intent',intent)).decision,'hold');
});

test('intent cannot change the approved branch candidate',async t=>{
 const f=await start(t),state=JSON.parse(await fs.readFile(f.statePath,'utf8'));
 const documents=[{kind:'spec',path:'spec.md'}];
 const send=async(kind,messageRef,data)=>{const s=JSON.parse(await fs.readFile(f.statePath,'utf8'));return api.runCooperativeCommand({...f.args,command:'record',input:{requestId:messageRef,expectedRevision:s.revision,actor:{id:'operator',role:'orchestrator'},evidence:{kind,messageRef,data}}});};
 await send('approval','scope-approval',{targetPreparation:{depth:'Bounded',documents,selectionRef:'user:target',kind:'branch',candidate:'approved',base:f.target.head,workflowId:'workflow',firstStageId:'stage',sourceTarget:state.target,sourceTargetVersion:1}});
 const intent={type:'intent',id:'intent',workflowId:'workflow',sourceTarget:state.target,sourceTargetVersion:1,selectionRef:'user:target',approvalRef:'scope-approval',depth:'Bounded',kind:'branch',candidate:'different',base:f.target.head,firstStageId:'stage',documents};
 assert.equal((await send('target-preparation','intent',intent)).decision,'hold');
});

test('intent cannot use approval for a different source target version',async t=>{
 const f=await start(t),state=JSON.parse(await fs.readFile(f.statePath,'utf8'));
 const documents=[{kind:'spec',path:'spec.md'}];
 const send=async(kind,messageRef,data)=>{const s=JSON.parse(await fs.readFile(f.statePath,'utf8'));return api.runCooperativeCommand({...f.args,command:'record',input:{requestId:messageRef,expectedRevision:s.revision,actor:{id:'operator',role:'orchestrator'},evidence:{kind,messageRef,data}}});};
 await send('approval','scope-approval',{targetPreparation:{depth:'Bounded',documents,selectionRef:'user:target',kind:'branch',candidate:'feature',base:f.target.head,workflowId:'workflow',firstStageId:'stage',sourceTarget:state.target,sourceTargetVersion:2}});
 const intent={type:'intent',id:'intent',workflowId:'workflow',sourceTarget:state.target,sourceTargetVersion:1,selectionRef:'user:target',approvalRef:'scope-approval',depth:'Bounded',kind:'branch',candidate:'feature',base:f.target.head,firstStageId:'stage',documents};
 assert.equal((await send('target-preparation','intent',intent)).decision,'hold');
});

test('approved bounded plan-only first stage does not require an omitted spec',async t=>{
 const f=await start(t),state=JSON.parse(await fs.readFile(f.statePath,'utf8'));
 const send=async(kind,messageRef,data)=>{const s=JSON.parse(await fs.readFile(f.statePath,'utf8'));return api.runCooperativeCommand({...f.args,command:'record',input:{requestId:messageRef,expectedRevision:s.revision,actor:{id:'operator',role:'orchestrator'},evidence:{kind,messageRef,data}}});};
 const documents=[{kind:'plan',path:'plan.md'}];
 await send('approval','scope-approval',{targetPreparation:{depth:'Bounded',documents,selectionRef:'user:target',kind:'branch',candidate:'feature',base:f.target.head,workflowId:'workflow',firstStageId:'stage',sourceTarget:state.target,sourceTargetVersion:1}});
 const intent={type:'intent',id:'intent',workflowId:'workflow',sourceTarget:state.target,sourceTargetVersion:1,selectionRef:'user:target',approvalRef:'scope-approval',depth:'Bounded',kind:'branch',candidate:'feature',base:f.target.head,firstStageId:'stage',documents};
 assert.equal((await send('target-preparation','intent',intent)).decision,'allow');
 const contract={document:{path:path.join(f.cwd,'plan.md'),kind:'plan',phase:'draft'},inputVersion:1,criteriaVersion:1,scopeVersion:0,targetIntentId:'intent'};
 await send('approval','stage-approval',{plannerStage:contract});
 assert.equal((await send('planner-stage','stage',{id:'stage',...contract,approvalRef:'stage-approval',criteria:[{id:'C1',status:'open',judgmentRef:'criterion'}]})).decision,'allow');
});

test('a required spec must be the first source draft before a plan',async t=>{
 const f=await start(t),state=JSON.parse(await fs.readFile(f.statePath,'utf8'));
 const send=async(kind,messageRef,data)=>{const s=JSON.parse(await fs.readFile(f.statePath,'utf8'));return api.runCooperativeCommand({...f.args,command:'record',input:{requestId:messageRef,expectedRevision:s.revision,actor:{id:'operator',role:'orchestrator'},evidence:{kind,messageRef,data}}});};
 const documents=[{kind:'spec',path:'spec.md'},{kind:'plan',path:'plan.md'}];
 await send('approval','scope-approval',{targetPreparation:{depth:'Architectural',documents,selectionRef:'user:target',kind:'branch',candidate:'feature',base:f.target.head,workflowId:'workflow',firstStageId:'stage',sourceTarget:state.target,sourceTargetVersion:1}});
 const intent={type:'intent',id:'intent',workflowId:'workflow',sourceTarget:state.target,sourceTargetVersion:1,selectionRef:'user:target',approvalRef:'scope-approval',depth:'Architectural',kind:'branch',candidate:'feature',base:f.target.head,firstStageId:'stage',documents};
 assert.equal((await send('target-preparation','intent',intent)).decision,'allow');
 const contract={document:{path:path.join(f.cwd,'plan.md'),kind:'plan',phase:'draft'},inputVersion:1,criteriaVersion:1,scopeVersion:0,targetIntentId:'intent'};
 await send('approval','spec-approval',{kind:'spec'});
 await send('approval','stage-approval',{plannerStage:contract,prerequisiteRefs:['spec-approval']});
 assert.equal((await send('planner-stage','stage',{id:'stage',...contract,approvalRef:'stage-approval',criteria:[{id:'C1',status:'open',judgmentRef:'criterion'}]})).decision,'hold');
});

async function intentStart(t,documents=[{kind:'spec',path:'spec.md'}]){
 const f=await start(t);f.call=async(command,input)=>api.runCooperativeCommand({...f.args,command,input});
 f.send=async(kind,data,messageRef)=>{const state=JSON.parse(await fs.readFile(f.statePath,'utf8'));return f.call('record',{requestId:'record:'+messageRef,expectedRevision:state.revision,actor:{id:'operator',role:'orchestrator'},evidence:{kind,messageRef,data}});};
 const state=JSON.parse(await fs.readFile(f.statePath,'utf8'));
 await f.send('approval',{targetPreparation:{depth:'Bounded',documents,selectionRef:'user:target',kind:'branch',candidate:'feature',base:f.target.head,workflowId:'workflow',firstStageId:'stage',sourceTarget:state.target,sourceTargetVersion:1}},'approved:scope');
 const intent={type:'intent',id:'intent-1',workflowId:'workflow',sourceTarget:state.target,sourceTargetVersion:state.targetVersion,selectionRef:'user:target',approvalRef:'approved:scope',depth:'Bounded',kind:'branch',candidate:'feature',base:f.target.head,documents,firstStageId:'stage'};
 const recorded=await f.send('target-preparation',intent,'intent:1').catch(error=>({decision:'hold',error:error.message}));
 assert.equal(recorded.decision,'allow',recorded.error);
 return {f,state};
}
async function plannerStart(t,documents){
 const {f}=await intentStart(t,documents);
 const contract={document:{path:path.join(f.cwd,'spec.md'),kind:'spec',phase:'draft'},inputVersion:1,criteriaVersion:1,scopeVersion:0,targetIntentId:'intent-1'};
 await f.send('approval',{plannerStage:contract},'approved:stage');
 f.stage={id:'stage',...contract,approvalRef:'approved:stage',criteria:[{id:'C1',status:'open',judgmentRef:'criterion:1'}]};
 const registered=await f.send('planner-stage',f.stage,'stage:registered').catch(error=>({decision:'hold',error:error.message}));
 assert.equal(registered.decision,'allow',registered.error);return f;
}
test('only one preparation intent may be active, while a completed intent permits the next',async t=>{
 const {f}=await intentStart(t),state=JSON.parse(await fs.readFile(f.statePath,'utf8'));
 const second={...state.targetIntents[0],id:'intent-2'};
 assert.equal((await f.send('target-preparation',second,'intent:2')).decision,'hold');
 const completed=structuredClone(state);completed.targetTransitions=[{intentId:'intent-1'}];
 const evidence={source:{target:completed.target,fingerprint:'sha256:'+'c'.repeat(64),snapshot:{index:[],files:[]}}};
 assert.equal(evaluateTargetPreparation({state:completed,request:second,evidence}).decision,'allow');
});
test('active target intent cannot be bypassed by omitting its ID from a plan stage',async t=>{
 const {f}=await intentStart(t);
 const plan={document:{path:path.join(f.cwd,'plan.md'),kind:'plan',phase:'draft'},inputVersion:1,criteriaVersion:1,scopeVersion:0};
 await f.send('approval',{kind:'spec',path:'unrelated.md',contentHash:'sha256:'+'a'.repeat(64)},'unrelated:spec');
 await f.send('approval',{plannerStage:plan,prerequisiteRefs:['unrelated:spec']},'plan:approval');
 assert.equal((await f.send('planner-stage',{id:'plan',...plan,approvalRef:'plan:approval',criteria:[{id:'P',status:'open',judgmentRef:'criterion'}]},'plan:stage')).decision,'hold');
});
test('persisted preparation records reject malformed arrays and dangling references',async t=>{
 const {f}=await intentStart(t),state=JSON.parse(await fs.readFile(f.statePath,'utf8'));
 const {validateCooperativeState}=await import('../../lib/runtime/cooperative-schema.mjs');
 validateCooperativeState(state);
 for(const mutate of [s=>s.targetIntents={},s=>s.targetIntents[0].source='proven',s=>s.targetCheckpoints=[{intentId:'missing'}],s=>s.targetTransitions=[{intentId:'missing'}],s=>s.targetDocuments=[{intentId:'missing'}]]){
  const invalid=structuredClone(state);mutate(invalid);assert.throws(()=>validateCooperativeState(invalid));
 }
});
test('persisted intent must retain its exact orchestrator-approved scope',async t=>{
 const {f}=await intentStart(t),state=JSON.parse(await fs.readFile(f.statePath,'utf8'));
 const {validateCooperativeState}=await import('../../lib/runtime/cooperative-schema.mjs');
 for(const mutate of [s=>s.targetIntents[0].candidate='other',s=>s.targetIntents[0].documents[0].path='other.md',s=>s.targetIntents[0].depth='Architectural',s=>s.records.find(r=>r.messageRef==='approved:scope').actor.role='planner',s=>s.records.find(r=>r.messageRef==='approved:scope').scopeVersion++]){
  const invalid=structuredClone(state);mutate(invalid);assert.throws(()=>validateCooperativeState(invalid));
 }
});
test('scope changes after draft block checkpoint and after checkpoint block transition',async t=>{
 for(const afterCheckpoint of [false,true]){
  const f=await plannerStart(t);await plannerPrepare(f,'first');
  await f.send('planner-result',{stageId:'stage',callRequestId:'first',status:'succeeded',chatDraft:{intentId:'intent-1',draftRef:'draft',selfReviewRef:'self',complete:true}},'result');
  const checkpoint={type:'checkpoint',intentId:'intent-1',stageId:'stage',resultRef:'result',selfReviewRef:'self'};
  if(afterCheckpoint)assert.equal((await f.send('target-preparation',checkpoint,'checkpoint')).decision,'allow');
  await f.send('scope',{paths:[path.join(f.cwd,'changed')]},'changed-scope');
  if(!afterCheckpoint)assert.equal((await f.send('target-preparation',checkpoint,'late-checkpoint')).decision,'hold');
  else{const state=JSON.parse(await fs.readFile(f.statePath,'utf8'));f.args.observe=async()=>({...f.target,branch:'feature'});assert.equal((await f.send('target-preparation',{type:'transition',intentId:'intent-1',checkpointRef:'checkpoint',expectedRevision:state.revision,destination:{realpath:f.cwd}},'late-transition')).decision,'hold');}
 }
});
function bindScopeApproval(state){
 state.scopeVersion=0;for(const intent of state.targetIntents){intent.scopeVersion=0;intent.approvalRef='scope';}
 for(const stage of state.plannerLedger.stages){stage.scopeVersion=0;stage.targetVersion=1;}
 (state.records??=[]).push({kind:'approval',messageRef:'scope',scopeVersion:0,targetVersion:1,actor:{role:'orchestrator'},source:'operator-attested'});
}
test('checkpoint requires the complete current chat result and independently observed source',()=>{
 const target={realpath:'/source',gitCommonDir:'/common',gitDir:'/common',head:'a'.repeat(40),branch:'main'};
 const intent={id:'intent-1',sourceTarget:target,sourceTargetVersion:1,kind:'branch',candidate:'feature',base:target.head,firstStageId:'stage'};
 const stage={id:'stage',targetIntentId:'intent-1',ready:false,pending:null,inputVersion:1,calls:[{requestId:'call',status:'succeeded'}],result:{ref:'result',requestId:'call',status:'succeeded',chatDraft:{intentId:'intent-1',draftRef:'draft',selfReviewRef:'self',complete:true}}};
 const state={workflowId:'workflow',revision:3,targetVersion:1,target,plannerLedger:{stages:[stage]},targetIntents:[intent],intents:[],unresolved:[]};
 bindScopeApproval(state);
 const request={type:'checkpoint',intentId:'intent-1',stageId:'stage',resultRef:'result',selfReviewRef:'self'};
 const evidence={source:{target,preserved:true,inputVersion:1,candidate:'feature',base:target.head}};
 assert.equal(evaluateTargetPreparation({state,request,evidence}).decision,'allow');
 assert.equal(stage.ready,false);assert.equal(state.targetVersion,1);
 for(const mutate of [
  s=>delete s.plannerLedger.stages[0].result.chatDraft.selfReviewRef,
  s=>s.plannerLedger.stages[0].result.chatDraft.complete=false,
  s=>s.plannerLedger.stages[0].calls[0].status='unknown',
  s=>s.plannerLedger.stages[0].pending='call',
  s=>s.targetVersion=2,
  s=>s.targetIntents[0].candidate='other',
  s=>s.targetIntents[0].base='b'.repeat(40),
 ]){const copy=structuredClone(state);mutate(copy);assert.equal(evaluateTargetPreparation({state:copy,request,evidence}).decision,'hold');}
});
test('branch transition requires independently observed identity and preserves source history',()=>{
 const source={realpath:'/source',gitCommonDir:'/common',gitDir:'/common',head:'a'.repeat(40),branch:'main'};
 const destination={...source,branch:'feature'};
 const intent={id:'i',sourceTarget:source,sourceTargetVersion:1,kind:'branch',candidate:'feature',base:source.head,firstStageId:'stage',sourceFingerprint:'sha256:'+'c'.repeat(64)};
 const stage={id:'stage',targetIntentId:'i',ready:false,calls:[{requestId:'call',status:'succeeded'}],result:{ref:'result',requestId:'call',status:'succeeded',chatDraft:{intentId:'i',draftRef:'draft',selfReviewRef:'self',complete:true}}};
 const state={workflowId:'workflow',revision:4,targetVersion:1,target:source,versions:{runtime:'cooperative-6'},targetIntents:[intent],targetCheckpoints:[{intentId:'i',messageRef:'checkpoint',stageId:'stage',resultRef:'result',selfReviewRef:'self',candidate:'feature',base:source.head}],targetTransitions:[],plannerLedger:{stages:[stage]},intents:[],unresolved:[],assignments:[]};
 bindScopeApproval(state);
 const request={type:'transition',intentId:'i',checkpointRef:'checkpoint',expectedRevision:4};
 const evidence={source:{target:destination,preserved:true},destination:{target:destination,registered:true},versions:state.versions};
 const decision=evaluateTargetPreparation({state,request,evidence});
 assert.equal(decision.decision,'allow');assert.deepEqual(state.plannerLedger.stages[0],stage);assert.equal(state.targetVersion,1);
 const pending=structuredClone(state);pending.plannerLedger.stages[0].pending='new-call';assert.equal(evaluateTargetPreparation({state:pending,request,evidence}).decision,'hold');
 const changed=structuredClone(state);changed.plannerLedger.stages[0].result.ref='new-result';assert.equal(evaluateTargetPreparation({state:changed,request,evidence}).decision,'hold');
 const changedInput=structuredClone(state);changedInput.plannerLedger.stages[0].inputVersion=2;assert.equal(evaluateTargetPreparation({state:changedInput,request,evidence}).decision,'hold');
 const changedIntent=structuredClone(state),changedEvidence=structuredClone(evidence);changedIntent.targetIntents[0].candidate='other';changedEvidence.source.target.branch='other';changedEvidence.destination.target.branch='other';assert.equal(evaluateTargetPreparation({state:changedIntent,request,evidence:changedEvidence}).decision,'hold');
 const next=preparation.applyTargetPreparationTransition({state,decision});
 assert.equal(next.targetVersion,2);assert.deepEqual(next.target,destination);assert.deepEqual(next.plannerLedger,state.plannerLedger);assert.equal(state.targetVersion,1);
 for(const change of [e=>e.destination.target.gitCommonDir='/other',e=>e.destination.target.branch='other',e=>e.destination.target.head='b'.repeat(40),e=>e.source.preserved=false]){const copy=structuredClone(evidence);change(copy);assert.equal(evaluateTargetPreparation({state,request,evidence:copy}).decision,'hold');}
 const replay=structuredClone(state);replay.targetTransitions.push({intentId:'i'});assert.equal(evaluateTargetPreparation({state:replay,request,evidence}).decision,'hold');
});
test('current and managed worktree transitions require correct identity, registration and attachment',()=>{
 const source={realpath:'/source',gitCommonDir:'/common',gitDir:'/common',head:'a'.repeat(40),branch:'main'},destination={...source,realpath:'/worktree',gitDir:'/worktree-git',branch:'feature'};
 const state={revision:4,targetVersion:1,target:source,versions:{runtime:'v'},targetIntents:[{id:'i',sourceTarget:source,sourceTargetVersion:1,firstStageId:'stage',kind:'current',candidate:'main',base:source.head}],targetCheckpoints:[{intentId:'i',messageRef:'checkpoint',stageId:'stage',resultRef:'result',selfReviewRef:'self',candidate:'main',base:source.head}],plannerLedger:{stages:[{id:'stage',targetIntentId:'i',calls:[{requestId:'call',status:'succeeded'}],result:{ref:'result',requestId:'call',status:'succeeded',chatDraft:{intentId:'i',draftRef:'draft',selfReviewRef:'self',complete:true}}}]},targetTransitions:[],intents:[],assignments:[],unresolved:[],records:[{kind:'note',messageRef:'attachment',targetVersion:1,source:'operator-attested',data:{type:'worktree-attachment',realpath:destination.realpath,gitDir:destination.gitDir,gitCommonDir:destination.gitCommonDir}}]};
 bindScopeApproval(state);
 const request={type:'transition',intentId:'i',checkpointRef:'checkpoint',expectedRevision:4},evidence={versions:state.versions,source:{target:source,preserved:true},destination:{target:source}};
 assert.equal(evaluateTargetPreparation({state,request,evidence}).decision,'allow');
 const wrongCandidate=structuredClone(state);wrongCandidate.targetIntents[0].candidate='other';assert.equal(evaluateTargetPreparation({state:wrongCandidate,request,evidence}).decision,'hold');
 const stale={...request,expectedRevision:3};assert.equal(evaluateTargetPreparation({state,request:stale,evidence}).decision,'hold');
 state.targetIntents[0].kind='worktree';state.targetIntents[0].candidate='feature';state.targetCheckpoints[0].candidate='feature';evidence.destination={target:destination,registered:true,attachmentRef:'attachment'};
 assert.equal(evaluateTargetPreparation({state,request,evidence}).decision,'allow');
 const pendingTask=structuredClone(state);pendingTask.tasks=[{id:'pending',paths:['/source/file']}];assert.equal(evaluateTargetPreparation({state:pendingTask,request,evidence}).decision,'hold');
 for(const mutate of [e=>e.destination.registered=false,e=>delete e.destination.attachmentRef,e=>e.destination.target.gitCommonDir='/other',e=>e.destination.target.gitDir=source.gitDir,e=>e.destination.target.head='b'.repeat(40),e=>e.source.target.head='b'.repeat(40)]){const copy=structuredClone(evidence);mutate(copy);assert.equal(evaluateTargetPreparation({state,request,evidence:copy}).decision,'hold');}
});
test('target intent is recorded before a Planner stage without saving or approving a document',async t=>{
 const {f,state:before}=await intentStart(t);
 const after=JSON.parse(await fs.readFile(f.statePath,'utf8'));
 assert.equal(after.targetVersion,before.targetVersion);
 assert.deepEqual(after.target,before.target);
 assert.equal(after.records.filter(r=>r.kind==='document').length,0);
 assert.equal(after.records.filter(r=>r.kind==='approval'&&r.data.kind==='spec').length,0);
});
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
test('complete chat draft and self-review can be checkpointed without becoming a saved or ready document',async t=>{
 const f=await plannerStart(t);await plannerPrepare(f,'first');
 const before=JSON.parse(await fs.readFile(f.statePath,'utf8'));
 const decision=await f.send('planner-result',{stageId:'stage',callRequestId:'first',status:'succeeded',chatDraft:{intentId:'intent-1',draftRef:'chat:draft',selfReviewRef:'chat:review',complete:true}},'chat:result');
 assert.equal(decision.decision,'allow');
 const checkpoint=await f.send('target-preparation',{type:'checkpoint',intentId:'intent-1',stageId:'stage',resultRef:'chat:result',selfReviewRef:'chat:review'},'checkpoint:1');
 assert.equal(checkpoint.decision,'allow');
 const state=JSON.parse(await fs.readFile(f.statePath,'utf8'));
 assert.equal(state.targetVersion,before.targetVersion);
 assert.equal(state.plannerLedger.stages[0].ready,false);
 assert.deepEqual(state.plannerLedger.stages[0].artifacts,[]);
 assert.equal(state.records.filter(r=>r.kind==='document').length,0);
 assert.equal(state.records.filter(r=>r.kind==='approval').length,before.records.filter(r=>r.kind==='approval').length);
});

test('public record transitions the observed branch once while retaining source history',async t=>{
 const f=await plannerStart(t);await plannerPrepare(f,'first');
 await f.send('planner-result',{stageId:'stage',callRequestId:'first',status:'succeeded',chatDraft:{intentId:'intent-1',draftRef:'chat:draft',selfReviewRef:'chat:review',complete:true}},'chat:result');
 assert.equal((await f.send('target-preparation',{type:'checkpoint',intentId:'intent-1',stageId:'stage',resultRef:'chat:result',selfReviewRef:'chat:review'},'checkpoint:1')).decision,'allow');
 const before=JSON.parse(await fs.readFile(f.statePath,'utf8'));
 const branch={...f.target,branch:'feature'};f.args.observe=async()=>branch;
 const result=await f.send('target-preparation',{type:'transition',intentId:'intent-1',checkpointRef:'checkpoint:1',expectedRevision:before.revision,destination:{realpath:f.cwd}},'transition:1');
 assert.equal(result.decision,'allow');
 const after=JSON.parse(await fs.readFile(f.statePath,'utf8'));
 assert.equal(after.targetVersion,2);assert.deepEqual(after.target,branch);assert.deepEqual(after.plannerLedger,before.plannerLedger);
 const replay=await f.send('target-preparation',{type:'transition',intentId:'intent-1',checkpointRef:'checkpoint:1',expectedRevision:after.revision,destination:{realpath:f.cwd}},'transition:2');
 assert.equal(replay.decision,'hold');
});

test('source draft cannot be recorded as an approved destination document before transition',async t=>{
 const f=await plannerStart(t);
 const decision=await f.send('approval',{kind:'spec',path:'spec.md',contentHash:'sha256:'+'a'.repeat(64)},'premature:approval');
 assert.equal(decision.decision,'hold');
});

test('prepared destination review and approval bind observed file bytes without making source stage ready',async t=>{
 const f=await plannerStart(t,[{kind:'spec',path:'spec.md'},{kind:'plan',path:'plan.md'}]);await plannerPrepare(f,'first');
 await f.send('planner-result',{stageId:'stage',callRequestId:'first',status:'succeeded',chatDraft:{intentId:'intent-1',draftRef:'chat:draft',selfReviewRef:'chat:review',complete:true}},'chat:result');
 await f.send('target-preparation',{type:'checkpoint',intentId:'intent-1',stageId:'stage',resultRef:'chat:result',selfReviewRef:'chat:review'},'checkpoint:1');
 const before=JSON.parse(await fs.readFile(f.statePath,'utf8'));f.args.observe=async()=>({...f.target,branch:'feature'});
 assert.equal((await f.send('target-preparation',{type:'transition',intentId:'intent-1',checkpointRef:'checkpoint:1',expectedRevision:before.revision,destination:{realpath:f.cwd}},'transition:1')).decision,'allow');
 await fs.writeFile(path.join(f.cwd,'spec.md'),'draft');
 const hash='sha256:7743ce348d9284d677a185f33295b92266cc435a5b5f775029b300066d26693a';
 assert.equal((await f.send('approval',{kind:'spec',path:'spec.md',contentHash:hash},'approval:before-review')).decision,'hold');
 const review={stageId:'stage',resultRef:'chat:result',full:true,complete:true,hash,criteria:[{id:'C1',status:'resolved',judgmentRef:'judgment'}]};
 assert.equal((await f.send('planner-review',review,'review:destination')).decision,'allow');
 assert.equal((await f.send('approval',{kind:'spec',path:path.join(f.cwd,'spec.md'),contentHash:hash},'approval:destination')).decision,'allow');
 const request={type:'destination',intentId:'intent-1',transitionRef:'transition:1',stageId:'stage',resultRef:'chat:result',selfReviewRef:'chat:review',path:'spec.md',hash,mode:0o100644,reviewRef:'review:destination',approvalRef:'approval:destination',targetVersion:2,destination:{realpath:f.cwd,path:'spec.md'}};
 const current=JSON.parse(await fs.readFile(f.statePath,'utf8'));
 const intent=current.targetIntents.find(i=>i.id===request.intentId);
 const evidence=await preparation.readTargetPreparationEvidence({state:current,targetIntent:intent,destination:request.destination,observe:f.args.observe,readChanges:f.args.readChanges});
 const decision=await f.send('target-preparation',request,'destination:1');
 assert.equal(decision.decision,'allow',JSON.stringify({decision,transition:current.targetTransitions,checkpoint:current.targetCheckpoints,stage:current.plannerLedger.stages[0],records:current.records.filter(r=>[request.reviewRef,request.approvalRef].includes(r.messageRef)),evidence}));
 const after=JSON.parse(await fs.readFile(f.statePath,'utf8'));
 assert.equal(after.plannerLedger.stages[0].ready,false);assert.equal(after.targetDocuments[0].sourceLink,'operator-attested');
 const plan={document:{path:path.join(f.cwd,'plan.md'),kind:'plan',phase:'draft'},inputVersion:1,criteriaVersion:1,scopeVersion:0};
 await f.send('approval',{kind:'spec',path:'unrelated.md',contentHash:hash},'unrelated:spec');
 await f.send('approval',{plannerStage:plan,prerequisiteRefs:['unrelated:spec']},'plan:bad-approval');
 assert.equal((await f.send('planner-stage',{id:'plan-stage',...plan,approvalRef:'plan:bad-approval',criteria:[{id:'P1',status:'open',judgmentRef:'criterion'}]},'plan:bad-stage')).decision,'hold');
 const wrong={...plan,document:{...plan.document,path:path.join(f.cwd,'wrong-plan.md')}};
 await f.send('approval',{plannerStage:wrong,prerequisiteRefs:['approval:destination']},'plan:wrong-path-approval');
 assert.equal((await f.send('planner-stage',{id:'plan-stage',...wrong,approvalRef:'plan:wrong-path-approval',criteria:[{id:'P1',status:'open',judgmentRef:'criterion'}]},'plan:wrong-path')).decision,'hold');
 await f.send('approval',{plannerStage:plan,prerequisiteRefs:['approval:destination']},'plan:approval');
 assert.equal((await f.send('planner-stage',{id:'plan-stage',...plan,approvalRef:'plan:approval',criteria:[{id:'P1',status:'open',judgmentRef:'criterion'}]},'plan:stage')).decision,'allow');
 const planHash='sha256:64879f7d6b960a01909762d911a32d4582c20010c5641ee90278b644a9e3b525';
 await fs.writeFile(path.join(f.cwd,'plan.md'),'plan');await fs.writeFile(path.join(f.cwd,'plan-self.md'),'self');
 let currentPlan=JSON.parse(await fs.readFile(f.statePath,'utf8'));
 assert.equal((await f.call('prepare',{requestId:'plan-call',expectedRevision:currentPlan.revision,actor:{id:'operator',role:'orchestrator'},operation:'planner-call',arguments:{stageId:'plan-stage',kind:'initial',intent:'substantive',criterionIds:[],evidenceRefs:[]}})).decision,'allow');
 for(const [ref,purpose,file] of [['plan-draft','draft','plan.md'],['plan-self','self-review','plan-self.md']])assert.equal((await f.send('planner-evidence',{stageId:'plan-stage',path:path.join(f.cwd,file),purpose,criterionIds:['P1']},ref)).decision,'allow');
 assert.equal((await f.send('planner-result',{stageId:'plan-stage',callRequestId:'plan-call',status:'succeeded',artifactRef:'plan-draft',selfReviewRef:'plan-self'},'plan-result')).decision,'allow');
 assert.equal((await f.send('planner-review',{stageId:'plan-stage',resultRef:'plan-result',full:true,complete:true,hash:planHash,criteria:[{id:'P1',status:'resolved',judgmentRef:'plan-judgment'}]},'plan-review')).decision,'allow');
 assert.equal((await f.send('approval',{kind:'plan',path:'wrong-plan.md',contentHash:planHash},'wrong-plan-approval')).decision,'hold');
 assert.equal((await f.send('approval',{kind:'plan',path:'plan.md',contentHash:'sha256:'+'0'.repeat(64)},'wrong-plan-hash')).decision,'hold');
 assert.equal((await f.send('approval',{kind:'plan',path:'plan.md',contentHash:planHash},'approved-plan')).decision,'allow');
 await f.send('scope',{paths:[path.join(f.cwd,'changed')]},'new-scope');
 assert.equal((await f.send('planner-review',review,'stale-review')).decision,'hold');
 assert.equal((await f.send('approval',{kind:'spec',path:'spec.md',contentHash:hash},'stale-spec-approval')).decision,'hold');
 assert.equal((await f.send('target-preparation',request,'stale-destination')).decision,'hold');
 const nextPlan={...plan,scopeVersion:1};await f.send('approval',{plannerStage:nextPlan,prerequisiteRefs:['approval:destination']},'stale-prerequisite-approval');
 assert.equal((await f.send('planner-stage',{id:'another-plan',...nextPlan,approvalRef:'stale-prerequisite-approval',criteria:[{id:'P1',status:'open',judgmentRef:'criterion'}]},'stale-prerequisite-stage')).decision,'hold');
});

test('incomplete chat self-review and unknown calls cannot establish a checkpoint',async t=>{
 for(const mode of ['missing-review','incomplete','unknown']){
  const f=await plannerStart(t);await plannerPrepare(f,'first');
  const state=JSON.parse(await fs.readFile(f.statePath,'utf8'));
  if(mode==='unknown')await f.send('planner-result',{stageId:'stage',callRequestId:'first',status:'unknown'},'unknown:first');
  const chatDraft={intentId:'intent-1',draftRef:'chat:draft',selfReviewRef:'chat:review',complete:true};
  if(mode==='missing-review')delete chatDraft.selfReviewRef;
  if(mode==='incomplete')chatDraft.complete=false;
  const d=await f.send('planner-result',{stageId:'stage',callRequestId:'first',status:'succeeded',chatDraft},'chat:'+mode);
  assert.equal(d.decision,'hold');
  const after=JSON.parse(await fs.readFile(f.statePath,'utf8'));
  assert.equal(after.plannerLedger.stages[0].ready,false);
  assert.equal(after.targetVersion,state.targetVersion);
 }
});
