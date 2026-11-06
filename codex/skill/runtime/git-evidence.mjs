import fs from 'node:fs/promises';
import {inspectPath} from './scope.mjs';
import crypto from 'node:crypto';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {constants} from 'node:fs';

const oid=value=>typeof value==='string'&&/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value);
const hash=bytes=>'sha256:'+crypto.createHash('sha256').update(bytes).digest('hex');
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const text=bytes=>new TextDecoder('utf-8',{fatal:true}).decode(bytes);
const gitPath=value=>typeof value==='string'&&value.length>0&&!/[\\\x00\r\n:]/.test(value)&&!value.startsWith('/')&&!value.split('/').some(p=>!p||p==='.'||p==='..');
const absolute=value=>typeof value==='string'&&path.isAbsolute(value)&&path.normalize(value)===value;
const unique=values=>new Set(values).size===values.length;
const samePaths=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&unique(a)&&unique(b)&&equal([...a].sort(),[...b].sort());
function paths(bytes){
 const output=text(bytes);if(!output)return [];
 if(!output.endsWith('\0'))throw Error('Incomplete Git path output');
 const result=output.slice(0,-1).split('\0');if(!result.every(gitPath)||!unique(result))throw Error('Invalid Git paths');return result;
}
/** The default transport is read-only, bounded and shell-free. Inherited Git
 * overrides and optional locks are disabled; no caller environment is accepted. */
function defaultRunner({args,cwd}){
 const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.toUpperCase().startsWith('GIT_')));
 Object.assign(env,{GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:process.platform==='win32'?'NUL':'/dev/null',GIT_OPTIONAL_LOCKS:'0',GIT_NO_REPLACE_OBJECTS:'1',GIT_NO_LAZY_FETCH:'1',GIT_TERMINAL_PROMPT:'0'});
 return spawnSync('git',['--no-pager','--literal-pathspecs','-c','core.fsmonitor=false','-c','core.untrackedCache=false',...args],{cwd,env,encoding:'buffer',maxBuffer:16*1024*1024,timeout:10000,windowsHide:true});
}
/** Construct Git tree object IDs in memory from the complete stage-0 index.
 * No write-tree/hash-object -w or other repository mutation is needed. */
function indexTree(bytes,objectLength){
 const entries=text(bytes);if(entries&&!entries.endsWith('\0'))throw Error('Incomplete index');
 const root=new Map();
 for(const entry of entries?entries.slice(0,-1).split('\0'):[]){
  const match=/^(100644|100755|120000|160000) ([a-f0-9]+) ([0-3])\t([\s\S]+)$/.exec(entry);
  if(!match||match[3]!=='0'||!oid(match[2])||match[2].length!==objectLength||!gitPath(match[4]))throw Error('Invalid or unmerged index');
  const parts=match[4].split('/');let directory=root;
  for(const part of parts.slice(0,-1)){if(directory.has(part)&&!(directory.get(part) instanceof Map))throw Error('Index path collision');if(!directory.has(part))directory.set(part,new Map());directory=directory.get(part);}
  const name=parts.at(-1);if(directory.has(name))throw Error('Duplicate index path');directory.set(name,{mode:match[1],object:match[2]});
 }
 const algorithm=objectLength===64?'sha256':'sha1';
 const tree=directory=>{
  const rows=[...directory].map(([name,value])=>({name,directory:value instanceof Map,value}));
  rows.sort((a,b)=>Buffer.compare(Buffer.from(a.name+(a.directory?'/':'')),Buffer.from(b.name+(b.directory?'/':''))));
  const body=Buffer.concat(rows.map(row=>Buffer.concat([Buffer.from(`${row.directory?'40000':row.value.mode} ${row.name}\0`),Buffer.from(row.directory?tree(row.value):row.value.object,'hex')])));
  return crypto.createHash(algorithm).update(Buffer.from(`tree ${body.length}\0`)).update(body).digest('hex');
 };
 return tree(root);
}
function documentInput(documents,target){
 if(!Array.isArray(documents))throw Error('Documents must be an array');
 for(const d of documents){
  if(!d||!['spec','plan'].includes(d.kind)||!gitPath(d.gitPath)||!absolute(d.path)||d.path!==path.join(target.realpath,...d.gitPath.split('/'))||!/^sha256:[a-f0-9]{64}$/.test(d.contentHash)||typeof d.approvalRef!=='string'||!d.approvalRef||(d.commit!==undefined&&!oid(d.commit)))throw Error('Invalid approved document');
 }
 if(!unique(documents.map(d=>d.gitPath))||!unique(documents.map(d=>d.kind)))throw Error('Duplicate document');
 const commits=new Set(documents.map(d=>d.commit));if(commits.size>1)throw Error('Documents must share a single commit');
}
/** Read actual objects/index and compare approved documents. gitRunner is a
 * trusted transport injection for tests/providers, never a tool argument. */
