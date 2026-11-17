import {execFileSync} from 'node:child_process';
import {readFileSync, appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

export const RELEASE_LABELS = Object.freeze(['release:major', 'release:minor', 'release:skip']);
const registryUrl = 'https://registry.npmjs.org/@yunhozz%2Farc';
const skip = () => ({mode: 'skip', bump: '', version: '', pr: ''});
const fail = message => { throw new Error(message); };

export function isStableVersion(value) {
  return typeof value === 'string' && !/[\r\n]/.test(value) && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value);
}

export function isGreater(left, right) {
  if (!isStableVersion(left) || !isStableVersion(right)) fail('Expected stable versions.');
  const a = left.split('.').map(BigInt);
  const b = right.split('.').map(BigInt);
  const index = a.findIndex((value, i) => value !== b[i]);
  return index >= 0 && a[index] > b[index];
}

export function nextVersion(current, bump) {
  if (!isStableVersion(current)) fail('Expected a stable version.');
  const [major, minor, patch] = current.split('.').map(BigInt);
  if (bump === 'major') return `${major + 1n}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1n}.0`;
  if (bump === 'patch') return `${major}.${minor}.${patch + 1n}`;
  fail('Invalid release bump.');
}

export function isReleaseCommit({authorName, message}) {
  return authorName === 'github-actions[bot]' && typeof message === 'string' && /^v\d+\.\d+\.\d+$/.test(message.trimEnd());
}

export function selectMergedPullRequest(pulls, sha) {
  if (!Array.isArray(pulls)) fail('Invalid GitHub pull request metadata.');
  const matches = pulls.filter(pull => pull?.merged_at && pull.base?.ref === 'master' && pull.merge_commit_sha === sha);
  if (matches.length > 1) fail('Multiple merged pull requests match this commit.');
  if (!matches.length) return null;
  const pull = matches[0];
  return {number: pull.number, labels: pull.labels.map(label => label.name)};
}

export function decideBump(labels) {
  const selected = [...new Set(labels.filter(label => RELEASE_LABELS.includes(label)))];
  if (selected.length > 1) fail('Multiple release labels; fix labels and Re-run.');
  if (selected[0] === 'release:skip') return {mode: 'skip'};
  return {mode: 'bump', bump: selected[0]?.slice('release:'.length) ?? 'patch'};
}

function validatePackage({pkg, lock}) {
  if (!pkg || !lock || lock.name !== pkg.name || lock.version !== pkg.version || lock.packages?.['']?.name !== pkg.name || lock.packages?.['']?.version !== pkg.version) fail('package-lock.json must match package.json name and version.');
  if (pkg.name !== '@yunhozz/arc' || !isStableVersion(pkg.version)) fail('Expected @yunhozz/arc with a stable version.');
  return pkg;
}

async function readRegistry(fetchImpl) {
  const response = await fetchImpl(registryUrl, {signal: AbortSignal.timeout(30000)});
  if (response.status === 404) fail('Publish @yunhozz/arc manually once, then configure npm Trusted Publishing before enabling this workflow.');
  if (!response.ok) fail(`npm registry request failed: ${response.status}`);
  const metadata = await response.json();
  const latest = metadata?.['dist-tags']?.latest;
  if (metadata?.name !== '@yunhozz/arc' || !isStableVersion(latest) || !metadata.versions || typeof metadata.versions !== 'object' || Array.isArray(metadata.versions) || metadata.versions[latest]?.version !== latest) fail('Invalid npm registry metadata.');
  return metadata;
}

function hasPublishedVersion(metadata, version) {
  if (!Object.hasOwn(metadata.versions, version)) return false;
  if (metadata.versions[version]?.version !== version) fail('Invalid published version metadata.');
  return true;
}

function requireAboveLatest(version, metadata) {
  if (!isGreater(version, metadata['dist-tags'].latest)) fail('New version must be greater than npm latest.');
}

