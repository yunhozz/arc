import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
for(const mutation of ['missing ID','changed assertion','duplicate ID'])test(`complete parity rejects ${mutation} even when legacy sources are absent`,t=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'arc-parity-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const ledger=JSON.parse(fs.readFileSync('tests/installer-parity.json'));fs.mkdirSync(path.join(root,'tests'),{recursive:true});for(const entry of ledger.entries){entry.status='verified';const filename=path.join(root,entry.destination.file);fs.mkdirSync(path.dirname(filename),{recursive:true});fs.appendFileSync(filename,'// '+entry.destination.test+'\n');}if(mutation==='missing ID')ledger.entries.pop();if(mutation==='changed assertion')ledger.legacyInventory[0].assertions[0].expression='self.assertTrue(True)';if(mutation==='duplicate ID')ledger.entries.push(ledger.entries[0]);fs.writeFileSync(path.join(root,'tests/installer-parity.json'),JSON.stringify(ledger));const result=spawnSync(process.execPath,['scripts/check-installer-parity.mjs','--root',root,'--complete'],{encoding:'utf8'});assert.equal(result.status,1,result.stdout);assert.match(result.stderr,/inventory|assertion|Duplicate/i);});
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