export async function readGitEvidence({target,documents=[],gitRunner=defaultRunner,env,...options}={}){
 if(!target||!absolute(target.realpath)||!absolute(target.gitCommonDir)||!oid(target.head)||!(target.branch===null||typeof target.branch==='string'&&target.branch)||typeof gitRunner!=='function'||env!==undefined&&(!env||Object.keys(env).length)||Object.keys(options).length)throw Error('Invalid Git evidence target or overrides');
 documentInput(documents,target);
 const run=async args=>{
  const result=await gitRunner({args,cwd:target.realpath});
  if(!result||result.status!==0||result.error||!(typeof result.stdout==='string'||Buffer.isBuffer(result.stdout)))throw Error('Git evidence query failed: '+args[0]);
  return Buffer.isBuffer(result.stdout)?result.stdout:Buffer.from(result.stdout);
 };
 const line=async args=>{const output=text(await run(args));if(!output.endsWith('\n')||output.slice(0,-1).includes('\n'))throw Error('Invalid Git scalar output');return output.slice(0,-1);};
 const observeTarget=async()=>{
  const realpath=await line(['rev-parse','--show-toplevel']);
  const gitCommonDir=await line(['rev-parse','--path-format=absolute','--git-common-dir']);
  const head=await line(['rev-parse','HEAD']);
  // Detached HEAD is deliberately represented as null, never silently rebound.
  let branch;
  if(target.branch===null){
   const r=await gitRunner({args:['symbolic-ref','--quiet','--short','HEAD'],cwd:target.realpath});
   if(r?.status!==1||r.error)throw Error('Expected detached HEAD');branch=null;
  }else branch=await line(['symbolic-ref','--quiet','--short','HEAD']);
  if(realpath!==target.realpath||gitCommonDir!==target.gitCommonDir||head!==target.head||branch!==target.branch)throw Error('Git target or HEAD drift');
  return {...target,realpath,gitCommonDir,head,branch};
 };
 const observedTarget=await observeTarget();
 const index=await run(['ls-files','--stage','-z']);
 const stagedPaths=paths(await run(['diff','--cached','--name-only','-z','--']));
 const diff=await run(['diff','--cached','--binary','--no-ext-diff','--no-textconv','--']);
 const workingPaths=paths(await run(['diff','--name-only','-z','--no-ext-diff','--no-textconv','--']));
 const untrackedPaths=paths(await run(['ls-files','--others','--exclude-standard','-z']));
 const observedDocuments=[];let docsCommit;
 if(documents.length){
  const commit=documents[0].commit;
  if(commit){
   const metadata=text(await run(['show','--no-patch','--format=%P%n%T',commit])).trimEnd().split('\n');
   if(metadata.length!==2||!oid(metadata[0])||!oid(metadata[1]))throw Error('Expected a single-parent document commit');
   await run(['merge-base','--is-ancestor',commit,target.head]);
   const committedPaths=paths(await run(['diff-tree','--no-commit-id','--name-only','-r','-z',commit,'--']));
   if(!samePaths(committedPaths,documents.map(d=>d.gitPath)))throw Error('Document commit must contain the exact approved document set');
   const rows=pathsForTree(await run(['ls-tree','-r','-z',commit,'--',...documents.map(d=>d.gitPath)]));
   if(!samePaths(rows.map(row=>row.path),documents.map(d=>d.gitPath))||rows.some(row=>!['100644','100755'].includes(row.mode)||row.type!=='blob'))throw Error('Documents must be regular committed files');
   docsCommit={commit,parent:metadata[0],tree:metadata[1],paths:committedPaths,documents:structuredClone(documents)};
  }
  const stagedModes=new Map(text(index).split('\0').filter(Boolean).map(entry=>{const m=/^(\d+) [a-f0-9]+ 0\t([\s\S]+)$/.exec(entry);return m?[m[2],m[1]]:[];}));
  for(const d of documents){
   if(!commit&&!['100644','100755'].includes(stagedModes.get(d.gitPath)))throw Error('Documents must be regular staged files');
   const bytes=await run(['show',`${commit??''}:${d.gitPath}`]);
   const observedHash=hash(bytes);if(observedHash!==d.contentHash)throw Error('Approved document hash mismatch');
   observedDocuments.push({...d,observedHash});
  }
 }
 // Reading a concurrent index twice is conservative: never publish a mixed
 // snapshot or infer completion after the target changed during observation.
 if(!(await run(['ls-files','--stage','-z'])).equals(index)||!(await run(['diff','--cached','--binary','--no-ext-diff','--no-textconv','--'])).equals(diff))throw Error('Index changed during Git observation');
 await observeTarget();
 return {target:observedTarget,indexTree:indexTree(index,target.head.length),stagedPaths,stagedFingerprint:hash(diff),workingPaths,untrackedPaths,documents:observedDocuments,...(docsCommit?{docsCommit}:{})};
}
function pathsForTree(bytes){
 const output=text(bytes);if(!output||!output.endsWith('\0'))throw Error('Invalid document tree');
 return output.slice(0,-1).split('\0').map(entry=>{const match=/^(\d+) (blob|tree|commit) ([a-f0-9]+)\t([\s\S]+)$/.exec(entry);if(!match||!oid(match[3])||!gitPath(match[4]))throw Error('Invalid document tree entry');return {mode:match[1],type:match[2],path:match[4]};});
}

