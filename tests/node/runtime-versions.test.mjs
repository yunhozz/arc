import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdtemp, mkdir, cp, writeFile, rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
const baselineHash='sha256:8cab6010f2a3ee6c226fca97b07cc8ca374ef6b26619ece14ab1629957ff3374';

// Independent T5 contract: omission, reordering or unhashed gate bytes must fail.
const expectedModules = [
 'cli.mjs', 'command.mjs', 'bootstrap.mjs', 'cooperative-schema.mjs', 'cooperative.mjs', 'evaluate.mjs',
 'scope.mjs', 'store.mjs', 'git-evidence.mjs', 'assignment.mjs', 'verification.mjs', 'acceptance.mjs', 'external.mjs',
 'schema.mjs', 'operations.mjs', 'gate.mjs'
];
for (const runtime of ['lib/runtime/', 'codex/skill/runtime/', 'claude/skill/runtime/']) {
 test(`${runtime} freezes the ordered T5 inventory and hashes every raw module Buffer`, async () => {
  const directory = new URL('../../' + runtime, import.meta.url);
  const api = await import(new URL('bootstrap.mjs', directory));
  assert.deepEqual(api.COOPERATIVE_RUNTIME_MODULES, expectedModules);
  assert.equal(Object.isFrozen(api.COOPERATIVE_RUNTIME_MODULES), true);
  const bytes = Buffer.concat(await Promise.all(expectedModules.map(file => readFile(new URL(file, directory)))));
  const expectedHash = 'sha256:' + createHash('sha256').update(bytes).digest('hex');
  const versions=await api.cooperativeVersions();assert.equal(versions.runtime,'cooperative-2');
  assert.equal(versions.runtimeHash, expectedHash);
  assert.equal(expectedHash, baselineHash);
 });
}

test('install-only inventory additions and byte changes preserve the cooperative baseline',async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'arc-install-only-'));t.after(()=>rm(root,{recursive:true,force:true}));
 for(const name of ['lib/runtime','lib/policy'])await cp(new URL('../../'+name,import.meta.url),path.join(root,name),{recursive:true});
 await mkdir(path.join(root,'scripts'));await cp(new URL('../../scripts/update-runtime-assets.mjs',import.meta.url),path.join(root,'scripts/update-runtime-assets.mjs'));
 await mkdir(path.join(root,'lib/installer'));const {RUNTIME_MODULE_PATHS}=await import('../../lib/installer/runtime-assets.mjs');
 await writeFile(path.join(root,'lib/installer/runtime-assets.mjs'),'export const RUNTIME_MODULE_PATHS=Object.freeze('+JSON.stringify([...RUNTIME_MODULE_PATHS,'lib/runtime/install-only.mjs'].sort())+');');
 for(const bytes of ['export const install=1;','export const install=2;']){
  await writeFile(path.join(root,'lib/runtime/install-only.mjs'),bytes);const result=spawnSync(process.execPath,[path.join(root,'scripts/update-runtime-assets.mjs'),'--root',root],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
  for(const runtime of ['lib/runtime','codex/skill/runtime','claude/skill/runtime']){assert.equal(await readFile(path.join(root,runtime,'install-only.mjs'),'utf8'),bytes);const api=await import(pathToFileURL(path.join(root,runtime,'bootstrap.mjs')));assert.equal((await api.cooperativeVersions()).runtimeHash,baselineHash);}
 }
});
