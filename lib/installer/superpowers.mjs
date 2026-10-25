import path from 'node:path';
import {createHash} from 'node:crypto';
import {readCheckedFile,sameIdentity,typeOf,metadataOf} from './targets.mjs';
export const REQUIRED=Object.freeze({
 'brainstorming':['SKILL.md','visual-companion.md','builder-check-prompt.md','scripts/start-server.sh','scripts/stop-server.sh','scripts/server.cjs','scripts/helper.js','scripts/frame-template.html'],
 'writing-plans':['SKILL.md'],
 'test-driven-development':['SKILL.md','writing-good-tests.md'],
});
export const SKILLS=Object.freeze(Object.keys(REQUIRED));
export const REPOSITORY='https://github.com/obra/superpowers';
export const DYNAMIC_ROOTS=Object.freeze(['codex','claude'].map(platform=>`${platform}/skill/references/superpowers`));
export const isDynamicReferencePath=name=>DYNAMIC_ROOTS.some(root=>name===root||name.startsWith(root+'/'));
export const REFERENCE_PATH_MAP=Object.freeze([
 ['brainstorming/SKILL.md','brainstorming.md'],['writing-plans/SKILL.md','writing-plans.md'],['test-driven-development/SKILL.md','test-driven-development.md'],
 ['brainstorming/visual-companion.md','visual-companion.md'],['brainstorming/builder-check-prompt.md','builder-check-prompt.md'],['test-driven-development/writing-good-tests.md','writing-good-tests.md'],
 ['brainstorming/scripts/start-server.sh','scripts/start-server.sh'],['brainstorming/scripts/stop-server.sh','scripts/stop-server.sh'],['brainstorming/scripts/server.cjs','scripts/server.cjs'],['brainstorming/scripts/helper.js','scripts/helper.js'],['brainstorming/scripts/frame-template.html','scripts/frame-template.html'],
 ['LICENSE','superpowers-LICENSE'],['provenance.json','superpowers-provenance.json'],
].map(([source,destination])=>Object.freeze({source,destination})));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function failure(message){throw new Error(message);}
export function snapshotSkill(root,absolute,required){
 const rootBefore=root.stat(),entries=new Map(),snapshot=new Map();
 function walk(directory,prefix=''){
  const before=directory.stat(),names=directory.readDir();
  for(const name of names){const relative=prefix?prefix+'/'+name:name,stat=directory.lstat(name),type=typeOf(stat);
   if(type===0o040000){const child=directory.openDir(name);try{if(!sameIdentity(stat,child.stat()))failure('Acquired directory changed during validation');entries.set(relative,{type:'directory',mode:stat.mode});snapshot.set(relative,{...metadataOf(stat),type:'directory'});walk(child,relative);}finally{child.close();}}
   else if(type===0o100000){const file=readCheckedFile(directory,name,stat);entries.set(relative,{type:'file',bytes:file.bytes,mode:stat.mode});snapshot.set(relative,file.metadata);}
   else if(type===0o120000){const raw=directory.readlink(name);const after=directory.lstat(name);if(!sameIdentity(stat,after))failure('Acquired symlink changed during validation');entries.set(relative,{type:'symlink',raw,mode:stat.mode});snapshot.set(relative,{...metadataOf(stat),type:'symlink',link:raw});}
   else failure('Acquired tree contains a special file');
  }if(!sameIdentity(before,directory.stat()))failure('Acquired directory changed during validation');
 }
 walk(root);
 const resolvedLinks=new Map();
 function targetOf(name,trail=new Set()){
  if(trail.has(name))failure('Acquired symlink cycle');
  if(resolvedLinks.has(name))return resolvedLinks.get(name);
  const entry=entries.get(name);if(!entry||entry.type!=='symlink')failure('Invalid acquired link');
  const active=new Set(trail);active.add(name);
  const parent=path.posix.dirname(name);const target=resolvePath(entry.raw,parent==='.'?[]:parent.split('/'),active);
  resolvedLinks.set(name,target);return target;
 }
 function resolvePath(raw,base=[],trail=new Set()){
  let current=[...base],parts;
  if(raw.startsWith('/')){if(!raw.startsWith(absolute+'/'))failure('Acquired link escapes its root');current=[];parts=raw.slice(absolute.length+1).split('/');}
  else parts=raw.split('/');
  for(let i=0;i<parts.length;i++){
   const part=parts[i];if(!part||part==='.')continue;
   if(part==='..'){if(!current.length)failure('Acquired link escapes its root');current.pop();continue;}
   const name=[...current,part].join('/'),entry=entries.get(name);if(!entry)failure('Acquired link is dangling');
   const canonical=entry.type==='symlink'?targetOf(name,trail):name;
   if(i<parts.length-1&&entries.get(canonical)?.type!=='directory')failure('Acquired link parent is not a directory');
   current=canonical.split('/');
  }
  const result=current.join('/');if(!result||!entries.has(result))failure('Acquired link resolves to its root or a missing entry');return result;
 }
 for(const[name,entry]of entries)if(entry.type==='symlink')targetOf(name);
 for(const[name,target]of resolvedLinks){const entry=entries.get(name);entry.target=target;entry.link=path.posix.relative(path.posix.dirname(name),target);delete entry.raw;}
 // Build directory edges, including directory symlinks, to reject cycles that
 // resolve individually but would create recursive staging traversals.
 const graph=new Map([['',new Set()]]);for(const[relative,entry]of entries){const parent=path.posix.dirname(relative)==='.'?'':path.posix.dirname(relative);if(!graph.has(parent))graph.set(parent,new Set());if(entry.type==='directory'){graph.get(parent).add(relative);if(!graph.has(relative))graph.set(relative,new Set());}else if(entry.type==='symlink'&&entries.get(entry.target)?.type==='directory')graph.get(parent).add(entry.target);}
 const active=new Set(),done=new Set();function visit(node){if(active.has(node))failure('Acquired directory links create a cycle');if(done.has(node))return;active.add(node);for(const next of graph.get(node)??[])visit(next);active.delete(node);done.add(node);}visit('');
 for(const name of required){const actual=resolvePath(name);if(entries.get(actual)?.type!=='file')failure('Required acquired skill file is missing or not regular');}
 if(!sameIdentity(rootBefore,root.stat()))failure('Acquired root changed during validation');
 return{root:absolute,rootMetadata:{...metadataOf(rootBefore),type:'directory',entries:root.readDir()},entries,snapshot};
}

