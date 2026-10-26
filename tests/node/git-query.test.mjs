import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const api = await import('../../lib/runtime/git-query.mjs').catch(() => ({}));
const policy = JSON.parse(fs.readFileSync(new URL('../../lib/policy/role-policy.json', import.meta.url))).git;
// These cases catch accidental mutation allowance; inputs are never executed.
for (const [command, allowed] of [
 ['git status --short',true],['git diff --check',true],['git -C "/tmp/a b" log -5 --oneline',false],
 ['git --git-dir=/tmp/repo show HEAD',false],['/usr/bin/git status',true],['"C:\\Program Files\\Git\\bin\\git.exe" status',true],
 ['git branch --list',true],['git config --get user.name',true],['npm test',true],
 ['git commit -m x',false],['git push',false],['git branch new',false],['git branch -D old',false],['git config user.name x',false],
 ['git status && git add .',false],['git status || git reset --hard',false],['git status; git push',false],['git status | git commit -F -',false],
 ["bash -c 'git status && git push'",false],["sh -c 'git diff --check'",true],['git unknown',false],['git status --unknown',false],
 ['git -c alias.x=push x',false],['git diff --output=file',false],['git log --output=file',false],['git $(echo status)',false],
 ['git status > file',false],['git status\ngit push',false],['git status & git push',false],
]) test(`${allowed?'allows':'denies'} ${command}`,()=>{ assert.equal(typeof api.classifyGitCommand,'function','classifier must implement policy decisions'); assert.equal(api.classifyGitCommand(command,policy).allowed,allowed); });
for(const command of ['git branch -l new','git status --help','git diff --ext-diff'])test(`denies side-effect option ${command}`,()=>assert.equal(api.classifyGitCommand(command,policy).allowed,false));
for(const command of ['git worktree list','git worktree list --porcelain','git remote -v','git remote get-url origin'])test(`allows required inspection ${command}`,()=>assert.equal(api.classifyGitCommand(command,policy).allowed,true));
for(const command of ['git worktree add /tmp/never-executed','git remote add origin nowhere','git remote set-url origin nowhere'])test(`denies mutation ${command}`,()=>assert.equal(api.classifyGitCommand(command,policy).allowed,false));
// Bash removes backslash-LF before tokenization. Build literal bytes explicitly;
// these classifier inputs must never be passed to a shell.
for (const lineBreak of ['\n','\r\n']) for (const quoted of [false,true]) {
 const escapedBreak = '\\' + lineBreak;
 const command = quoted ? '"gi' + escapedBreak + 't" push' : 'gi' + escapedBreak + 't push';
 test(`denies escaped ${JSON.stringify(lineBreak)} in ${quoted?'quoted':'unquoted'} executable`,()=>{
  assert.ok(command.includes('\\'+lineBreak));
  assert.equal(api.classifyGitCommand(command,policy).allowed,false);
 });
}

for(const command of ['git diff --no-index a b','git show ../outside','git diff -- /absolute','git --work-tree=/tmp status','git --namespace=other status'])test(`shared query target restriction denies ${command}`,()=>assert.equal(api.classifyGitCommand(command,policy).allowed,false));
