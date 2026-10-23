import path from 'node:path';import crypto from 'node:crypto';
export class TargetConfigurationError extends Error{constructor(message,options){super(message,options);this.name='TargetConfigurationError';this.code='ARC_TARGET_CONFIGURATION';}}
const fail=message=>{throw new TargetConfigurationError(message);};
export function resolveTarget(platform,{userHome,env={},cwd}={}){
 if(!['codex','claude'].includes(platform))fail('Target must be codex or claude');
 if(typeof userHome!=='string'||!path.isAbsolute(userHome)||!userHome.trim())fail('userHome must be an absolute user directory');
 userHome=path.resolve(userHome);if(!env||typeof env!=='object')fail('env must be an environment object');
 const expand=value=>value==='~'?userHome:value.startsWith('~/')?path.join(userHome,value.slice(2)):value;
 let home;if(platform==='codex'){const raw=env.CODEX_HOME;if(raw!==undefined&&(typeof raw!=='string'||!raw.trim()))fail('CODEX_HOME is empty or invalid');const expanded=expand(raw??path.join(userHome,'.codex'));if(path.isAbsolute(expanded))home=path.resolve(expanded);else{const base=cwd??process.cwd();if(typeof base!=='string'||!path.isAbsolute(base))fail('cwd must be absolute for relative CODEX_HOME');home=path.resolve(base,expanded);}}
 else{home=path.join(userHome,'.claude');const raw=env.CLAUDE_CONFIG_DIR;if(raw!==undefined&&(typeof raw!=='string'||!raw.trim()||!path.isAbsolute(expand(raw))||path.resolve(expand(raw))!==home))fail('CLAUDE_CONFIG_DIR must select the default ~/.claude directory');}
 if(home==='/'||home===path.resolve(userHome))fail('Target home must not be the filesystem or user-home root');
 const profileNames=['scouter','planner','implementer','qa','reviewer'].map(role=>`arc-${role}.${platform==='codex'?'toml':'md'}`);
 return Object.freeze({platform,home,userHome:path.resolve(userHome),payloadPrefix:platform,profileNames:Object.freeze(profileNames),instructionPath:path.join(home,platform==='codex'?'AGENTS.md':'CLAUDE.md'),runtimeConfigPath:path.join(home,platform==='codex'?'config.toml':'settings.json'),globalPaths:Object.freeze(platform==='codex'?[path.join(home,'AGENTS.md'),path.join(home,'config.toml')]:[path.join(home,'CLAUDE.md'),path.join(home,'settings.json')])});
}
export function typeOf(metadata){return Number(metadata.mode&0o170000n);}
export function sameObjectIdentity(a,b){return ['dev','ino','mode'].every(key=>a[key]===b[key]);}
export function sameIdentity(a,b){return ['dev','ino','mode','size','mtimeNs','ctimeNs'].every(key=>a[key]===b[key]);}
export function metadataOf(stat){return Object.fromEntries(['dev','ino','mode','size','atimeNs','mtimeNs','ctimeNs'].map(key=>[key,stat[key]]));}
export function readCheckedFile(directory,name,before=directory.lstat(name)){
 const file=directory.openFile(name,{read:true});try{const opened=file.stat();if(!sameIdentity(before,opened))fail('File identity changed before reading');const bytes=file.readAll();const after=file.stat();if(!sameIdentity(opened,after))fail('File changed during read');return{bytes,metadata:{...metadataOf(after),type:'file',sha256:crypto.createHash('sha256').update(bytes).digest('hex')}};}finally{file.close();}
}
// Traverse every existing component through held directory descriptors. Missing
// targets are recorded without creating their parents or opening a fallback path.
export function inspectPath(safeFs,absolute,{kind,tree=false,allowLinks=false,snapshot=new Map(),read=false,allowLeafLink=false}={}){
 if(!path.isAbsolute(absolute))fail('Inspection requires an absolute path');
 const parts=absolute.split('/').filter(Boolean);if(parts.some(p=>p==='.'||p==='..'))fail('Unsafe destination component');
 let directory=safeFs.openRoot('/');let current='';
 try{
  for(let index=0;index<parts.length;index++){
   const name=parts[index];current+='/'+name;let stat;
   try{stat=directory.lstat(name);}catch(error){if(error.code==='ENOENT'){snapshot.set(absolute,null);return{exists:false};}throw error;}
   const type=typeOf(stat),leaf=index===parts.length-1;
   if(type===0o120000){if(leaf&&allowLeafLink){const link=directory.readlink(name);snapshot.set(current,{...metadataOf(stat),type:'symlink',link});return{exists:true,type:'symlink',link};}fail(`Symlink destination is unsafe: ${current}`);}
   if(!leaf||kind==='directory'){
    if(type!==0o040000)fail(`Expected destination directory: ${current}`);
    const next=directory.openDir(name);if(!sameObjectIdentity(stat,next.stat())){next.close();fail('Directory identity changed during traversal');}directory.close();directory=next;
    if(leaf){snapshot.set(current,{...metadataOf(stat),type:'directory'});if(tree)inspectTree(directory,current,{allowLinks,snapshot});return{exists:true,type:'directory'};}
   }else{
    if(type!==0o100000)fail(`Expected regular destination file: ${current}`);
    const result=readCheckedFile(directory,name,stat);snapshot.set(current,result.metadata);return{exists:true,type:'file',...(read?{bytes:result.bytes}:{})};
   }
  }
  fail('Filesystem root cannot be a managed destination');
 }catch(error){if(error instanceof TargetConfigurationError)throw error;throw new TargetConfigurationError(`Cannot inspect destination ${absolute}: ${error.message}`,{cause:error});}finally{directory.close();}
}
function inspectTree(directory,absolute,{allowLinks,snapshot}){
 const before=directory.stat(),names=directory.readDir();snapshot.set(absolute,{...metadataOf(before),type:'directory',entries:names});
 for(const name of names){const child=absolute+'/'+name,stat=directory.lstat(name),type=typeOf(stat);
  if(type===0o040000){const next=directory.openDir(name);try{if(!sameIdentity(stat,next.stat()))fail('Directory changed before tree traversal');inspectTree(next,child,{allowLinks,snapshot});}finally{next.close();}}
  else if(type===0o100000)snapshot.set(child,readCheckedFile(directory,name,stat).metadata);
  else if(type===0o120000&&allowLinks)snapshot.set(child,{...metadataOf(stat),type:'symlink',link:directory.readlink(name)});
  else fail(`Unsafe entry in existing destination tree: ${child}`);
 }
 if(!sameIdentity(before,directory.stat()))fail('Directory changed during tree inspection');
}
