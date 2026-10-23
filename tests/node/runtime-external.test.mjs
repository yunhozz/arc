import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../../lib/runtime/evaluate.mjs';
const descriptors={push:{repository:'repo',destination:'origin',refspec:'main:main',sourceOid:'a'.repeat(40),expectedRemoteOid:'b'.repeat(40)},merge:{repository:'repo',changeRef:'change/1',targetRef:'main',expectedTargetOid:'b'.repeat(40)},deploy:{service:'host',project:'app',environment:'production',artifactId:'build-1',destination:'region-1'},publish:{service:'registry',namespace:'team',name:'app',version:'1.0',artifactHash:'sha256:'+'a'.repeat(64),destination:'registry'}};
function fixture(operation='push'){
 const scope=['/workspace/app'],descriptor=structuredClone(descriptors[operation]);
 const state={mode:'plan',revision:1,scopeVersion:0,targetVersion:1,target:{realpath:'/workspace',head:'a'.repeat(40)},versions:{runtimeHash:'version'},records:[],intents:[],unresolved:[]};
 const approval={kind:'external-approval',messageRef:'user:external',source:'operator-attested',scopeVersion:0,targetVersion:1,data:{operation,scope,descriptor}};state.records.push(structuredClone(approval));
 return {state,request:{requestId:'external',expectedRevision:1,actor:{id:'operator',role:'orchestrator'},operation,arguments:{approvalRef:approval.messageRef,scope,descriptor}},approvalEvidence:approval};
}
function prepare(f){assert.equal(typeof api.evaluateCooperativeExternal,'function','external gate required');return api.evaluateCooperativeExternal(f);}
function ready(operation){const f=fixture(operation),d=prepare(f);assert.equal(d.decision,'allow',d.reason);f.intent=d.proposedTransition.intent;f.state.intents.push(f.intent);f.result={status:'succeeded',messageRef:'operator:observed',data:{operation:f.request.operation,scope:f.request.arguments.scope,descriptor:f.request.arguments.descriptor}};return f;}
function reconcile(f){assert.equal(typeof api.reconcileCooperativeExternal,'function','external reconciliation required');return api.reconcileCooperativeExternal({...f,observations:{target:f.state.target}});}
test('missingExactExternalApprovalHolds and localCommitApprovalCannotAuthorizePush',()=>{
 for(const mutate of [f=>f.state.records=[],f=>f.state.records[0].kind='approval',f=>f.state.records[0].data.operation='commit',f=>f.request.arguments.approvalRef='other',f=>f.request.actor.role='implementer',f=>f.state.scopeVersion++,f=>f.state.mode='no-plan']){const f=fixture();mutate(f);assert.equal(prepare(f).decision,'hold');}
});
test('all four external descriptors require exact action scope target approval',()=>{
 for(const operation of Object.keys(descriptors)){assert.equal(prepare(fixture(operation)).decision,'allow');for(const mutate of [f=>f.request.arguments.descriptor={...f.request.arguments.descriptor,extra:'x'},f=>f.request.arguments.scope=['/workspace/other'],f=>f.request.arguments.descriptor[Object.keys(descriptors[operation])[0]]='other']){const f=fixture(operation);f.state.records=structuredClone(f.state.records);mutate(f);assert.equal(prepare(f).decision,'hold',operation);}}
});
test('externalTargetMismatchHolds and stale results remain unresolved',()=>{
 for(const operation of Object.keys(descriptors)){for(const mutate of [f=>f.result.data.descriptor={...f.result.data.descriptor,extra:'x'},f=>f.state.target.head='changed',f=>f.state.versions.runtimeHash='changed',f=>f.state.scopeVersion++]){const f=ready(operation);mutate(f);const d=reconcile(f);assert.equal(d.decision,'hold');assert.equal(d.proposedTransition.result.status,'mismatch');}}
});
test('externalResultUnknownNeverRetries and operatorResultIsNotRemoteVerification',()=>{
 const f=ready();f.result.status='unknown';const d=reconcile(f);assert.equal(d.decision,'hold');f.intent.status='unknown';assert.equal(prepare({...f,request:{...f.request,requestId:'retry'}}).decision,'hold');
 f.result.status='succeeded';const resolved=reconcile(f);assert.equal(resolved.decision,'allow');assert.equal(resolved.coverage.remoteVerified,false);assert.equal(resolved.proposedTransition.result.data.remoteVerified,false);f.intent.status='succeeded';assert.equal(reconcile(f).decision,'hold');assert.equal(prepare(f).decision,'hold');
});
test('credential destinations and secret fields are refused without echoing credentials',()=>{
 for(const destination of ['https://user:password@example.com/repo','https://example.com/repo?token=secret']){const f=fixture();f.request.arguments.descriptor.destination=destination;const d=prepare(f);assert.equal(d.decision,'hold');assert.ok(!JSON.stringify(d).includes(destination));}
});
test('noNetworkOrNativeExecution external module contains no effect executor',async()=>{
 const fs=await import('node:fs/promises');const source=await fs.readFile(new URL('../../lib/runtime/external.mjs',import.meta.url),'utf8');assert.doesNotMatch(source,/node:(child_process|http|https|net)|\bfetch\s*\(/);
});
export {descriptors};
test('missing approval evidence holds without throwing',()=>{const f=fixture();delete f.approvalEvidence;assert.equal(prepare(f).decision,'hold');});

test('mismatched external result preserves the actual stated descriptor',()=>{const f=ready();f.result.data.descriptor.destination='other';const d=reconcile(f);assert.equal(d.decision,'hold');assert.equal(d.proposedTransition.result.data.descriptor.destination,'other');});
