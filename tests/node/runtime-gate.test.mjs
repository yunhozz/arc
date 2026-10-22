import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const api=await import('../../lib/runtime/gate.mjs').catch(()=>({}));
const sha=c=>c.repeat(40);
const hash=s=>'sha256:'+crypto.createHash('sha256').update(s).digest('hex');
// These are trusted provider observations. The platform adapter must never take
// Git evidence, acceptance, identity or result facts from tool arguments.
function fixture(kind='task'){
 const target={realpath:'/workspace',gitCommonDir:'/repo/.git',branch:'work',head:sha('a')};
 const paths=kind==='documents'?['spec.md','plan.md']:['code.mjs'];
 const documents=['spec','plan'].map(kind=>({kind,path:`/workspace/${kind}.md`,gitPath:`${kind}.md`,contentHash:hash(kind),approvalRef:kind}));
 const state={workflowId:'workflow',revision:4,target,mode:'plan',documents,
  identities:[{actorRef:'root',role:'orchestrator',taskId:'T1'}],leases:[{actorRef:'root',taskId:'T1',status:'active'}],
  tasks:[{id:'T1',status:'accepted',paths:['/workspace/code.mjs'],criteria:['criterion'],requiredChecks:['qa']}],
  acceptances:[{taskId:'T1',actorRef:'root',fingerprint:hash('diff'),criteria:['criterion'],checkIds:['qa'],findingIds:[]}],
  approvals:documents.map(d=>({id:d.approvalRef,source:'user-message',messageRef:d.kind,contentHash:d.contentHash})),commits:[],audit:[]};
 const request={requestId:'commit-1',actorRef:'root',taskId:'T1',operation:'commit',cwd:'/workspace',paths:paths.map(p=>'/workspace/'+p),descriptor:{kind,parent:target.head,indexTree:sha('b'),fingerprint:hash('diff'),paths}};
 const gitEvidence={target,indexTree:sha('b'),stagedFingerprint:hash('diff'),stagedPaths:paths,workingPaths:[],untrackedPaths:[],documents:documents.map(d=>({...d,observedHash:d.contentHash}))};
 return {phase:'preflight',state,request,gitEvidence};
}
test('docs-only preflight allows the exact complete approved document set',async()=>{
 assert.equal(typeof api.runGate,'function');const f=fixture('documents');const result=await api.runGate(f);
 assert.equal(result.decision,'allow');assert.equal(result.proposedTransition?.commits?.length??0,0,'permission is not a completed commit');
 assert.equal(f.state.commits.length,0);
});
for(const [name,mutate] of [
 ['mixed implementation',f=>{f.gitEvidence.stagedPaths.push('code.mjs');}],
 ['missing document',f=>{f.gitEvidence.stagedPaths.pop();}],
 ['changed document hash',f=>{f.gitEvidence.documents[0].observedHash=hash('changed');}],
 ['missing approved plan',f=>{f.state.documents.pop();}],
 ['wrong approval hash',f=>{f.state.approvals[0].contentHash=hash('changed');}],
])test(`docs-only preflight holds ${name}`,async()=>{
 assert.equal(typeof api.runGate,'function');const f=fixture('documents');mutate(f);const before=structuredClone(f.state);
 const result=await api.runGate(f);assert.notEqual(result.decision,'allow');assert.deepEqual(f.state,before);assert.equal(result.proposedTransition,null);
});
test('accepted task preflight matches exact current diff and does not mark committed',async()=>{
 assert.equal(typeof api.runGate,'function');const f=fixture();const result=await api.runGate(f);
 assert.equal(result.decision,'allow');assert.equal(f.state.tasks[0].status,'accepted');assert.equal(f.state.commits.length,0);
 assert.equal(result.expectedCommit.parent,f.state.target.head);assert.equal(result.expectedCommit.tree,f.gitEvidence.indexTree);assert.deepEqual(result.expectedCommit.paths,['code.mjs']);
});
for(const [name,mutate] of [
 ['no acceptance',f=>{f.state.acceptances=[];}],
 ['wrong acceptance task',f=>{f.state.acceptances[0].taskId='T2';}],
 ['unaccepted task',f=>{f.state.tasks[0].status='implemented';}],
 ['stale accepted diff',f=>{f.gitEvidence.stagedFingerprint=hash('new diff');}],
 ['unrelated staged path',f=>{f.gitEvidence.stagedPaths.push('other.mjs');}],
 ['unstaged task change',f=>{f.gitEvidence.workingPaths=['code.mjs'];}],
 ['untracked task change',f=>{f.gitEvidence.untrackedPaths=['code.mjs'];}],
 ['stale expected tree',f=>{f.gitEvidence.indexTree=sha('f');}],
 ['HEAD drift',f=>{f.gitEvidence.target.head=sha('f');}],
 ['wrong worktree',f=>{f.gitEvidence.target.realpath='/other';}],
 ['specialist mutation',f=>{f.state.identities[0].role='coder';}],
 ['retired actor',f=>{f.state.leases[0].status='retired';}],
])test(`task preflight holds or denies ${name} without transition`,async()=>{
 assert.equal(typeof api.runGate,'function');const f=fixture();mutate(f);const before=structuredClone(f.state);
 const result=await api.runGate(f);assert.notEqual(result.decision,'allow');assert.equal(result.proposedTransition,null);assert.deepEqual(f.state,before);
});
function reconciliation(){const f=fixture();f.phase='reconcile';f.expectedCommit={requestId:f.request.requestId,taskId:'T1',parent:sha('a'),tree:sha('b'),paths:['code.mjs'],fingerprint:hash('diff')};f.result={commit:sha('c'),parent:sha('a'),tree:sha('b'),paths:['code.mjs'],head:sha('c'),target:{...f.state.target,head:sha('c')},remainingPaths:[]};return f;}
test('only observed matching SHA parent tree paths and resulting HEAD complete commit',async()=>{
 assert.equal(typeof api.runGate,'function');const f=reconciliation();const result=await api.runGate(f);
 assert.equal(result.decision,'allow');assert.equal(result.proposedTransition.tasks[0].status,'committed');
 assert.equal(result.proposedTransition.commits[0].commit,sha('c'));assert.equal(result.proposedTransition.target.head,sha('c'));
 assert.equal(f.state.target.head,sha('a'),'input must remain immutable');
});
for(const [name,mutate] of [
 ['lost result',f=>{delete f.result;}],['wrong parent',f=>{f.result.parent=sha('f');}],
 ['wrong tree',f=>{f.result.tree=sha('f');}],['wrong HEAD',f=>{f.result.head=sha('f');}],
 ['wrong path set',f=>{f.result.paths.push('other');}],['remaining changes',f=>{f.result.remainingPaths=['code.mjs'];}],
 ['unknown request',f=>{f.expectedCommit.requestId='other';}],['different target',f=>{f.result.target.realpath='/other';}],
])test(`reconciliation holds ${name}; no assumed completion or retry action`,async()=>{
 assert.equal(typeof api.runGate,'function');const f=reconciliation();mutate(f);const before=structuredClone(f.state);const result=await api.runGate(f);
 assert.equal(result.decision,'hold');assert.equal(result.proposedTransition,null);assert.deepEqual(f.state,before);assert.equal(result.retry,undefined);assert.equal(result.command,undefined);
});

test('reconciled commit records retain schema preflight fields',async()=>{const f=reconciliation();const d=await api.runGate(f);const c=d.proposedTransition.commits[0];assert.equal(c.purpose,'task');assert.equal(c.expectedParent,sha('a'));assert.equal(c.expectedTree,sha('b'));});

test('shared Git snapshot checks reject unrelated scope without changing trusted role provenance',()=>{
 const f=fixture();assert.equal(typeof api.validateGitPreflight,'function');
 assert.equal(api.validateGitPreflight({target:f.state.target,descriptor:f.request.descriptor,scope:f.state.tasks[0].paths,gitEvidence:f.gitEvidence}),null);
 f.request.descriptor.paths=['other.mjs'];f.gitEvidence.stagedPaths=['other.mjs'];
 assert.match(api.validateGitPreflight({target:f.state.target,descriptor:f.request.descriptor,scope:f.state.tasks[0].paths,gitEvidence:f.gitEvidence}),/unrelated|another task/i);
});