export function createReferenceBundle({skills,license,revision,fetchedAt=new Date().toISOString()}){
 const entries=new Map([['LICENSE',{type:'file',bytes:Buffer.from(license),mode:0o644n}]]);
 for(const name of SKILLS){const tree=skills.get(name);if(!tree)failure('Required skill is missing');entries.set(name,{type:'directory',mode:tree.rootMetadata.mode});for(const[key,entry]of tree.entries)entries.set(name+'/'+key,{...entry});}
 const provenance={schemaVersion:1,repository:REPOSITORY,revision,fetchedAt,skills:[...SKILLS],files:{},links:{}};
 for(const[name,entry]of entries){if(entry.type==='file')provenance.files[name]=hash(entry.bytes);else if(entry.type==='symlink')provenance.links[name]=entry.link;}
 entries.set('provenance.json',{type:'file',bytes:Buffer.from(JSON.stringify(provenance,null,2)+'\n'),mode:0o644n});
 const bundle={entries,provenance};validateReferenceBundle(bundle);return bundle;
}
export function validateReferenceBundle(bundle){
 const entries=bundle?.entries,p=bundle?.provenance;
 if(!(entries instanceof Map)||!p||p.schemaVersion!==1||p.repository!==REPOSITORY||!/^[a-f0-9]{40,64}$/.test(p.revision)||typeof p.fetchedAt!=='string'||!Number.isFinite(Date.parse(p.fetchedAt))||new Date(p.fetchedAt).toISOString()!==p.fetchedAt||JSON.stringify(p.skills)!==JSON.stringify(SKILLS)||!p.files||typeof p.files!=='object'||Array.isArray(p.files)||!p.links||typeof p.links!=='object'||Array.isArray(p.links))failure('Invalid reference provenance');
 const files={},links={};
 for(const[name,entry]of entries){
  if(typeof name!=='string'||name.includes('\\')||name.includes('\0')||name.split('/').some(part=>!part||part==='.'||part==='..')||!['LICENSE','provenance.json',...SKILLS].includes(name.split('/')[0]))failure('Unexpected reference path');
  const parent=path.posix.dirname(name);if(parent!=='.'&&entries.get(parent)?.type!=='directory')failure('Reference parent is missing');
  if(entry.type==='file'){if(!Buffer.isBuffer(entry.bytes))failure('Invalid reference bytes');if(name!=='provenance.json')files[name]=hash(entry.bytes);}
  else if(entry.type==='symlink'){if(!SKILLS.includes(name.split('/')[0])||typeof entry.link!=='string'||path.posix.isAbsolute(entry.link))failure('Unsafe reference link');const resolved=path.posix.normalize(path.posix.join(parent,entry.link));if(!resolved.startsWith(name.split('/')[0]+'/')||!entries.has(resolved))failure('Reference link escapes or is missing');links[name]=entry.link;}
  else if(entry.type!=='directory')failure('Unsafe reference entry');
 }
 for(const name of ['LICENSE','provenance.json'])if(entries.get(name)?.type!=='file')failure('Reference metadata file missing');
 if(!entries.get('LICENSE').bytes.length)failure('Reference license is empty');
 let recorded;try{recorded=JSON.parse(entries.get('provenance.json').bytes);}catch{failure('Malformed reference provenance');}
 const equal=(a,b)=>Object.keys(a).sort().join('\0')===Object.keys(b).sort().join('\0')&&Object.keys(a).every(key=>a[key]===b[key]);
 if(JSON.stringify(recorded)!==JSON.stringify(p)||!equal(files,p.files)||!equal(links,p.links))failure('Reference inventory or hash mismatch');
 function resolve(name,trail=new Set()){
  if(trail.has(name))failure('Reference link cycle');const entry=entries.get(name);if(!entry)failure('Required reference is missing');
  if(entry.type==='symlink'){const next=new Set(trail);next.add(name);return resolve(path.posix.normalize(path.posix.join(path.posix.dirname(name),entry.link)),next);}
  return entry;
 }
 for(const[name,entry]of entries)if(entry.type==='symlink')resolve(name);
 const graph=new Map([['',new Set()]]);
 for(const[name,entry]of entries){const parent=path.posix.dirname(name)==='.'?'':path.posix.dirname(name);if(!graph.has(parent))graph.set(parent,new Set());if(entry.type==='directory'){graph.get(parent).add(name);if(!graph.has(name))graph.set(name,new Set());}else if(entry.type==='symlink'&&resolve(name).type==='directory')graph.get(parent).add(path.posix.normalize(path.posix.join(path.posix.dirname(name),entry.link)));}
 const active=new Set(),done=new Set();function visit(name){if(active.has(name))failure('Reference directory link cycle');if(done.has(name))return;active.add(name);for(const next of graph.get(name)??[])visit(next);active.delete(name);done.add(name);}visit('');

 for(const[skill,names]of Object.entries(REQUIRED)){if(entries.get(skill)?.type!=='directory')failure('Required skill tree missing');for(const name of names){let parts=(skill+'/'+name).split('/'),current='';for(let i=0;i<parts.length;i++){current=current?current+'/'+parts[i]:parts[i];const e=entries.get(current);if(e?.type==='symlink'){current=path.posix.normalize(path.posix.join(path.posix.dirname(current),e.link));resolve(current);}if(i===parts.length-1&&resolve(current).type!=='file')failure('Required reference is not regular');}}}
 return bundle;
}
export function readReferenceBundle({safeFs,root,directory:held}){
 const directory=held??safeFs.openRoot(root);try{
  const allowed=new Set(['LICENSE','provenance.json',...SKILLS]);if(directory.readDir().some(name=>!allowed.has(name)))failure('Unknown reference tree');
  const skills=new Map();for(const name of SKILLS){const skill=directory.openDir(name);try{skills.set(name,snapshotSkill(skill,path.join(root,name),REQUIRED[name]));}finally{skill.close();}}
  const license=readCheckedFile(directory,'LICENSE'),provenance=readCheckedFile(directory,'provenance.json');let p;try{p=JSON.parse(provenance.bytes);}catch{failure('Malformed reference provenance');}
  const entries=new Map([['LICENSE',{type:'file',bytes:license.bytes,mode:license.metadata.mode}],['provenance.json',{type:'file',bytes:provenance.bytes,mode:provenance.metadata.mode}]]);
  for(const[name,tree]of skills){entries.set(name,{type:'directory',mode:tree.rootMetadata.mode});for(const[key,value]of tree.entries)entries.set(name+'/'+key,value);}
  return validateReferenceBundle({entries,provenance:p});
 }finally{if(!held)directory.close();}
}
export function composeArcSkillTree(skillFiles,references){
 validateReferenceBundle(references);const entries=new Map();
 for(const[name,bytes]of skillFiles){if(name==='references/superpowers'||name.startsWith('references/superpowers/'))continue;const parts=name.split('/');if(parts.some(part=>!part||part==='.'||part==='..'))failure('Unsafe ARC path');for(let i=1;i<parts.length;i++)entries.set(parts.slice(0,i).join('/'),{type:'directory',mode:0o700n});entries.set(name,{type:'file',bytes:Buffer.from(bytes),mode:0o600n});}
 entries.set('references',{type:'directory',mode:0o700n});entries.set('references/superpowers',{type:'directory',mode:0o700n});
 for(const[name,entry]of references.entries)entries.set('references/superpowers/'+name,{...entry});return entries;
}
export function flattenReferenceBundle(bundle){
 validateReferenceBundle(bundle);const allowedFiles=new Set(REFERENCE_PATH_MAP.map(item=>item.source)),allowedDirectories=new Set();
 for(const name of allowedFiles){const parts=name.split('/');for(let i=1;i<parts.length;i++)allowedDirectories.add(parts.slice(0,i).join('/'));}
 for(const[name,entry]of bundle.entries){if(entry.type==='symlink')failure('Unsupported reference link in flat payload');if(entry.type==='file'&&!allowedFiles.has(name)||entry.type==='directory'&&!allowedDirectories.has(name))failure('Unsupported reference file in flat payload');}
 return new Map(REFERENCE_PATH_MAP.map(({source,destination})=>{const entry=bundle.entries.get(source);if(entry?.type!=='file')failure('Required flat reference is missing or not regular');return[destination,{...entry,bytes:Buffer.from(entry.bytes)}];}));
}
export function validateFlatReferenceFiles(files,platform){
 if(!(files instanceof Map)||!['codex','claude'].includes(platform))failure('Invalid flat reference input');
 const prefix=platform+'/skill/references/',entries=new Map();
 for(const name of files.keys())if(name.startsWith(prefix+'superpowers/'))failure('Unexpected nested reference payload');
 for(const{source,destination}of REFERENCE_PATH_MAP){const bytes=files.get(prefix+destination);if(!Buffer.isBuffer(bytes))failure('Required flat reference file is missing: '+prefix+destination);const parts=source.split('/');for(let i=1;i<parts.length;i++)entries.set(parts.slice(0,i).join('/'),{type:'directory',mode:0o755n});entries.set(source,{type:'file',bytes,mode:0o644n});}
 let provenance;try{provenance=JSON.parse(entries.get('provenance.json').bytes);}catch{failure('Malformed flat reference provenance');}
 const bundle=validateReferenceBundle({entries,provenance});return{provenance,entries:flattenReferenceBundle(bundle)};
}
export function composeStaticArcSkillTree(skillFiles){
 const entries=new Map();
 for(const[name,bytes]of skillFiles){const parts=name.split('/');if(parts.some(part=>!part||part==='.'||part==='..')||name.includes('\\')||name.includes('\0')||name==='references/superpowers'||name.startsWith('references/superpowers/'))failure('Unsafe static ARC path');if(!Buffer.isBuffer(bytes))failure('Invalid static ARC bytes');for(let i=1;i<parts.length;i++)entries.set(parts.slice(0,i).join('/'),{type:'directory',mode:0o700n});entries.set(name,{type:'file',bytes:Buffer.from(bytes),mode:0o600n});}
 return entries;
}
