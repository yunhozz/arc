import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const api = await import('../../claude/skill/hooks/role-git-guard.mjs').catch(() => ({}));
const policy = JSON.parse(fs.readFileSync(new URL('../../lib/policy/role-policy.json', import.meta.url))).git;
// These cases catch accidental mutation allowance; inputs are never executed.
for (const [command, allowed] of [
 ['git status --short',true],['git diff --check',true],['git -C "/tmp/a b" log -5 --oneline',true],
 ['git --git-dir=/tmp/repo show HEAD',true],['/usr/bin/git status',true],['"C:\\Program Files\\Git\\bin\\git.exe" status',true],
 ['git branch --list',true],['git config --get user.name',true],['npm test',true],
 ['git commit -m x',false],['git push',false],['git branch new',false],['git branch -D old',false],['git config user.name x',false],
 ['git status && git add .',false],['git status || git reset --hard',false],['git status; git push',false],['git status | git commit -F -',false],
 ["bash -c 'git status && git push'",false],["sh -c 'git diff --check'",true],['git unknown',false],['git status --unknown',false],
 ['git -c alias.x=push x',false],['git diff --output=file',false],['git log --output=file',false],['git $(echo status)',false],
 ['git status > file',false],['git status\ngit push',false],['git status & git push',false],
]) test(`${allowed?'allows':'denies'} ${command}`,()=>{ assert.equal(typeof api.classifyGitCommand,'function','classifier must implement policy decisions'); assert.equal(api.classifyGitCommand(command,policy).allowed,allowed); });
test('hook rejects malformed events and ignores optional role identity',()=>{
 assert.equal(typeof api.evaluateHookEvent,'function','event evaluator must enforce the guard');
 assert.equal(api.evaluateHookEvent({},policy).hookSpecificOutput.permissionDecision,'deny');
 assert.equal(api.evaluateHookEvent({hook_event_name:'PreToolUse',tool_name:'Bash',tool_input:{command:'git push'},agent_type:'orchestrator'},policy).hookSpecificOutput.permissionDecision,'deny');
 assert.deepEqual(api.evaluateHookEvent({hook_event_name:'PreToolUse',tool_name:'Bash',tool_input:{command:'git status'}},policy),{});
});
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
const hookApi=await import('../../lib/policy/claude-hook.mjs').catch(()=>({}));
test('installed hook uses safe absolute assets from any cwd and denies bad policy/input',t=>{
 assert.equal(typeof hookApi.buildClaudeHookCommand,'function','installed hook builder is required');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),`arc hook 한글 ' " `));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.mkdirSync(path.join(root,'hooks'));fs.copyFileSync(new URL('../../claude/skill/hooks/role-git-guard.mjs',import.meta.url),path.join(root,'hooks/role-git-guard.mjs'));fs.writeFileSync(path.join(root,'hooks/git-policy.json'),JSON.stringify(policy));
 const command=hookApi.buildClaudeHookCommand(path.join(root,'hooks/role-git-guard.mjs'));
 const run=(input,cwd=os.tmpdir())=>spawnSync(command,{shell:true,cwd,input:typeof input==='string'?input:JSON.stringify(input),encoding:'utf8'});
 for(const cwd of [root,os.tmpdir()])for(const [command,allowed]of [['git diff --check',true],['git commit -m x',false]]){
  const result=run({hook_event_name:'PreToolUse',tool_name:'Bash',tool_input:{command}},cwd);assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).hookSpecificOutput?.permissionDecision,allowed?undefined:'deny');
 }
 assert.equal(JSON.parse(run('{').stdout).hookSpecificOutput.permissionDecision,'deny');
 fs.unlinkSync(path.join(root,'hooks/git-policy.json'));assert.equal(JSON.parse(run({hook_event_name:'PreToolUse',tool_name:'Bash',tool_input:{command:'git status'}}).stdout).hookSpecificOutput.permissionDecision,'deny');
 assert.throws(()=>hookApi.buildClaudeHookCommand('relative/hook.mjs'));
});
for(const command of ['git branch -l new','git status --help','git diff --ext-diff'])test(`denies side-effect option ${command}`,()=>assert.equal(api.classifyGitCommand(command,policy).allowed,false));
for(const command of ['git worktree list','git worktree list --porcelain','git remote -v','git remote get-url origin'])test(`allows required inspection ${command}`,()=>assert.equal(api.classifyGitCommand(command,policy).allowed,true));
for(const command of ['git worktree add /tmp/never-executed','git remote add origin nowhere','git remote set-url origin nowhere'])test(`denies mutation ${command}`,()=>assert.equal(api.classifyGitCommand(command,policy).allowed,false));
test('missing event identity cannot authorize even a query',()=>assert.equal(api.evaluateHookEvent({tool_name:'Bash',tool_input:{command:'git status'}},policy).hookSpecificOutput?.permissionDecision,'deny'));
test('Windows target path is passed as encoded file URL data',()=>{
 const command=hookApi.buildClaudeHookCommand('C:\\Users\\한 글 " \'\\hooks\\role-git-guard.mjs');
 const encoded=/"([A-Za-z0-9+/]+=*)"$/.exec(command)[1];const url=new URL(Buffer.from(encoded,'base64').toString());
 assert.equal(url.protocol,'file:');assert.equal(decodeURIComponent(url.pathname),'/C:/Users/한 글 " \'/hooks/role-git-guard.mjs');
 hookApi.validateClaudeHookCommand(command);
});
test('missing hook module requests a blocking exit code instead of success',()=>{
 const command=hookApi.buildClaudeHookCommand(path.join(os.tmpdir(),'arc-nonexistent/hooks/role-git-guard.mjs'));
 const result=spawnSync(command,{shell:true,encoding:'utf8'});assert.equal(result.status,2);assert.match(result.stderr,/ARC Git guard failed to load/);
});
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
