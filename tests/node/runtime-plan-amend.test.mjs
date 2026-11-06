import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {initializeCooperativeWorkflow} from '../../lib/runtime/bootstrap.mjs';
import {runCooperativeCommand} from '../../lib/runtime/cooperative.mjs';
import {fingerprintRequest} from '../../lib/runtime/store.mjs';

const oid = c => c.repeat(40);
const hash = bytes => 'sha256:' + crypto.createHash('sha256').update(bytes).digest('hex');
const remoteIdentity = hash(JSON.stringify(['https://example.invalid/arc-fixture']));
const blob = bytes => crypto.createHash('sha1').update(`blob ${Buffer.byteLength(bytes)}\0`).update(bytes).digest('hex');
const now = Date.parse('2026-11-05T12:00:00.000Z');
const iso = value => new Date(value).toISOString();
const oldText = '# plan v1\n';
const newText = '# plan v2\n';
const actor = {id:'operator',role:'orchestrator'};
const mode = '100644';

function contract(target, history, at=now) {
 const planPath=path.join(target.realpath,'plan.md');
 return {
  classification:'contract',reason:'approved acceptance change',changedAt:iso(at-60000),affectedTaskIds:['T1'],
  plan:{path:planPath,gitPath:'plan.md',old:{version:1,hash:hash(oldText),content:oldText},new:{version:2,hash:hash(newText),content:newText}},
  history:{base:history.base,planCommit:history.planCommit,head:history.head,branch:target.branch},
  approvals:{original:{ref:'approval:old',version:1,hash:hash(oldText),approvedAt:iso(at-120000)},amendment:{ref:'approval:new',version:2,hash:hash(newText),approvedAt:iso(at-30000)}},
  writers:[{assignmentId:'implementer:T1',stoppedAt:iso(at-45000),evidenceRef:'writer:stopped'}],
  ownership:'exclusive',publication:'unpublished',
  remotes:[{name:'origin',identity:remoteIdentity,complete:true,refs:[{name:'refs/heads/main',oid:history.base}],observedAt:iso(at-1000),evidenceRef:'remote:snapshot'}],
  recovery:{ref:'refs/arc/recovery/plan-test',oid:history.head}
 };
}
function syntheticHistory() {
 const base=oid('a'),planCommit=oid('b'),first=oid('c'),head=oid('d');
 const revised=oid('e'),next=oid('f'),newHead=oid('1');
 const entry=(name,content)=>({path:name,mode,oid:blob(content)});
 const oldPlan=entry('plan.md',oldText),newPlan=entry('plan.md',newText),one=entry('one.txt','one\n'),two=entry('two.txt','two\n');
 const commit=(id,parent,message,tree)=>({oid:id,parent,author:'ARC <arc@example.invalid>',authorDate:'2026-11-05T10:00:00Z',message,tree});
 return {base,planCommit,first,head,revised,next,newHead,
  oldCommits:[commit(planCommit,base,'docs\n',[oldPlan]),commit(first,planCommit,'first\n',[oldPlan,one]),commit(head,first,'second\n',[oldPlan,one,two])],
  newCommits:[commit(revised,base,'docs\n',[newPlan]),commit(next,revised,'first\n',[newPlan,one]),commit(newHead,next,'second\n',[newPlan,one,two])],
  mapping:[{old:planCommit,new:revised},{old:first,new:next},{old:head,new:newHead}]};
}

