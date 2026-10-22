import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

// Independent T2 contract: omission, reordering or unhashed gate bytes must fail.
const expectedModules = [
 'bootstrap.mjs', 'cooperative-schema.mjs', 'cooperative.mjs', 'evaluate.mjs',
 'scope.mjs', 'store.mjs', 'git-evidence.mjs', 'assignment.mjs'
];
for (const runtime of ['lib/runtime/', 'codex/skill/runtime/', 'claude/skill/runtime/']) {
 test(`${runtime} freezes the ordered T2 inventory and hashes every raw module Buffer`, async () => {
  const directory = new URL('../../' + runtime, import.meta.url);
  const api = await import(new URL('bootstrap.mjs', directory));
  assert.deepEqual(api.COOPERATIVE_RUNTIME_MODULES, expectedModules);
  assert.equal(Object.isFrozen(api.COOPERATIVE_RUNTIME_MODULES), true);
  const bytes = Buffer.concat(await Promise.all(expectedModules.map(file => readFile(new URL(file, directory)))));
  const expectedHash = 'sha256:' + createHash('sha256').update(bytes).digest('hex');
  assert.equal((await api.cooperativeVersions()).runtimeHash, expectedHash);
 });
}
