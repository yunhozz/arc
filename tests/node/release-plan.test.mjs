import test from 'node:test';
import assert from 'node:assert/strict';

const api = await import('../../.github/scripts/release-plan.mjs').catch(() => ({}));
const sha = 'a'.repeat(40);
const before = 'b'.repeat(40);
const registryUrl = 'https://registry.npmjs.org/@yunhozz%2Farc';
const pullsUrl = `https://api.github.com/repos/yunhozz/arc/commits/${sha}/pulls`;
const skip = {mode: 'skip', bump: '', version: '', pr: ''};
const bump = {mode: 'bump', bump: 'patch', version: '0.4.2', pr: '70'};
function ready(name) { assert.equal(typeof api[name], 'function', `${name} API must exist`); }
function registry() {
  return {name: '@yunhozz/arc', 'dist-tags': {latest: '0.4.1'}, versions: {'0.4.1': {version: '0.4.1'}}};
}
function packages(version = '0.4.1') {
  const pkg = {name: '@yunhozz/arc', version};
  return {pkg, lock: {...pkg, packages: {'': {...pkg}}}};
}
function pull(overrides = {}) {
  return {number: 70, merged_at: '2026-11-17T00:00:00Z', base: {ref: 'master'}, merge_commit_sha: sha, labels: [], ...overrides};
}
function fixture({version = '0.4.1', previous = '0.4.1', pulls = [pull()], metadata = registry(), registryStatus = 200, pullsStatus = 200} = {}) {
  const calls = [];
  const reads = [];
  const files = packages(version);
  const fetchImpl = async (url, options) => {
    calls.push({url, options});
    const response = url === registryUrl ? {status: registryStatus, json: metadata}
      : url === pullsUrl ? {status: pullsStatus, json: pulls} : null;
    assert.ok(response, `Unexpected URL: ${url}`);
    return {status: response.status, ok: response.status >= 200 && response.status < 300, json: async () => structuredClone(response.json)};
  };
  const ctx = {
    trigger: 'push', sha, before, ref: 'refs/heads/master', repo: 'yunhozz/arc', token: 'test-token',
    headCommit: {authorName: 'yunhozz', message: 'feat: example'},
    readPackage: () => { reads.push('current'); return files; },
    readPreviousPackage: value => { reads.push(value); return {name: '@yunhozz/arc', version: previous}; },
    fetchImpl,
  };
  return {ctx, files, calls, reads};
}

