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
    core: ['scope.non-escalation', 'external.explicit-user-authority', 'role.orchestrator-boundary'],
    assignment: ['git.specialists-deny', 'role.scouter-read-only', 'role.planner-draft-only', 'role.implementer-implementation', 'role.qa-verification', 'role.reviewer-independent'],
    planning: ['git.orchestrator-accept-commit', 'review.significant-no-plan', 'review.significant-plan', 'review.final-plan-recheck', 'planning.plan-amend', 'planning.planner-brief'],
    handoff: ['git.specialists-deny', 'role.implementer-implementation', 'review.significant-no-plan', 'review.significant-plan', 'review.final-plan-recheck'],
    preparation: ['scope.non-escalation', 'git.specialists-deny', 'git.orchestrator-accept-commit', 'external.explicit-user-authority', 'planning.plan-amend'],
    verification: ['git.orchestrator-accept-commit', 'review.significant-no-plan', 'review.significant-plan', 'review.final-plan-recheck', 'planning.plan-amend'],
    commit: ['scope.non-escalation', 'git.orchestrator-accept-commit', 'external.explicit-user-authority', 'planning.plan-amend'],
  };
  const p = policy();
  for (const platform of ['codex', 'claude']) for (const [projection, ids] of Object.entries(expected)) {
    const output = api.renderPolicySection(p, {platform, audience:'orchestrator', projection, skillPath:'/tmp/한 글/SKILL.md'});
    const lines = output.split('\n');
    assert.deepEqual(lines.slice(1, -2), ids.map(id => `- [${id}] ${p.rules.find(rule => rule.id === id).text}`));
    assert.equal(lines.at(-2), `- [platform.${platform}] ${p.platforms[platform].notice}`);
    assert.equal(lines.at(-1), '- Policy details: `/tmp/한 글/SKILL.md`.');
  }
  const reversed = policy(); reversed.rules.reverse();
  const reversedOutput = api.renderPolicySection(reversed, {platform:'codex', audience:'orchestrator', projection:'core', section:'global'});
  assert.deepEqual([...reversedOutput.matchAll(/^- \[([^\]]+)\]/gm)].map(match => match[1]), [...expected.core].reverse());
  assert.throws(() => api.renderPolicySection(p, {platform:'codex', audience:'orchestrator', projection:'unknown'}), /unknown.*projection/i);
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
  for (const platform of ['codex', 'claude']) for (const audience of ['scouter', 'planner', 'implementer', 'qa', 'reviewer']) for (const section of ['contract', 'global']) {
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
  assert.deepEqual(p.review.noPlan,['implementer','qa','reviewer','orchestrator-accept']);
  assert.deepEqual(p.review.planTask,['implementer','fresh-qa','orchestrator-accept','orchestrator-commit']);
  assert.deepEqual(p.review.planFinal,['required-qa','reviewer']);
  assert.deepEqual(p.review.planFinding,['implementer','reviewer']);
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
      assert.match(output, /\[planning\.plan-amend\]/);
    }
    const output = api.renderPolicySection(p, {platform, audience:'orchestrator', projection:'planning'});
    assert.match(output, /\[planning\.planner-brief\]/);
  }
});

test('spec and plan revision ownership reaches both platform contracts', () => {
  for (const platform of ['codex', 'claude']) {
    const output = api.renderPolicySection(policy(), {platform, audience:'orchestrator', projection:'planning'});
    assert.match(output, /Planner returns a complete.*first draft and self-review/i);
    assert.match(output, /Orchestrator reviews and directly revises the same spec or plan/i);
    assert.match(output, /new product decisions.*outside approved scope.*user/i);
    assert.match(output, /missing or failed first draft.*does not transfer initial authorship/i);
    const brief = output.split('\n').find(line => line.startsWith('- [planning.planner-brief]'));
    assert.ok(brief, `${platform}: planning brief`);
    const [specPlan, design] = brief.split('For design and brainstorming');
    assert.ok(design, `${platform}: design boundary`);
    assert.match(specPlan, /Orchestrator reviews and directly revises the same spec or plan/i);
    assert.doesNotMatch(specPlan, /\b(?:send|return|route|request|ask|assign)\w*[^.]*\b(?:Planner|correction|revision)\b/i);
    assert.doesNotMatch(specPlan, /\bPlanner\b[^.]*\b(?:revis(?:e|es|ion|ions)|correct(?:s|ion|ions)|amend(?:s|ment)?|rewrit(?:e|es))\b/i);
  }
});

test('platform role gates preserve Planner first drafts and Orchestrator spec/plan revisions', () => {
  for (const platform of ['codex', 'claude']) {
    const skill = fs.readFileSync(new URL(`${platform}/skill/SKILL.md`, root), 'utf8');
    const gate = skill.match(/^\*\*Role gate:\*\*.*$/m)?.[0];
    assert.ok(gate, `${platform}: role gate`);
    assert.match(gate, /Planner.*design\/brainstorming drafts and first complete spec\/plan drafts/i, platform);
    assert.match(gate, /Orchestrator reviews and directly revises the same spec or plan/i, platform);
    assert.doesNotMatch(gate, /Orchestrator never authors them/i, platform);
  }
});

