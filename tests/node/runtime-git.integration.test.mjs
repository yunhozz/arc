// Git mutations in this suite are executed ONLY by Orchestrator in an isolated
// temporary repository. Coder authors this file but must not execute the suite.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
const evidenceApi=await import('../../lib/runtime/git-evidence.mjs').catch(()=>({}));
const gateApi=await import('../../lib/runtime/gate.mjs').catch(()=>({}));
const hash=s=>'sha256:'+crypto.createHash('sha256').update(s).digest('hex');
test('actual isolated repository verifies docs/task SHA parent tree, holds invalid request before mutation',{skip:process.env.ARC_RUN_GIT_INTEGRATION!=='1'},async t=>{
 const tempRoot=await fs.mkdtemp(path.join(os.tmpdir(),'arc-t3-git-'));t.after(()=>fs.rm(tempRoot,{recursive:true,force:true}));
 const root=await fs.realpath(tempRoot);
 // No caller-controlled Git variables, hooks, signing, global config or shell.
 const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('GIT_')));
 Object.assign(env,{GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:process.platform==='win32'?'NUL':'/dev/null',GIT_AUTHOR_NAME:'ARC fixture',GIT_AUTHOR_EMAIL:'fixture@example.invalid',GIT_COMMITTER_NAME:'ARC fixture',GIT_COMMITTER_EMAIL:'fixture@example.invalid'});
 const git=(...args)=>{const r=spawnSync('git',args,{cwd:root,env,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
 git('init','--initial-branch=fixture');git('config','core.hooksPath',path.join(root,'no-hooks'));git('config','commit.gpgsign','false');
 await fs.writeFile(path.join(root,'code.mjs'),'export const value=1;\n');git('add','--','code.mjs');git('commit','-m','base');
 const base=git('rev-parse','HEAD');
 assert.equal(typeof evidenceApi.readGitEvidence,'function','Git object evidence reader must exist');
 assert.equal(typeof gateApi.runGate,'function','commit gate must exist');
 const target={realpath:root,gitCommonDir:git('rev-parse','--path-format=absolute','--git-common-dir'),head:base,branch:'fixture'};
 const documents=['spec','plan'].map(kind=>({kind,path:path.join(root,kind+'.md'),gitPath:kind+'.md',contentHash:hash(kind),approvalRef:kind}));
 for(const d of documents)await fs.writeFile(d.path,d.kind);
 git('add','--','spec.md','plan.md');
 const gitRunner=async({args,cwd})=>{assert.equal(cwd,root);return spawnSync('git',args,{cwd,env,encoding:'utf8'});};
 let observed=await evidenceApi.readGitEvidence({target,documents,gitRunner});
 const state={workflowId:'workflow',revision:0,target,mode:'plan',documents,
  identities:[{actorRef:'root',role:'orchestrator',taskId:'T1'}],leases:[{actorRef:'root',taskId:'T1',status:'active'}],
  tasks:[{id:'T1',status:'pending',paths:[path.join(root,'code.mjs')],criteria:['criterion'],requiredChecks:['qa']}],
  approvals:documents.map(d=>({id:d.approvalRef,source:'user-message',messageRef:d.kind,contentHash:d.contentHash})),acceptances:[],commits:[],audit:[]};
 const request={requestId:'docs',actorRef:'root',taskId:'T1',operation:'commit',cwd:root,paths:documents.map(d=>d.path),descriptor:{kind:'documents',parent:base,indexTree:observed.indexTree,fingerprint:observed.stagedFingerprint,paths:documents.map(d=>d.gitPath)}};
 let allowed=await gateApi.runGate({phase:'preflight',state,request,gitEvidence:observed});assert.equal(allowed.decision,'allow');
 // Mixing a product path into the index must be rejected without touching HEAD.
 await fs.writeFile(path.join(root,'code.mjs'),'export const value=2;\n');git('add','--','code.mjs');
 const mixed=await evidenceApi.readGitEvidence({target,documents,gitRunner});
 const rejected=await gateApi.runGate({phase:'preflight',state,request,gitEvidence:mixed});assert.notEqual(rejected.decision,'allow');assert.equal(git('rev-parse','HEAD'),base);
 // Remove only this fixture's staged product change; this reset is Orchestrator
 // fixture preparation, never recovery against the user's working tree.
 git('restore','--staged','--','code.mjs');
 await fs.writeFile(path.join(root,'code.mjs'),'export const value=1;\n');
 observed=await evidenceApi.readGitEvidence({target,documents,gitRunner});
 allowed=await gateApi.runGate({phase:'preflight',state,request,gitEvidence:observed});assert.equal(allowed.decision,'allow');
 git('commit','-m','approved documents');const docsSha=git('rev-parse','HEAD');
 const docsResult={commit:docsSha,parent:git('rev-parse','HEAD^'),tree:git('rev-parse','HEAD^{tree}'),head:docsSha,paths:git('diff-tree','--no-commit-id','--name-only','-r','HEAD').split('\n'),target:{...target,head:docsSha},remainingPaths:[]};
 assert.equal(docsResult.tree,observed.indexTree);assert.equal(docsResult.parent,base);
 const confirmed=await gateApi.runGate({phase:'reconcile',state,request,expectedCommit:allowed.expectedCommit,result:docsResult});assert.equal(confirmed.decision,'allow');
 state.target.head=docsSha;for(const d of documents)d.commit=docsSha;
 const defaultObserved=await evidenceApi.readGitEvidence({target:state.target,documents});assert.equal(defaultObserved.docsCommit.commit,docsSha);
 const committedDocs=await evidenceApi.readGitEvidence({target:state.target,documents,gitRunner});assert.equal(committedDocs.docsCommit.commit,docsSha);assert.equal(committedDocs.docsCommit.tree,docsResult.tree);
 await fs.writeFile(path.join(root,'code.mjs'),'export const value=2;\n');
 git('add','--','code.mjs');observed=await evidenceApi.readGitEvidence({target:state.target,documents,gitRunner});
 state.tasks[0].status='accepted';state.acceptances=[{taskId:'T1',actorRef:'root',fingerprint:observed.stagedFingerprint,criteria:['criterion'],checkIds:['qa'],findingIds:[]}];
 const taskRequest={...request,requestId:'task',paths:[path.join(root,'code.mjs')],descriptor:{kind:'task',parent:docsSha,indexTree:observed.indexTree,fingerprint:observed.stagedFingerprint,paths:['code.mjs']}};
 const preflight=await gateApi.runGate({phase:'preflight',state,request:taskRequest,gitEvidence:observed});assert.equal(preflight.decision,'allow');
 git('commit','-m','T1');const taskSha=git('rev-parse','HEAD');
 const result={commit:taskSha,parent:git('rev-parse','HEAD^'),tree:git('rev-parse','HEAD^{tree}'),head:taskSha,paths:git('diff-tree','--no-commit-id','--name-only','-r','HEAD').split('\n'),target:{...state.target,head:taskSha},remainingPaths:[]};
 assert.equal(result.parent,docsSha);assert.equal(result.tree,observed.indexTree);
 const completed=await gateApi.runGate({phase:'reconcile',state,request:taskRequest,expectedCommit:preflight.expectedCommit,result});assert.equal(completed.decision,'allow');assert.equal(completed.proposedTransition.tasks[0].status,'committed');assert.equal(completed.proposedTransition.commits.at(-1).commit,taskSha);
 const held=await gateApi.runGate({phase:'reconcile',state,request:taskRequest,expectedCommit:preflight.expectedCommit,result:undefined});assert.equal(held.decision,'hold');assert.equal(git('rev-parse','HEAD'),taskSha);
 t.diagnostic(JSON.stringify({executor:'orchestrator',base,docsSha,docsParent:docsResult.parent,docsTree:docsResult.tree,taskSha,taskParent:result.parent,taskTree:result.tree}));
});

test('canonical document object evidence ignores repository-local replace refs',{skip:process.env.ARC_RUN_GIT_INTEGRATION!=='1'},async t=>{
 const tempRoot=await fs.mkdtemp(path.join(os.tmpdir(),'arc-t3-replace-'));t.after(()=>fs.rm(tempRoot,{recursive:true,force:true}));
 const root=await fs.realpath(tempRoot);
 const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.toUpperCase().startsWith('GIT_')));
 Object.assign(env,{GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:process.platform==='win32'?'NUL':'/dev/null',GIT_AUTHOR_NAME:'ARC fixture',GIT_AUTHOR_EMAIL:'fixture@example.invalid',GIT_COMMITTER_NAME:'ARC fixture',GIT_COMMITTER_EMAIL:'fixture@example.invalid'});
 const git=(...args)=>{const r=spawnSync('git',args,{cwd:root,env,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
 git('init','--initial-branch=fixture');git('config','core.hooksPath',path.join(root,'no-hooks'));git('config','commit.gpgsign','false');
 await fs.writeFile(path.join(root,'code.mjs'),'base');git('add','--','code.mjs');git('commit','-m','base');
 const base=git('rev-parse','HEAD');const baseTree=git('rev-parse','HEAD^{tree}');
 const documents=['spec','plan'].map(kind=>({kind,path:path.join(root,kind+'.md'),gitPath:kind+'.md',contentHash:hash(kind),approvalRef:kind}));
 for(const d of documents)await fs.writeFile(d.path,d.kind);
 git('add','--','spec.md','plan.md');git('commit','-m','original approved documents');
 const original=git('rev-parse','HEAD');const originalTree=git('rev-parse','HEAD^{tree}');for(const d of documents)d.commit=original;
 // All object/ref mutations stay inside this Orchestrator-owned fixture.
 await fs.writeFile(path.join(root,'spec.md'),'forged spec');await fs.writeFile(path.join(root,'code.mjs'),'forged code');git('add','--','spec.md','code.mjs');
 const alternateTree=git('write-tree');const alternateParent=git('commit-tree',baseTree,'-m','alternate root');
 const alternate=git('commit-tree',alternateTree,'-p',alternateParent,'-m','replacement');
 await fs.writeFile(path.join(root,'spec.md'),'spec');await fs.writeFile(path.join(root,'code.mjs'),'base');git('add','--','spec.md','code.mjs');
 git('replace',original,alternate);
 assert.equal(git('show','--no-patch','--format=%P%n%T',original),alternateParent+'\n'+alternateTree,'fixture must actually redirect ordinary Git reads');
 assert.equal(git('show',original+':spec.md'),'forged spec');
 const target={realpath:root,gitCommonDir:git('rev-parse','--path-format=absolute','--git-common-dir'),head:original,branch:'fixture'};
 const observed=await evidenceApi.readGitEvidence({target,documents});
 assert.equal(observed.docsCommit.commit,original);assert.equal(observed.docsCommit.parent,base);assert.equal(observed.docsCommit.tree,originalTree);
 assert.deepEqual([...observed.docsCommit.paths].sort(),['plan.md','spec.md']);
 assert.deepEqual(observed.docsCommit.documents,documents);assert.equal(observed.documents.find(d=>d.kind==='spec').observedHash,hash('spec'));
 assert.equal(observed.indexTree,originalTree);assert.deepEqual(observed.stagedPaths,[]);assert.equal(git('rev-parse','HEAD'),original);
 t.diagnostic(JSON.stringify({executor:'orchestrator',original,originalParent:base,originalTree,alternate,alternateParent,alternateTree,replaceRef:'refs/replace/'+original}));
});