test('stable versions reject noncanonical values and compare arbitrary precision components', () => {
  ready('isStableVersion'); ready('isGreater');
  for (const value of ['0.4.1', '1.2.3', '9007199254740993.0.0']) assert.equal(api.isStableVersion(value), true);
  for (const value of ['01.2.3', '1.2', '1.2.3-rc.1', '1.2.3\n', null, 123]) assert.equal(api.isStableVersion(value), false);
  for (const [left, right, expected] of [['0.4.2', '0.4.1', true], ['1.0.0', '0.99.99', true], ['0.4.1', '0.4.1', false], ['0.4.1', '0.5.0', false], ['9007199254740993.0.0', '9007199254740992.0.0', true]]) assert.equal(api.isGreater(left, right), expected);
});
test('nextVersion increments only the selected component', () => {
  ready('nextVersion');
  for (const [current, kind, expected] of [['0.4.1', 'patch', '0.4.2'], ['0.4.1', 'minor', '0.5.0'], ['0.4.1', 'major', '1.0.0'], ['1.2.3', 'major', '2.0.0']]) assert.equal(api.nextVersion(current, kind), expected);
  assert.throws(() => api.nextVersion('0.4.1', 'prerelease'));
});
test('release labels select patch, minor, major or skip without exposing arbitrary labels', () => {
  ready('decideBump');
  for (const [labels, expected] of [[[], {mode: 'bump', bump: 'patch'}], [['bug'], {mode: 'bump', bump: 'patch'}], [['release:minor'], {mode: 'bump', bump: 'minor'}], [['release:major'], {mode: 'bump', bump: 'major'}], [['release:skip'], {mode: 'skip'}], [['release:minor', 'release:minor'], {mode: 'bump', bump: 'minor'}]]) assert.deepEqual(api.decideBump(labels), expected);
  for (const labels of [['release:minor', 'release:major'], ['release:skip', 'release:minor']]) assert.throws(() => api.decideBump(labels), error => {
    assert.match(error.message, /Multiple release labels/); assert.match(error.message, /fix labels and Re-run/); return true;
  });
});
test('only a bot author and an exact version message suppress recursive release', () => {
  ready('isReleaseCommit');
  for (const [authorName, message, expected] of [['github-actions[bot]', 'v0.4.2', true], ['github-actions[bot]', 'v0.4.2\n', true], ['github-actions[bot]', 'v0.4.2  \n', true], ['github-actions[bot]', 'feat: x', false], ['yunhozz', 'v0.4.2', false], ['github-actions[bot]', 'v0.4.2-rc.1', false], ['github-actions[bot]', ' v0.4.2', false]]) assert.equal(api.isReleaseCommit({authorName, message}), expected);
});
test('PR selection requires a unique merged master PR with the exact SHA', () => {
  ready('selectMergedPullRequest');
  assert.deepEqual(api.selectMergedPullRequest([pull({labels: [{name: 'release:minor'}], title: 'untrusted title'})], sha), {number: 70, labels: ['release:minor']});
  for (const pulls of [[], [pull({merged_at: null})], [pull({base: {ref: 'develop'}})], [pull({merge_commit_sha: before})]]) assert.equal(api.selectMergedPullRequest(pulls, sha), null);
  assert.throws(() => api.selectMergedPullRequest([pull(), pull({number: 71})], sha));
});
test('bot release skips before before-SHA validation, file reads and fetch', async () => {
  ready('planRelease'); const f = fixture();
  Object.assign(f.ctx, {before: 'invalid', headCommit: {authorName: 'github-actions[bot]', message: 'v0.4.2'}});
  assert.deepEqual(await api.planRelease(f.ctx), skip); assert.deepEqual(f.calls, []); assert.deepEqual(f.reads, []);
});
test('manual version changes publish only eligible unpublished versions', async () => {
  ready('planRelease'); const f = fixture({version: '0.4.2'});
  assert.deepEqual(await api.planRelease(f.ctx), {mode: 'manual', bump: '', version: '0.4.2', pr: ''});
  assert.deepEqual(f.calls.map(call => call.url), [registryUrl]);
  assert.deepEqual(f.reads, ['current', before]);
});
test('manual changes already published skip publication', async () => {
  ready('planRelease'); const metadata = registry(); metadata.versions['0.4.2'] = {version: '0.4.2'};
  assert.deepEqual(await api.planRelease(fixture({version: '0.4.2', metadata}).ctx), skip);
});
test('unchanged version without a matching PR skips without registry requests', async () => {
  ready('planRelease'); const f = fixture({pulls: []});
  assert.deepEqual(await api.planRelease(f.ctx), skip); assert.deepEqual(f.calls.map(call => call.url), [pullsUrl]);
});
test('eligible PR without release labels defaults to a patch bump with authenticated lookup', async () => {
  ready('planRelease'); const f = fixture(); assert.deepEqual(await api.planRelease(f.ctx), bump);
  assert.deepEqual(f.calls.map(call => call.url), [pullsUrl, registryUrl]);
  assert.deepEqual(f.calls[0].options.headers, {Authorization: 'Bearer test-token', Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'});
  for (const call of f.calls) assert.ok(call.options.signal instanceof AbortSignal);
});
test('skip label avoids registry lookup and major bump promotes 0.x to 1.0.0', async () => {
  ready('planRelease'); const f = fixture({pulls: [pull({labels: [{name: 'release:skip'}]})]});
  assert.deepEqual(await api.planRelease(f.ctx), skip); assert.deepEqual(f.calls.map(call => call.url), [pullsUrl]);
  assert.deepEqual(await api.planRelease(fixture({pulls: [pull({labels: [{name: 'release:major'}]})]}).ctx), {...bump, bump: 'major', version: '1.0.0'});
});
for (const [name, setup, message] of [
  ['nonincreasing manual version', () => fixture({version: '0.4.0'}), 'New version must be greater than previous master version.'],
  ['lock version mismatch', () => { const f = fixture(); f.files.lock.version = '0.4.0'; return f; }, 'package-lock.json must match package.json name and version.'],
  ['lock root name mismatch', () => { const f = fixture(); f.files.lock.packages[''].name = 'other'; return f; }, 'package-lock.json must match package.json name and version.'],
  ['wrong package name', () => { const f = fixture(); f.files.pkg.name = f.files.lock.name = f.files.lock.packages[''].name = 'other'; return f; }, 'Expected @yunhozz/arc with a stable version.'],
  ['unstable version', () => fixture({version: '0.4.2-rc.1'}), 'Expected @yunhozz/arc with a stable version.'],
  ['all-zero before', () => { const f = fixture(); f.ctx.before = '0'.repeat(40); return f; }, 'Missing previous master commit; cannot establish a version change.'],
  ['short before', () => { const f = fixture(); f.ctx.before = 'abc'; return f; }, 'Missing previous master commit; cannot establish a version change.'],
  ['invalid previous metadata', () => { const f = fixture(); f.ctx.readPreviousPackage = () => ({name: 'other', version: '0.4.0'}); return f; }, 'Invalid previous package metadata.'],
  ['registry 404', () => fixture({registryStatus: 404}), 'Publish @yunhozz/arc manually once, then configure npm Trusted Publishing before enabling this workflow.'],
  ['registry 500', () => fixture({registryStatus: 500}), 'npm registry request failed: 500'],
  ['wrong registry identity', () => { const metadata = registry(); metadata.name = 'other'; return fixture({metadata}); }, 'Invalid npm registry metadata.'],
  ['array versions metadata', () => { const metadata = registry(); metadata.versions = []; return fixture({metadata}); }, 'Invalid npm registry metadata.'],
  ['missing latest metadata', () => { const metadata = registry(); delete metadata.versions['0.4.1']; return fixture({metadata}); }, 'Invalid npm registry metadata.'],
  ['invalid published metadata', () => { const metadata = registry(); metadata.versions['0.4.2'] = {version: '9.9.9'}; return fixture({version: '0.4.2', metadata}); }, 'Invalid published version metadata.'],
  ['manual version below latest', () => { const metadata = registry(); metadata['dist-tags'].latest = '0.5.0'; metadata.versions['0.5.0'] = {version: '0.5.0'}; return fixture({version: '0.4.2', metadata}); }, 'New version must be greater than npm latest.'],
]) test(`eligibility rejects ${name} with the preserved message`, async () => {
  ready('planRelease'); await assert.rejects(api.planRelease(setup().ctx), {message});
});
for (const [name, setup, message] of [
  ['multiple labels', () => fixture({pulls: [pull({labels: [{name: 'release:major'}, {name: 'release:minor'}]})]}), /Multiple release labels/],
  ['current version unpublished', () => { const metadata = registry(); metadata['dist-tags'].latest = '0.4.0'; metadata.versions = {'0.4.0': {version: '0.4.0'}}; return fixture({metadata}); }, /publish-current/],
  ['next version already exists', () => { const metadata = registry(); metadata.versions['0.4.2'] = {version: '0.4.2'}; return fixture({metadata}); }, /already published|already exists/i],
  ['next version below latest', () => { const metadata = registry(); metadata['dist-tags'].latest = '0.5.0'; metadata.versions['0.5.0'] = {version: '0.5.0'}; return fixture({metadata}); }, /New version must be greater than npm latest/],
  ['pull lookup forbidden', () => fixture({pullsStatus: 403}), /403/],
  ['unsafe repository', () => { const f = fixture(); f.ctx.repo = 'yunhozz/arc/../other'; return f; }, /repository/i],
]) test(`bump planning rejects ${name}`, async () => {
  ready('planRelease'); await assert.rejects(api.planRelease(setup().ctx), message);
});
test('publish-current permits unpublished version above latest without previous git or PR lookup', async () => {
  ready('planRelease'); const f = fixture({version: '0.4.2'}); f.ctx.trigger = 'publish-current';
  assert.deepEqual(await api.planRelease(f.ctx), {mode: 'publish-current', bump: '', version: '0.4.2', pr: ''});
  assert.deepEqual(f.reads, ['current']); assert.deepEqual(f.calls.map(call => call.url), [registryUrl]);
});
test('publish-current skips an existing version and rejects non-master or nonincreasing versions', async () => {
  ready('planRelease'); const f = fixture(); f.ctx.trigger = 'publish-current';
  assert.deepEqual(await api.planRelease(f.ctx), skip);
  const metadata = registry(); metadata['dist-tags'].latest = '0.5.0'; metadata.versions['0.5.0'] = {version: '0.5.0'};
  const lower = fixture({version: '0.4.2', metadata}); lower.ctx.trigger = 'publish-current';
  await assert.rejects(api.planRelease(lower.ctx), /New version must be greater than npm latest/);
  f.ctx.ref = 'refs/heads/feature'; await assert.rejects(api.planRelease(f.ctx), /master/);
});
test('formatOutputs emits exactly the four validated keys', () => {
  ready('formatOutputs');
  assert.equal(api.formatOutputs({...bump, title: 'do not output', labels: ['do not output']}), 'mode=bump\nbump=patch\nversion=0.4.2\npr=70\n');
  assert.equal(api.formatOutputs(skip), 'mode=skip\nbump=\nversion=\npr=\n');
  for (const change of [{mode: 'publish'}, {mode: 'bump\nx'}, {bump: 'prerelease'}, {bump: 'patch\nx'}, {version: '0.4.2\nx'}, {version: '0.4.2\r'}, {pr: 'x'}, {pr: '01'}, {pr: '70\n'}, {pr: 70}]) assert.throws(() => api.formatOutputs({...bump, ...change}));
});
test('formatOutputs rejects any release fields on skip', () => {
  ready('formatOutputs');
  for (const plan of [
    {mode: 'skip', bump: 'major', version: '1.0.0', pr: '70'},
    {...skip, bump: 'patch'}, {...skip, pr: '70'}, {...skip, version: '0.4.2'},
  ]) assert.throws(() => api.formatOutputs(plan), /Invalid release outputs/);
});
for (const mode of ['manual', 'publish-current']) test(`formatOutputs requires only a nonempty stable version for ${mode}`, () => {
  ready('formatOutputs');
  for (const plan of [
    {mode, bump: '', version: '', pr: ''},
    {mode, bump: 'patch', version: '0.4.2', pr: ''},
    {mode, bump: '', version: '0.4.2', pr: '70'},
    {mode, bump: 'major', version: '1.0.0', pr: '70'},
  ]) assert.throws(() => api.formatOutputs(plan), /Invalid release outputs/);
});
test('formatOutputs requires bump, version and PR together for bump mode', () => {
  ready('formatOutputs');
  for (const plan of [
    {...bump, version: ''}, {...bump, bump: ''}, {...bump, pr: ''},
    {mode: 'bump', bump: '', version: '0.4.2', pr: ''},
    {mode: 'bump', bump: '', version: '', pr: ''},
  ]) assert.throws(() => api.formatOutputs(plan), /Invalid release outputs/);
});
test('formatOutputs rejects incomplete bump evaluations in dry-run mode', () => {
  ready('formatOutputs');
  for (const plan of [
    {mode: 'dry-run', bump: '', version: '0.4.2', pr: '70'},
    {mode: 'dry-run', bump: '', version: '', pr: '70'},
    {mode: 'dry-run', bump: 'patch', version: '0.4.2', pr: ''},
    {mode: 'dry-run', bump: 'minor', version: '', pr: '70'},
    {mode: 'dry-run', bump: 'major', version: '', pr: ''},
  ]) assert.throws(() => api.formatOutputs(plan), /Invalid release outputs/);
});
test('formatOutputs accepts every permitted mode and dry-run evaluation shape', () => {
  ready('formatOutputs');
  for (const [plan, expected] of [
    [{mode: 'manual', bump: '', version: '0.4.2', pr: ''}, 'mode=manual\nbump=\nversion=0.4.2\npr=\n'],
    [{mode: 'publish-current', bump: '', version: '0.4.2', pr: ''}, 'mode=publish-current\nbump=\nversion=0.4.2\npr=\n'],
    [{mode: 'bump', bump: 'minor', version: '0.5.0', pr: '70'}, 'mode=bump\nbump=minor\nversion=0.5.0\npr=70\n'],
    [{mode: 'bump', bump: 'major', version: '1.0.0', pr: '70'}, 'mode=bump\nbump=major\nversion=1.0.0\npr=70\n'],
    [{mode: 'dry-run', bump: '', version: '', pr: ''}, 'mode=dry-run\nbump=\nversion=\npr=\n'],
    [{mode: 'dry-run', bump: '', version: '0.4.2', pr: ''}, 'mode=dry-run\nbump=\nversion=0.4.2\npr=\n'],
    [{mode: 'dry-run', bump: 'patch', version: '0.4.2', pr: '70'}, 'mode=dry-run\nbump=patch\nversion=0.4.2\npr=70\n'],
    [{mode: 'dry-run', bump: 'minor', version: '0.5.0', pr: '70'}, 'mode=dry-run\nbump=minor\nversion=0.5.0\npr=70\n'],
    [{mode: 'dry-run', bump: 'major', version: '1.0.0', pr: '70'}, 'mode=dry-run\nbump=major\nversion=1.0.0\npr=70\n'],
  ]) assert.equal(api.formatOutputs(plan), expected);
});
test('isPublished distinguishes absent and present validated versions', async () => {
  ready('isPublished'); const f = fixture();
  assert.equal(await api.isPublished(f.ctx.fetchImpl, '0.4.1'), true);
  assert.equal(await api.isPublished(f.ctx.fetchImpl, '0.4.2'), false);
  for (const registryStatus of [404, 500]) await assert.rejects(api.isPublished(fixture({registryStatus}).ctx.fetchImpl, '0.4.1'));
  const metadata = registry(); metadata.versions['0.4.2'] = {version: 'other'};
  await assert.rejects(api.isPublished(fixture({metadata}).ctx.fetchImpl, '0.4.2'), /Invalid published version metadata/);
});

function cliFixture(options = {}) {
  const f = fixture(options); const writes = []; const logs = []; const gitCalls = []; const fileReads = [];
  const env = {GITHUB_EVENT_NAME: 'push', GITHUB_EVENT_PATH: '/event.json', GITHUB_SHA: sha, GITHUB_REF: 'refs/heads/master', GITHUB_REPOSITORY: 'yunhozz/arc', GH_TOKEN: 'test-token', GITHUB_OUTPUT: '/output', GITHUB_STEP_SUMMARY: '/summary'};
  const deps = {
    argv: ['plan'], env, fetchImpl: f.ctx.fetchImpl,
    git: args => {
      gitCalls.push(args);
      if (JSON.stringify(args) === JSON.stringify(['rev-parse', `${sha}^1`])) return `${before}\n`;
      if (JSON.stringify(args) === JSON.stringify(['show', '-s', '--format=%an%x00%B', sha])) return 'yunhozz\0feat: example\n';
      if (JSON.stringify(args) === JSON.stringify(['show', `${before}:package.json`])) return JSON.stringify({name: '@yunhozz/arc', version: '0.4.1'});
      assert.fail(`Unexpected git arguments: ${JSON.stringify(args)}`);
    },
    readFile: file => {
      fileReads.push(file);
      if (file === '/event.json') return JSON.stringify({before, head_commit: {author: {name: 'yunhozz'}, message: 'feat: example'}});
      if (file === 'package.json') return JSON.stringify(f.files.pkg);
      if (file === 'package-lock.json') return JSON.stringify(f.files.lock);
      assert.fail(`Unexpected file read: ${file}`);
    },
    appendFile: (file, value) => writes.push({file, value}), log: value => logs.push(value),
  };
  return {...f, deps, env, writes, logs, gitCalls, fileReads};
}
test('main push consumes the event and writes the planned outputs', async () => {
  ready('main'); const f = cliFixture(); await api.main(f.deps);
  assert.deepEqual(f.writes.filter(write => write.file === '/output'), [{file: '/output', value: 'mode=bump\nbump=patch\nversion=0.4.2\npr=70\n'}]);
  assert.deepEqual(f.gitCalls, [['show', `${before}:package.json`]]); assert.ok(f.fileReads.includes('/event.json'));
});
test('main dry-run uses master first parent and git head metadata, logs evaluation and writes summary', async () => {
  ready('main'); const f = cliFixture(); Object.assign(f.env, {GITHUB_EVENT_NAME: 'workflow_dispatch', RELEASE_ACTION: 'dry-run'});
  await api.main(f.deps);
  assert.deepEqual(f.gitCalls, [['rev-parse', `${sha}^1`], ['show', '-s', '--format=%an%x00%B', sha], ['show', `${before}:package.json`]]);
  assert.deepEqual(f.writes.filter(write => write.file === '/output'), [{file: '/output', value: 'mode=dry-run\nbump=patch\nversion=0.4.2\npr=70\n'}]);
  const summary = f.writes.find(write => write.file === '/summary')?.value;
  assert.match(summary, /bump/); assert.match(summary, /0\.4\.2/); assert.match(f.logs.join('\n'), /0\.4\.2/);
  assert.equal(f.fileReads.includes('/event.json'), false);
});
test('main dry-run preserves skip evaluation and allows absent optional summary', async () => {
  ready('main'); const f = cliFixture({pulls: []}); Object.assign(f.env, {GITHUB_EVENT_NAME: 'workflow_dispatch', RELEASE_ACTION: 'dry-run'}); delete f.env.GITHUB_STEP_SUMMARY;
  await api.main(f.deps);
  assert.deepEqual(f.writes, [{file: '/output', value: 'mode=dry-run\nbump=\nversion=\npr=\n'}]);
});
test('main rejects non-master dispatch before reads and propagates dry-run evaluation failure', async () => {
  ready('main');
  for (const action of ['dry-run', 'publish-current']) {
    const f = cliFixture(); Object.assign(f.env, {GITHUB_EVENT_NAME: 'workflow_dispatch', RELEASE_ACTION: action, GITHUB_REF: 'refs/heads/feature'});
    await assert.rejects(api.main(f.deps), /master/); assert.deepEqual(f.gitCalls, []); assert.deepEqual(f.calls, []); assert.deepEqual(f.writes, []);
  }
  const f = cliFixture({registryStatus: 500}); Object.assign(f.env, {GITHUB_EVENT_NAME: 'workflow_dispatch', RELEASE_ACTION: 'dry-run'});
  await assert.rejects(api.main(f.deps), /npm registry request failed: 500/); assert.deepEqual(f.writes, []);
});
test('main publish-current needs neither event nor git reads', async () => {
  ready('main'); const f = cliFixture({version: '0.4.2'}); Object.assign(f.env, {GITHUB_EVENT_NAME: 'workflow_dispatch', RELEASE_ACTION: 'publish-current'});
  await api.main(f.deps);
  assert.deepEqual(f.gitCalls, []); assert.equal(f.fileReads.includes('/event.json'), false);
  assert.deepEqual(f.writes.filter(write => write.file === '/output'), [{file: '/output', value: 'mode=publish-current\nbump=\nversion=0.4.2\npr=\n'}]);
});
test('main published writes the prepublish registry recheck result', async () => {
  ready('main');
  for (const [version, expected] of [['0.4.1', 'published=true\n'], ['0.4.2', 'published=false\n']]) {
    const f = cliFixture(); f.deps.argv = ['published']; f.env.VERSION = version; await api.main(f.deps);
    assert.deepEqual(f.writes, [{file: '/output', value: expected}]); assert.deepEqual(f.gitCalls, []); assert.deepEqual(f.fileReads, []);
  }
});
