import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const api=await import('../../lib/runtime/git-evidence.mjs').catch(()=>({}));
const query=await import('../../lib/runtime/git-query.mjs').catch(()=>({}));
const policy=JSON.parse(fs.readFileSync(new URL('../../lib/policy/role-policy.json',import.meta.url))).git;
const sha=c=>c.repeat(40);
const hash=s=>'sha256:'+crypto.createHash('sha256').update(s).digest('hex');
const treeBytes=Buffer.concat([Buffer.from('100644 plan.md\0'),Buffer.from(sha('1'),'hex'),Buffer.from('100644 spec.md\0'),Buffer.from(sha('2'),'hex')]);
const indexTree=crypto.createHash('sha1').update(Buffer.concat([Buffer.from(`tree ${treeBytes.length}\0`),treeBytes])).digest('hex');
const target={realpath:'/workspace',gitCommonDir:'/repo/.git',branch:'work',head:sha('a')};
const documents=['spec','plan'].map(kind=>({kind,path:`/workspace/${kind}.md`,gitPath:`${kind}.md`,contentHash:hash(kind),commit:sha('b'),approvalRef:kind}));
// The injected transport receives an argument array, never shell text. Unexpected
// commands fail so no missing/failed observation can silently become evidence.
function runner(overrides={}){
 const calls=[];
 const gitRunner=async ({args,cwd,env})=>{
  calls.push({args,cwd,env});assert.equal(cwd,target.realpath);assert.ok(Array.isArray(args));
  const key=JSON.stringify(args);
  const values={
   '["rev-parse","--show-toplevel"]':'/workspace\n',
   '["rev-parse","--path-format=absolute","--git-common-dir"]':'/repo/.git\n',
   '["rev-parse","HEAD"]':sha('a')+'\n',
   '["symbolic-ref","--quiet","--short","HEAD"]':'work\n',
   '["ls-files","--stage","-z"]':`100644 ${sha('1')} 0\tplan.md\0`+`100644 ${sha('2')} 0\tspec.md\0`,
   '["diff","--cached","--name-only","-z","--"]':'spec.md\0plan.md\0',
   '["diff","--cached","--binary","--no-ext-diff","--no-textconv","--"]':'observed staged diff',
   '["diff","--name-only","-z","--no-ext-diff","--no-textconv","--"]':'',
   '["ls-files","--others","--exclude-standard","-z"]':'',
   [`["merge-base","--is-ancestor","${sha('b')}","${sha('a')}"]`]:'',
   [`["ls-tree","-r","-z","${sha('b')}","--","spec.md","plan.md"]`]:`100644 blob ${sha('2')}\tspec.md\0`+`100644 blob ${sha('1')}\tplan.md\0`,
   [`["show","--no-patch","--format=%P%n%T","${sha('b')}"]`]:sha('d')+'\n'+sha('e')+'\n',
   [`["diff-tree","--no-commit-id","--name-only","-r","-z","${sha('b')}","--"]`]:'spec.md\0plan.md\0',
   [`["show","${sha('b')}:spec.md"]`]:'spec',
   [`["show","${sha('b')}:plan.md"]`]:'plan',
  };
  assert.ok(Object.hasOwn(values,key)||Object.hasOwn(overrides,key),'unexpected Git query '+key);
  const value=Object.hasOwn(overrides,key)?overrides[key]:values[key];
  return value instanceof Error?{status:1,stdout:'',stderr:value.message}:{status:0,stdout:value,stderr:''};
 };
 return {gitRunner,calls};
}
test('reads actual target, index, document blobs and commit parent/tree using fixed queries',async()=>{
 assert.equal(typeof api.readGitEvidence,'function');const r=runner();
 const result=await api.readGitEvidence({target,documents,gitRunner:r.gitRunner});
 assert.deepEqual(result.target,target);assert.equal(result.indexTree,indexTree);
 assert.deepEqual(result.stagedPaths,['spec.md','plan.md']);assert.equal(result.stagedFingerprint,hash('observed staged diff'));
 assert.equal(result.docsCommit.commit,sha('b'));assert.equal(result.docsCommit.parent,sha('d'));assert.equal(result.docsCommit.tree,sha('e'));
 assert.deepEqual(result.docsCommit.paths,['spec.md','plan.md']);assert.deepEqual(result.docsCommit.documents,documents);
 assert.ok(r.calls.length>0);assert.ok(r.calls.every(c=>!c.env||!Object.keys(c.env).some(k=>k.startsWith('GIT_'))));
});
for(const [name,overrides] of [
 ['missing document',{[`["show","${sha('b')}:spec.md"]`]:new Error('missing blob')}],
 ['changed approved document',{[`["show","${sha('b')}:plan.md"]`]:'tampered'}],
 ['different worktree',{'["rev-parse","--show-toplevel"]':'/other\n'}],
 ['different repository',{'["rev-parse","--path-format=absolute","--git-common-dir"]':'/other/.git\n'}],
 ['HEAD drift',{'["rev-parse","HEAD"]':sha('f')+'\n'}],
 ['branch drift',{'["symbolic-ref","--quiet","--short","HEAD"]':'other\n'}],
 ['unmerged index',{'["ls-files","--stage","-z"]':`100644 ${sha('1')} 2\tplan.md\0`}],
 ['symlink document',{[`["ls-tree","-r","-z","${sha('b')}","--","spec.md","plan.md"]`]:`120000 blob ${sha('2')}\tspec.md\0`+`100644 blob ${sha('1')}\tplan.md\0`}],
 ['unreachable docs commit',{[`["merge-base","--is-ancestor","${sha('b')}","${sha('a')}"]`]:new Error('not ancestor')}],
 ['unreadable index',{'["ls-files","--stage","-z"]':new Error('index unavailable')}],
 ['mixed docs commit',{[`["diff-tree","--no-commit-id","--name-only","-r","-z","${sha('b')}","--"]`]:'spec.md\0plan.md\0code.mjs\0'}],
 ['incomplete docs commit',{[`["diff-tree","--no-commit-id","--name-only","-r","-z","${sha('b')}","--"]`]:'spec.md\0'}],
])test(`rejects ${name} without manufacturing Git evidence`,async()=>{
 assert.equal(typeof api.readGitEvidence,'function');await assert.rejects(()=>api.readGitEvidence({target,documents,gitRunner:runner(overrides).gitRunner}));
});
test('rejects document object traversal, mixed commits and Git environment overrides before transport',async()=>{
 assert.equal(typeof api.readGitEvidence,'function');
 for(const input of [
  {documents:[{...documents[0],gitPath:'../secret'},documents[1]]},
  {documents:[documents[0],{...documents[1],commit:sha('f')}]},
  {env:{GIT_INDEX_FILE:'/other/index'}},{env:{GIT_DIR:'/other'}},{env:{GIT_CONFIG_COUNT:'1'}},
 ]){let calls=0;await assert.rejects(()=>api.readGitEvidence({target,documents,...input,gitRunner:async()=>{calls++;throw Error('must not run');}}));assert.equal(calls,0);}
});
for(const [command,allowed] of [
 ['git status --short',true],['git diff --cached --name-only',true],['git log -5 --oneline',true],['git branch --list',true],
 ['git commit -m x',false],['git status && git add .',false],['git $(echo status)',false],['git diff --output=file',false],
 ['git -c alias.x=push x',false],['git --git-dir=/other status',false],['git --work-tree=/other status',false],['git -C /other status',false],
 ['GIT_INDEX_FILE=/other git status',false],['git diff --no-index /outside /other',false],['git status -- ../outside',false],['git show /outside',false],['git diff --ext-diff',false],['git status > output',false],['git status\ngit push',false],
])test(`shared query classifier ${allowed?'allows':'rejects'} ${command}`,()=>{
 assert.equal(typeof query.classifyGitCommand,'function');assert.equal(query.classifyGitCommand(command,policy).allowed,allowed);
});

