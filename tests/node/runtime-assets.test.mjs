import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
test('runtime generator is deterministic check-only and rejects symlinks without deleting unmanaged files',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'arc-assets-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.cp('lib/runtime',path.join(root,'lib/runtime'),{recursive:true});await fs.mkdir(path.join(root,'lib/policy'),{recursive:true});await fs.writeFile(path.join(root,'lib/runtime/schema.mjs'),'export const version=1;\n');await fs.writeFile(path.join(root,'lib/policy/role-policy.json'),'{}\n');
 const run=args=>spawnSync(process.execPath,['scripts/update-runtime-assets.mjs','--root',root,...args],{encoding:'utf8'});
 assert.equal(run([]).status,0);const target=path.join(root,'codex/skill/runtime/schema.mjs');assert.equal(await fs.readFile(target,'utf8'),'export const version=1;\n');assert.equal(run(['--check']).status,0);
 await fs.writeFile(target,'drift');assert.equal(run(['--check']).status,1);assert.equal(await fs.readFile(target,'utf8'),'drift');assert.equal(run([]).status,0);
 const unmanaged=path.join(root,'codex/skill/runtime/user.txt');await fs.writeFile(unmanaged,'keep');assert.equal(run([]).status,0);assert.equal(await fs.readFile(unmanaged,'utf8'),'keep');
 await fs.unlink(target);await fs.symlink(unmanaged,target);assert.equal(run([]).status,1);assert.equal(await fs.readFile(unmanaged,'utf8'),'keep');
});

test('runtime generator rejects a missing installed command dependency',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'arc-assets-missing-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await fs.cp('lib/runtime',path.join(root,'lib/runtime'),{recursive:true});await fs.mkdir(path.join(root,'lib/policy'),{recursive:true});await fs.writeFile(path.join(root,'lib/policy/role-policy.json'),'{}');
 await fs.rm(path.join(root,'lib/runtime/command.mjs'),{force:true});
 const result=spawnSync(process.execPath,['scripts/update-runtime-assets.mjs','--root',root],{encoding:'utf8'});
 assert.equal(result.status,1);assert.match(result.stderr,/command.mjs/);
});