test('design and brainstorming retain consolidated Planner correction', () => {
  for (const platform of ['codex', 'claude']) {
    const output = api.renderPolicySection(policy(), {platform, audience:'orchestrator', projection:'planning'});
    assert.match(output, /design and brainstorming.*one consolidated correction/i, platform);
    assert.match(output, /further calls.*(?:scope|evidence).*unmet checklist items.*new input.*criterion.*progress/i, platform);
  }
});

test('design and brainstorming hold repeated unmet criteria without progress', () => {
  for (const platform of ['codex', 'claude']) {
    const output = api.renderPolicySection(policy(), {platform, audience:'orchestrator', projection:'planning'});
    assert.match(output, /repeated unmet criteria without new input, evidence or progress.*hold/i, platform);
    assert.match(output, /do not.*count rewording.*agent replacement as progress/i, platform);
  }
});

// H1/H2/H4: emitted role contracts must not lose bounded recovery or provenance.
// Approved structural checks; consuming-agent behavior is verified separately by fresh QA.
test('bounded read recovery and provenance reach every role on both platforms', () => {
  for (const platform of ['codex', 'claude']) for (const {id: audience} of policy().roles) {
    const output = api.renderPolicySection(policy(), {platform, audience});
    for (const required of [
      /optional read method/i, /pre-authorized.*side-effect-free/i,
      /positively identified material.*approved version.*purpose.*role authority/i,
      /different locator.*exact locator.*brief/i, /equivalent evidence/i,
      /required input.*authority.*target.*ownership.*partial mutation.*unknown state/i,
      /alternative.*(?:unapproved|unauthorized).*ambiguous.*fails/i,
      /no chained discovery.*guessed paths.*mutation retries/i,
      /first failure.*alternative.*evidence.*limits.*dependent.*independent/i,
      /user-provided instructions.*discovered workspace instruction files.*installed role references.*task inputs/i,
      /root AGENTS\.md.*absence.*not.*absence of instructions/i,
      /resume brief.*completed work.*failure.*resolution.*valid.*invalid.*evidence.*next objective/i,
    ]) assert.match(output, required, `${platform}/${audience}: ${required}`);
  }
});
// H3: losing source/output identity must fail before a visual claim is accepted.
test('visual evidence is carried from implementation to fresh QA', () => {
  for (const platform of ['codex', 'claude']) for (const audience of ['implementer', 'qa']) {
    const output = api.renderPolicySection(policy(), {platform, audience});
    for (const required of [/approved visual source.*version.*approval.*access/i,
      /criterion IDs.*properties.*comparison method/i, /actual.output identity.*revision.*basis/i,
      /pass.*mismatch.*unverified/, /fresh QA.*actual comparison/i,
      /revision.*unverified.*visible.*mismatch/i]) assert.match(output, required);
  }
});

// H1-04/H4-02: unrelated baseline failures must not stall approved independent work.
// Written-contract sequence only; live release decisions remain Orchestrator's duty.
test('failure disposition orders baseline evidence classification scoped holds and independent release', () => {
  const sequence = [
    /First, record the exact failed check.*baseline revision.*current revision/i,
    /Second, classify each failure.*baseline or current.*affected scope.*dependency/i,
    /Third, hold only affected or dependent tasks and checks.*unknown.*only work whose impact is unknown/i,
    /Fourth, Orchestrator must release already-approved independent work without waiting for unrelated failures/i,
    /Finally, keep acceptance held while any required check remains unresolved/i,
  ];
  for (const platform of ['codex', 'claude']) for (const {id: audience} of policy().roles) {
    const output = api.renderPolicySection(policy(), {platform, audience});
    let offset = 0;
    for (const step of sequence) {
      const found = step.exec(output.slice(offset));
      assert.ok(found, `${platform}/${audience}: missing or out-of-order ${step}`);
      offset += found.index + found[0].length;
    }
    assert.match(output, /Specialists report evidence.*must not self-authorize release/i);
  }
});

test('HSR: policy generation leaves hook-free profiles and uses prompt Git control',()=>{
 const p=policy();assert.equal(p.rules.find(r=>r.id==='git.specialists-deny').controls.claude,'prompt');
 const inputs=new Map(api.POLICY_TARGETS.map(({path:name})=>[name,fs.readFileSync(new URL(name,root))]));
 for(const [name,bytes]of inputs)if(name.startsWith('claude/agents/'))inputs.set(name,Buffer.from(bytes.toString().replace(/^hooks:\r?\n(?:[ \t].*(?:\r?\n|$))*/m,'')));
 const output=api.buildPolicyOutputs(inputs,p);assert.equal(output.has('claude/skill/hooks/git-policy.json'),false);for(const [name,bytes]of output)if(name.startsWith('claude/agents/'))assert.doesNotMatch(bytes.toString(),/^hooks:/m);
});
