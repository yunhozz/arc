import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const api = await import('../../lib/policy/render.mjs').catch(() => ({}));
const root = new URL('../../', import.meta.url);
const policy = () => JSON.parse(fs.readFileSync(new URL('lib/policy/role-policy.json', root)));
const block = body => `[ARC role policy: contract begin]\n${body}\n[ARC role policy: contract end]`;
// Removing validation would permit an unrecognized role/control or ambiguous rule to grant authority.
test('policy rejects unknown roles, duplicate IDs and unsupported controls', () => {
  assert.equal(typeof api.validateRolePolicy, 'function');
  for (const mutate of [
    p => p.roles.push({id:'unknown', description:'unexpected'}),
    p => p.rules.push({...p.rules[0]}),
    p => p.rules[0].roles.push('unknown'),
    p => p.rules[0].controls.codex = 'sandbox',
    p => p.rules[0].effect = 'maybe',
  ]) { const p = policy(); mutate(p); assert.throws(() => api.validateRolePolicy(p), /policy/i); }
});
// The output must retain hand-authored bytes, and malformed boundaries must never select a larger edit range.
test('managed replacement preserves outside bytes and rejects missing duplicate reversed boundaries', () => {
  assert.equal(typeof api.replaceManagedPolicyBlocks, 'function');
  const original = 'user\r\n' + block('old').replaceAll('\n','\r\n') + '\r\nuser suffix';
  assert.equal(api.replaceManagedPolicyBlocks(original, {contract:'new\nbody'}), 'user\r\n' + block('new\nbody').replaceAll('\n','\r\n') + '\r\nuser suffix');
  for (const bad of ['', block('old')+block('other'), '[ARC role policy: contract end]\n[ARC role policy: contract begin]', '[ARC role policy: contract begin]']) {
    assert.throws(() => api.replaceManagedPolicyBlocks(bad,{contract:'new'}), /policy/i);
  }
});
test('generation is deterministic and preserves buffers when any target is malformed', () => {
  assert.equal(typeof api.buildPolicyOutputs, 'function');
  const inputs = new Map(api.POLICY_TARGETS.map(({path: name}) => [name, fs.readFileSync(new URL(name,root))]));
  const before = new Map([...inputs].map(([name,bytes])=>[name,Buffer.from(bytes)]));
  const first = api.buildPolicyOutputs(inputs,policy());
  assert.deepEqual(api.buildPolicyOutputs(first,policy()),first);
  const last = [...inputs.keys()].at(-1); inputs.set(last,Buffer.from('bad target'));
  assert.throws(()=>api.buildPolicyOutputs(inputs,policy()),/policy/i);
  for (const [name, bytes] of before) if(name!==last) assert.deepEqual(inputs.get(name),bytes);
});
// These independently specified sequences catch missing no-plan review and per-commit review regressions.
test('review routing keeps final review and its plan-only correction exception', () => {
  assert.equal(typeof api.validateRolePolicy,'function');
  const p=policy(); api.validateRolePolicy(p);
  assert.deepEqual(p.review.noPlan,['coder','qa','reviewer','orchestrator-accept']);
  assert.deepEqual(p.review.planTask,['coder','fresh-qa','orchestrator-accept','orchestrator-commit']);
  assert.deepEqual(p.review.planFinal,['required-qa','reviewer']);
  assert.deepEqual(p.review.planFinding,['coder','reviewer']);
  for(const mutate of [p=>p.review.noPlan.splice(2,1),p=>p.review.planTask.splice(2,0,'reviewer'),p=>p.review.planFinding.splice(1,0,'qa')]) {
    const bad=policy(); mutate(bad); assert.throws(()=>api.validateRolePolicy(bad),/policy/i);
  }
  const output=api.renderPolicySection(p,{platform:'codex',audience:'orchestrator',section:'contract'});
  assert.match(output,/review.significant-no-plan/); assert.match(output,/review.significant-plan/); assert.match(output,/review.final-plan-recheck/);
});
test('CLI check is read-only and validation failure leaves every target unchanged', t => {
  assert.ok(Array.isArray(api.POLICY_TARGETS),'policy target list is available');
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'arc-policy-')); t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
  const names=['lib/policy/role-policy.json',...api.POLICY_TARGETS.map(x=>x.path)];
  for(const name of names){fs.mkdirSync(path.dirname(path.join(temp,name)),{recursive:true});fs.copyFileSync(new URL(name,root),path.join(temp,name));}
  const target=path.join(temp,api.POLICY_TARGETS[0].path);
  fs.writeFileSync(target,fs.readFileSync(target,'utf8').replace(/Generated from[^\n]+/,'stale policy'));
  const snapshot=()=>names.map(name=>fs.readFileSync(path.join(temp,name)));
  const before=snapshot(); const run=args=>spawnSync(process.execPath,['scripts/update-role-policy.mjs','--root',temp,...args],{encoding:'utf8'});
  assert.equal(run(['--check']).status,1); assert.deepEqual(snapshot(),before);
  const last=path.join(temp,names.at(-1)); fs.writeFileSync(last,'missing markers'); const invalid=snapshot();
  assert.equal(run([]).status,1); assert.deepEqual(snapshot(),invalid);
});
