import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync('.github/workflows/npm-publish.yml', 'utf8');
const jobHeaders = [...workflow.matchAll(/^  (plan|rehearse|release|publish):$/gm)];
const jobs = Object.fromEntries(jobHeaders.map((match, index) => [
  match[1], workflow.slice(match.index, jobHeaders[index + 1]?.index ?? workflow.length),
]));
const header = workflow.split(/^jobs:$/m)[0];

function job(name) {
  assert.ok(jobs[name], `Missing ${name} job`);
  return jobs[name];
}

function runBlocks(source) {
  const lines = source.split('\n');
  const blocks = [];
  for (let index = 0; index < lines.length; index++) {
    const match = /^(\s*)(?:- )?run:\s*(.*)$/.exec(lines[index]);
    if (!match) continue;
    if (!/^[|>][-+]?\s*$/.test(match[2])) {
      blocks.push(match[2]);
      continue;
    }
    const block = [];
    while (index + 1 < lines.length) {
      const next = lines[index + 1];
      if (next.trim() && next.search(/\S/) <= match[1].length) break;
      block.push(next);
      index++;
    }
    blocks.push(block.join('\n'));
  }
  return blocks;
}

function ordered(source, fragments) {
  let previous = -1;
  for (const fragment of fragments) {
    const position = source.indexOf(fragment);
    assert.ok(position > previous, `Missing or out of order: ${fragment}`);
    previous = position;
  }
}

function condition(source) {
  return source.split(/^    steps:$/m)[0].match(/^    if: ([\s\S]*?)(?=^    \S|$(?![\s\S]))/m)?.[1].replace(/\s+/g, ' ').trim();
}

test('triggers and top-level permissions', () => {
  assert.match(header, /push:\n    branches: \[master\]/);
  assert.doesNotMatch(header, /paths(?:-ignore)?:/);
  assert.match(header, /workflow_dispatch:\n    inputs:\n      action:/);
  assert.match(header, /type: choice/);
  assert.match(header, /options: \[dry-run, publish-current\]/);
  assert.match(header, /default: dry-run/);
  assert.match(header, /required: true/);
  assert.match(header, /^permissions: \{\}$/m);
  assert.match(header, /concurrency:\n  group: npm-publish\n  cancel-in-progress: false/);
  assert.deepEqual(Object.keys(jobs), ['plan', 'rehearse', 'release', 'publish']);
  assert.doesNotMatch(workflow, /^  eligibility:|^    environment:/m);
});

test('job permissions are least privilege', () => {
  const expected = {
    plan: ['contents: read', 'pull-requests: read'],
    rehearse: ['contents: read'],
    release: ['contents: write'],
    publish: ['contents: read', 'id-token: write'],
  };
  for (const [name, permissions] of Object.entries(expected)) {
    const section = job(name).match(/^    permissions:\n((?:^      .+\n)+)/m)?.[1];
    assert.ok(section, `${name} needs explicit permissions`);
    assert.deepEqual(section.trim().split('\n').map(line => line.trim()).sort(), permissions.sort());
  }
});

test('only release persists credentials', () => {
  assert.equal((workflow.match(/persist-credentials: true/g) ?? []).length, 1);
  for (const name of ['plan', 'rehearse', 'publish']) {
    assert.match(job(name), /persist-credentials: false/);
  }
  assert.match(job('release'), /persist-credentials: true/);
});

test('gates restrict writes and publication while allowing disabled-gate rehearsal', () => {
  assert.equal(condition(job('plan')), "(github.event_name == 'workflow_dispatch' && inputs.action == 'dry-run') || vars.NPM_PUBLISH_ENABLED == 'true'");
  assert.equal(condition(job('rehearse')), "github.event_name == 'workflow_dispatch' && needs.plan.outputs.mode == 'dry-run'");
  assert.equal(condition(job('release')), "vars.NPM_PUBLISH_ENABLED == 'true' && github.event_name == 'push' && needs.plan.outputs.mode == 'bump'");
  assert.equal(condition(job('publish')), ">- !cancelled() && vars.NPM_PUBLISH_ENABLED == 'true' && needs.plan.result == 'success' && ((needs.plan.outputs.mode == 'bump' && needs.release.result == 'success') || ((needs.plan.outputs.mode == 'manual' || needs.plan.outputs.mode == 'publish-current') && needs.release.result == 'skipped'))");
  assert.match(job('rehearse'), /needs: plan/);
  assert.match(job('release'), /needs: plan/);
  assert.match(job('publish'), /needs: \[plan, release\]/);
});

test('plan invokes the release-plan module and forwards its validated outputs', () => {
  const plan = job('plan');
  for (const key of ['mode', 'bump', 'version', 'pr']) {
    assert.ok(plan.includes(key + ': ${{ steps.plan.outputs.' + key + ' }}'));
  }
  ordered(plan, ['actions/checkout@v4', 'fetch-depth: 0', 'actions/setup-node@v4', "node-version: '24'", 'id: plan', 'node .github/scripts/release-plan.mjs plan']);
  assert.ok(plan.includes('GH_TOKEN: ${{ github.token }}'));
  assert.ok(plan.includes('RELEASE_ACTION: ${{ inputs.action }}'));
});

