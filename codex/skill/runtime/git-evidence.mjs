import fs from 'node:fs/promises';
import {inspectPath} from './scope.mjs';
import crypto from 'node:crypto';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

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
