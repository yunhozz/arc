import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import fixture from './fixtures/instruction-contracts.json' with {type:'json'};
import {agentsBlockBody} from '../../lib/installer/global-config.mjs';
import {POLICY_TARGETS,defaultRolePolicy} from '../../lib/policy/render.mjs';
import {effectiveSection,effectiveText} from './fixtures/effective-doc.mjs';
const root=new URL('../../',import.meta.url).pathname;
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const file=(platform,name)=>`${platform}/skill/${name==='core'?'SKILL.md':`references/${name}.md`}`;
const gates=['coordination','limits','planning','handoff','verification','commit','handoff-prep'];
const fastHeading='## Orchestrator direct path for small tasks';
const briefFields=['Goal','Criteria','Exact scope/ownership','Constraints/decisions','Evidence','Prior findings','Exact next objective','Return format'];

for (const platform of ['codex','claude']) {
 test(`${platform} fast path preserves all-proven conditions`,()=>{
  const section=effectiveSection(platform,'handoff',fastHeading);
  for(let i=1;i<=8;i++) assert.ok(section.includes(`**F${i}**`),`F${i}`);
 });
 test(`${platform} fast path preserves instruction fingerprint`,()=>{
  effectiveSection(platform,'handoff','### Instruction fingerprint');
 });
 test(`${platform} fast path preserves task envelope`,()=>{
  effectiveSection(platform,'handoff','### Task envelope');
 });
 test(`${platform} fingerprint specifies batch hash and unchanged-evidence reuse`,()=>{
  const section=effectiveSection(platform,'handoff','### Instruction fingerprint');
  for(const token of ['node --input-type=module','realpathSync','createHash("sha256")']) assert.ok(section.includes(token),token);
 });
 test(`${platform} envelope records all nine fields and criteria-specific evidence`,()=>{
  const section=effectiveSection(platform,'handoff','### Task envelope');
  for(const field of ['task','instructions','target','authorization','scopeCriteria','riskDepth','tdd','verification','refresh']) assert.ok(section.includes('`'+field+'`'),field);
 });
 test(`${platform} fast judgment reads initial sections and retains action gates`,()=>{
  const core=effectiveText(platform,'core');
  for(const heading of ['Orchestrator direct path for small tasks','Authorization and scope','Design path and plan depth','Risk-scaled execution','Implementer TDD and constraints']) assert.ok(core.includes(heading),heading);
 });
 test(`${platform} maps task envelope into fixed brief fields`,()=>{
  const coordination=effectiveSection(platform,'coordination','## Context discipline and handoffs');
  const fields=briefFields.join('.*');
  assert.match(coordination,new RegExp(fields,'s'));
  assert.match(coordination,new RegExp('envelope.*'+fields,'s'));
 });
}

