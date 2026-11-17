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
    git: args => {
      if (args[0] === 'rev-list') {
        assert.deepEqual(args, ['rev-list', '--parents', '-n', '1', sha]); return `${sha} ${before}\n`;
      }
      assert.deepEqual(args, ['rev-parse', '-q', '--verify', `refs/tags/v${version}`]);
      throw Object.assign(new Error('Tag not found.'), {status: 1});
    },
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
    sleep: async () => assert.fail('Unexpected retry wait.'),
    git: args => {
      gitCalls.push(args);
      if (JSON.stringify(args) === JSON.stringify(['rev-parse', `${sha}^1`])) return `${before}\n`;
      if (JSON.stringify(args) === JSON.stringify(['show', '-s', '--format=%an%x00%B', sha])) return 'yunhozz\0feat: example\n';
      if (JSON.stringify(args) === JSON.stringify(['show', `${before}:package.json`])) return JSON.stringify({name: '@yunhozz/arc', version: '0.4.1'});
      if (args[0] === 'rev-parse' && args[1] === '-q') return f.ctx.git(args);
      if (args[0] === 'rev-list') return f.ctx.git(args);
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

function delayedPullFixture(responses, options = {}) {
  const f = fixture(options); const waits = []; const gitCalls = [];
  f.ctx.headCommit.message = 'Merge pull request #70 from x/y';
  const fetchImpl = f.ctx.fetchImpl; let lookups = 0;
  f.ctx.fetchImpl = async (url, init) => {
    const response = await fetchImpl(url, init);
    if (url === pullsUrl) response.json = async () => structuredClone(responses[Math.min(lookups++, responses.length - 1)]);
    return response;
  };
  f.ctx.git = args => {
    gitCalls.push(args); assert.deepEqual(args, ['rev-list', '--parents', '-n', '1', sha]);
    return `${sha} ${before} ${'c'.repeat(40)}\n`;
  };
  f.ctx.sleep = async milliseconds => waits.push(milliseconds);
  return {...f, waits, gitCalls};
}
for (const [attempt, expectedWaits] of [[1, [5000]], [2, [5000, 10000]], [3, [5000, 10000, 20000]]]) {
  test(`merge PR lookup recovers on retry ${attempt} with bounded backoff`, async () => {
    const f = delayedPullFixture([...Array.from({length: attempt}, () => []), [pull()]]);
    assert.deepEqual(await api.planRelease(f.ctx), bump);
    assert.deepEqual(f.waits, expectedWaits);
    assert.deepEqual(f.gitCalls, [['rev-list', '--parents', '-n', '1', sha]]);
    assert.deepEqual(f.calls.map(call => call.url), [...Array(attempt + 1).fill(pullsUrl), registryUrl]);
  });
}
test('merge PR lookup fails with Re-run guidance after exactly three empty retries', async () => {
  const f = delayedPullFixture([[]]);
  await assert.rejects(api.planRelease(f.ctx), /Re-run/);
  assert.deepEqual(f.waits, [5000, 10000, 20000]);
  assert.deepEqual(f.calls.map(call => call.url), Array(4).fill(pullsUrl));
});
test('direct-pushed merge commits with no eligible PR skip without waiting or retrying', async () => {
  const f = delayedPullFixture([[]]);
  f.ctx.headCommit.message = "Merge branch 'master' of github.com:yunhozz/arc";
  assert.deepEqual(await api.planRelease(f.ctx), skip);
  assert.deepEqual(f.waits, []);
  assert.deepEqual(f.calls.map(call => call.url), [pullsUrl]);
});
test('merge PR lookup retries when results contain only ineligible PRs', async () => {
  const f = delayedPullFixture([[pull({merge_commit_sha: before})], [pull({merged_at: null})], [pull({base: {ref: 'develop'}})], [pull({labels: [{name: 'release:skip'}]})]]);
  assert.deepEqual(await api.planRelease(f.ctx), skip);
  assert.deepEqual(f.waits, [5000, 10000, 20000]);
  assert.deepEqual(f.calls.map(call => call.url), Array(4).fill(pullsUrl));
});
test('single-parent commits with no eligible PR skip without waiting', async () => {
  const f = delayedPullFixture([[]]);
  f.ctx.git = args => {
    assert.deepEqual(args, ['rev-list', '--parents', '-n', '1', sha]); return `${sha} ${before}\n`;
  };
  assert.deepEqual(await api.planRelease(f.ctx), skip);
  assert.deepEqual(f.waits, []); assert.deepEqual(f.calls.map(call => call.url), [pullsUrl]);
});
test('merge PR retries propagate HTTP errors without further waits or registry access', async () => {
  const f = delayedPullFixture([[]]); const fetchImpl = f.ctx.fetchImpl; let count = 0;
  f.ctx.fetchImpl = async (url, init) => {
    const response = await fetchImpl(url, init);
    if (++count === 2) return {...response, ok: false, status: 403};
    return response;
  };
  await assert.rejects(api.planRelease(f.ctx), /GitHub pull request request failed: 403/);
  assert.deepEqual(f.waits, [5000]); assert.deepEqual(f.calls.map(call => call.url), [pullsUrl, pullsUrl]);
});
test('merge PR retries reject ambiguous matching PRs immediately', async () => {
  const f = delayedPullFixture([[], [pull(), pull({number: 71})]]);
  await assert.rejects(api.planRelease(f.ctx), /Multiple merged pull requests/);
  assert.deepEqual(f.waits, [5000]); assert.deepEqual(f.calls.map(call => call.url), [pullsUrl, pullsUrl]);
});
test('main injects git and fake sleep into delayed merge PR planning', async () => {
  const f = cliFixture(); const delayed = delayedPullFixture([[], [pull()]]);
  f.deps.fetchImpl = delayed.ctx.fetchImpl; f.deps.sleep = delayed.ctx.sleep;
  const readFile = f.deps.readFile;
  f.deps.readFile = file => file === '/event.json'
    ? JSON.stringify({before, head_commit: {author: {name: 'yunhozz'}, message: 'Merge pull request #70 from x/y'}})
    : readFile(file);
  const git = f.deps.git;
  f.deps.git = args => args[0] === 'rev-list' ? delayed.ctx.git(args) : git(args);
  await api.main(f.deps);
  assert.deepEqual(delayed.waits, [5000]);
  assert.deepEqual(f.writes.filter(write => write.file === '/output'), [{file: '/output', value: 'mode=bump\nbump=patch\nversion=0.4.2\npr=70\n'}]);
});
for (const [name, message, retries] of [
  ['PR merge', 'Merge pull request #70 from x/y', true],
  ['direct-pushed merge', "Merge branch 'master' of github.com:yunhozz/arc", false],
]) test(`main dry-run uses the git commit message to decide retries for a ${name}`, async () => {
  const f = cliFixture(); const delayed = delayedPullFixture([[]]);
  Object.assign(f.env, {GITHUB_EVENT_NAME: 'workflow_dispatch', RELEASE_ACTION: 'dry-run'});
  f.deps.fetchImpl = delayed.ctx.fetchImpl; f.deps.sleep = delayed.ctx.sleep;
  const git = f.deps.git;
  f.deps.git = args => {
    if (args[0] === 'rev-list') return delayed.ctx.git(args);
    if (JSON.stringify(args) === JSON.stringify(['show', '-s', '--format=%an%x00%B', sha])) return `yunhozz\0${message}\n`;
    return git(args);
  };
  if (retries) {
    await assert.rejects(api.main(f.deps), /Re-run/);
    assert.deepEqual(delayed.waits, [5000, 10000, 20000]);
    assert.deepEqual(delayed.calls.map(call => call.url), Array(4).fill(pullsUrl));
    assert.deepEqual(f.writes, []);
  } else {
    await api.main(f.deps);
    assert.deepEqual(delayed.waits, []);
    assert.deepEqual(delayed.calls.map(call => call.url), [pullsUrl]);
    assert.deepEqual(f.writes.filter(write => write.file === '/output'), [{file: '/output', value: 'mode=dry-run\nbump=\nversion=\npr=\n'}]);
  }
  assert.equal(f.fileReads.includes('/event.json'), false);
});
test('main dry-run uses master first parent and git head metadata, logs evaluation and writes summary', async () => {
  ready('main'); const f = cliFixture(); Object.assign(f.env, {GITHUB_EVENT_NAME: 'workflow_dispatch', RELEASE_ACTION: 'dry-run'});
  await api.main(f.deps);
  assert.deepEqual(f.gitCalls, [['rev-parse', `${sha}^1`], ['show', '-s', '--format=%an%x00%B', sha], ['show', `${before}:package.json`]]);
  assert.deepEqual(f.writes.filter(write => write.file === '/output'), [{file: '/output', value: 'mode=dry-run\nbump=patch\nversion=0.4.2\npr=70\n'}]);
  const summary = f.writes.find(write => write.file === '/summary')?.value;
  assert.equal(summary, 'Dry-run evaluation:\nmode=bump\nbump=patch\nversion=0.4.2\npr=70\nmode=dry-run\nbump=patch\nversion=0.4.2\npr=70\n');
  assert.match(f.logs.join('\n'), /0\.4\.2/);
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
test('main publish-current checks the local version tag without reading an event', async () => {
  ready('main'); const f = cliFixture({version: '0.4.2'}); Object.assign(f.env, {GITHUB_EVENT_NAME: 'workflow_dispatch', RELEASE_ACTION: 'publish-current'});
  await api.main(f.deps);
  assert.deepEqual(f.gitCalls, [['rev-parse', '-q', '--verify', 'refs/tags/v0.4.2']]); assert.equal(f.fileReads.includes('/event.json'), false);
  assert.deepEqual(f.writes.filter(write => write.file === '/output'), [{file: '/output', value: 'mode=publish-current\nbump=\nversion=0.4.2\npr=\n'}]);
});

test('publish-current accepts a matching stable tag and preserves registry decisions', async () => {
  for (const [version, expected] of [
    ['0.4.2', {mode: 'publish-current', bump: '', version: '0.4.2', pr: ''}], ['0.4.1', skip],
  ]) {
    const f = fixture({version}); Object.assign(f.ctx, {trigger: 'publish-current', ref: `refs/tags/v${version}`});
    f.ctx.git = () => assert.fail('Tag dispatch must not check master tags.');
    assert.deepEqual(await api.planRelease(f.ctx), expected);
  }
  const f = fixture({version: '0.4.0'}); Object.assign(f.ctx, {trigger: 'publish-current', ref: 'refs/tags/v0.4.0'});
  await assert.rejects(api.planRelease(f.ctx), /New version must be greater than npm latest/);
});
test('publish-current rejects mismatched tags before registry access', async () => {
  const f = fixture({version: '0.4.2'}); Object.assign(f.ctx, {trigger: 'publish-current', ref: 'refs/tags/v0.4.3'});
  await assert.rejects(api.planRelease(f.ctx), /tag.*version|version.*tag/i);
  assert.deepEqual(f.calls, []);
});
test('publish-current rejects invalid tag refs before package reads', async () => {
  for (const ref of ['refs/tags/v01.4.2', 'refs/tags/v0.4.2-rc.1', 'refs/tags/v0.4.2\n', 'refs/heads/feature']) {
    const f = fixture(); Object.assign(f.ctx, {trigger: 'publish-current', ref});
    await assert.rejects(api.planRelease(f.ctx)); assert.deepEqual(f.reads, []); assert.deepEqual(f.calls, []);
  }
});
test('publish-current on master refuses an existing tag with a tag dispatch command', async () => {
  for (const version of ['0.4.1', '0.4.2']) {
    const f = fixture({version}); f.ctx.trigger = 'publish-current';
    f.ctx.git = async args => {
      assert.deepEqual(args, ['rev-parse', '-q', '--verify', `refs/tags/v${version}`]); return `${sha}\n`;
    };
    await assert.rejects(api.planRelease(f.ctx), error => {
      assert.ok(error.message.includes(`gh workflow run npm-publish.yml -r v${version} -f action=publish-current`)); return true;
    });
    assert.deepEqual(f.calls, []);
  }
});
test('publish-current propagates unexpected git failures instead of treating tags as absent', async () => {
  const f = fixture({version: '0.4.2'}); f.ctx.trigger = 'publish-current';
  const failure = Object.assign(new Error('Git failed.'), {status: 128}); f.ctx.git = () => { throw failure; };
  await assert.rejects(api.planRelease(f.ctx), error => error === failure); assert.deepEqual(f.calls, []);
});
test('main publish-current accepts tag dispatch and preserves its version outputs', async () => {
  const f = cliFixture({version: '0.4.2'});
  Object.assign(f.env, {GITHUB_EVENT_NAME: 'workflow_dispatch', RELEASE_ACTION: 'publish-current', GITHUB_REF: 'refs/tags/v0.4.2'});
  await api.main(f.deps);
  assert.deepEqual(f.gitCalls, []);
  assert.deepEqual(f.writes.filter(write => write.file === '/output'), [{file: '/output', value: 'mode=publish-current\nbump=\nversion=0.4.2\npr=\n'}]);
});
test('main dry-run rejects a stable tag dispatch without any reads or outputs', async () => {
  const f = cliFixture();
  Object.assign(f.env, {GITHUB_EVENT_NAME: 'workflow_dispatch', RELEASE_ACTION: 'dry-run', GITHUB_REF: 'refs/tags/v0.4.2'});
  await assert.rejects(api.main(f.deps), /master/);
  assert.deepEqual(f.fileReads, []); assert.deepEqual(f.gitCalls, []); assert.deepEqual(f.writes, []);
});
test('main published writes the prepublish registry recheck result', async () => {
  ready('main');
  for (const [version, expected] of [['0.4.1', 'published=true\n'], ['0.4.2', 'published=false\n']]) {
    const f = cliFixture(); f.deps.argv = ['published']; f.env.VERSION = version; await api.main(f.deps);
    assert.deepEqual(f.writes, [{file: '/output', value: expected}]); assert.deepEqual(f.gitCalls, []); assert.deepEqual(f.fileReads, []);
  }
});

test('main rejects invalid release actions without reads or outputs on any ref', async () => {
  for (const ref of ['refs/heads/master', 'refs/tags/v0.4.2', 'refs/heads/feature']) {
    for (const action of [undefined, '', 'publish', 'dry-run\ninjected']) {
      const f = cliFixture();
      Object.assign(f.env, {GITHUB_EVENT_NAME: 'workflow_dispatch', RELEASE_ACTION: action, GITHUB_REF: ref});
      await assert.rejects(api.main(f.deps), {message: 'Invalid release action.'});
      assert.deepEqual(f.writes, []); assert.deepEqual(f.fileReads, []);
      assert.deepEqual(f.gitCalls, []); assert.deepEqual(f.calls, []);
    }
  }
});
test('main rejects unsupported events without reads or outputs', async () => {
  for (const event of ['pull_request', 'schedule', '', undefined]) {
    const f = cliFixture(); f.env.GITHUB_EVENT_NAME = event;
    await assert.rejects(api.main(f.deps), {message: 'Invalid release event.'});
    assert.deepEqual(f.writes, []); assert.deepEqual(f.fileReads, []);
    assert.deepEqual(f.gitCalls, []); assert.deepEqual(f.calls, []);
  }
});

for (const [name, options, env, expected] of [
  ['push bump', {pulls: [pull({title: 'UNTRUSTED_TITLE\nmode=manual', labels: [{name: 'UNTRUSTED_LABEL\nversion=9.9.9'}]})]}, {}, 'mode=bump\nbump=patch\nversion=0.4.2\npr=70\n'],
  ['push manual', {version: '0.4.2'}, {}, 'mode=manual\nbump=\nversion=0.4.2\npr=\n'],
  ['push skip', {pulls: []}, {}, 'mode=skip\nbump=\nversion=\npr=\n'],
  ['master publish-current', {version: '0.4.2'}, {GITHUB_EVENT_NAME: 'workflow_dispatch', RELEASE_ACTION: 'publish-current'}, 'mode=publish-current\nbump=\nversion=0.4.2\npr=\n'],
  ['tag publish-current', {version: '0.4.2'}, {GITHUB_EVENT_NAME: 'workflow_dispatch', RELEASE_ACTION: 'publish-current', GITHUB_REF: 'refs/tags/v0.4.2'}, 'mode=publish-current\nbump=\nversion=0.4.2\npr=\n'],
  ['tag published skip', {}, {GITHUB_EVENT_NAME: 'workflow_dispatch', RELEASE_ACTION: 'publish-current', GITHUB_REF: 'refs/tags/v0.4.1'}, 'mode=skip\nbump=\nversion=\npr=\n'],
]) {
  test(`main records only validated outputs in the ${name} summary`, async () => {
    const f = cliFixture(options); Object.assign(f.env, env);
    await api.main(f.deps);
    assert.deepEqual(f.writes.filter(write => write.file === '/summary'), [{file: '/summary', value: expected}]);
    assert.deepEqual(f.writes.filter(write => write.file === '/output'), [{file: '/output', value: expected}]);
  });
}
test('main allows an absent optional summary for push and publish-current', async () => {
  for (const event of ['push', 'workflow_dispatch']) {
    const f = cliFixture({version: '0.4.2'});
    Object.assign(f.env, {GITHUB_EVENT_NAME: event, RELEASE_ACTION: 'publish-current'}); delete f.env.GITHUB_STEP_SUMMARY;
    await api.main(f.deps);
    assert.equal(f.writes.length, 1); assert.equal(f.writes[0].file, '/output');
  }
});
test('main writes neither summary nor output when a planned PR value is invalid', async () => {
  const f = cliFixture({pulls: [pull({number: '70\nINJECTED'})]});
  await assert.rejects(api.main(f.deps), /Invalid release outputs/); assert.deepEqual(f.writes, []);
});
