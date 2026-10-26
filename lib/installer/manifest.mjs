import {COOPERATIVE_RUNTIME_MODULES} from '../runtime/bootstrap.mjs';
import {RUNTIME_MODULE_PATHS} from './runtime-assets.mjs';
import {POLICY_TARGETS,buildPolicyOutputs} from '../policy/render.mjs';
import {validateFlatReferenceFiles,REFERENCE_PATH_MAP} from './superpowers.mjs';
import path from 'node:path';import crypto from 'node:crypto';import{loadModelConfig,resolveModelSettings,renderProfiles}from '../models/index.mjs';import{readCheckedFile,typeOf,sameIdentity,metadataOf}from './targets.mjs';
export class PayloadValidationError extends Error{constructor(message,options){super(message,options);this.name='PayloadValidationError';this.code='ARC_PAYLOAD_VALIDATION';}}
const MUTABLE=new Set(['codex/skill/models.toml','claude/skill/models.toml']);
export const LOCAL_UPDATER_PATH='scripts/update-superpowers-local.sh';
const ROOTS=['bin','lib','scripts','vendor','prebuilds','codex/skill','codex/agents','claude/skill','claude/agents'];
const FIXED=['README.md','install.command','package.json','native/binding.c','native/binding.gyp'];
function safeName(name){return typeof name==='string'&&name.length>0&&!name.includes('\\')&&!name.includes('\0')&&!name.startsWith('/')&&name.split('/').every(p=>p&&p!=='.'&&p!=='..')&&path.posix.normalize(name)===name;}
function allowed(name){return FIXED.includes(name)||ROOTS.some(root=>name.startsWith(root+'/'));}
export function renderManifest(files){return Buffer.from([...files].filter(([name])=>!MUTABLE.has(name)&&name!==LOCAL_UPDATER_PATH&&!name.split('/').includes('.DS_Store')).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([name,bytes])=>{if(!safeName(name)||!allowed(name)||!Buffer.isBuffer(bytes))throw Error('Invalid protected manifest file');return crypto.createHash('sha256').update(bytes).digest('hex')+'  '+name+'\n';}).join(''));}
const LIFECYCLE_HOOKS=['preinstall','install','postinstall','prepublish','prepare','prepublishOnly','prepack','postpack','publish','postpublish','preuninstall','uninstall','postuninstall'];
function sourcePayload(root,mode){
 if(!['auto','source','package'].includes(mode))throw Error('Invalid payload mode');if(mode==='package')return false;
 if(mode==='auto'){let marker;try{marker=root.lstat('.git');}catch(error){if(error.code==='ENOENT')return false;throw error;}
  if(typeOf(marker)===0o040000){const directory=root.openDir('.git');try{if(!sameIdentity(marker,directory.stat()))throw Error('Source marker changed');}finally{directory.close();}}
  else if(typeOf(marker)===0o100000){const bytes=readCheckedFile(root,'.git',marker).bytes;let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw Error('Invalid source Git marker');}if(!/^gitdir: [^\0\r\n]+\r?\n?$/.test(text))throw Error('Invalid source Git marker');}
  else throw Error('Unsafe source Git marker');
 }
 let pkg,lock;try{pkg=JSON.parse(readCheckedFile(root,'package.json').bytes);lock=JSON.parse(readCheckedFile(root,'package-lock.json').bytes);}catch{throw Error('Source package identity or lock is invalid');}
 const recorded=lock?.packages?.[''];if(pkg?.name!=='@yunhozz/arc'||!/^\d+\.\d+\.\d+$/.test(pkg.version)||lock.name!==pkg.name||lock.version!==pkg.version||recorded?.name!==pkg.name||recorded?.version!==pkg.version||LIFECYCLE_HOOKS.some(name=>Object.hasOwn(pkg.scripts??{},name))||Object.hasOwn(pkg.scripts??{},'build')||Object.hasOwn(pkg,'workspaces')||Object.hasOwn(recorded,'hasInstallScript'))throw Error('Source package identity or lifecycle contract is invalid');return true;
}
export function verifyPayload({packageRoot,safeFs,payloadMode='auto'}){
 let root;try{
  root=safeFs.openRoot(packageRoot);const source=sourcePayload(root,payloadMode),manifest=readCheckedFile(root,'MANIFEST.sha256').bytes;let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(manifest);}catch{throw Error('Manifest is not UTF-8');}
  const listed=new Map();for(const line of text.split(/\r?\n/)){if(!line)continue;const m=/^([a-fA-F0-9]{64})  (.+)$/.exec(line);if(!m||!safeName(m[2]))throw Error('Malformed or escaping manifest path');const name=m[2];if(MUTABLE.has(name)||name===LOCAL_UPDATER_PATH||!allowed(name)||name.split('/').includes('.DS_Store')||listed.has(name))throw Error(`Duplicate, mutable or unexpected manifest entry: ${name}`);listed.set(name,m[1].toLowerCase());}
  const files=new Map(),snapshot=new Map(),referenceTrees={};
  function walk(directory,prefix){const before=directory.stat();for(const name of directory.readDir()){
    const relative=prefix?prefix+'/'+name:name;const stat=directory.lstat(name),type=typeOf(stat);
    if(relative===LOCAL_UPDATER_PATH){if(!source)throw Error('Local updater wrapper is forbidden in package payload');if(type!==0o100000||!sameIdentity(stat,directory.lstat(name)))throw Error('Local updater wrapper must be a stable regular file');continue;}
    if(name==='.DS_Store'){if(type!==0o100000)throw Error('DS_Store must be a regular file');continue;}
    if(type===0o040000){const sub=directory.openDir(name);try{if(!sameIdentity(stat,sub.stat()))throw Error('Payload directory changed');snapshot.set(relative,{...metadataOf(stat),type:'directory'});walk(sub,relative);}finally{sub.close();}}
    else if(type===0o100000){const item=readCheckedFile(directory,name,stat);if(!MUTABLE.has(relative)&&(!listed.has(relative)||crypto.createHash('sha256').update(item.bytes).digest('hex')!==listed.get(relative)))throw Error(`Missing entry or hash mismatch: ${relative}`);files.set(relative,item.bytes);snapshot.set(relative,item.metadata);}
    else throw Error(`Unsafe payload type: ${relative}`);
   }if(!sameIdentity(before,directory.stat()))throw Error('Payload directory changed while reading');}
  function select(relative,isTree){const parts=relative.split('/');let parent=root;const opened=[];try{for(const component of parts.slice(0,-1)){let st;try{st=parent.lstat(component);}catch(e){if(e.code==='ENOENT')return;throw e;}if(typeOf(st)!==0o040000)throw Error('Unsafe payload parent');const next=parent.openDir(component);if(!sameIdentity(st,next.stat())){next.close();throw Error('Payload parent changed');}opened.push(next);parent=next;}const name=parts.at(-1);let st;try{st=parent.lstat(name);}catch(e){if(e.code==='ENOENT')return;throw e;}if(isTree){if(typeOf(st)!==0o040000)throw Error('Payload root is not a directory');const sub=parent.openDir(name);try{if(!sameIdentity(st,sub.stat()))throw Error('Payload root changed');snapshot.set(relative,{...metadataOf(st),type:'directory'});walk(sub,relative);}finally{sub.close();}}else{if(typeOf(st)!==0o100000)throw Error('Payload file is not regular');const item=readCheckedFile(parent,name,st);if(!listed.has(relative)||crypto.createHash('sha256').update(item.bytes).digest('hex')!==listed.get(relative))throw Error(`Missing entry or hash mismatch: ${relative}`);files.set(relative,item.bytes);snapshot.set(relative,item.metadata);}}finally{for(const h of opened.reverse())h.close();}}
  for(const item of FIXED)select(item,false);for(const item of ROOTS)select(item,true);
  for(const platform of ['codex','claude'])referenceTrees[platform]=validateFlatReferenceFiles(files,platform);
  for(const{destination}of REFERENCE_PATH_MAP)if(!referenceTrees.codex.entries.get(destination).bytes.equals(referenceTrees.claude.entries.get(destination).bytes))throw Error('Imported platform parity mismatch: '+destination);
  for(const name of listed.keys())if(!files.has(name))throw Error(`Manifest entry is missing: ${name}`);
  const required=['lib/policy/role-policy.json','lib/policy/render.mjs','scripts/update-role-policy.mjs','lib/limits.mjs','lib/installer/limits.mjs','lib/installer/runtime-config.mjs','README.md','install.command','package.json','bin/arc.mjs','lib/cli/root.mjs','lib/tui/app.mjs','lib/tui/terminal.mjs','lib/tui/render.mjs','lib/tui/setup.mjs','lib/management/operations.mjs','lib/management/status.mjs','lib/management/update.mjs','lib/management/workflow.mjs','lib/cli/postinstall.mjs','scripts/postinstall.mjs','lib/cli/upgrade.mjs','bin/arc-upgrade.mjs','lib/installer/shell-completion.mjs','lib/installer/manifest.mjs','lib/installer/targets.mjs','lib/installer/global-config.mjs','lib/installer/plan.mjs','lib/safe-fs/index.mjs','lib/safe-fs/native.mjs','lib/models/index.mjs','lib/models/config.mjs','lib/models/profiles.mjs','vendor/toml/LICENSE','vendor/toml/package.json','vendor/toml/provenance.json','vendor/toml/dist/index.js','prebuilds/index.json'];
  required.push('lib/installer/runtime-assets.mjs',...RUNTIME_MODULE_PATHS);
  for(const platform of ['codex','claude'])required.push(`${platform}/skill/runtime/role-policy.json`,...RUNTIME_MODULE_PATHS.map(name=>`${platform}/skill/runtime/${name.slice('lib/runtime/'.length)}`));
  for(const tuple of ['darwin-arm64','darwin-x64','linux-arm64-gnu','linux-x64-gnu'])required.push(`prebuilds/${tuple}/arc_safe_fs.node`);
  for(const platform of ['codex','claude'])for(const name of [...COOPERATIVE_RUNTIME_MODULES,'role-policy.json'])required.push(`${platform}/skill/runtime/${name}`);
  const modelInputs={};for(const platform of ['codex','claude']){const base=`${platform}/skill`;required.push(`${base}/SKILL.md`,`${base}/models.toml`,`${base}/references/limits.md`);const profiles=new Map();for(const role of ['scouter','planner','implementer','qa','reviewer']){const name=`arc-${role}.${platform==='codex'?'toml':'md'}`,key=`${platform}/agents/${name}`;required.push(key);profiles.set(name,files.get(key));}modelInputs[platform]={models:files.get(`${base}/models.toml`),profiles};}
  for(const name of required)if(!files.has(name))throw Error(`Required runtime asset is missing: ${name}`);
  const policyInputs=new Map(POLICY_TARGETS.map(({path:name})=>[name,files.get(name)]));
  const policyOutputs=buildPolicyOutputs(policyInputs,JSON.parse(files.get('lib/policy/role-policy.json').toString('utf8')));
  for(const [name,bytes] of policyOutputs)if(!bytes.equals(files.get(name)))throw Error(`Stale role policy output: ${name}`);
  const vendor=JSON.parse(files.get('vendor/toml/provenance.json'));for(const name of Object.keys(vendor.files??{}))if(!safeName(name)||!files.has('vendor/toml/'+name))throw Error('Vendored runtime asset is missing');
  for(const platform of ['codex','claude']){const input=modelInputs[platform];const config=loadModelConfig(input.models,platform);renderProfiles(input.profiles,resolveModelSettings(config));modelInputs[platform]={models:Buffer.from(input.models),profiles:new Map([...input.profiles].map(([k,v])=>[k,Buffer.from(v)]))};}
  return{packageRoot,files,modelInputs,snapshot,referenceTrees};
 }catch(cause){throw new PayloadValidationError(`Payload verification failed: ${cause.message}`,{cause});}finally{root?.close();}
}