/** Assignment observation additionally compares regular current files to Git objects.
 * No Git facts or transport override are accepted from workflow command JSON. */
export async function readAssignmentGitEvidence({target,documents}){
 const evidence=await readGitEvidence({target,documents});
 for(const document of evidence.documents){
  await inspectPath(document.path);
  document.currentHash=hash(await fs.readFile(document.path));
  if(document.currentHash!==document.contentHash)throw Error('Current approved document hash mismatch');
 }
 return evidence;
}

/** Cooperative observations come only from local read-only Git queries. */
export async function readCooperativeCommitGitEvidence({target,commit,gitRunner=defaultRunner}){
 if(commit!==undefined&&!oid(commit))throw Error('Invalid commit object ID');
 const evidence=await readGitEvidence({target,gitRunner});
 if(commit===undefined)return evidence;
 const run=async args=>{const r=await gitRunner({args,cwd:target.realpath});if(r?.status!==0||r.error||!(Buffer.isBuffer(r.stdout)||typeof r.stdout==='string'))throw Error('Commit evidence query failed');return Buffer.from(r.stdout);};
 const metadata=text(await run(['show','--no-patch','--format=%H%n%P%n%T',commit])).trimEnd().split('\n');
 if(metadata.length!==3||metadata[0]!==commit||!metadata.every(oid))throw Error('Expected exact single-parent commit');
 const committedPaths=paths(await run(['diff-tree','--no-commit-id','--name-only','-r','-z',commit,'--']));
 // Reobserve both HEAD and index after metadata so a concurrent mutation holds.
 const after=await readGitEvidence({target,gitRunner});
 if(!equal(evidence,after))throw Error('Git changed during commit observation');
 return {...evidence,commit:{commit,parent:metadata[1],tree:metadata[2],paths:committedPaths,head:target.head}};
}