// The injectable observer and clock are trusted test seams. They are not part
// of the JSON command envelope and cannot be supplied by a CLI caller.
async function fixture(t) {
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'arc-plan-amend-unit-')));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const cwd=path.join(root,'workspace'),common=path.join(root,'common');await fs.mkdir(cwd);await fs.mkdir(common);await fs.writeFile(path.join(cwd,'plan.md'),oldText);
 const h=syntheticHistory(),target={realpath:cwd,gitCommonDir:common,gitDir:common,head:h.head,branch:'main'};
 let currentTarget={...target};
 const observation={target,index:{tree:oid('2'),headTree:oid('2'),stagedPaths:[]},worktree:{planClean:true,nonPlanFingerprint:hash('dirty tracked and untracked bytes')},configuredRemotes:[{name:'origin',identity:remoteIdentity}],history:{base:h.base,planCommit:h.planCommit,head:h.head,commits:h.oldCommits},plan:{path:path.join(cwd,'plan.md'),content:oldText,hash:hash(oldText),originalHash:hash(oldText),mode},recoveryRef:null};
 const args={cwd,workflowId:'plan-amend',observe:async()=>({...currentTarget}),readPlanAmendGit:async()=>structuredClone(observation),clock:()=>now};
 await initializeCooperativeWorkflow({...args,input:{mode:'plan',actor,selection:{messageRef:'target:selected',contentHash:hash('selection')}}});
 const file=path.join(common,'arc/workflows/plan-amend/state.json');let revision=0,sequence=0;
 async function invoke(command,input,overrides={}){
  const full={requestId:`r${++sequence}`,expectedRevision:revision,actor,...input};
  const out=await runCooperativeCommand({...args,...overrides,command,input:full});revision=out.revision;return {out,input:full};
 }
 const a=contract(target,h);
 for(const [ref,approval] of Object.entries({old:a.approvals.original,new:a.approvals.amendment})){
  const r=await invoke('record',{evidence:{kind:'approval',messageRef:approval.ref,data:{kind:'plan',path:a.plan.path,version:approval.version,contentHash:approval.hash,approvedAt:approval.approvedAt}}});
  assert.equal(r.out.decision,'allow',ref+' approval record');
 }
 assert.equal((await invoke('record',{evidence:{kind:'note',messageRef:'writer:stopped',data:{type:'writer-stopped',assignmentId:a.writers[0].assignmentId,stoppedAt:a.writers[0].stoppedAt}}})).out.decision,'allow');
 return {args,target,h,a,observation,file,invoke,state:async()=>JSON.parse(await fs.readFile(file,'utf8')),setTarget:value=>{currentTarget=value;}};
}
async function prepare(f,mutate=()=>{},inputOverrides={}) {
 const a=structuredClone(f.a);mutate(a,f.observation);return f.invoke('prepare',{operation:'plan-amend',arguments:a,...inputOverrides});
}
async function ready(f) {
 const p=await prepare(f);assert.equal(p.out.decision,'allow','valid plan-amend evidence must prepare a durable intent');assert.equal(p.out.persisted,true);
 f.observation.recoveryRef={name:f.a.recovery.ref,oid:f.a.recovery.oid};
 const c=await f.invoke('record',{evidence:{kind:'note',messageRef:'checkpoint:before-rewrite',data:{type:'plan-amend-checkpoint',intentId:p.input.requestId}}});
 assert.equal(c.out.decision,'allow','checkpoint requires the locally observed recovery ref and unchanged HEAD');
 return p.input.requestId;
}
async function rewritten(f) {
 await fs.writeFile(f.a.plan.path,newText);
 const target={...f.target,head:f.h.newHead};f.setTarget(target);
 f.observation.target=target;f.observation.history={base:f.h.base,planCommit:f.h.planCommit,head:f.h.head,commits:f.h.oldCommits,newCommits:f.h.newCommits};
 f.observation.plan={path:f.a.plan.path,content:newText,hash:hash(newText),originalHash:hash(oldText),mode};
}
function result(f,status='succeeded') {
 return {status,messageRef:'operator:rewrite',data:{head:f.h.newHead,mapping:structuredClone(f.h.mapping),remotes:structuredClone(f.a.remotes)}};
}

