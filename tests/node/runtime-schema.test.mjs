import test from 'node:test';
import assert from 'node:assert/strict';
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