// Capture every working-tree entry, including ignored and empty directories.
// Never follow a symlink or include Git's own mutable workflow directory.
async function preservationFingerprint(root,planPath){
 const rows=[];let total=0;
 async function visit(dir,relative=''){
  const before=await fs.lstat(dir);if(!before.isDirectory()||before.isSymbolicLink())throw Error('Unsafe worktree directory');
  const names=(await fs.readdir(dir,{encoding:'buffer'})).map(text).sort((a,b)=>Buffer.compare(Buffer.from(a),Buffer.from(b)));
  for(const name of names){
   if(!relative&&name==='.git')continue;
   const rel=relative?relative+'/'+name:name;if(!gitPath(rel))throw Error('Unsafe worktree path');if(rel===planPath)continue;
   const filename=path.join(dir,name),stat=await fs.lstat(filename);if(++total>50000)throw Error('Worktree snapshot too large');
   const mode=stat.mode&0o7777;
   if(stat.isDirectory()&&!stat.isSymbolicLink()){rows.push({path:rel,type:'directory',mode});await visit(filename,rel);}
   else if(stat.isSymbolicLink())rows.push({path:rel,type:'symlink',mode,target:await fs.readlink(filename)});
   else if(stat.isFile()){
    if(stat.size>64*1024*1024)throw Error('Worktree file too large');
    const handle=await fs.open(filename,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);let bytes;
    try{const first=await handle.stat();if(!first.isFile()||first.dev!==stat.dev||first.ino!==stat.ino)throw Error('Worktree file changed');bytes=await handle.readFile();const last=await handle.stat(),named=await fs.lstat(filename);if(first.dev!==last.dev||first.ino!==last.ino||first.size!==last.size||first.mtimeMs!==last.mtimeMs||last.dev!==named.dev||last.ino!==named.ino||last.mode!==named.mode)throw Error('Worktree file changed');}finally{await handle.close();}
    rows.push({path:rel,type:'file',mode,hash:hash(bytes)});
   }else throw Error('Unsupported worktree entry');
  }
  const after=await fs.lstat(dir);if(before.dev!==after.dev||before.ino!==after.ino||before.mtimeMs!==after.mtimeMs||before.mode!==after.mode)throw Error('Worktree directory changed');
 }
 await visit(root);return hash(Buffer.from(JSON.stringify(rows)));
}
async function readPlanBytes(filename){
 await inspectPath(filename);const handle=await fs.open(filename,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{const before=await handle.stat();if(!before.isFile()||before.size>1024*1024)throw Error('Invalid plan file');const bytes=await handle.readFile(),after=await handle.stat(),named=await fs.lstat(filename);if(before.dev!==after.dev||before.ino!==after.ino||before.size!==after.size||before.mtimeMs!==after.mtimeMs||after.dev!==named.dev||after.ino!==named.ino||after.mode!==named.mode)throw Error('Plan file changed');await inspectPath(filename);return {bytes,mode:before.mode&0o111?'100755':'100644'};}finally{await handle.close();}
}
// This value is used only as input to an opaque fingerprint and is never
// persisted or returned. URL credentials and fragment are discarded; a query
// can affect routing, so its presence requires operator investigation.
function sanitizedFetchUrl(value){
 if(typeof value!=='string'||!value||/[\x00-\x1f\x7f]/.test(value))throw Error('Invalid remote identity');
 if(/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(value)){
  let parsed;try{parsed=new URL(value);}catch{throw Error('Invalid remote identity');}
  if(!['http:','https:','ssh:','git:','file:'].includes(parsed.protocol)||parsed.protocol!=='file:'&&!parsed.hostname||parsed.search)throw Error('Invalid remote identity');
  parsed.username='';parsed.password='';parsed.hash='';return parsed.toString();
 }
 if(!/^[A-Za-z]:[\\/]/.test(value)){
  const scp=/^(?:[^@/:\s]+@)?(\[[0-9A-Fa-f:.]+\]|[^@/:\s]+):(.+)$/.exec(value);
  if(scp)return `scp:${scp[1].toLowerCase()}:${scp[2]}`;
 }
 return `path:${value}`;
}

/** Local, read-only plan-amend observation. Git arguments and object IDs are
 * checked before transport; operator snapshots never enter the Git runner. */
export async function readPlanAmendGitEvidence({target,arguments:a,mapping=[],gitRunner=defaultRunner}={}){
 if(!target||!a?.plan||!a?.history||!a?.recovery||!gitPath(a.plan.gitPath)||a.plan.path!==path.join(target.realpath,...a.plan.gitPath.split('/'))||![a.history.base,a.history.planCommit,a.history.head].every(oid)||!/^refs\/arc\/recovery\/[A-Za-z0-9._/-]+$/.test(a.recovery.ref)||a.recovery.ref.includes('..')||a.recovery.ref.includes('//')||!Array.isArray(mapping)||mapping.length>256||mapping.some(m=>!m||!oid(m.old)||!oid(m.new)))throw Error('Invalid plan-amend observation request');
 const run=async args=>{const r=await gitRunner({args,cwd:target.realpath});if(!r||r.status!==0||r.error||!(Buffer.isBuffer(r.stdout)||typeof r.stdout==='string'))throw Error('Plan-amend Git query failed: '+args[0]);return Buffer.from(r.stdout);};
 const line=async args=>{const v=text(await run(args));if(!v.endsWith('\n')||v.slice(0,-1).includes('\n'))throw Error('Invalid Git scalar');return v.slice(0,-1);};
 const before=await readGitEvidence({target,gitRunner});
 const headTree=await line(['rev-parse','--verify',`${target.head}^{tree}`]);if(!oid(headTree))throw Error('Invalid HEAD tree');
 const observeRemotes=async()=>{
  const remoteOutput=text(await run(['remote']));if(remoteOutput&&!remoteOutput.endsWith('\n'))throw Error('Incomplete remote list');
  const names=remoteOutput?remoteOutput.slice(0,-1).split('\n'):[];if(!unique(names)||names.some(name=>!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)))throw Error('Invalid configured remote');
  const remotes=[];for(const name of names.sort()){
   const output=text(await run(['remote','get-url','--all',name]));if(!output||!output.endsWith('\n'))throw Error('Invalid remote identity');
   const urls=output.slice(0,-1).split('\n').map(sanitizedFetchUrl),identities=[...new Set(urls)].sort();if(!identities.length)throw Error('Invalid remote identity');
   remotes.push({name,identity:hash(Buffer.from(JSON.stringify(identities)))});
  }return remotes;
 };
 const observeRecoveryRef=async()=>{
  const result=await gitRunner({args:['show-ref','--verify','--quiet',a.recovery.ref],cwd:target.realpath});
  if(result?.status===0&&!result.error){const value=await line(['rev-parse','--verify',a.recovery.ref]);if(!oid(value))throw Error('Invalid recovery ref');return {name:a.recovery.ref,oid:value};}
  if(result?.status!==1||result.error)throw Error('Recovery ref observation failed');return null;
 };
 const configuredRemotes=await observeRemotes();
 const list=text(await run(['rev-list','--reverse','--topo-order',`${a.history.base}..${a.history.head}`]));
 if(!list.endsWith('\n'))throw Error('Empty or incomplete history');const ids=list.slice(0,-1).split('\n');if(ids.length>256||!ids.every(oid)||!unique(ids))throw Error('Invalid history range');
 const commit=async id=>{
  const raw=await run(['cat-file','commit',id]),separator=raw.indexOf(Buffer.from('\n\n'));if(separator<0)throw Error('Malformed commit');
  const headers=[];for(const header of text(raw.subarray(0,separator)).split('\n')){
   if(header.startsWith(' ')){const previous=headers.at(-1);if(!previous||['tree','parent','committer'].includes(previous.name))throw Error('Malformed commit header');previous.raw+='\n'+header;continue;}
   const parsed=/^([^\s]+) (.*)$/.exec(header);if(!parsed)throw Error('Malformed commit header');headers.push({name:parsed[1],raw:header,value:parsed[2]});
  }
  const fields=name=>headers.filter(header=>header.name===name),trees=fields('tree'),parents=fields('parent'),authors=fields('author'),committers=fields('committer');
  const match=/^author (.*) (\d+) ([+-]\d{4})$/.exec(authors[0]?.raw??'');if(trees.length!==1||!oid(trees[0].value)||parents.length!==1||!oid(parents[0].value)||authors.length!==1||committers.length!==1||!match)throw Error('Expected linear commit metadata');
  const headerTemplate=headers.map(header=>['tree','parent','committer'].includes(header.name)?header.name:header.raw);
  const bytes=await run(['ls-tree','-r','-z','--full-tree',id]);const entries=text(bytes);if(entries&&!entries.endsWith('\0'))throw Error('Incomplete tree');
  const treeEntries=(entries?entries.slice(0,-1).split('\0'):[]).map(row=>{const m=/^(100644|100755|120000|160000) (blob|commit) ([a-f0-9]+)\t([\s\S]+)$/.exec(row);if(!m||!oid(m[3])||!gitPath(m[4]))throw Error('Invalid tree entry');return {path:m[4],mode:m[1],oid:m[3]};});
  if(!unique(treeEntries.map(x=>x.path)))throw Error('Duplicate tree path');
  return {oid:id,parent:parents[0].value,author:match[1],authorDate:match[2]+' '+match[3],message:text(raw.subarray(separator+2)),tree:treeEntries,headerTemplate};
 };
 const commits=[];for(const id of ids)commits.push(await commit(id));
 const newCommits=[];for(const item of mapping)newCommits.push(await commit(item.new));
 const original=await run(['show',`${a.history.planCommit}:${a.plan.gitPath}`]);
 const current=await readPlanBytes(a.plan.path);
 const firstFingerprint=await preservationFingerprint(target.realpath,a.plan.gitPath);
 const recoveryRef=await observeRecoveryRef();
 const after=await readGitEvidence({target,gitRunner}),secondFingerprint=await preservationFingerprint(target.realpath,a.plan.gitPath);
 const latest=await readPlanBytes(a.plan.path),finalRemotes=await observeRemotes(),finalRecoveryRef=await observeRecoveryRef();
 if(!equal(before,after)||firstFingerprint!==secondFingerprint||!latest.bytes.equals(current.bytes)||latest.mode!==current.mode||!equal(configuredRemotes,finalRemotes)||!equal(recoveryRef,finalRecoveryRef))throw Error('Git or worktree changed during observation');
 return {target,index:{tree:before.indexTree,headTree,stagedPaths:before.stagedPaths},worktree:{planClean:!before.workingPaths.includes(a.plan.gitPath)&&!before.untrackedPaths.includes(a.plan.gitPath),nonPlanFingerprint:firstFingerprint},configuredRemotes,history:{base:a.history.base,planCommit:a.history.planCommit,head:a.history.head,commits,newCommits},plan:{path:a.plan.path,content:text(current.bytes),hash:hash(current.bytes),originalHash:hash(original),mode:current.mode},recoveryRef};
}