test('valid plan-amend is allowed only after the intent is durably saved and request fingerprint is computed',async t=>{
 const f=await fixture(t),p=await prepare(f);
 assert.equal(p.out.decision,'allow','valid plan-amend evidence must prepare a durable intent');assert.equal(p.out.persisted,true);
 assert.equal(p.out.coverage.nativeVerified,false);assert.equal(p.out.coverage.provenance,'operator-attested');
 const state=await f.state(),intent=state.intents.find(i=>i.requestId===p.input.requestId);
 assert.equal(intent.operation,'plan-amend');assert.equal(intent.status,'prepared');
 assert.equal(state.requests.find(r=>r.requestId===p.input.requestId).requestFingerprint,fingerprintRequest({command:'prepare',input:p.input}));
 assert.deepEqual(state.target,f.target);assert.equal(state.commits.length,0);
});

for(const [name,mutate,options] of [
 ['new document hash mismatch',a=>{a.plan.new.hash=hash('wrong');}],
 ['approval hash mismatch',a=>{a.approvals.amendment.hash=hash('wrong');}],
 ['amendment approval version mismatch',a=>{a.approvals.amendment.version=3;}],
 ['amendment approval reference mismatch',a=>{a.approvals.amendment.ref='approval:missing';}],
 ['approval predates the changed document',a=>{a.approvals.amendment.approvedAt=iso(now-90000);}],
 ['missing writer stop evidence',a=>{a.writers[0].evidenceRef='';}],
 ['duplicate affected task IDs',a=>{a.affectedTaskIds=['T1','T1'];}],
 ['plan path escapes checkout',a=>{a.plan.gitPath='../plan.md';}],
 ['remote snapshot older than five minutes',a=>{a.remotes[0].observedAt=iso(now-300001);}],
 ['remote snapshot from the future',a=>{a.remotes[0].observedAt=iso(now+1);}],
 ['configured remote is missing',a=>{a.remotes=[];}],
 ['remote endpoint identity mismatch',a=>{a.remotes[0].identity=hash('different endpoint');}],
 ['local endpoint changed under the same name',(_a,g)=>{g.configuredRemotes[0].identity=hash('changed endpoint');}],
 ['incomplete remote snapshot',a=>{delete a.remotes[0].refs;}],
 ['unknown publication',a=>{a.publication='unknown';}],
 ['unknown ownership',a=>{a.ownership='unknown';}],
 ['staged index',(_a,g)=>{g.index.stagedPaths=['one.txt'];}],
 ['dirty plan path',(_a,g)=>{g.worktree.planClean=false;}],
 ['nonlinear history',(_a,g)=>{g.history.commits[1].parent=[oid('b'),oid('9')];}],
 ['wrong actor',()=>{},{actor:{id:'worker',role:'implementer'}}],
 ])test(`plan-amend holds ${name} without an executable intent`,async t=>{
 const f=await fixture(t);let out;
 try{({out}=await prepare(f,mutate,options));}catch(error){assert.match(error.message,/schema|input|invalid|evidence|field/i);}
 if(out)assert.notEqual(out.decision,'allow');assert.equal((await f.state()).intents.length,0);
});

test('remote snapshot at exactly five minutes is eligible while older is held',async t=>{
 const f=await fixture(t);const p=await prepare(f,a=>{a.remotes[0].observedAt=iso(now-300000);});assert.equal(p.out.decision,'allow');
});

test('remote snapshots without an endpoint identity cannot prepare a rewrite',async t=>{
 const f=await fixture(t);let p;try{p=await prepare(f,a=>{delete a.remotes[0].identity;});}catch(error){assert.match(error.message,/schema|remote/i);}
 if(p)assert.notEqual(p.out.decision,'allow');assert.equal((await f.state()).intents.length,0);
});

test('held prepare exposes only the observed opaque local remote identity',async t=>{
 const f=await fixture(t),p=await prepare(f,a=>{a.remotes[0].identity=hash('wrong endpoint');});assert.notEqual(p.out.decision,'allow');
 assert.deepEqual(p.out.observedRemoteIdentities,{source:'local-git',remotes:[{name:'origin',identity:remoteIdentity}]});assert.equal(p.out.coverage.nativeVerified,false);
});