test('rehearsal never pushes or publishes', () => {
  const rehearse = job('rehearse');
  assert.doesNotMatch(rehearse, /git (?:push|commit|tag)\b|npm publish|id-token|NPM_PUBLISH_ENABLED/);
  assert.ok(rehearse.includes('ref: ${{ github.sha }}'));
  for (const name of ['rehearse', 'release']) {
    assert.ok(job(name).includes('BUMP: ${{ needs.plan.outputs.bump }}'));
    assert.ok(job(name).includes('VERSION: ${{ needs.plan.outputs.version }}'));
  }
  ordered(rehearse, ["node-version: '24'", 'node scripts/update-manifest.mjs --check', 'if [ -n "$BUMP" ]', 'npm version "$BUMP" --no-git-tag-version --ignore-scripts', 'node scripts/update-manifest.mjs\n', 'npm run check:manifest', 'REHEARSE_VERSION=', 'npm run pack:release -- --out-dir "$RUNNER_TEMP/arc-release"', 'node scripts/verify-release.mjs --out-dir "$RUNNER_TEMP/arc-release" --name @yunhozz/arc --version "$REHEARSE_VERSION"']);
  assert.match(rehearse, /REHEARSE_VERSION="\$\{VERSION:-\$\(node -p 'require\("\.\/package.json"\).version'\)\}"/);
  assert.ok(rehearse.includes('[ "$(node -p \'require("./package.json").version\')" = "$REHEARSE_VERSION" ]'));
});

test('release order and atomic push', () => {
  const release = job('release');
  assert.ok(release.includes('ref: ${{ github.sha }}'));
  ordered(release, ['fetch-depth: 0', "node-version: '24'", 'git ls-remote origin refs/heads/master', 'node scripts/update-manifest.mjs --check', 'npm version "$BUMP" --no-git-tag-version --ignore-scripts', 'node scripts/update-manifest.mjs\n', 'npm run check:manifest', 'git status --porcelain', 'git ls-remote --exit-code --tags origin "refs/tags/v$VERSION"', 'git add package.json package-lock.json MANIFEST.sha256', 'commit -m "v$VERSION"', 'git tag "v$VERSION"', 'git push --atomic origin HEAD:refs/heads/master "refs/tags/v$VERSION"', 'sha=$(git rev-parse HEAD)']);
  assert.doesNotMatch(release, /--force|(?:^|\s)-f(?:\s|$)|npm ci|npm install/);
  assert.ok(release.includes("user.name='github-actions[bot]'"));
  assert.ok(release.includes("user.email='41898282+github-actions[bot]@users.noreply.github.com'"));
  assert.ok(release.includes('sha: ${{ steps.release.outputs.sha }}'));
  assert.ok(release.includes('echo "sha=$sha" >> "$GITHUB_OUTPUT"'));
});

test('release rejects master drift, unexpected changes, version drift and existing tags', () => {
  const release = job('release');
  assert.ok(release.includes('[ "$remote_sha" != "$GITHUB_SHA" ]'));
  assert.ok(release.includes('changes=$(git status --porcelain)'));
  assert.ok(release.includes("expected=$(printf ' M MANIFEST.sha256\\n M package-lock.json\\n M package.json')"));
  assert.ok(release.includes('[ "$changes" != "$expected" ]'));
  assert.ok(release.includes('[ "$(node -p \'require("./package.json").version\')" = "$VERSION" ]'));
  assert.match(release, /if git ls-remote --exit-code --tags origin "refs\/tags\/v\$VERSION"; then\s+echo 'Release tag already exists\.' >&2\s+exit 1\s+else\s+status=\$\?\s+if \[ "\$status" -ne 2 \]; then\s+exit "\$status"\s+fi\s+fi/);
});

test('publication checks out the released SHA or the triggering SHA', () => {
  const publish = job('publish');
  assert.ok(publish.includes("ref: ${{ needs.plan.outputs.mode == 'bump' && needs.release.outputs.sha || github.sha }}"));
  assert.ok(publish.includes('VERSION: ${{ needs.plan.outputs.version }}'));
});

test('publication skips all later steps when the version is already published', () => {
  const publish = job('publish');
  const steps = publish.split(/^      - /m).slice(1);
  const published = steps.findIndex(step => /id: published/.test(step));
  assert.ok(published >= 0);
  assert.match(steps[published], /node \.github\/scripts\/release-plan.mjs published/);
  const later = steps.slice(published + 1);
  assert.equal(later.length, 5);
  for (const step of later) assert.match(step, /if: steps.published.outputs.published == 'false'/);
  ordered(publish, ['release-plan.mjs published', '[ "$(node -p \'require("./package.json").version\')" = "$VERSION" ]', 'node scripts/update-manifest.mjs --check']);
});

test('publication consumes only the reverified tarball', () => {
  const publish = job('publish');
  ordered(publish, ["node-version: '24'", 'npm install --global npm@11', 'release-plan.mjs published', 'node scripts/update-manifest.mjs --check', 'npm run pack:release -- --out-dir "$RUNNER_TEMP/arc-release"', 'node scripts/verify-release.mjs --out-dir "$RUNNER_TEMP/arc-release" --name @yunhozz/arc --version "$VERSION"', 'npm publish "$RUNNER_TEMP/arc-release/arc-release.tgz" --access public --provenance --registry https://registry.npmjs.org/']);
  assert.equal((workflow.match(/npm publish/g) ?? []).length, 1);
  assert.doesNotMatch(workflow, /continue-on-error|always\(\)|registry-url|npm publish --access/);
});

test('no expression interpolation inside run blocks', () => {
  const blocks = runBlocks(workflow);
  assert.ok(blocks.length > 0);
  for (const block of blocks) assert.ok(!block.includes('${{'), block);
});
