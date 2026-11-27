import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const api = await import('../../lib/policy/render.mjs').catch(() => ({}));
const placement = await import('../../lib/policy/placement.mjs').catch(() => ({}));
const root = new URL('../../', import.meta.url);
const policy = () => JSON.parse(fs.readFileSync(new URL('lib/policy/role-policy.json', root)));
const block = body => `[ARC role policy: contract begin]\n${body}\n[ARC role policy: contract end]`;
test('approval.run-mode is required', () => {
  const p = policy();
  p.rules = p.rules.filter(({id}) => id !== 'approval.run-mode');
  assert.throws(() => api.validateRolePolicy(p), /missing required rule approval\.run-mode/);
});

test('approval.run-mode is placed in core and planning projections', () => {
  const {core, planning, preparation} = placement.POLICY_PROJECTIONS;
  assert.ok(core.includes('approval.run-mode'));
  assert.ok(planning.includes('approval.run-mode'));
  assert.ok(!preparation.includes('approval.run-mode'));
});

test('approval.run-mode immediately follows external authority in policy order', () => {
  const ids = policy().rules.map(({id}) => id);
  assert.equal(ids[ids.indexOf('external.explicit-user-authority') + 1], 'approval.run-mode');
});

test('approval.run-mode is rendered for specialists', () => {
  const output = api.renderPolicySection(api.defaultRolePolicy, {platform:'claude', audience:'tester'});
  assert.match(output, /^- \[approval\.run-mode\] /m);
});