test('mechanical change can prepare with its original approval and no amendment approval',async t=>{
 const f=await fixture(t),p=await prepare(f,a=>{a.classification='mechanical';a.approvals.amendment=null;});assert.equal(p.out.decision,'allow');assert.equal(p.out.persisted,true);assert.equal((await f.state()).intents.find(i=>i.requestId===p.input.requestId).operation,'plan-amend');
});

test('contract change requires the new version and hash to have an amendment approval',async t=>{
 const f=await fixture(t);let p;try{p=await prepare(f,a=>{a.approvals.amendment=null;});}catch(error){assert.match(error.message,/schema|approval/i);}
 if(p)assert.notEqual(p.out.decision,'allow');assert.equal((await f.state()).intents.length,0);
});

async function observerFixture(t,urls){
 const {readPlanAmendGitEvidence}=await import('../../lib/runtime/git-evidence.mjs');
 const temp=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'arc-plan-amend-remote-')));t.after(()=>fs.rm(temp,{recursive:true,force:true}));
 const cwd=path.join(temp,'work'),common=path.join(temp,'common');await fs.mkdir(cwd);await fs.mkdir(common);await fs.writeFile(path.join(cwd,'plan.md'),oldText);
 const head=oid('a'),base=oid('b'),blobOid=blob(oldText),body=Buffer.concat([Buffer.from('100644 plan.md\0'),Buffer.from(blobOid,'hex')]),tree=crypto.createHash('sha1').update(Buffer.from(`tree ${body.length}\0`)).update(body).digest('hex');
 const target={realpath:cwd,gitCommonDir:common,gitDir:common,head,branch:'main'},a=contract(target,{base,planCommit:head,head}),calls=[];
 const outputs=new Map([
  [JSON.stringify(['rev-parse','--show-toplevel']),cwd+'\n'],[JSON.stringify(['rev-parse','--path-format=absolute','--git-common-dir']),common+'\n'],[JSON.stringify(['rev-parse','HEAD']),head+'\n'],[JSON.stringify(['symbolic-ref','--quiet','--short','HEAD']),'main\n'],
  [JSON.stringify(['ls-files','--stage','-z']),`100644 ${blobOid} 0\tplan.md\0`],[JSON.stringify(['diff','--cached','--name-only','-z','--']),''],[JSON.stringify(['diff','--cached','--binary','--no-ext-diff','--no-textconv','--']),''],[JSON.stringify(['diff','--name-only','-z','--no-ext-diff','--no-textconv','--']),''],[JSON.stringify(['ls-files','--others','--exclude-standard','-z']),''],
  [JSON.stringify(['rev-parse','--verify',`${head}^{tree}`]),tree+'\n'],[JSON.stringify(['remote']),'origin\n'],[JSON.stringify(['remote','get-url','--all','origin']),urls.join('\n')+'\n'],[JSON.stringify(['rev-list','--reverse','--topo-order',`${base}..${head}`]),head+'\n'],
  [JSON.stringify(['cat-file','commit',head]),`tree ${tree}\nparent ${base}\nauthor ARC <arc@example.invalid> 1793872800 +0000\ncommitter ARC <arc@example.invalid> 1793872800 +0000\n\ndocs\n`],[JSON.stringify(['ls-tree','-r','-z','--full-tree',head]),`100644 blob ${blobOid}\tplan.md\0`],[JSON.stringify(['show',`${head}:plan.md`]),oldText]
 ]);
 const gitRunner=async ({args})=>{calls.push(args);if(args[0]==='show-ref')return {status:1,stdout:''};const key=JSON.stringify(args);assert.ok(outputs.has(key),'unexpected Git query '+key);return {status:0,stdout:outputs.get(key)};};
 return {readPlanAmendGitEvidence,target,a,calls,gitRunner};
}