// Exercise the real default child-process transport with a harmless executable
// probe. This writes only test-owned temporary files and never invokes Git.
test('default transport fixes GIT_NO_REPLACE_OBJECTS even after an inherited override',{skip:process.platform==='win32'},async t=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'arc-git-env-'));t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
 const root=fs.realpathSync(temp);const record=path.join(root,'environment.jsonl');
 const answers={
  '["rev-parse","--show-toplevel"]':root+'\n',
  '["rev-parse","--path-format=absolute","--git-common-dir"]':root+'/.git\n',
  '["rev-parse","HEAD"]':sha('a')+'\n',
  '["symbolic-ref","--quiet","--short","HEAD"]':'work\n',
  '["ls-files","--stage","-z"]':'',
  '["diff","--cached","--name-only","-z","--"]':'',
  '["diff","--cached","--binary","--no-ext-diff","--no-textconv","--"]':'',
  '["diff","--name-only","-z","--no-ext-diff","--no-textconv","--"]':'',
  '["ls-files","--others","--exclude-standard","-z"]':'',
 };
 const source=`#!/usr/bin/env node
const fs=require('node:fs');
fs.appendFileSync(${JSON.stringify(record)},JSON.stringify(process.env.GIT_NO_REPLACE_OBJECTS??null)+'\\n');
const args=process.argv.slice(8);
const answers=${JSON.stringify(answers)};
const key=JSON.stringify(args);
if(!Object.hasOwn(answers,key))process.exit(9);
process.stdout.write(answers[key]);
`;
 fs.writeFileSync(path.join(root,'git'),source,{mode:0o755});
 const originalPath=process.env.PATH;const originalReplace=process.env.GIT_NO_REPLACE_OBJECTS;
 let observed,error;
 try{
  process.env.PATH=root+path.delimiter+originalPath;process.env.GIT_NO_REPLACE_OBJECTS='0';
  try{observed=await api.readGitEvidence({target:{...target,realpath:root,gitCommonDir:root+'/.git'}});}catch(e){error=e;}
 }finally{
  if(originalPath===undefined)delete process.env.PATH;else process.env.PATH=originalPath;
  if(originalReplace===undefined)delete process.env.GIT_NO_REPLACE_OBJECTS;else process.env.GIT_NO_REPLACE_OBJECTS=originalReplace;
 }
 const values=fs.readFileSync(record,'utf8').trim().split('\n').map(line=>JSON.parse(line));
 assert.ok(values.length>0);assert.equal(values[0],'1','canonical Git object reads must disable replace refs');
 assert.ok(values.every(value=>value==='1'));if(error)throw error;assert.equal(observed.target.head,target.head);
});
