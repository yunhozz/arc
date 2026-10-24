import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
for(const mutation of ['missing ID','changed assertion','duplicate ID'])test(`complete parity rejects ${mutation} even when legacy sources are absent`,t=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'arc-parity-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const ledger=JSON.parse(fs.readFileSync('tests/installer-parity.json'));fs.mkdirSync(path.join(root,'tests'),{recursive:true});for(const entry of ledger.entries){if(entry.status==='retired')continue;entry.status='verified';const filename=path.join(root,entry.destination.file);fs.mkdirSync(path.dirname(filename),{recursive:true});fs.appendFileSync(filename,'// '+entry.destination.test+'\n');}if(mutation==='missing ID')ledger.entries.pop();if(mutation==='changed assertion')ledger.legacyInventory[0].assertions[0].expression='self.assertTrue(True)';if(mutation==='duplicate ID')ledger.entries.push(ledger.entries[0]);fs.writeFileSync(path.join(root,'tests/installer-parity.json'),JSON.stringify(ledger));const result=spawnSync(process.execPath,['scripts/check-installer-parity.mjs','--root',root,'--complete'],{encoding:'utf8'});assert.equal(result.status,1,result.stdout);assert.match(result.stderr,/inventory|assertion|Duplicate/i);});
for(const mutation of ['missing helper file','unexecuted helper test','invalid helper path','unmapped helper'])test(`complete parity rejects ${mutation} with legacy sources absent`,t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'arc-helper-parity-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const ledger=JSON.parse(fs.readFileSync('tests/installer-parity.json')),passing={file:'tests/node/passing.test.mjs',test:'passing'};
 fs.mkdirSync(path.join(root,'tests/node'),{recursive:true});fs.writeFileSync(path.join(root,passing.file),"import test from 'node:test';test('passing',()=>{});\n");
 for(const entry of ledger.entries){entry.status='verified';entry.destinations=[passing];entry.destination=passing;}
 for(const helper of ledger.legacyHelpers)helper.destinations=[passing];
 if(mutation==='missing helper file')ledger.legacyHelpers[0].destinations=[{file:'tests/node/absent.test.mjs',test:'helper assertion'}];
 if(mutation==='unexecuted helper test')ledger.legacyHelpers[0].destinations=[{...passing,test:'absent helper assertion'}];
 if(mutation==='invalid helper path')ledger.legacyHelpers[0].destinations=[{file:'../outside.mjs',test:'helper assertion'}];
 if(mutation==='unmapped helper')ledger.legacyHelpers[0].destinations=[];
 fs.writeFileSync(path.join(root,'tests/installer-parity.json'),JSON.stringify(ledger));
 const result=spawnSync(process.execPath,['scripts/check-installer-parity.mjs','--root',root,'--complete'],{encoding:'utf8',env:Object.fromEntries(Object.entries(process.env).filter(([name])=>name!=='NODE_TEST_CONTEXT'))});
 assert.equal(result.status,1,result.stdout);assert.match(result.stderr,/helper|mapped test file|Invalid destination/i);
});
const retiredId='tests/test_install.py::PolicyWordBudgetTests::test_policy_text_stays_within_word_budget';
const approvedPlan='docs/superpowers/plans/2026-10-17-arc-harness-refactor-plan.md';
for(const mutation of ['authorized','unknown ID','missing plan','missing plan file','wrong plan','missing reason','extra destinations','singular destination','active mapping'])test(`parity retirement contract: ${mutation}`,t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'arc-retired-parity-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const ledger=JSON.parse(fs.readFileSync('tests/installer-parity.json')),passing={file:'tests/node/passing.test.mjs',test:'passing'};
 fs.mkdirSync(path.join(root,'tests/node'),{recursive:true});fs.writeFileSync(path.join(root,passing.file),"import test from 'node:test';test('passing',()=>{});\n");
 for(const entry of ledger.entries){entry.status='verified';entry.destinations=[passing];entry.destination=passing;}
 for(const helper of ledger.legacyHelpers)helper.destinations=[passing];
 if(mutation!=='missing plan file'){fs.mkdirSync(path.dirname(path.join(root,approvedPlan)),{recursive:true});fs.writeFileSync(path.join(root,approvedPlan),'Approved retirement plan fixture.\n');}
 const retired=ledger.entries.find(entry=>entry.legacy===retiredId);Object.assign(retired,{status:'retired',destinations:[],retirementReason:'Approved plan retires this legacy policy assertion.',approvedPlan});delete retired.destination;
 if(mutation==='unknown ID'){retired.status='verified';retired.destinations=[passing];const other=ledger.entries[0];Object.assign(other,{status:'retired',destinations:[],retirementReason:'Retired',approvedPlan});delete other.destination;}
 if(mutation==='missing plan')delete retired.approvedPlan;
 if(mutation==='wrong plan')retired.approvedPlan='docs/another-plan.md';
 if(mutation==='missing reason')retired.retirementReason=' ';
 if(mutation==='extra destinations')retired.destinations=[passing];
 if(mutation==='singular destination')retired.destination=passing;
 if(mutation==='active mapping')ledger.entries[0].destinations=[];
 fs.writeFileSync(path.join(root,'tests/installer-parity.json'),JSON.stringify(ledger));
 const result=spawnSync(process.execPath,['scripts/check-installer-parity.mjs','--root',root,'--complete'],{encoding:'utf8',env:Object.fromEntries(Object.entries(process.env).filter(([name])=>name!=='NODE_TEST_CONTEXT'))});
 assert.equal(result.status,mutation==='authorized'?0:1,result.stderr||result.stdout);
 if(mutation==='authorized'){assert.match(result.stdout,/236 original test IDs.*235 verified.*1 retired/);assert.match(result.stdout,/739 test assertions.*736 verified.*3 retired/);assert.match(result.stdout,/14 helper assertions.*all active mappings ran/);}
 else assert.match(result.stderr,/retire|coverage/i);
});

// H5: inspect real generated delivery payloads, not only the frozen installer inventory.
test('paired specialist payloads deliver the same bounded recovery and visual contracts', async () => {
  const {buildPolicyOutputs, POLICY_TARGETS} = await import('../../lib/policy/render.mjs');
  const policy = JSON.parse(fs.readFileSync('lib/policy/role-policy.json'));
  const inputs = new Map(POLICY_TARGETS.map(({path: name}) => [name, fs.readFileSync(name)]));
  const outputs = buildPolicyOutputs(inputs, policy);
  for (const role of ['scouter', 'planner', 'implementer', 'qa', 'reviewer']) {
    const contracts = ['codex', 'claude'].map(platform => {
      const name = `${platform}/agents/arc-${role}.${platform === 'codex' ? 'toml' : 'md'}`;
      const text = outputs.get(name).toString();
      assert.match(text, /optional read method/i);
      const body = text.split('[ARC role policy: contract begin]')[1].split('[ARC role policy: contract end]')[0];
      return body.split('\n').filter(line => !line.startsWith('- [platform.')).join('\n');
    });
    assert.equal(contracts[0], contracts[1], role);
  }
  assert.deepEqual(JSON.parse(outputs.get('claude/skill/hooks/git-policy.json')), policy.git);
});