// Broken placement validation would silently drop rules or render ambiguous contracts.
test('policy projections reject unknown duplicate and uncovered rules', () => {
  assert.equal(typeof placement.validatePolicyProjections, 'function');
  const p = policy();
  assert.doesNotThrow(() => placement.validatePolicyProjections(p));
  const copy = () => structuredClone(placement.POLICY_PROJECTIONS);
  const unknown = copy(); unknown.core.push('unknown.rule');
  assert.throws(() => placement.validatePolicyProjections(p, unknown), /unknown.*unknown.rule/i);
  const duplicate = copy(); duplicate.core.push('scope.non-escalation');
  assert.throws(() => placement.validatePolicyProjections(p, duplicate), /duplicate.*scope.non-escalation/i);
  const uncovered = copy();
  for (const ids of Object.values(uncovered)) {
    const index = ids.indexOf('scope.non-escalation'); if (index !== -1) ids.splice(index, 1);
  }
  assert.throws(() => placement.validatePolicyProjections(p, uncovered), /uncovered.*scope.non-escalation/i);
  const extended = policy(); extended.rules.push({...extended.rules[0], id:'future.rule'});
  assert.throws(() => placement.validatePolicyProjections(extended), /uncovered.*future.rule/i);
});
// Selecting the wrong subset or sorting by the placement table would change emitted authority.
test('orchestrator projections preserve canonical text and order', () => {
  const expected = {
    core: ['scope.non-escalation', 'external.explicit-user-authority', 'approval.run-mode', 'role.orchestrator-boundary'],
    assignment: ['git.specialists-deny', 'role.scouter-read-only', 'role.planner-draft-only', 'role.implementer-implementation', 'role.tester-verification', 'role.reviewer-independent'],
    planning: ['git.orchestrator-accept-commit', 'approval.run-mode', 'review.significant-no-plan', 'review.significant-plan', 'review.final-plan-recheck', 'planning.plan-revision', 'planning.planner-brief'],
    handoff: ['git.specialists-deny', 'role.implementer-implementation', 'review.significant-no-plan', 'review.significant-plan', 'review.final-plan-recheck'],
    preparation: ['scope.non-escalation', 'git.specialists-deny', 'git.orchestrator-accept-commit', 'external.explicit-user-authority', 'planning.plan-revision'],
    verification: ['git.orchestrator-accept-commit', 'review.significant-no-plan', 'review.significant-plan', 'review.final-plan-recheck', 'planning.plan-revision'],
    commit: ['scope.non-escalation', 'git.orchestrator-accept-commit', 'external.explicit-user-authority', 'planning.plan-revision'],
  };
  const p = policy();
  for (const platform of ['codex', 'claude']) for (const [projection, ids] of Object.entries(expected)) {
    const output = api.renderPolicySection(p, {platform, audience:'orchestrator', projection, skillPath:'/tmp/café folder/SKILL.md'});
    const lines = output.split('\n');
    assert.deepEqual(lines.slice(1, -2), ids.map(id => `- [${id}] ${p.rules.find(rule => rule.id === id).text}`));
    assert.equal(lines.at(-2), `- [platform.${platform}] ${p.platforms[platform].notice}`);
    assert.equal(lines.at(-1), '- Policy details: `/tmp/café folder/SKILL.md`.');
  }
  const reversed = policy(); reversed.rules.reverse();
  const reversedOutput = api.renderPolicySection(reversed, {platform:'codex', audience:'orchestrator', projection:'core', section:'global'});
  assert.deepEqual([...reversedOutput.matchAll(/^- \[([^\]]+)\]/gm)].map(match => match[1]), [...expected.core].reverse());
  assert.throws(() => api.renderPolicySection(p, {platform:'codex', audience:'orchestrator', projection:'unknown'}), /unknown.*projection/i);
});
// Keeping the removed rule or dropping revision evidence would emit the old commit authority.
test('plan-revision rule replaces plan-amend with approved operations and evidence', () => {
  const p = policy();
  assert.equal(p.rules.some(rule => rule.id === 'planning.plan-amend'), false);
  const revision = p.rules.find(rule => rule.id === 'planning.plan-revision');
  assert.ok(revision);
  assert.deepEqual(revision.operations, ['non-progress-spec-plan-content-update', 'pending-plan-revision-commit']);
  assert.deepEqual(revision.evidence, ['non-progress-content-change-classification', 'actual-approval-chronology', 'approved-revision-content-hash', 'plan-revision-trailers']);
  assert.deepEqual(revision.roles, ['orchestrator']);
  assert.equal(revision.effect, 'require');
  assert.equal(revision.authority, 'orchestrator');
});
test('plan-level progress records extend accept-commit and plan-revision text only', () => {
  const {rules} = policy();
  assert.deepEqual(rules.map(({id}) => id), [
    'scope.non-escalation',
    'git.specialists-deny',
    'git.orchestrator-accept-commit',
    'external.explicit-user-authority',
    'approval.run-mode',
    'role.orchestrator-boundary',
    'role.scouter-read-only',
    'role.planner-draft-only',
    'role.implementer-implementation',
    'role.tester-verification',
    'role.reviewer-independent',
    'review.significant-no-plan',
    'review.significant-plan',
    'review.final-plan-recheck',
    'planning.plan-revision',
    'planning.planner-brief',
  ]);

  const accept = rules.find(rule => rule.id === 'git.orchestrator-accept-commit');
  assert.deepEqual(accept.operations, ['accept', 'task-progress-record', 'stage', 'commit']);
  assert.deepEqual(accept.evidence, ['acceptance-criteria', 'required-checks', 'findings-disposition', 'task-progress-classification-reason-time']);
  assert.deepEqual(accept.roles, ['orchestrator']);
  assert.equal(accept.effect, 'allow');
  assert.equal(accept.authority, 'orchestrator');

  const revision = rules.find(rule => rule.id === 'planning.plan-revision');
  assert.deepEqual(revision.operations, ['non-progress-spec-plan-content-update', 'pending-plan-revision-commit']);
  assert.deepEqual(revision.evidence, ['non-progress-content-change-classification', 'actual-approval-chronology', 'approved-revision-content-hash', 'plan-revision-trailers']);
  assert.deepEqual(revision.roles, ['orchestrator']);
  assert.equal(revision.effect, 'require');
  assert.equal(revision.authority, 'orchestrator');

});
// Adding projections must not change existing installed contracts or global-section filtering.
test('default policy rendering preserves complete existing contracts', () => {
  const p = policy();
  for (const platform of ['codex', 'claude']) for (const {id:audience} of p.roles) for (const section of ['contract', 'global']) {
    const options = {platform, audience, section, skillPath:'~/.arc/SKILL.md'};
    const expectedRules = p.rules.filter(rule => section === 'global' || audience === 'orchestrator' || rule.roles.includes(audience));
    const expected = ['Generated from lib/policy/role-policy.json; do not edit this managed section manually.',
      ...expectedRules.map(rule => `- [${rule.id}] ${rule.text}`),
      ...(section === 'global' ? [] : [`- [platform.${platform}] ${p.platforms[platform].notice}`]),
      '- Policy details: `~/.arc/SKILL.md`.'].join('\n');
    assert.equal(api.renderPolicySection(p, options), expected);
    assert.equal(api.renderPolicySection(p, {...options, projection:'full'}), expected);
  }
  const inputs = new Map(api.POLICY_TARGETS.map(({path:name}) => [name, fs.readFileSync(new URL(name, root))]));
  assert.deepEqual(api.buildPolicyOutputs(inputs, p), inputs);
});
// A caller must not accidentally replace a specialist's complete role contract with a subset.
test('specialist rendering rejects partial projections', () => {
  for (const platform of ['codex', 'claude']) for (const audience of ['scouter', 'planner', 'implementer', 'tester', 'reviewer']) for (const section of ['contract', 'global']) {
    assert.throws(() => api.renderPolicySection(policy(), {platform, audience, section, projection:'core'}), /specialist.*projection/i);
  }
});
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
  assert.deepEqual(p.review.noPlan,['implementer','tester','reviewer','orchestrator-accept']);
  assert.deepEqual(p.review.planTask,['implementer','fresh-tester','orchestrator-accept','orchestrator-commit']);
  assert.deepEqual(p.review.planFinal,['required-tester','reviewer']);
  assert.deepEqual(p.review.planFinding,['implementer','reviewer']);
  for(const mutate of [p=>p.review.noPlan.splice(2,1),p=>p.review.planTask.splice(2,0,'reviewer'),p=>p.review.planFinding.splice(1,0,'tester')]) {
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
test('Git query policy validation rejects malformed shared rules',()=>{
 const p=policy();delete p.git.commands.status.flags;assert.throws(()=>api.validateRolePolicy(p),/policy/i);
});
test('runtime evidence policy rejects missing roles rules and evidence requirements',()=>{
 const p=policy();assert.equal(p.runtime.schemaVersion,1);
 for(const mutate of [p=>delete p.runtime,p=>p.runtime.roles.reverse(),p=>p.runtime.ruleIds=[],p=>p.runtime.requiredEvidence=[]]){const bad=policy();mutate(bad);assert.throws(()=>api.validateRolePolicy(bad),/runtime/i);}
});

test('instruction policy targets use the approved action projections',()=>{
 const placements={'SKILL':'core',coordination:'assignment',planning:'planning',handoff:'handoff','handoff-prep':'preparation',verification:'verification',commit:'commit'};
 for(const platform of ['codex','claude'])for(const[name,projection]of Object.entries(placements)){
  const target=api.POLICY_TARGETS.find(t=>t.path===`${platform}/skill/${name==='SKILL'?'SKILL.md':`references/${name}.md`}`);
  assert.ok(target,`${platform}/${name}`);assert.equal(target.projection,projection);
 }
});

// An omitted projection would hide the new plan update gate from its owner surface.
test('plan update and Planner brief rules reach their owning contracts', () => {
  const p = policy();
  for (const platform of ['codex', 'claude']) {
    for (const projection of ['planning', 'preparation', 'verification', 'commit']) {
      const output = api.renderPolicySection(p, {platform, audience:'orchestrator', projection});
      assert.match(output, /\[planning\.plan-revision\]/);
    }
    const output = api.renderPolicySection(p, {platform, audience:'orchestrator', projection:'planning'});
    assert.match(output, /\[planning\.planner-brief\]/);
  }
});

test('spec and plan revision ownership reaches both platform contracts', () => {
  for (const platform of ['codex', 'claude']) {
    const output = api.renderPolicySection(policy(), {platform, audience:'orchestrator', projection:'planning'});
    const brief = output.split('\n').find(line => line.startsWith('- [planning.planner-brief]'));
    assert.ok(brief, `${platform}: planning brief`);
    const [specPlan, design] = brief.split('For design and brainstorming');
    assert.ok(design, `${platform}: design boundary`);
    assert.doesNotMatch(specPlan, /\b(?:send|return|route|request|ask|assign)\w*[^.]*\b(?:Planner|correction|revision)\b/i);
    assert.doesNotMatch(specPlan, /\bPlanner\b[^.]*\b(?:revis(?:e|es|ion|ions)|correct(?:s|ion|ions)|amend(?:s|ment)?|rewrit(?:e|es))\b/i);
  }
});

test('platform role gates preserve Planner first drafts and Orchestrator spec/plan revisions', () => {
  for (const platform of ['codex', 'claude']) {
    const skill = fs.readFileSync(new URL(`${platform}/skill/SKILL.md`, root), 'utf8');
    const gate = skill.match(/^\*\*Role gate:\*\*.*$/m)?.[0];
    assert.ok(gate, `${platform}: role gate`);
    assert.doesNotMatch(gate, /Orchestrator never authors them/i, platform);
  }
});

// H1-04/H4-02: unrelated baseline failures must not stall approved independent work.
// Written-contract sequence only; live release decisions remain Orchestrator's duty.
test('failure disposition orders baseline evidence classification scoped holds and independent release', () => {
  const orderedSteps = ['First', 'Second', 'Third', 'Fourth', 'Finally'];
  for (const platform of ['codex', 'claude']) for (const {id: audience} of policy().roles) {
    const output = api.renderPolicySection(policy(), {platform, audience});
    const line = output.split('\n').find(text => text.startsWith('- [scope.non-escalation]'));
    const steps = [...(line ?? '').matchAll(/\b(First|Second|Third|Fourth|Finally),/g)].map(match => match[1]);
    assert.deepEqual(steps, orderedSteps, `${platform}/${audience}`);
  }
});

test('HSR: policy generation leaves hook-free profiles and uses prompt Git control',()=>{
 const p=policy();assert.equal(p.rules.find(r=>r.id==='git.specialists-deny').controls.claude,'prompt');
 const inputs=new Map(api.POLICY_TARGETS.map(({path:name})=>[name,fs.readFileSync(new URL(name,root))]));
 for(const [name,bytes]of inputs)if(name.startsWith('claude/agents/'))inputs.set(name,Buffer.from(bytes.toString().replace(/^hooks:\r?\n(?:[ \t].*(?:\r?\n|$))*/m,'')));
 const output=api.buildPolicyOutputs(inputs,p);assert.equal(output.has('claude/skill/hooks/git-policy.json'),false);for(const [name,bytes]of output)if(name.startsWith('claude/agents/'))assert.doesNotMatch(bytes.toString(),/^hooks:/m);
});