test('read-only observer binds sanitized complete fetch URL set without network or mutation commands',async t=>{
 const f=await observerFixture(t,['https://user:password@example.invalid/arc-fixture#private','https://another.example/team/repo#key=secret']);
 const observed=await f.readPlanAmendGitEvidence({target:f.target,arguments:f.a,gitRunner:f.gitRunner});
 const forbidden=new Set(['fetch','ls-remote','push','update-ref','rebase','reset','checkout','worktree']);
 assert.ok(f.calls.every(args=>!forbidden.has(args[0])));assert.ok(f.calls.some(args=>JSON.stringify(args)===JSON.stringify(['remote','get-url','--all','origin'])));
 assert.deepEqual(observed.configuredRemotes,[{name:'origin',identity:hash(JSON.stringify(['https://another.example/team/repo','https://example.invalid/arc-fixture']))}]);
 const serialized=JSON.stringify(observed);for(const secret of ['password','token=secret','key=secret','#private'])assert.equal(serialized.includes(secret),false);
 const same=await observerFixture(t,['https://another.example/team/repo#different','https://other:credential@example.invalid/arc-fixture']);
 const again=await same.readPlanAmendGitEvidence({target:same.target,arguments:same.a,gitRunner:same.gitRunner});assert.deepEqual(again.configuredRemotes,observed.configuredRemotes);
});

test('a configured URL query holds without disclosing userinfo query or fragment in output or state',async t=>{
 const secrets=['ARC_USERINFO_CANARY_31bd','ARC_PASSWORD_CANARY_82fc','ARC_QUERY_SECRET_CANARY_9f2c','ARC_FRAGMENT_CANARY_7a1e'];
 const f=await observerFixture(t,['https://ARC_USERINFO_CANARY_31bd:ARC_PASSWORD_CANARY_82fc@example.invalid/arc-fixture?tenant=ARC_QUERY_SECRET_CANARY_9f2c#ARC_FRAGMENT_CANARY_7a1e']);
 await assert.rejects(f.readPlanAmendGitEvidence({target:f.target,arguments:f.a,gitRunner:f.gitRunner}),error=>{assert.match(error.message,/remote identity/i);for(const secret of secrets)assert.equal(error.message.includes(secret),false);return true;});
 const workflow=await fixture(t);workflow.args.readPlanAmendGit=()=>f.readPlanAmendGitEvidence({target:f.target,arguments:f.a,gitRunner:f.gitRunner});
 const p=await prepare(workflow);assert.notEqual(p.out.decision,'allow');const serialized=JSON.stringify({output:p.out,state:await workflow.state()});
 for(const secret of secrets)assert.equal(serialized.includes(secret),false);
});

test('invalid local fetch URL is held without disclosing credential-bearing input',async t=>{
 const f=await observerFixture(t,['https://user:password@/repo?token=secret']);
 await assert.rejects(f.readPlanAmendGitEvidence({target:f.target,arguments:f.a,gitRunner:f.gitRunner}),error=>{assert.match(error.message,/remote identity/i);assert.doesNotMatch(error.message,/password|token=secret/);return true;});
});

test('durable write failure cannot return allow or leave a partial intent',async t=>{
 const f=await fixture(t),before=await fs.readFile(f.file,'utf8');
 await assert.rejects(f.invoke('prepare',{operation:'plan-amend',arguments:f.a},{storage:{rename:async()=>{throw Error('durability failure');}}}),/durability failure/);
 assert.equal(await fs.readFile(f.file,'utf8'),before);assert.equal((await f.state()).intents.length,0);
});

test('same request replay cannot authorize another rewrite and modified replay conflicts',async t=>{
 const f=await fixture(t),p=await prepare(f);assert.equal(p.out.decision,'allow');const before=await fs.readFile(f.file,'utf8');
 const replay=await runCooperativeCommand({...f.args,command:'prepare',input:p.input});assert.notEqual(replay.decision,'allow');assert.equal(replay.replayed,true);assert.equal(await fs.readFile(f.file,'utf8'),before);
 const changed=structuredClone(p.input);changed.arguments.reason='changed request';await assert.rejects(runCooperativeCommand({...f.args,command:'prepare',input:changed}),/fingerprint.*conflict/i);assert.equal(await fs.readFile(f.file,'utf8'),before);
});