export async function planRelease(ctx) {
  if (ctx.trigger === 'push') {
    if (isReleaseCommit(ctx.headCommit)) return skip();
    if (typeof ctx.before !== 'string' || ctx.before.length !== 40 || !/^[a-f0-9]{40}$/.test(ctx.before) || /^0+$/.test(ctx.before)) fail('Missing previous master commit; cannot establish a version change.');
  } else if (ctx.trigger === 'publish-current') {
    if (ctx.ref !== 'refs/heads/master') fail('Release dispatch requires refs/heads/master.');
  } else {
    fail('Invalid release trigger.');
  }

  const current = validatePackage(await ctx.readPackage());
  if (ctx.trigger === 'publish-current') {
    const metadata = await readRegistry(ctx.fetchImpl);
    if (hasPublishedVersion(metadata, current.version)) return skip();
    requireAboveLatest(current.version, metadata);
    return {mode: 'publish-current', bump: '', version: current.version, pr: ''};
  }

  const previous = await ctx.readPreviousPackage(ctx.before);
  if (previous?.name !== current.name || !isStableVersion(previous.version)) fail('Invalid previous package metadata.');
  if (previous.version !== current.version) {
    if (!isGreater(current.version, previous.version)) fail('New version must be greater than previous master version.');
    const metadata = await readRegistry(ctx.fetchImpl);
    if (hasPublishedVersion(metadata, current.version)) return skip();
    requireAboveLatest(current.version, metadata);
    return {mode: 'manual', bump: '', version: current.version, pr: ''};
  }

  if (typeof ctx.repo !== 'string' || /[\r\n]/.test(ctx.repo) || !/^[\w.-]+\/[\w.-]+$/.test(ctx.repo)) fail('Invalid GitHub repository.');
  const response = await ctx.fetchImpl(`https://api.github.com/repos/${ctx.repo}/commits/${ctx.sha}/pulls`, {
    headers: {Authorization: `Bearer ${ctx.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'},
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) fail(`GitHub pull request request failed: ${response.status}`);
  const pull = selectMergedPullRequest(await response.json(), ctx.sha);
  if (!pull) return skip();
  const decision = decideBump(pull.labels);
  if (decision.mode === 'skip') return skip();
  const version = nextVersion(current.version, decision.bump);
  const metadata = await readRegistry(ctx.fetchImpl);
  if (!hasPublishedVersion(metadata, current.version)) fail('Current version is unpublished; run publish-current first.');
  if (hasPublishedVersion(metadata, version)) fail('Next version is already published.');
  requireAboveLatest(version, metadata);
  return {mode: 'bump', bump: decision.bump, version, pr: String(pull.number)};
}

export function formatOutputs(plan) {
  const {mode, bump, version, pr} = plan;
  if ([mode, bump, version, pr].some(value => typeof value !== 'string' || /[\r\n]/.test(value))
      || !['skip', 'manual', 'bump', 'publish-current', 'dry-run'].includes(mode)
      || !['', 'patch', 'minor', 'major'].includes(bump)
      || (version !== '' && !isStableVersion(version))
      || (pr !== '' && !/^[1-9]\d*$/.test(pr))) fail('Invalid release outputs.');
  const noBump = bump === '' && pr === '';
  const completeBump = bump !== '' && pr !== '' && version !== '';
  if ((mode === 'skip' && (!noBump || version !== ''))
      || (['manual', 'publish-current'].includes(mode) && (!noBump || version === ''))
      || (mode === 'bump' && !completeBump)
      || (mode === 'dry-run' && !noBump && !completeBump)) fail('Invalid release outputs.');
  return `mode=${mode}\nbump=${bump}\nversion=${version}\npr=${pr}\n`;
}

export async function isPublished(fetchImpl, version) {
  if (!isStableVersion(version)) fail('Expected @yunhozz/arc with a stable version.');
  return hasPublishedVersion(await readRegistry(fetchImpl), version);
}

export async function main({argv, env, fetchImpl, git, readFile, appendFile, log}) {
  if (argv[0] === 'published') {
    const published = await isPublished(fetchImpl, env.VERSION);
    await appendFile(env.GITHUB_OUTPUT, `published=${published}\n`);
    return;
  }
  if (argv[0] !== 'plan') fail('Expected plan or published command.');
  const dispatch = env.GITHUB_EVENT_NAME === 'workflow_dispatch';
  if (dispatch && env.GITHUB_REF !== 'refs/heads/master') fail('Release dispatch requires refs/heads/master.');
  if (dispatch && !['dry-run', 'publish-current'].includes(env.RELEASE_ACTION)) fail('Invalid release action.');
  if (!dispatch && env.GITHUB_EVENT_NAME !== 'push') fail('Invalid release event.');
  const ctx = {
    trigger: dispatch && env.RELEASE_ACTION === 'publish-current' ? 'publish-current' : 'push',
    sha: env.GITHUB_SHA, ref: env.GITHUB_REF, repo: env.GITHUB_REPOSITORY, token: env.GH_TOKEN, fetchImpl,
    readPackage: async () => ({pkg: JSON.parse(await readFile('package.json', 'utf8')), lock: JSON.parse(await readFile('package-lock.json', 'utf8'))}),
    readPreviousPackage: async before => JSON.parse(await git(['show', `${before}:package.json`])),
  };
  const dryRun = dispatch && env.RELEASE_ACTION === 'dry-run';
  if (dryRun) {
    ctx.before = String(await git(['rev-parse', `${ctx.sha}^1`])).trim();
    const head = String(await git(['show', '-s', '--format=%an%x00%B', ctx.sha]));
    const separator = head.indexOf('\0');
    ctx.headCommit = {authorName: head.slice(0, separator), message: head.slice(separator + 1)};
  } else if (!dispatch) {
    const event = JSON.parse(await readFile(env.GITHUB_EVENT_PATH, 'utf8'));
    ctx.before = event.before;
    ctx.headCommit = {authorName: event.head_commit?.author?.name, message: event.head_commit?.message};
  }
  const plan = await planRelease(ctx);
  const outputs = formatOutputs(dryRun ? {...plan, mode: 'dry-run'} : plan);
  if (dryRun) {
    const evaluation = `Dry-run evaluation:\n${formatOutputs(plan)}`;
    log(evaluation);
    if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, evaluation);
  }
  await appendFile(env.GITHUB_OUTPUT, outputs);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main({
    argv: process.argv.slice(2), env: process.env, fetchImpl: globalThis.fetch,
    git: args => execFileSync('git', args, {encoding: 'utf8'}),
    readFile: readFileSync, appendFile: appendFileSync, log: console.log,
  });
}
