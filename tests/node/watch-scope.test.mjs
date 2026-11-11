import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {makeHomes} from './fixtures/watch/homes.mjs';
import {createGitRunner, GIT_ALLOWED} from '../../lib/watch/git.mjs';
import {resolveScope, refreshScope, inScope, claudeDirPrefixes, normalizeSlug} from '../../lib/watch/scope.mjs';

function repository(t) {
  const homes = makeHomes(t), repo = path.join(homes.root, 'repo');
  fs.mkdirSync(repo);
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_')));
  Object.assign(env, {HOME:homes.userHome, CODEX_HOME:homes.codexHome, TZ:'UTC', GIT_CONFIG_NOSYSTEM:'1', GIT_CONFIG_GLOBAL:'/dev/null'});
  const run = args => execFileSync('git', args, {cwd:repo, env, stdio:'pipe'});
  run(['init']); run(['-c','user.name=Watch','-c','user.email=watch@example.invalid','commit','--allow-empty','-m','initial']);
  const git = createGitRunner({env:{...env, GIT_DIR:'/nonexistent', GIT_WORK_TREE:'/nonexistent'}});
  const add = name => { const dir = path.join(homes.root, name); run(['worktree','add','-b',name.replaceAll(' ','-'),dir]); return fs.realpathSync(dir); };
  return {...homes, repo:fs.realpathSync(repo), git, add};
}
test('git runner rejects commands outside the allowlist', async t => {
  const {repo, git} = repository(t);
  for (const args of [['status'],['worktree','add','x']]) await assert.rejects(async () => git(repo, args), {message:'git command not allowed'});
  for (const args of GIT_ALLOWED) assert.equal(typeof await git(repo, args), 'string');
  assert.equal(await git(path.dirname(repo), GIT_ALLOWED[0]), null);
});
test('default scope covers every worktree of the repository', async t => {
  const {repo, git, add} = repository(t), wt = add('wt 2');
  const scope = await resolveScope({mode:'default', dir:repo, git});
  assert.equal(scope.kind, 'repo'); assert.deepEqual(new Set(scope.roots), new Set([repo,wt]));
  assert.equal(inScope(scope, path.join(wt,'sub')), true);
  assert.equal(inScope(scope, `${repo}-other`), false);
  assert.equal(scope.gitCommonDir, path.join(repo,'.git'));
});
test('non-repository directory scope', async t => {
  const h = makeHomes(t), git = createGitRunner({env:{HOME:h.userHome,TZ:'UTC',PATH:process.env.PATH}});
  const scope = await resolveScope({mode:'default', dir:h.userHome, git});
  assert.equal(scope.kind,'dir'); assert.equal(inScope(scope,path.join(h.userHome,'sub')),true);
  assert.equal(inScope(scope,h.root),false);
});
test('inScope resolves symlinked and spaced paths', async t => {
  const {root,repo,git} = repository(t), link = path.join(root,'linked repo');
  fs.symlinkSync(repo,link,'dir'); fs.mkdirSync(path.join(repo,'문서'));
  const scope = await resolveScope({mode:'default',dir:repo,git});
  assert.equal(inScope(scope,path.join(link,'missing','child')),true);
  assert.equal(inScope(scope,path.join(repo,'문서')),true);
});
test('refreshScope picks up a worktree added later', async t => {
  const {repo,git,add} = repository(t), scope = await resolveScope({mode:'default',dir:repo,git});
  const wt = add('later'); assert.equal(inScope(scope,wt),false);
  const refreshed = await refreshScope(scope,git);
  assert.equal(inScope(refreshed,wt),true);
});
test('claudeDirPrefixes normalizes worktree paths', async t => {
  const {root,repo,git} = repository(t), link = path.join(root,'alias'); fs.symlinkSync(repo,link,'dir');
  const scope = await resolveScope({mode:'cwd',dir:link,git});
  assert.equal(normalizeSlug('/a/b.c d'),'-a-b-c-d');
  assert.ok(claudeDirPrefixes(scope).includes(repo.replace(/[^A-Za-z0-9]/g,'-')));
  for (const mode of ['all','session']) {
    const unrestricted = await resolveScope({mode,dir:repo,session:'sid',git});
    assert.equal(claudeDirPrefixes(unrestricted),null); assert.equal(inScope(unrestricted,'/outside'),true);
  }
});