test('checkpoint requires the expected recovery ref before rewrite and cannot be backdated after HEAD changes',async t=>{
 const f=await fixture(t),p=await prepare(f);assert.equal(p.out.decision,'allow');
 const evidence={kind:'note',messageRef:'checkpoint:before-rewrite',data:{type:'plan-amend-checkpoint',intentId:p.input.requestId}};
 assert.notEqual((await f.invoke('record',{evidence})).out.decision,'allow');
 f.observation.recoveryRef={name:f.a.recovery.ref,oid:oid('9')};assert.notEqual((await f.invoke('record',{evidence:{...evidence,messageRef:'checkpoint:wrong-ref'}})).out.decision,'allow');
 f.observation.recoveryRef={name:f.a.recovery.ref,oid:f.a.recovery.oid};f.setTarget({...f.target,head:f.h.newHead});
 assert.notEqual((await f.invoke('record',{evidence:{...evidence,messageRef:'checkpoint:late'}})).out.decision,'allow');
});

test('checkpoint holds a remote endpoint change under the same remote name',async t=>{
 const f=await fixture(t),p=await prepare(f);assert.equal(p.out.decision,'allow');f.observation.recoveryRef={name:f.a.recovery.ref,oid:f.a.recovery.oid};f.observation.configuredRemotes[0].identity=hash('new endpoint');
 const r=await f.invoke('record',{evidence:{kind:'note',messageRef:'checkpoint:changed-remote',data:{type:'plan-amend-checkpoint',intentId:p.input.requestId}}});assert.notEqual(r.out.decision,'allow');assert.equal((await f.state()).intents.find(i=>i.requestId===p.input.requestId).checkpoint,undefined);
});

test('same intent reconciliation observes the mapping before changing target',async t=>{
 const f=await fixture(t),intentId=await ready(f);await rewritten(f);
 const r=await f.invoke('reconcile',{intentId,result:result(f)});assert.equal(r.out.decision,'allow');assert.equal(r.out.persisted,true);
 const state=await f.state();assert.equal(state.target.head,f.h.newHead);assert.equal(state.target.branch,'main');assert.equal(state.intents.find(i=>i.requestId===intentId).status,'succeeded');assert.equal(r.out.coverage.nativeVerified,false);
});

for(const [name,mutate] of [
 ['missing mapping',(_f,r)=>{r.data.mapping.pop();}],
 ['duplicate mapping',(_f,r)=>{r.data.mapping[1].new=r.data.mapping[0].new;}],
 ['wrong parent',f=>{f.observation.history.newCommits[1].parent=oid('9');}],
 ['non-plan tree change',f=>{f.observation.history.newCommits[1].tree[1].oid=oid('9');}],
 ['descendant plan change',f=>{f.observation.history.newCommits[2].tree[0].oid=blob('unapproved\n');}],
 ['changed commit message',f=>{f.observation.history.newCommits[1].message='different\n';}],
 ['dirty file fingerprint changed',f=>{f.observation.worktree.nonPlanFingerprint=hash('changed');}],
 ['wrong recovery ref',f=>{f.observation.recoveryRef.oid=oid('9');}],
 ['remote endpoint changed',f=>{f.observation.configuredRemotes[0].identity=hash('new endpoint');}],
 ['remote endpoint and refreshed attestation both changed',(f,r)=>{const identity=hash('new endpoint');f.observation.configuredRemotes[0].identity=identity;r.data.remotes[0].identity=identity;}],
 ['wrong branch',f=>{f.setTarget({...f.target,head:f.h.newHead,branch:'other'});f.observation.target.branch='other';}],
 ])test(`reconciliation holds ${name} and keeps the protected target`,async t=>{
 const f=await fixture(t),intentId=await ready(f);await rewritten(f);const statement=result(f);mutate(f,statement);
 const r=await f.invoke('reconcile',{intentId,result:statement});assert.notEqual(r.out.decision,'allow');
 const state=await f.state();assert.equal(state.target.head,f.target.head);assert.notEqual(state.intents.find(i=>i.requestId===intentId).status,'succeeded');
});

