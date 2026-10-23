import test from 'node:test';
import assert from 'node:assert/strict';
const api=await import('../../lib/runtime/acceptance.mjs').catch(()=>({}));
const oid=c=>c.repeat(40),hash=c=>'sha256:'+c.repeat(64);
function fixture(){
 const target={realpath:'/workspace',gitCommonDir:'/repo/.git',gitDir:'/repo/.git',branch:'main',head:oid('a')};
 const descriptor={executable:'/bin/check',args:[],cwd:'/workspace',env:{},outputs:[]};
 const task={id:'T1',paths:['/workspace/code.mjs'],criteria:['works'],requiredChecks:[descriptor],dependencies:[],approvalRef:'approved',approvalVersion:1,documentVersion:1,scopeVersion:0,targetVersion:1,status:'pending'};
 const state={mode:'plan',revision:1,target,targetVersion:1,scopeVersion:0,versions:{runtimeHash:hash('a')},tasks:[task],records:[{kind:'approval',messageRef:'approved',source:'operator-attested',scopeVersion:0,targetVersion:1,data:{approvalVersion:1,documentVersion:1}}],assignments:[{taskId:'T1',agentId:'implementer',status:'active'}],checks:[{id:'qa',scope:'task',taskId:'T1',operation:'check',descriptor,verificationActor:{id:'qa1',role:'qa'},status:'passed',verdict:'proven',changeFingerprint:hash('a'),resultRef:'qa:passed',source:'operator-attested'}],findings:[],acceptances:[],commits:[],intents:[],unresolved:[]};
 const request={requestId:'accept',expectedRevision:1,actor:{id:'operator',role:'orchestrator'},taskId:'T1',operation:'accept',arguments:{messageRef:'operator:accepted',criteria:['works'],checkIds:['qa'],findingIds:[],changeFingerprint:hash('a')}};
 const git={target,indexTree:oid('b'),stagedFingerprint:hash('b'),stagedPaths:['code.mjs'],workingPaths:[],untrackedPaths:[]};
 return {state,request,evidence:{changes:{tasks:{T1:hash('a')},final:hash('a')},git},gitEvidence:git};
}
function accept(f){assert.equal(typeof api.evaluateCooperativeAcceptance,'function','acceptance gate must exist');return api.evaluateCooperativeAcceptance(f);}
function accepted(){const f=fixture(),d=accept(f);assert.equal(d.decision,'allow',d.reason);f.state.acceptances.push(d.proposedTransition.acceptance);f.state.tasks[0].status='accepted';f.request={requestId:'commit',expectedRevision:1,actor:f.request.actor,taskId:'T1',operation:'commit',arguments:{acceptanceId:'accept'}};return f;}
function prepare(f){assert.equal(typeof api.prepareCooperativeCommit,'function','commit preflight must exist');return api.prepareCooperativeCommit(f);}
function prepared(){const f=accepted(),d=prepare(f);assert.equal(d.decision,'allow',d.reason);f.intent=d.proposedTransition.intent;f.state.intents.push(f.intent);f.gitEvidence={...f.gitEvidence,target:{...f.state.target,head:oid('c')},indexTree:oid('b'),stagedPaths:[],workingPaths:[],untrackedPaths:[],commit:{commit:oid('c'),parent:oid('a'),tree:oid('b'),paths:['code.mjs'],head:oid('c')}};f.result={status:'succeeded',messageRef:'commit:observed',data:{commit:oid('c')}};return f;}
function reconcile(f){assert.equal(typeof api.reconcileCooperativeCommit,'function','commit reconciliation must exist');return api.reconcileCooperativeCommit(f);}
test('acceptRequiresExactCriteriaChecksAndFindings',()=>{
 const f=fixture();assert.equal(accept(f).decision,'allow');assert.equal(f.state.tasks[0].status,'pending');
 for(const mutate of [f=>f.request.arguments.criteria=[],f=>f.request.arguments.checkIds=[],f=>f.state.checks[0].changeFingerprint=hash('d'),f=>f.state.checks[0].verificationActor.id='implementer',f=>f.state.findings.push({id:'F',scope:'task',taskId:'T1',status:'open'}),f=>f.state.records[0].messageRef='changed',f=>f.request.actor.role='implementer']){const f=fixture();mutate(f);assert.equal(accept(f).decision,'hold');}
});
test('acceptedFingerprintCannotCommitDifferentIndex',()=>{for(const mutate of [f=>f.gitEvidence.indexTree=oid('d'),f=>f.gitEvidence.stagedFingerprint=hash('d'),f=>f.evidence.changes.tasks.T1=hash('d'),f=>f.state.tasks[0].criteria=['changed']]){const f=accepted();mutate(f);assert.equal(prepare(f).decision,'hold');}});
test('unrelatedStagedPathsHold',()=>{const f=fixture();f.gitEvidence.stagedPaths.push('other.mjs');assert.equal(accept(f).decision,'hold');const g=fixture();g.state.tasks.push({...g.state.tasks[0],id:'T2'});assert.equal(accept(g).decision,'hold','overlapping another task must hold');});
test('unstagedScopedChangesHold',()=>{for(const key of ['workingPaths','untrackedPaths']){const f=fixture();f.gitEvidence[key]=['code.mjs'];assert.equal(accept(f).decision,'hold');}});
test('sameFileSemanticLimitIsVisible',()=>{const d=accept(fixture());assert.equal(d.decision,'allow');assert.match(d.semanticLimit,/same file/i);assert.equal(d.coverage.nativeVerified,false);assert.equal(d.proposedTransition.acceptance.source,'operator-attested');});
test('commitResultMustMatchParentTreePathsHead',()=>{const f=prepared(),d=reconcile(f);assert.equal(d.decision,'allow',d.reason);assert.equal(d.proposedTransition.commit.commit,oid('c'));assert.equal(f.state.tasks[0].status,'accepted');for(const mutate of [f=>f.gitEvidence.commit.parent=oid('d'),f=>f.gitEvidence.commit.tree=oid('d'),f=>f.gitEvidence.commit.paths=['other.mjs'],f=>f.gitEvidence.commit.head=oid('d'),f=>f.gitEvidence.target.branch='other',f=>f.gitEvidence.workingPaths=['code.mjs'],f=>f.gitEvidence.stagedPaths=['other.mjs'],f=>f.result.data.commit=oid('d'),f=>f.state.checks[0].status='failed',f=>f.state.findings.push({id:'F',scope:'task',taskId:'T1',status:'open'})]){const f=prepared();mutate(f);assert.equal(reconcile(f).decision,'hold');}});
test('failedReconcileKeepsActualHistory',()=>{const f=prepared();f.gitEvidence.commit.tree=oid('d');const before=structuredClone(f.state),d=reconcile(f);assert.equal(d.decision,'hold');assert.equal(d.proposedTransition.observation.commit.tree,oid('d'));assert.equal(d.proposedTransition.result.status,'mismatch');assert.deepEqual(f.state,before);});
test('commitReplayNeverCreatesSecondEffect',()=>{const f=prepared();f.intent.status='succeeded';f.state.commits.push({taskId:'T1',commit:oid('c')});assert.equal(reconcile(f).decision,'hold');assert.equal(prepare(f).decision,'hold');});
test('acceptance cannot be repeated and failed check history requires its successful current recheck',()=>{const f=accepted();f.request=fixture().request;assert.equal(accept(f).decision,'hold');const g=fixture();g.state.checks.unshift({...g.state.checks[0],id:'failed',status:'failed'});assert.equal(accept(g).decision,'allow');g.state.checks.push({...g.state.checks[0],id:'failed-again'});assert.equal(accept(g).decision,'hold');});
test('durable acceptance and reconciliation update target only from verified observed Git result',async t=>{
 const fs=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path');
 const {initializeCooperativeWorkflow}=await import('../../lib/runtime/bootstrap.mjs'),{runCooperativeCommand}=await import('../../lib/runtime/cooperative.mjs'),{workflowStatePath}=await import('../../lib/runtime/scope.mjs');
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'arc-acceptance-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));const cwd=path.join(root,'workspace'),common=path.join(root,'common');await fs.mkdir(cwd);await fs.mkdir(common);
 let target={realpath:cwd,gitCommonDir:common,gitDir:common,head:oid('a'),branch:'main'};const f=fixture(),actor=f.request.actor;
 let git={...f.gitEvidence,target},changes=f.evidence.changes;
 const args={cwd,workflowId:'acceptance',observe:async()=>target,readCommitGit:async()=>git,readChanges:async()=>changes};
 await initializeCooperativeWorkflow({...args,input:{mode:'plan',actor,selection:{messageRef:'target',contentHash:hash('a')}}});
 const file=await workflowStatePath(target,'acceptance'),state=JSON.parse(await fs.readFile(file));
 for(const key of ['tasks','records','assignments','checks'])state[key]=f.state[key];state.tasks[0].paths=[path.join(cwd,'code.mjs')];state.tasks[0].requiredChecks[0].cwd=cwd;state.checks[0].descriptor=state.tasks[0].requiredChecks[0];state.records[0].actor=actor;
 await fs.writeFile(file,JSON.stringify(state));let revision=0;
 const invoke=async(command,input)=>{const out=await runCooperativeCommand({...args,command,input:{requestId:'r'+revision,expectedRevision:revision,actor,...input}});revision=out.revision;return out;};
 assert.equal((await invoke('prepare',{operation:'accept',taskId:'T1',arguments:f.request.arguments})).decision,'allow');
 let stored=JSON.parse(await fs.readFile(file));assert.equal(stored.tasks[0].status,'accepted');assert.equal(stored.intents.length,0);assert.equal(stored.commits.length,0);
 assert.equal((await invoke('prepare',{operation:'commit',taskId:'T1',arguments:{acceptanceId:'r0'}})).decision,'allow');
 target={...target,head:oid('c')};git={...git,target,indexTree:oid('b'),stagedPaths:[],commit:{commit:oid('c'),parent:oid('a'),tree:oid('b'),paths:['code.mjs'],head:oid('c')}};
 const result={status:'succeeded',messageRef:'actual commit',data:{commit:oid('c')}};
 assert.equal((await invoke('reconcile',{intentId:'r1',actor:{id:'implementer',role:'implementer'},result})).decision,'hold');
 assert.equal(JSON.parse(await fs.readFile(file)).target.head,oid('a'));
 assert.equal((await invoke('reconcile',{intentId:'r1',result:{...result,status:'unknown'}})).decision,'hold');
 assert.equal(JSON.parse(await fs.readFile(file)).intents.find(i=>i.requestId==='r1').status,'unknown');
 assert.equal((await invoke('reconcile',{intentId:'r1',result})).decision,'allow');
 stored=JSON.parse(await fs.readFile(file));assert.equal(stored.target.head,oid('c'));assert.equal(stored.tasks[0].status,'committed');assert.equal(stored.commits.length,1);assert.equal(stored.commitObservations.length,3);assert.equal(stored.targetHistory.at(-1).target.head,oid('a'));
 assert.equal(stored.intents.find(i=>i.requestId==='r1').status,'succeeded');
 assert.equal((await runCooperativeCommand({...args,command:'status'})).decision,'allow');
 assert.equal((await invoke('reconcile',{intentId:'r1',result})).decision,'hold');stored=JSON.parse(await fs.readFile(file));assert.equal(stored.commits.length,1);
});
test('historical QA for an observed committed task does not become an active pending-task failure',async()=>{
 const {evaluateCooperative}=await import('../../lib/runtime/evaluate.mjs'),{cooperativeVersions}=await import('../../lib/runtime/bootstrap.mjs');
 const f=fixture();Object.assign(f.state,{workflowKind:'cooperative',contractVersion:1,schemaVersion:1,workflowId:'history',coverage:{enforcement:'cooperative',provenance:'operator-attested',nativeVerified:false},versions:await cooperativeVersions()});
 for(const key of ['actors','selections','identities','leases','scopes','approvals','documents','requests','results','audit','targetHistory'])f.state[key]=[];f.state.records[0].actor=f.request.actor;
 f.state.tasks[0].status='committed';f.state.commits=[{taskId:'T1',commit:f.state.target.head,source:'operator-attested',postCommitFingerprint:hash('d')}];
 const d=evaluateCooperative({state:f.state,request:{command:'status'},evidence:{target:f.state.target,versions:f.state.versions,changes:{tasks:{T1:hash('d')}}}});
 assert.equal(d.decision,'allow',d.reason);
 assert.equal(evaluateCooperative({state:f.state,request:{command:'status'},evidence:{target:f.state.target,versions:f.state.versions,changes:{tasks:{T1:hash('e')}}}}).decision,'hold');
});
test('store rejects a verified cooperative decision whose proposed commit was changed',async()=>{
 const {applyCooperativeCommitTransition}=await import('../../lib/runtime/store.mjs');const f=prepared(),d=reconcile(f);
 assert.equal(d.decision,'allow');d.proposedTransition.target.head=oid('f');
 assert.throws(()=>applyCooperativeCommitTransition({state:f.state,decision:d}),/verified/i);
});
test('commit observer reads exact real local commit objects and rejects caller object expressions',async()=>{
 const {readCooperativeCommitGitEvidence}=await import('../../lib/runtime/git-evidence.mjs'),{observeCooperativeTarget}=await import('../../lib/runtime/scope.mjs');
 const {execFileSync}=await import('node:child_process'),target=await observeCooperativeTarget(process.cwd());
 const observed=await readCooperativeCommitGitEvidence({target,commit:target.head});
 const expected=execFileSync('git',['--no-replace-objects','show','--no-patch','--format=%H%n%P%n%T',target.head],{encoding:'utf8'}).trim().split('\n');
 assert.equal(observed.commit.commit,expected[0]);assert.equal(observed.commit.parent,expected[1]);assert.equal(observed.commit.tree,expected[2]);assert.equal(observed.commit.head,target.head);
 await assert.rejects(readCooperativeCommitGitEvidence({target,commit:'HEAD^{tree}'}),/object ID/);
});

test('verified completed task does not own a subsequent task staged path forever',()=>{
 const f=fixture();f.state.tasks.push({...structuredClone(f.state.tasks[0]),id:'T0',status:'committed'});f.state.commits.push({taskId:'T0',requestId:'commit0',observationSource:'local-git'});f.state.intents.push({requestId:'commit0',taskId:'T0',operation:'commit',status:'succeeded'});assert.equal(accept(f).decision,'allow');f.state.commits=[];assert.equal(accept(f).decision,'hold');
});

test('pending dependent task does not own paths before its predecessor finishes',()=>{const f=fixture();f.state.tasks.push({...structuredClone(f.state.tasks[0]),id:'T2',dependencies:['T1']});assert.equal(accept(f).decision,'allow');f.state.intents.push({operation:'assign-agent',taskId:'T2',status:'unknown'});assert.equal(accept(f).decision,'hold');});
