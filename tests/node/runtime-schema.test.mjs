import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {initializeCooperativeWorkflow} from '../../lib/runtime/bootstrap.mjs';
import {runCooperativeCommand} from '../../lib/runtime/cooperative.mjs';
import {validateCooperativeState} from '../../lib/runtime/cooperative-schema.mjs';
import {workflowStatePath} from '../../lib/runtime/scope.mjs';
const api = await import('../../lib/runtime/schema.mjs').catch(()=>({}));
export const state = () => ({schemaVersion:1,workflowId:'workflow',revision:0,versions:{policy:'1',runtime:'1',adapter:'1',policyHash:'sha256:'+ 'a'.repeat(64),runtimeHash:'sha256:'+ 'b'.repeat(64),adapterHash:'sha256:'+ 'c'.repeat(64)},target:{realpath:'/workspace',repository:'repo',worktree:'wt',branch:'main',baseHead:'base',head:'head'},documents:[],approvals:[],tasks:[{id:'T1',status:'pending',paths:['/workspace/file'],dependencies:[],baseCommit:'head',criteria:['criterion'],requiredChecks:[]}],assignments:[],identities:[],leases:[],checks:[],findings:[],acceptances:[],commits:[],audit:[],capabilities:[],requests:[],mode:'plan'});
export const request = () => ({requestId:'request',platform:'codex',operation:'read',actorRef:'actor',taskId:'T1',cwd:'/workspace',toolName:'Read',arguments:{},paths:['/workspace/file'],descriptor:{}});
test('schema accepts complete state and rejects invalid version role target task and approval provenance',()=>{
 assert.equal(typeof api.validateWorkflowState,'function'); api.validateWorkflowState(state());
 for(const mutate of [s=>s.schemaVersion=2,s=>s.target.realpath='relative',s=>s.identities.push({actorRef:'x',role:'owner',taskId:'T1',observationRef:'o'}),s=>s.tasks[0].status='done',s=>s.approvals.push({id:'a',approved:true})]) {const s=state();mutate(s);assert.throws(()=>api.validateWorkflowState(s));}
});
test('request and evidence reject unknown operations and incomplete provenance',()=>{
 assert.equal(typeof api.validateRequest,'function');api.validateRequest(request());
 assert.throws(()=>api.validateRequest({...request(),operation:'anything'}));
 assert.throws(()=>api.validateRequest({...request(),cwd:'relative'}));
 assert.equal(typeof api.validateEvidence,'function'); assert.throws(()=>api.validateEvidence({provenance:[{id:'x',verified:true}]}));
 api.validateEvidence({provenance:[]});
});
test('schema requires hash algorithms and rejects malformed workflow records',()=>{
 for(const mutate of [s=>s.versions.policyHash='bare-hash',s=>s.tasks[0].criteria=undefined,s=>s.assignments.push({}),s=>s.checks.push({}),s=>s.findings.push({}),s=>s.acceptances.push({}),s=>s.commits.push({}),s=>s.documents.push({kind:'spec',path:'/workspace/spec',gitPath:'../spec',contentHash:'hash',approvalRef:'a'})]){const s=state();mutate(s);assert.throws(()=>api.validateWorkflowState(s));}
});

test('stored qa operation reads as test', () => {
 const stored = state();
 stored.approvals.push({id: 'approval', source: 'user-message', messageRef: 'message', contentHash: 'sha256:' + 'a'.repeat(64), scope: {taskId: 'T1', target: '/workspace', operations: ['qa'], paths: ['/workspace/file']}});
 stored.assignments.push({actorRef: 'actor', taskId: 'T1', role: 'implementer', paths: ['/workspace/file'], operations: ['read', 'qa'], approvalRef: 'approval'});
 stored.audit.push({operation: 'qa'});
 const loaded = api.validateWorkflowState(stored);
 assert.deepEqual(loaded.approvals[0].scope.operations, ['test']);
 assert.deepEqual(loaded.assignments[0].operations, ['read', 'test']);
 assert.equal(loaded.audit[0].operation, 'test');
 assert.deepEqual(stored.approvals[0].scope.operations, ['qa']);
});

async function legacyCheckState(t) {
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'arc-legacy-check-')));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const cwd=path.join(root,'workspace'),common=path.join(root,'common');
 await fs.mkdir(cwd);
 await fs.mkdir(common);
 const target={realpath:cwd,gitCommonDir:common,gitDir:common,head:'a'.repeat(40),branch:'main'};
 const fingerprint='sha256:'+'a'.repeat(64);
 const args={cwd,workflowId:'legacy-check',observe:async()=>target,readChanges:async()=>({tasks:{T1:fingerprint}})};
 await initializeCooperativeWorkflow({...args,input:{mode:'plan',actor:{id:'operator',role:'orchestrator'},selection:{messageRef:'target',contentHash:fingerprint}}});
 const file=await workflowStatePath(target,args.workflowId);
 const stored=JSON.parse(await fs.readFile(file));
 const descriptor={executable:'/bin/check',args:[],cwd,env:{},outputs:[]};
 stored.tasks.push({id:'T1',paths:[path.join(cwd,'code.mjs')],criteria:['works'],requiredChecks:[descriptor],dependencies:[]});
 stored.checks.push({id:'old-check',taskId:'T1',operation:'check',scope:'task',verificationActor:{id:'qa1',role:'qa'},descriptor,changeFingerprint:fingerprint,resultRef:'old:passed',status:'passed',verdict:'proven',source:'operator-attested'});
 return {args,file,stored};
}

test('legacy qa check state passes status and schema',async t=>{
 const {args,file,stored}=await legacyCheckState(t);
 const before=Buffer.from(JSON.stringify(stored));
 await fs.writeFile(file,before);
 assert.equal(validateCooperativeState(stored).schemaVersion,1);
 const status=await runCooperativeCommand({...args,command:'status'});
 assert.equal(status.decision,'allow');
 assert.equal(status.state.checks[0].verificationActor.role,'qa');
 assert.deepEqual(await fs.readFile(file),before);
});

test('runtime hash drift still holds',async t=>{
 const {args,file,stored}=await legacyCheckState(t);
 stored.versions.runtimeHash='sha256:'+'0'.repeat(64);
 const before=Buffer.from(JSON.stringify(stored));
 await fs.writeFile(file,before);
 const status=await runCooperativeCommand({...args,command:'status'});
 assert.equal(status.decision,'hold');
 assert.deepEqual(status.ruleIds,['cooperative.versions']);
 assert.deepEqual(await fs.readFile(file),before);
});