test('unknown result cannot become success via a different intent or automatic retry',async t=>{
 const f=await fixture(t),intentId=await ready(f);await rewritten(f);
 assert.notEqual((await f.invoke('reconcile',{intentId,result:result(f,'unknown')})).out.decision,'allow');
 assert.notEqual((await f.invoke('reconcile',{intentId:'different-intent',result:result(f)})).out.decision,'allow');
 assert.equal((await f.state()).target.head,f.target.head);
});

// These cases run only under Orchestrator's opt-in. All Git mutations are
// confined to this test-owned temporary repository and helper worktree.
for(const scenario of ['success','bad-mapping','cas-failure'])test(`actual Git amendment preserves the dirty checkout (${scenario})`,{skip:process.env.ARC_RUN_GIT_INTEGRATION!=='1'},async t=>{
 const {execFileSync,spawnSync}=await import('node:child_process');
 const {observeCooperativeTarget}=await import('../../lib/runtime/scope.mjs');
 const temp=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'arc-plan-amend-git-')));t.after(()=>fs.rm(temp,{recursive:true,force:true}));
 const root=path.join(temp,'primary'),helper=path.join(temp,'helper');await fs.mkdir(root);
 const env={...Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.toUpperCase().startsWith('GIT_'))),GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1',GIT_TERMINAL_PROMPT:'0'};
 const gitAt=(cwd,...args)=>execFileSync('git',['-c','user.name=ARC Fixture','-c','user.email=fixture@example.invalid',...args],{cwd,env,encoding:'utf8'}).trim();
 const git=(...args)=>gitAt(root,...args);
 git('init','-q','-b','main');await fs.writeFile(path.join(root,'tracked.txt'),'base\n');git('add','tracked.txt');git('commit','-qm','base');const base=git('rev-parse','HEAD');
 await fs.writeFile(path.join(root,'plan.md'),oldText);await fs.writeFile(path.join(root,'spec.md'),'spec\n');git('add','plan.md','spec.md');git('commit','-qm','docs');const planCommit=git('rev-parse','HEAD');
 await fs.writeFile(path.join(root,'one.txt'),'one\n');git('add','one.txt');git('commit','-qm','first');const first=git('rev-parse','HEAD');
 await fs.writeFile(path.join(root,'two.txt'),'two\n');git('add','two.txt');git('commit','-qm','second');const head=git('rev-parse','HEAD');
 git('remote','add','origin','https://example.invalid/arc-fixture');
 await fs.writeFile(path.join(root,'tracked.txt'),'pending original task\n');await fs.writeFile(path.join(root,'untracked.txt'),'preserve me\n');
 const target=await observeCooperativeTarget(root),a=contract(target,{base,planCommit,head}),args={cwd:root,workflowId:'real-amend',clock:()=>now};
 await initializeCooperativeWorkflow({...args,input:{mode:'plan',actor,selection:{messageRef:'target:selected',contentHash:hash('selection')}}});
 let revision=0,sequence=0;async function invoke(command,input){const full={requestId:`real:${++sequence}`,expectedRevision:revision,actor,...input};const out=await runCooperativeCommand({...args,command,input:full});revision=out.revision;return {out,input:full};}
 for(const approval of [a.approvals.original,a.approvals.amendment])assert.equal((await invoke('record',{evidence:{kind:'approval',messageRef:approval.ref,data:{kind:'plan',path:a.plan.path,version:approval.version,contentHash:approval.hash,approvedAt:approval.approvedAt}}})).out.decision,'allow');
 assert.equal((await invoke('record',{evidence:{kind:'note',messageRef:'writer:stopped',data:{type:'writer-stopped',assignmentId:a.writers[0].assignmentId,stoppedAt:a.writers[0].stoppedAt}}})).out.decision,'allow');
 const refsBefore=git('show-ref'),trackedBefore=await fs.readFile(path.join(root,'tracked.txt'),'utf8'),untrackedBefore=await fs.readFile(path.join(root,'untracked.txt'),'utf8');
 const prepared=await invoke('prepare',{operation:'plan-amend',arguments:a});assert.equal(prepared.out.decision,'allow','valid actual Git history must prepare');assert.equal(prepared.out.persisted,true);
 assert.equal(git('show-ref'),refsBefore,'prepare must not create refs or rewrite history');assert.equal(await fs.readFile(path.join(root,'tracked.txt'),'utf8'),trackedBefore);
 git('update-ref',a.recovery.ref,head);
 const checkpoint=await invoke('record',{evidence:{kind:'note',messageRef:'checkpoint:before-rewrite',data:{type:'plan-amend-checkpoint',intentId:prepared.input.requestId}}});assert.equal(checkpoint.out.decision,'allow');
 git('worktree','add','--detach',helper,planCommit);await fs.writeFile(path.join(helper,'plan.md'),newText);gitAt(helper,'add','plan.md');gitAt(helper,'commit','--amend','--no-edit','-q');const revised=gitAt(helper,'rev-parse','HEAD');
 gitAt(helper,'cherry-pick',first);const next=gitAt(helper,'rev-parse','HEAD');gitAt(helper,'cherry-pick',head);const newHead=gitAt(helper,'rev-parse','HEAD');
 git('switch','--detach',head);
 if(scenario==='cas-failure'){
  const failed=spawnSync('git',['update-ref','refs/heads/main',newHead,base],{cwd:root,env,encoding:'utf8'});assert.notEqual(failed.status,0);assert.equal(git('rev-parse','refs/heads/main'),head);
  const r=await invoke('reconcile',{intentId:prepared.input.requestId,result:{status:'unknown',messageRef:'operator:cas-failed',data:{head,mapping:[],remotes:a.remotes}}});
  assert.notEqual(r.out.decision,'allow');const state=JSON.parse(await fs.readFile(path.join(target.gitCommonDir,'arc/workflows/real-amend/state.json'),'utf8'));assert.equal(state.target.head,head);assert.notEqual(state.intents.find(i=>i.requestId===prepared.input.requestId).status,'succeeded');return;
 }
 git('update-ref','refs/heads/main',newHead,head);git('switch','main');
 assert.equal(await fs.readFile(path.join(root,'tracked.txt'),'utf8'),trackedBefore);assert.equal(await fs.readFile(path.join(root,'untracked.txt'),'utf8'),untrackedBefore);assert.equal(git('diff','--cached','--name-only'),'');
 const mapping=[{old:planCommit,new:revised},{old:first,new:next},{old:head,new:newHead}];if(scenario==='bad-mapping')mapping.pop();
 const r=await invoke('reconcile',{intentId:prepared.input.requestId,result:{status:'succeeded',messageRef:'operator:rewrite',data:{head:newHead,mapping,remotes:a.remotes}}});
 const state=JSON.parse(await fs.readFile(path.join(target.gitCommonDir,'arc/workflows/real-amend/state.json'),'utf8'));
 if(scenario==='success'){assert.equal(r.out.decision,'allow');assert.equal(state.target.head,newHead);assert.equal(await fs.readFile(path.join(root,'plan.md'),'utf8'),newText);}
 else{assert.notEqual(r.out.decision,'allow');assert.equal(state.target.head,head);assert.notEqual(state.intents.find(i=>i.requestId===prepared.input.requestId).status,'succeeded');}
 assert.equal(git('rev-parse',a.recovery.ref),head);
});
