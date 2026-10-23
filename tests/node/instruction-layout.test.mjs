import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import fixture from './fixtures/instruction-contracts.json' with {type:'json'};
import {agentsBlockBody} from '../../lib/installer/global-config.mjs';
import {POLICY_TARGETS,defaultRolePolicy} from '../../lib/policy/render.mjs';
const root=new URL('../../',import.meta.url).pathname;
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const normalize=text=>text.replaceAll('arc_coder','arc_implementer').replaceAll('arc-coder','arc-implementer').replaceAll('Coder','Implementer').replaceAll('coder','implementer').replaceAll('references/','').replace(/\s+/g,' ').trim();
const file=(platform,name)=>`${platform}/skill/${name==='core'?'SKILL.md':`references/${name}.md`}`;
const gates={coordination:'Before the first specialist creation or assignment and related coordination decisions',limits:'Before the first specialist creation',planning:'Design/plan-depth judgments',handoff:'Every Implementer first start/restart',verification:"Orchestrator's verification design",commit:'Plan-task acceptance', 'handoff-prep':'Execution-target choice request'};
function checkLayout(platform,documents){
 const core=documents.get('core');
 for(const[name,trigger]of Object.entries(gates)){
  assert.ok(documents.has(name),`missing ${platform}/${name}`);
  const row=core.split('\n').find(line=>line.startsWith('|')&&line.includes(`references/${name}.md`));
  assert.ok(row?.includes(trigger),`missing before-action gate ${platform}/${name}`);
 }
 for(const contract of fixture.platforms[platform].contracts){
  assert.equal(contract.reader,'orchestrator');
  if(contract.destination!=='core'){
   const row=core.split('\n').find(line=>line.startsWith('|')&&line.includes(`references/${contract.destination}.md`));
   assert.ok(row?.includes(contract.requiredBefore.replaceAll('Coder','Implementer')),`unreachable contract ${platform}/${contract.heading}`);
  }
  let expected=contract.text;for(const[old,replacement]of Object.entries(fixture.relocations[contract.heading]??{}))expected=expected.replaceAll(old,replacement);
  assert.ok(normalize(documents.get(contract.destination)).includes(normalize(expected)),`missing baseline contract ${platform}/${contract.heading} in ${contract.destination}`);
 }
 const exceptions=core.split('\n').find(line=>line.startsWith('Before classifying'));
 assert.ok(exceptions?.includes('small-task, plan-omission, or TDD exception')&&exceptions.includes('read the full conditions')&&exceptions.includes('references/handoff.md'),'missing full exception gate');
 for(const target of POLICY_TARGETS.filter(t=>t.platform===platform&&t.audience==='orchestrator')){
  const name=target.path.endsWith('/SKILL.md')?'core':path.basename(target.path,'.md');
  for(const rule of defaultRolePolicy.rules.filter(rule=>({core:['scope.non-escalation','external.explicit-user-authority','role.orchestrator-boundary'],coordination:['git.specialists-deny','role.scouter-read-only','role.planner-draft-only','role.implementer-implementation','role.qa-verification','role.reviewer-independent'],planning:['git.orchestrator-accept-commit','review.significant-no-plan','review.significant-plan','review.final-plan-recheck'],handoff:['git.specialists-deny','role.implementer-implementation','review.significant-no-plan','review.significant-plan','review.final-plan-recheck'],'handoff-prep':['scope.non-escalation','git.specialists-deny','git.orchestrator-accept-commit','external.explicit-user-authority'],verification:['git.orchestrator-accept-commit','review.significant-no-plan','review.significant-plan','review.final-plan-recheck'],commit:['scope.non-escalation','git.orchestrator-accept-commit','external.explicit-user-authority']}[name]??[]).includes(rule.id))){
   assert.ok(documents.get(name).includes(`- [${rule.id}] ${rule.text}`),`missing canonical contract ${platform}/${name}/${rule.id}`);
  }
 }
 for(const rule of defaultRolePolicy.rules)assert.ok([...documents.values()].some(text=>text.includes(`- [${rule.id}] ${rule.text}`)),`unreachable rule ${rule.id}`);
}
for(const platform of ['codex','claude']){
 test(`${platform} bootstrap preserves activation while deferring policy contracts`,()=>{
  const text=agentsBlockBody(`/Users/u/.${platform}`,'/Users/u','en',platform),base=fixture.platforms[platform];
  assert.equal(text.trim(),base.bootstrap);
  assert.ok(Buffer.byteLength(text)<base.global.bytes);assert.ok(text.split('\n').length-1<base.global.lines);
  const custom=agentsBlockBody('/tmp/home with spaces/custom arc','/Users/u','ko',platform);
  assert.ok(custom.includes('`/tmp/home with spaces/custom arc/skills/arc/SKILL.md`'));assert.ok(custom.includes('Use Korean by default'));
 });
 test(`${platform} contracts have explicit destinations and before-action gates`,()=>{
  const documents=new Map(['core',...Object.keys(gates)].map(name=>[name,fs.existsSync(path.join(root,file(platform,name)))?read(file(platform,name)):'']));
  checkLayout(platform,documents);
  assert.ok(normalize(documents.get('core')).includes(normalize(fixture.platforms[platform].opening)),`missing initial routing ${platform}`);
  assert.ok(Buffer.byteLength(documents.get('core'))<fixture.platforms[platform].skill.bytes);
  assert.ok(documents.get('core').split('\n').length-1<fixture.platforms[platform].skill.lines);
  for(const link of documents.get('core').matchAll(/\]\((references\/[^)#]+)(?:#[^)]+)?\)/g))assert.ok(fs.existsSync(path.join(root,platform,'skill',link[1])),link[1]);
  for(const name of Object.keys(gates)){
   const missing=new Map(documents);missing.delete(name);assert.throws(()=>checkLayout(platform,missing),undefined,`omitted ${name}`);
   const ungated=new Map(documents);ungated.set('core',documents.get('core').split('\n').filter(line=>!line.includes(`references/${name}.md`)).join('\n'));assert.throws(()=>checkLayout(platform,ungated),undefined,`ungated ${name}`);
  }
 });
}
test('profile models, permissions, hooks, canonical policy and CLI/runtime bytes are preserved',()=>{
 for(const[name,hash]of Object.entries(fixture.protected))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex'),hash,name);
});
