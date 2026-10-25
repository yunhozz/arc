import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const expectedPaths = [
 'lib/runtime/acceptance.mjs','lib/runtime/adapters/claude.mjs','lib/runtime/adapters/codex.mjs',
 'lib/runtime/assignment.mjs','lib/runtime/bootstrap.mjs','lib/runtime/capabilities.mjs','lib/runtime/cli.mjs','lib/runtime/command.mjs',
 'lib/runtime/cooperative-schema.mjs','lib/runtime/cooperative.mjs','lib/runtime/evaluate.mjs',
 'lib/runtime/external.mjs','lib/runtime/gate.mjs','lib/runtime/git-evidence.mjs',
 'lib/runtime/git-query.mjs','lib/runtime/identity.mjs','lib/runtime/operations.mjs',
 'lib/runtime/schema.mjs','lib/runtime/scope.mjs','lib/runtime/store.mjs','lib/runtime/verification.mjs'
];
async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'arc-assets-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await fs.cp(new URL('../../lib/runtime',import.meta.url),path.join(root,'lib/runtime'),{recursive:true});
 await fs.mkdir(path.join(root,'lib/policy'),{recursive:true});await fs.writeFile(path.join(root,'lib/policy/role-policy.json'),'{}\n');
 await fs.mkdir(path.join(root,'scripts'));await fs.copyFile(new URL('../../scripts/update-runtime-assets.mjs',import.meta.url),path.join(root,'scripts/update-runtime-assets.mjs'));
 await fs.mkdir(path.join(root,'lib/installer'));const inventory=paths=>fs.writeFile(path.join(root,'lib/installer/runtime-assets.mjs'),'export const RUNTIME_MODULE_PATHS = Object.freeze('+JSON.stringify(paths)+');\n');await inventory(expectedPaths);
 const run=args=>spawnSync(process.execPath,[path.join(root,'scripts/update-runtime-assets.mjs'),'--root',root,...args],{encoding:'utf8'});
 return {root,inventory,run};
}
test('installer inventory covers every canonical module with frozen sorted root-relative paths',async()=>{
 const api=await import('../../lib/installer/runtime-assets.mjs').catch(()=>({}));assert.deepEqual(api.RUNTIME_MODULE_PATHS,expectedPaths);assert.equal(Object.isFrozen(api.RUNTIME_MODULE_PATHS),true);
 const walk=async directory=>(await Promise.all((await fs.readdir(directory,{withFileTypes:true})).map(async entry=>entry.isDirectory()?walk(path.join(directory,entry.name)):path.relative(new URL('../../',import.meta.url).pathname,path.join(directory,entry.name))))).flat();
 assert.deepEqual((await walk(new URL('../../lib/runtime',import.meta.url).pathname)).sort(),expectedPaths);
});
for(const kind of ['canonical-only','inventory-only','duplicate'])test(`generator rejects ${kind} before writing outputs`,async t=>{
 const {root,inventory,run}=await fixture(t);assert.equal(run([]).status,0);
 const target=path.join(root,'codex/skill/runtime/acceptance.mjs');await fs.writeFile(target,'sentinel');
 if(kind==='canonical-only')await fs.writeFile(path.join(root,'lib/runtime/new.mjs'),'export {};');
 if(kind==='inventory-only')await inventory([...expectedPaths,'lib/runtime/new.mjs'].sort());
 if(kind==='duplicate')await inventory([...expectedPaths,expectedPaths[0]].sort());
 const result=run([]);assert.equal(result.status,1,result.stdout);assert.match(result.stderr,/inventory/i);assert.equal(await fs.readFile(target,'utf8'),'sentinel');
 await assert.rejects(fs.access(path.join(root,'codex/skill/runtime/new.mjs')),{code:'ENOENT'});
});
test('runtime generator copies inventory additions and preserves check-only symlink and unmanaged-file safety',async t=>{
 const {root,inventory,run}=await fixture(t);await fs.writeFile(path.join(root,'lib/runtime/install-only.mjs'),'export const install=1;\n');await inventory([...expectedPaths,'lib/runtime/install-only.mjs'].sort());
 assert.equal(run([]).status,0);for(const platform of ['codex','claude'])assert.equal(await fs.readFile(path.join(root,platform,'skill/runtime/install-only.mjs'),'utf8'),'export const install=1;\n');
 const target=path.join(root,'codex/skill/runtime/schema.mjs');assert.deepEqual(await fs.readFile(target),await fs.readFile(path.join(root,'lib/runtime/schema.mjs')));assert.equal(run(['--check']).status,0);
 await fs.writeFile(target,'drift');assert.equal(run(['--check']).status,1);assert.equal(await fs.readFile(target,'utf8'),'drift');assert.equal(run([]).status,0);assert.equal(run(['--check']).status,0);
 const unmanaged=path.join(root,'codex/skill/runtime/user.txt');await fs.writeFile(unmanaged,'keep');assert.equal(run([]).status,0);assert.equal(await fs.readFile(unmanaged,'utf8'),'keep');
 await fs.unlink(target);await fs.symlink(unmanaged,target);assert.equal(run([]).status,1);assert.equal(await fs.readFile(unmanaged,'utf8'),'keep');
});

test('runtime generator rejects a missing installed command dependency',async t=>{
 const {root,run}=await fixture(t);
 await fs.rm(path.join(root,'lib/runtime/command.mjs'),{force:true});
 const result=run([]);
 assert.equal(result.status,1);assert.match(result.stderr,/command.mjs/);
});

test('cooperative runtime fingerprint changes when Planner transitive guard dependencies change',async t=>{
 const {pathToFileURL}=await import('node:url'),f=await fixture(t),api=await import(pathToFileURL(path.join(f.root,'lib/runtime/bootstrap.mjs')));
 for(const name of ['schema.mjs','operations.mjs','gate.mjs']){const before=await api.cooperativeVersions(),filename=path.join(f.root,'lib/runtime',name);await fs.appendFile(filename,'\n// dependency drift\n');const after=await api.cooperativeVersions();assert.notEqual(after.runtimeHash,before.runtimeHash,name);}
});
