import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {isDeepStrictEqual} from 'node:util';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {openRoot} from '../safe-fs/index.mjs';
import {verifyPayload,LOCAL_UPDATER_PATH} from '../installer/manifest.mjs';
import {readCheckedFile,typeOf,sameIdentity} from '../installer/targets.mjs';
import {runNpm} from '../npm/process.mjs';

const HOOKS=['preinstall','install','postinstall','prepublish','prepare','prepublishOnly','prepack','postpack','publish','postpublish','preuninstall','uninstall','postuninstall'];
const NAME='@yunhozz/arc',HOOK='node scripts/postinstall.mjs';
const same=(a,b)=>a.dev===b.dev&&a.ino===b.ino;
const digest=(bytes,algorithm='sha256')=>crypto.createHash(algorithm).update(bytes).digest('hex');
const json=file=>JSON.parse(fs.readFileSync(file,'utf8'));
function abort(signal){if(signal?.aborted)throw new Error('Release artifact generation cancelled');}
function inside(parent,child){const relative=path.relative(parent,child);return relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative));}
function regular(file){const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink())throw new Error('Expected regular release input: '+file);return stat;}
function metadata(pkg,lock,{artifact=false}={}){
 if(pkg.name!==NAME||!/^\d+\.\d+\.\d+$/.test(pkg.version)||pkg.private===true)throw new Error('Invalid release package identity');
 for(const hook of HOOKS)if(pkg.scripts?.[hook]!==undefined&&!(artifact&&hook==='postinstall'&&pkg.scripts[hook]===HOOK))throw new Error('Unapproved package lifecycle: '+hook);
 if(artifact&&pkg.scripts?.postinstall!==HOOK)throw new Error('Artifact postinstall is missing');
 if(Object.hasOwn(pkg.scripts??{},'build')||Object.hasOwn(pkg,'workspaces'))throw new Error('Source Git preparation trigger is not allowed');
 if(lock){
  const root=lock.packages?.[''];if(lock.name!==pkg.name||lock.version!==pkg.version||root?.name!==pkg.name||root?.version!==pkg.version)throw new Error('Package lock identity mismatch');
  for(const key of ['bin','dependencies','optionalDependencies','devDependencies','peerDependencies','engines'])if(!isDeepStrictEqual(root[key],pkg[key]))throw new Error('Package lock metadata mismatch: '+key);
  if(artifact?root.hasInstallScript!==true:Object.hasOwn(root,'hasInstallScript'))throw new Error('Package lock install script metadata mismatch');
 }
}
function inputNames(pkg){const names=new Set(['README.md','package.json','package-lock.json','MANIFEST.sha256']);for(const entry of pkg.files??[]){if(entry==='!**/__pycache__/**'||entry==='!**/*.pyc')continue;const name=entry.replace(/\/$/,'');if(!name||name.startsWith('/')||name.startsWith('!')||name.includes('\\')||name.split('/').some(part=>!part||part==='.'||part==='..')||/[*?\[\]]/.test(name))throw new Error('Unsupported package files entry');names.add(name);}return [...names].sort();}
function sourceMetadata(root){
 const directory=openRoot(root);
 try{const result={};for(const name of ['package.json','package-lock.json']){const stat=directory.lstat(name);if(typeOf(stat)!==0o100000)throw new Error('Expected regular source metadata: '+name);result[name]=readCheckedFile(directory,name,stat).bytes;}return result;}
 finally{directory.close();}
}
function inventory(root,pkg){
 const files=new Map(),directory=openRoot(root);
 function visit(parent,name,relative){
  const stat=parent.lstat(name),type=typeOf(stat);
  if(relative===LOCAL_UPDATER_PATH)throw new Error('Local updater wrapper is forbidden in release inventory');
  if(type===0o040000){
   const child=parent.openDir(name);try{if(!sameIdentity(stat,child.stat()))throw new Error('Release source directory changed');
    const before=child.stat();for(const leaf of child.readDir())visit(child,leaf,relative+'/'+leaf);if(!sameIdentity(before,child.stat()))throw new Error('Release source directory changed while reading');
   }finally{child.close();}
  }else if(type===0o100000){const item=readCheckedFile(parent,name,stat);files.set(relative,{bytes:item.bytes,mode:Number(stat.mode&0o777n)});}
  else throw new Error('Unsafe release source file: '+relative);
 }
 try{
  for(const name of inputNames(pkg)){
   const parts=name.split('/'),opened=[];let parent=directory;
   try{for(const part of parts.slice(0,-1)){const stat=parent.lstat(part);if(typeOf(stat)!==0o040000)throw new Error('Unsafe release source parent');const child=parent.openDir(part);opened.push(child);if(!sameIdentity(stat,child.stat()))throw new Error('Release source parent changed');parent=child;}visit(parent,parts.at(-1),name);}
   finally{for(const child of opened.reverse())child.close();}
  }
 }finally{directory.close();}
 const snapshot=digest([...files].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([name,{bytes,mode}])=>name+'\0'+mode+'\0'+bytes.length+'\0'+digest(bytes)+'\n').join(''));
 return{files,snapshot};
}
function refresh(root){
 const result=spawnSync(process.execPath,[path.join(root,'scripts/update-manifest.mjs'),'--root',root],{encoding:'utf8',env:{PATH:process.env.PATH}});
 if(result.status!==0)throw new Error('Staging manifest generation failed: '+result.stderr);
}
function safeOutput(sourceRoot,outDir){
 if(!path.isAbsolute(outDir)||path.normalize(outDir)!==outDir||inside(sourceRoot,outDir))throw new Error('Release output must be an absolute directory outside source');
 let current=path.parse(outDir).root;for(const component of outDir.slice(current.length).split(path.sep).filter(Boolean)){
  current=path.join(current,component);try{const stat=fs.lstatSync(current);if(stat.isSymbolicLink()||!stat.isDirectory())throw new Error('Unsafe release output path');}catch(error){if(error.code!=='ENOENT')throw error;if(current!==outDir)throw new Error('Release output parent is missing');}
 }
 const parent=fs.realpathSync(path.dirname(outDir));if(inside(sourceRoot,parent))throw new Error('Release output resolves inside source');
 try{fs.mkdirSync(outDir,{mode:0o700});}catch(error){if(error.code!=='EEXIST')throw error;}
 if(fs.readdirSync(outDir).length)throw new Error('Release output is occupied or incomplete; use a new output directory');
 return openRoot(outDir);
}
function readText(bytes,start,length){return bytes.subarray(start,start+length).toString('utf8').replace(/\0.*$/s,'');}
function number(bytes,start,length){const text=readText(bytes,start,length).trim();if(!/^[0-7]*$/.test(text))throw new Error('Unsupported tar number');const value=parseInt(text||'0',8);if(!Number.isSafeInteger(value))throw new Error('Invalid tar size');return value;}
function pax(bytes){
 const result={};let offset=0;while(offset<bytes.length){const space=bytes.indexOf(32,offset);if(space<0)throw new Error('Malformed tar metadata');const size=Number(bytes.subarray(offset,space).toString());if(!Number.isSafeInteger(size)||size<=space-offset+1||offset+size>bytes.length)throw new Error('Malformed tar metadata');const record=bytes.subarray(space+1,offset+size).toString('utf8');if(!record.endsWith('\n'))throw new Error('Malformed tar metadata');const equal=record.indexOf('=');if(equal<1)throw new Error('Malformed tar metadata');result[record.slice(0,equal)]=record.slice(equal+1,-1);offset+=size;}return result;
}
function archive(bytes){
 const raw=gunzipSync(bytes,{maxOutputLength:256*1024*1024}),files=new Map();let extended={},global={};
 for(let offset=0;offset+512<=raw.length;){
  const header=raw.subarray(offset,offset+512);if(header.every(byte=>byte===0))break;
  let sum=0;for(let i=0;i<512;i++)sum+=i>=148&&i<156?32:header[i];if(sum!==number(header,148,8))throw new Error('Invalid tar header checksum');
  const size=number(header,124,12),type=String.fromCharCode(header[156]||48),end=offset+512+size;if(end>raw.length)throw new Error('Truncated tar archive');
  const data=raw.subarray(offset+512,end);offset+=512+Math.ceil(size/512)*512;
  if(type==='x'||type==='g'){const values=pax(data);if(type==='g')global={...global,...values};else extended=values;continue;}
  const attrs={...global,...extended};extended={};if(attrs.linkpath!==undefined)throw new Error('Archive links are forbidden');
  let name=attrs.path??[readText(header,345,155),readText(header,0,100)].filter(Boolean).join('/');
  if(name.endsWith('/'))name=name.slice(0,-1);
  if(name!=='package'&&(!name.startsWith('package/')||name.split('/').some(part=>!part||part==='.'||part==='..')||name.includes('\\')||name.includes('\0')))throw new Error('Unsafe archive path');
  if(type==='5')continue;if(type!=='0')throw new Error('Archive links and special files are forbidden');
  if(name==='package'||files.has(name))throw new Error('Duplicate archive path');
  if(attrs.size!==undefined&&Number(attrs.size)!==size)throw new Error('Unsupported tar size override');
  files.set(name.slice(8),{bytes:Buffer.from(data),mode:number(header,100,8)&0o777});
 }
 if(!files.size)throw new Error('Empty release archive');return files;
}
function validateTarball(bytes,{expectedName,expectedVersion}){
 const files=archive(bytes),pkgFile=files.get('package.json');if(!pkgFile)throw new Error('Artifact package metadata is missing');
 if(files.has(LOCAL_UPDATER_PATH))throw new Error('Local updater wrapper is forbidden in release artifact');
 const pkg=JSON.parse(pkgFile.bytes);metadata(pkg,undefined,{artifact:true});
 if(pkg.name!==expectedName||pkg.version!==expectedVersion)throw new Error('Artifact package identity mismatch');
 for(const name of ['scripts/postinstall.mjs','lib/cli/postinstall.mjs','lib/tui/app.mjs','lib/tui/terminal.mjs','lib/cli/root.mjs','lib/cli/upgrade.mjs','bin/arc-upgrade.mjs'])if(!files.has(name))throw new Error('Artifact runtime asset missing: '+name);
 if(files.has('package-lock.json')||[...files.keys()].some(name=>name.split('/').some(part=>part==='.git'||part.startsWith('.arc-release'))))throw new Error('Private staging data in artifact');
 const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'arc-release-verify-'));
 try{
  for(const[name,item]of files){const filename=path.join(root,name);fs.mkdirSync(path.dirname(filename),{recursive:true,mode:0o700});fs.writeFileSync(filename,item.bytes,{mode:item.mode});}
  verifyPayload({packageRoot:root,safeFs:{openRoot},payloadMode:'package'});
 }finally{fs.rmSync(root,{recursive:true,force:true});}
 return pkg;
}
async function pack({stagingRoot,workRoot,npmCli,signal}){
 const packDir=path.join(workRoot,'packed'),home=path.join(workRoot,'home');fs.mkdirSync(packDir);fs.mkdirSync(home);
 const env={PATH:process.env.PATH,HOME:home,npm_config_userconfig:path.join(home,'user.npmrc'),npm_config_globalconfig:path.join(home,'global.npmrc'),npm_config_cache:path.join(workRoot,'cache'),npm_config_offline:'true',npm_config_ignore_scripts:'true',npm_config_audit:'false',npm_config_fund:'false',npm_config_update_notifier:'false'};
 const result=await runNpm(npmCli,['pack','--ignore-scripts','--offline','--json','--pack-destination',packDir],{cwd:stagingRoot,env,signal});
 if(result.code!==0)throw new Error('Release npm pack failed: '+result.stderr);
 const records=JSON.parse(result.stdout),record=Array.isArray(records)?records[0]:records[NAME];
 if(!record||typeof record.filename!=='string'||path.basename(record.filename)!==record.filename)throw new Error('Invalid npm pack result');
 const filename=path.join(packDir,record.filename);regular(filename);return fs.readFileSync(filename);
}
export async function buildReleaseArtifact({sourceRoot,outDir,npmCli,signal,deps={}}){
 if(!path.isAbsolute(sourceRoot)||fs.realpathSync(sourceRoot)!==sourceRoot)throw new Error('Source root must be an absolute real path');
 abort(signal);const inputs=sourceMetadata(sourceRoot),pkg=JSON.parse(inputs['package.json']),lock=JSON.parse(inputs['package-lock.json']);metadata(pkg,lock);
 const source=inventory(sourceRoot,pkg);for(const name of ['package.json','package-lock.json'])if(!inputs[name].equals(source.files.get(name).bytes))throw new Error('Release source metadata changed during validation');
 verifyPayload({packageRoot:sourceRoot,safeFs:{openRoot},payloadMode:'source'});if(inventory(sourceRoot,pkg).snapshot!==source.snapshot)throw new Error('Release source snapshot changed during validation');
 let output,lockIdentity,workRoot,workIdentity;const id=crypto.randomUUID(),partial='.arc-release-'+id+'.partial';let partialExists=false;
 try{
  output=safeOutput(sourceRoot,outDir);const lockFile=output.openFile('.arc-release.lock',{createExclusive:true,read:false});try{lockFile.writeAll(JSON.stringify({schema:1,owner:id,pid:process.pid,state:'incomplete'}));lockIdentity=lockFile.stat();lockFile.sync();}finally{lockFile.close();}
  workRoot=fs.mkdtempSync(path.join(fs.realpathSync(path.dirname(outDir)),'.arc-release-stage-'));workIdentity=fs.lstatSync(workRoot);
  const stagingRoot=path.join(workRoot,'package');fs.mkdirSync(stagingRoot,{mode:0o700});
  for(const[name,item]of source.files){const filename=path.join(stagingRoot,name);fs.mkdirSync(path.dirname(filename),{recursive:true,mode:0o700});fs.writeFileSync(filename,item.bytes,{flag:'wx',mode:item.mode});}
  const stagedPkg={...pkg,scripts:{...pkg.scripts,postinstall:HOOK}},stagedLock=structuredClone(lock);stagedLock.packages[''].hasInstallScript=true;
  fs.writeFileSync(path.join(stagingRoot,'package.json'),JSON.stringify(stagedPkg,null,2)+'\n');fs.writeFileSync(path.join(stagingRoot,'package-lock.json'),JSON.stringify(stagedLock,null,2)+'\n');metadata(stagedPkg,stagedLock,{artifact:true});
  fs.writeFileSync(path.join(stagingRoot,'.arc-release-staging.json'),JSON.stringify({schema:1,owner:id,state:'incomplete',sourceSnapshot:source.snapshot}));
  refresh(stagingRoot);verifyPayload({packageRoot:stagingRoot,safeFs:{openRoot},payloadMode:'package'});await deps.onStaged?.({stagingRoot,signal});abort(signal);verifyPayload({packageRoot:stagingRoot,safeFs:{openRoot},payloadMode:'package'});
  const bytes=await(deps.pack??pack)({stagingRoot,workRoot,npmCli,signal});abort(signal);validateTarball(bytes,{expectedName:pkg.name,expectedVersion:pkg.version});
  if(inventory(sourceRoot,pkg).snapshot!==source.snapshot)throw new Error('Release source snapshot changed during generation');abort(signal);
  const tarballPath=path.join(outDir,'arc-release.tgz'),receiptPath=path.join(outDir,'arc-release.json');
  const receipt={schema:1,name:pkg.name,version:pkg.version,tarballPath,sha512:digest(bytes,'sha512'),sourceSnapshot:source.snapshot,verified:true};
  const file=output.openFile(partial,{createExclusive:true,read:false});partialExists=true;try{file.writeAll(bytes);file.sync();}finally{file.close();}
  output.renameNoReplaceTo(partial,output,'arc-release.tgz');partialExists=false;
  const receiptFile=output.openFile(partial,{createExclusive:true,read:false});partialExists=true;try{receiptFile.writeAll(JSON.stringify(receipt,null,2)+'\n');receiptFile.sync();}finally{receiptFile.close();}
  output.renameNoReplaceTo(partial,output,'arc-release.json');partialExists=false;output.sync();
  if(!same(output.stat(),fs.lstatSync(outDir,{bigint:true}))||fs.lstatSync(outDir).isSymbolicLink())throw new Error('Release output directory changed');
  return{...receipt,receiptPath};
 }finally{
  if(workRoot){try{if(same(workIdentity,fs.lstatSync(workRoot)))fs.rmSync(workRoot,{recursive:true,force:true});}catch(error){if(error.code!=='ENOENT')throw error;}}
  if(output){try{if(partialExists)output.unlink(partial);if(lockIdentity&&same(lockIdentity,output.lstat('.arc-release.lock')))output.unlink('.arc-release.lock');}finally{output.close();}}
 }
}
export async function verifyReleaseArtifact({outDir,expectedName,expectedVersion}){
 if(!path.isAbsolute(outDir)||fs.realpathSync(outDir)!==outDir)throw new Error('Unsafe release output path');
 if(fs.readdirSync(outDir).includes('.arc-release.lock'))throw new Error('Release output is locked or incomplete');
 regular(path.join(outDir,'arc-release.json'));const receipt=json(path.join(outDir,'arc-release.json'));
 if(receipt.schema!==1||receipt.verified!==true||receipt.name!==expectedName||receipt.version!==expectedVersion||receipt.tarballPath!==path.join(outDir,'arc-release.tgz')||!/^[a-f0-9]{128}$/.test(receipt.sha512)||!/^[a-f0-9]{64}$/.test(receipt.sourceSnapshot))throw new Error('Invalid release receipt');
 regular(receipt.tarballPath);const bytes=fs.readFileSync(receipt.tarballPath);if(digest(bytes,'sha512')!==receipt.sha512)throw new Error('Release tarball digest mismatch');
 validateTarball(bytes,{expectedName,expectedVersion});return receipt;
}
export function resolveNpmCli(){
 const executable=process.env.npm_execpath;if(executable&&path.isAbsolute(executable)&&fs.existsSync(executable))return fs.realpathSync(executable);
 const candidate=path.resolve(path.dirname(process.execPath),'../lib/node_modules/npm/bin/npm-cli.js');
 if(fs.existsSync(candidate))return fs.realpathSync(candidate);throw new Error('Cannot resolve npm CLI; use npm run pack:release');
}
export const releaseSourceRoot=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
