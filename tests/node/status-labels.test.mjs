import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {RELEASE_CONDITIONS, reason} from '../../lib/runtime/role-dispatch-policy.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));

test('release conditions use the corrected Not Available code', () => {
  assert.ok(Object.hasOwn(RELEASE_CONDITIONS, 'Not Available'));
  assert.equal(Object.hasOwn(RELEASE_CONDITIONS, 'Not Ava'+'liable'), false);
  assert.throws(() => reason('Not Ava'+'liable'));
});

test('live sources, runtime copies, node tests and current docs do not contain the misspelled label', async () => {
  const files = [];
  async function collect(relative) {
    const entries = await fs.readdir(path.join(root, relative), {withFileTypes: true});
    for (const entry of entries) {
      const file = path.join(relative, entry.name);
      if (entry.isDirectory()) await collect(file);
      else if (entry.isFile()) files.push(file);
    }
  }
  for (const directory of ['lib', 'claude/skill', 'codex/skill', 'tests/node']) await collect(directory);
  files.push('README.md', 'docs/harness-operation.md');
  const misspelled = [];
  for (const file of files) {
    if ((await fs.readFile(path.join(root, file), 'utf8')).includes('Ava'+'liable')) misspelled.push(file);
  }
  assert.deepEqual(misspelled, [], `Misspelled label in: ${misspelled.join(', ')}`);
});