const validGitPaths=values=>Array.isArray(values)&&values.every(gitPath)&&unique(values);
const within=(base,file)=>{const relative=path.relative(base,file);return relative===''||!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep);};
/** Provenance-neutral Git checks shared by trusted and cooperative callers.
 * The caller must establish role, approval and acceptance separately. */
export function validateGitPreflight({target,descriptor:d,scope,gitEvidence:g}){
 if(!g||!equal(g.target,target)||!oid(d?.parent)||d.parent!==target.head||!oid(d.indexTree)||!/^sha256:[a-f0-9]{64}$/.test(d.fingerprint)||!validGitPaths(d.paths)||!d.paths.length||g.indexTree!==d.indexTree||g.stagedFingerprint!==d.fingerprint||!samePaths(g.stagedPaths,d.paths)||!validGitPaths(g.workingPaths)||!validGitPaths(g.untrackedPaths))return 'Actual Git target index diff and exact paths required';
 if(d.paths.some(file=>!scope.some(base=>within(base,path.join(target.realpath,...file.split('/'))))))return 'Commit contains another task or unrelated changes';
 if([...g.workingPaths,...g.untrackedPaths].some(file=>scope.some(base=>within(base,path.join(target.realpath,...file.split('/'))))))return 'Unstaged or untracked task changes invalidate acceptance';
 return null;
}
export function validateGitCommitResult({target,expected,result,scope}){
 if(!result||!oid(result.commit)||result.commit===expected.parent||result.commit.length!==expected.parent.length||result.parent!==expected.parent||result.tree!==expected.tree||!samePaths(result.paths,expected.paths)||result.head!==result.commit||!equal(result.target,{...target,head:result.commit})||!validGitPaths(result.remainingPaths))return 'Commit result unavailable or differs from expected parent tree paths and HEAD';
 if(result.remainingPaths.some(file=>scope.some(base=>within(base,path.join(target.realpath,...file.split('/'))))))return 'Committed task still has remaining changes';
 if(expected.remainingPaths!==undefined&&!samePaths(result.remainingPaths,expected.remainingPaths))return 'Remaining changes differ from preflight observation';
 return null;
}