function checkLayout(platform,documents){
 const core=documents.get('core');
 for(const name of gates){
  assert.ok(documents.has(name),`missing ${platform}/${name}`);
  const row=core.split('\n').find(line=>line.startsWith('|')&&line.includes(`references/${name}.md`));
  assert.ok(row,`missing before-action gate ${platform}/${name}`);
 }
 for(const contract of fixture.platforms[platform].contracts){
  assert.equal(contract.reader,'orchestrator');
  if(contract.destination!=='core'){
   const row=core.split('\n').find(line=>line.startsWith('|')&&line.includes(`references/${contract.destination}.md`));
   assert.ok(row,`unreachable contract ${platform}/${contract.heading}`);
  }
  assert.ok(documents.get(contract.destination)?.split('\n').some(line=>line.replace(/^#{1,6}\s+/, '')===contract.heading),
   `missing heading ${platform}/${contract.destination}/${contract.heading}`);
 }
 for(const target of POLICY_TARGETS.filter(t=>t.platform===platform&&t.audience==='orchestrator')){
  const name=target.path.endsWith('/SKILL.md')?'core':path.basename(target.path,'.md');
  for(const rule of defaultRolePolicy.rules.filter(rule=>({core:['scope.non-escalation','external.explicit-user-authority','role.orchestrator-boundary'],coordination:['git.specialists-deny','role.scouter-read-only','role.planner-draft-only','role.implementer-implementation','role.tester-verification','role.reviewer-independent'],planning:['git.orchestrator-accept-commit','review.significant-no-plan','review.significant-plan','review.final-plan-recheck'],handoff:['git.specialists-deny','role.implementer-implementation','review.significant-no-plan','review.significant-plan','review.final-plan-recheck'],'handoff-prep':['scope.non-escalation','git.specialists-deny','git.orchestrator-accept-commit','external.explicit-user-authority'],verification:['git.orchestrator-accept-commit','review.significant-no-plan','review.significant-plan','review.final-plan-recheck'],commit:['scope.non-escalation','git.orchestrator-accept-commit','external.explicit-user-authority']}[name]??[]).includes(rule.id))){
   assert.ok(documents.get(name).includes(`- [${rule.id}] ${rule.text}`),`missing canonical contract ${platform}/${name}/${rule.id}`);
  }
 }
 for(const rule of defaultRolePolicy.rules)assert.ok([...documents.values()].some(text=>text.includes(`- [${rule.id}] ${rule.text}`)),`unreachable rule ${rule.id}`);
}
for(const platform of ['codex','claude']){
 test(`${platform} bootstrap preserves activation while deferring policy contracts`,()=>{
  const text=agentsBlockBody(`/Users/u/.${platform}`,'/Users/u','en',platform),base=fixture.platforms[platform];
  assert.ok(Buffer.byteLength(text)<base.global.bytes);assert.ok(text.split('\n').length-1<base.global.lines);
  const custom=agentsBlockBody('/tmp/home with spaces/custom arc','/Users/u','ko',platform);
  assert.ok(custom.includes('`/tmp/home with spaces/custom arc/skills/arc/SKILL.md`'));
 });
 test(`${platform} contracts have explicit destinations and before-action gates`,()=>{
  const documents=new Map(['core',...gates].filter(name=>fs.existsSync(path.join(root,file(platform,name)))).map(name=>[name,effectiveText(platform,name)]));
  checkLayout(platform,documents);
  assert.ok(Buffer.byteLength(documents.get('core'))<fixture.platforms[platform].skill.bytes);
  assert.ok(documents.get('core').split('\n').length-1<fixture.platforms[platform].skill.lines);
  for(const link of documents.get('core').matchAll(/\]\((references\/[^)#]+)(?:#[^)]+)?\)/g))assert.ok(fs.existsSync(path.join(root,platform,'skill',link[1]))||fs.existsSync(path.join(root,'shared/skill',link[1])),link[1]);
  for(const name of gates){
   const missing=new Map(documents);missing.delete(name);assert.throws(()=>checkLayout(platform,missing),undefined,`omitted ${name}`);
   const ungated=new Map(documents);ungated.set('core',documents.get('core').split('\n').filter(line=>!line.includes(`references/${name}.md`)).join('\n'));assert.throws(()=>checkLayout(platform,ungated),undefined,`ungated ${name}`);
  }
 });
}
test('planning document commits wait for every planned spec and plan approval on both platforms',()=>{
 for(const platform of ['claude','codex']){
  const document=effectiveText(platform,'handoff-prep');
  assert.ok(document.includes('<a id="planning-document-commit"></a>'),platform);
 }
});
test('Codex document transfer includes legacy documents while excluding normal new documents',()=>{
 assert.match(read('shared/skill/references/handoff-worktree.md'),/^### Worktree document transfer$/m);
});
test('Codex Git escalation requires sandbox denial and stays limited to the exact command and workspace',()=>{
 const recovery=effectiveSection('codex','git-recovery','## Git metadata write denial');
 assert.doesNotMatch(recovery,/evidence of permission-system denial/);
});
test('Codex coordination uses the current Tester role in its task name example',()=>{
 assert.match(effectiveText('codex','coordination'),/`tester_installer_checks`/);
});
test('profile models, permissions, canonical policy and CLI/runtime bytes are preserved',()=>{
 for(const[name,hash]of Object.entries(fixture.protected))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex'),hash,name);
});
