import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const workflow=fs.readFileSync('.github/workflows/npm-publish.yml','utf8');
test('release workflow preserves all eligibility guards and publication permissions',()=>{
 assert.equal(createHash('sha256').update(workflow.split(/^  publish:$/m)[0]).digest('hex'),'73fdd28ffba1b03258ad81330c66f7da40585211bf0859e841523b1d650c25c7');
 const publish=workflow.split(/^  publish:$/m)[1];assert.ok(publish);assert.match(publish,/needs: eligibility/);assert.match(publish,/needs.eligibility.outputs.publish == 'true'/);
 assert.match(publish,/contents: read/);assert.match(publish,/id-token: write/);assert.match(publish,/persist-credentials: false/);assert.match(publish,/node-version: '24'/);assert.match(publish,/npm install --global npm@11/);
});
test('publication consumes only the generated and reverified tarball after source validation',()=>{
 const publish=workflow.split(/^  publish:$/m)[1];
 const manifest=publish.indexOf('node scripts/update-manifest.mjs --check'),build=publish.indexOf('npm run pack:release -- --out-dir'),verify=publish.indexOf('node scripts/verify-release.mjs'),upload=publish.indexOf('npm publish "$RUNNER_TEMP/arc-release/arc-release.tgz"');
 assert.ok(manifest>=0&&build>manifest&&verify>build&&upload>verify,'source check → generator → verifier → tarball publish');
 assert.match(publish,/--name @yunhozz\/arc --version "\$version"/);assert.match(publish,/--access public --provenance --registry https:\/\/registry.npmjs.org\//);
 assert.equal((publish.match(/npm publish/g)||[]).length,1);assert.doesNotMatch(publish,/continue-on-error|always\(\)|npm publish --access/);
});
