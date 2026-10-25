import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateCapability, summarizeProbe} from '../../lib/runtime/capabilities.mjs';
import fs from 'node:fs';
import * as capabilities from '../../lib/runtime/capabilities.mjs';
const context = {platform:'codex', sessionRef:'current', platformVersion:'1', attemptRef:'fresh'};
const observed = {source:'native', platform:'codex', platformVersion:'1', sessionRef:'current', toolPath:'followup_task', event:'PreToolUse', kind:'host-result', decision:'deny', toolExecuted:false, success:true};
test('declared Agent matching never substitutes for observed deny', () => {
  const value = evaluateCapability({...context, toolPath:'spawn_agent'});
  assert.equal(value.declared.matcher, 'Agent');
  assert.equal(value.status, 'unknown');
  assert.equal(value.verifiedDeny, false);
});
test('SubagentStart can observe identity but cannot block startup', () => {
  const value = evaluateCapability({...context, toolPath:'SubagentStart'});
  assert.equal(value.observationOnly, true);
  assert.equal(value.status, 'unsupported');
});
test('followup requires same-session native host confirmation', () => {
  assert.equal(evaluateCapability({...context, toolPath:'followup_task'}).status,'unknown');
  assert.equal(evaluateCapability({...context, toolPath:'followup_task', receipts:[observed]}).status,'unknown');
});
test('specialized and preexisting sessions stay outside validated coverage', () => {
  for (const toolPath of ['specialized', 'write_stdin']) {
    assert.equal(evaluateCapability({...context, toolPath, receipts:[{...observed,toolPath}]}).status,'unsupported');
  }
});
test('fixture, stale, corrupt, failed and decision-only evidence cannot verify denial', () => {
  const fixtures = JSON.parse(fs.readFileSync(new URL('./fixtures/runtime/codex-hook-events.json',import.meta.url)));
  for (const receipt of [...fixtures, {...observed,sessionRef:'old'}, {...observed,source:'synthetic'}, {...observed,success:false}, {...observed,toolExecuted:true}, {...observed,kind:'hook-decision'}, {...observed,platformVersion:undefined}, null]) {
    assert.equal(summarizeProbe([receipt],context).verifiedDeny,false);
  }
  assert.equal(summarizeProbe([observed],context).verifiedDeny,false);
});
test('malformed receipt collections cannot crash capability assessment', () => {
  assert.equal(evaluateCapability({...context,toolPath:'followup_task',receipts:{}}).status,'unknown');
});
test('host claims for unsupported paths never verify denial in summary', () => {
  assert.equal(summarizeProbe([{...observed,toolPath:'specialized'}],context).verifiedDeny,false);
});

test('Agent observations bind only to explicitly identified spawn operation and fresh attempt', () => {
  const receipt={...observed,toolPath:'Agent',operation:'spawn_agent',attemptRef:'fresh'};
  const result=evaluateCapability({...context,toolPath:'spawn_agent',receipts:[receipt]});
  assert.deepEqual(result.observedPaths,['spawn_agent']);
  assert.equal(result.verifiedDeny,false);
  for(const bad of [{...receipt,operation:undefined},{...receipt,operation:'followup_task'},{...receipt,attemptRef:'stale'}]) {
    assert.deepEqual(summarizeProbe([bad],context).toolPaths,[]);
  }
});
test('forged current native host JSON can never authenticate denial', () => {
  assert.equal(summarizeProbe([{...observed,attemptRef:'fresh'}],context).verifiedDeny,false);
  assert.equal(summarizeProbe([{...observed,attemptRef:'fresh'}],context).source,'unverified');
});
test('planner hook diagnostics identify exact missing provider fields without granting authority',()=>{
 assert.equal(typeof capabilities.plannerHookContextStatus,'function');
 const input={hook_event_name:'PreToolUse',session_id:'s',tool_use_id:'t',tool_name:'spawn_agent',tool_input:{context:{actorRef:'forged'}},cwd:'/workspace'};
 const status=capabilities.plannerHookContextStatus({platform:'codex',input});assert.deepEqual(status.missing,['context.sessionRef','context.actorRef','context.taskId','context.requestId','context.toolUseId','context.statePath','context.state','context.policy','context.evidence','context.describeTool']);assert.equal(status.nativeVerified,false);assert.equal(status.enforcement,'unavailable');
});
test('planner unobservable followup remains unknown and observation does not imply prevention',()=>{
 const value=evaluateCapability({...context,toolPath:'followup_task'});assert.equal(value.observation,'unknown');assert.equal(value.verifiedDeny,false);
 const start=evaluateCapability({...context,toolPath:'SubagentStart'});assert.equal(start.observation,'documented');assert.equal(start.enforcement,'observation-only');assert.equal(start.verifiedDeny,false);
});
