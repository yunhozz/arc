import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {COOPERATIVE_RUNTIME_MODULES, cooperativeVersions} from './bootstrap.mjs';
import {inspectPath} from './scope.mjs';
import {resolveConfigHome, resolveLocalCli, probePlatformAuth} from './local-cli.mjs';
import {ROUTING_ROLES, parseRoleRoutingConfig} from './role-routing-config.mjs';

const RELEASE = Object.freeze({
 activation_unverified:'Verify the active configuration, both prepared markers and installed bytes under the shared lock.',
 native_provider_unavailable:'Provide a trusted host channel that correlates the assignment and execution.',
 native_profile_reload_unverified:'Verify that the host session loaded the requested profile revision.',
 capacity_unverified:'Verify the active executions and actual capacity of the current session.',
 permission_scope_unverified:'Verify enforcement of the role permissions and approved scope before starting.',
 model_effort_observer_unavailable:'Provide a trusted observer for the requested model and effort or their rejection.'
});
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const hash=bytes=>'sha256:'+crypto.createHash('sha256').update(bytes).digest('hex');
const equalStat=(a,b)=>['dev','ino','mode','size','mtimeNs','ctimeNs'].every(key=>a[key]===b[key]);
const validHash=value=>typeof value==='string'&&/^sha256:[a-f0-9]{64}$/.test(value);
const reason=code=>({code,releaseCondition:RELEASE[code]});

async function readStable(filename,snapshot){
 await inspectPath(filename);
 const before=await fs.lstat(filename,{bigint:true});
 if(!before.isFile()||before.isSymbolicLink()||before.size>10485760n)throw Error('Unsafe file');
 const handle=await fs.open(filename,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const opened=await handle.stat({bigint:true});if(!equalStat(before,opened))throw Error('File changed');
  const bytes=await handle.readFile();const after=await handle.stat({bigint:true});const named=await fs.lstat(filename,{bigint:true});
  if(!equalStat(opened,after)||!equalStat(after,named))throw Error('File changed');
  snapshot.push({filename,stat:named});return bytes;
 }finally{await handle.close();}
}
async function checkSnapshot(snapshot){
 for(const entry of snapshot){await inspectPath(entry.filename);if(!equalStat(entry.stat,await fs.lstat(entry.filename,{bigint:true})))throw Error('File changed');}
}
async function acquireLock(home){
 await inspectPath(home,{directory:true});
 const filename=path.join(home,'arc-role-platform-routing.lock'),operationId=crypto.randomUUID();
 const handle=await fs.open(filename,'wx',0o600);let identity;
 try{
  identity=await handle.stat({bigint:true});
  await handle.writeFile(JSON.stringify({version:1,operationId,pid:process.pid,createdAt:new Date().toISOString()})+'\n');
  await handle.sync();
 }catch(error){await handle.close();throw error;}
 await handle.close();
 return async()=>{
  try{
   const stat=await fs.lstat(filename,{bigint:true});
   if(!stat.isFile()||stat.isSymbolicLink()||stat.dev!==identity.dev||stat.ino!==identity.ino)return false;
   const data=JSON.parse(await fs.readFile(filename,'utf8'));
   if(!exact(data,['version','operationId','pid','createdAt'])||data.version!==1||data.operationId!==operationId||data.pid!==process.pid)return false;
   const current=await fs.lstat(filename,{bigint:true});if(current.dev!==identity.dev||current.ino!==identity.ino)return false;
   await fs.unlink(filename);return true;
  }catch{return false;}
 };
}
async function readActivation(homes,expectedRevision){
 const snapshot=[],activePath=path.join(homes.codex,'arc-role-platform-routing.json');
 const configBytes=await readStable(activePath,snapshot),config=parseRoleRoutingConfig(configBytes.toString('utf8'));
 if(config.revision!==expectedRevision)throw Error('Revision mismatch');
 const versions=await cooperativeVersions();
 for(const platform of ['codex','claude']){
  const home=homes[platform],marker=JSON.parse((await readStable(path.join(home,'arc-role-platform-routing.prepared.json'),snapshot)).toString('utf8'));
  if(!exact(marker,['version','revision','platform','targetHome','activeConfigPath','configHash','runtime','profiles'])||marker.version!==1||marker.revision!==config.revision||marker.platform!==platform||marker.targetHome!==home||marker.activeConfigPath!==activePath||marker.configHash!==hash(configBytes))throw Error('Invalid marker');
  if(!exact(marker.runtime,['version','hash','policyHash'])||marker.runtime.version!==versions.runtime||!validHash(marker.runtime.hash)||!validHash(marker.runtime.policyHash))throw Error('Invalid runtime marker');
  const runtimeDir=path.join(home,'skills','arc','runtime');
  const runtime=[];for(const module of COOPERATIVE_RUNTIME_MODULES)runtime.push(await readStable(path.join(runtimeDir,module),snapshot));
  const policy=await readStable(path.join(runtimeDir,'role-policy.json'),snapshot);
  if(hash(Buffer.concat(runtime))!==marker.runtime.hash||hash(policy)!==marker.runtime.policyHash||marker.runtime.hash!==versions.runtimeHash||marker.runtime.policyHash!==versions.policyHash)throw Error('Runtime mismatch');
  const roles=ROUTING_ROLES.filter(role=>config.roles[role].platform===platform);
  if(!exact(marker.profiles,roles))throw Error('Invalid profiles');
  for(const role of roles){
   const suffix=role.slice('arc_'.length),relative=`agents/arc-routing-${suffix}.${platform==='codex'?'toml':'md'}`,entry=marker.profiles[role];
   if(!exact(entry,['path','hash'])||entry.path!==relative||!validHash(entry.hash)||hash(await readStable(path.join(home,relative),snapshot))!==entry.hash)throw Error('Profile mismatch');
  }
 }
 await checkSnapshot(snapshot);return config;
}

/** No current provider can establish all pre-dispatch evidence. This never reserves or starts a role. */
export async function prepareRoleDispatch({context,assignment,expectedRevision}={}){
 const host=['codex','claude'].includes(context?.hostPlatform)?context.hostPlatform:null;
 const environments=['codex-cli','claude-cli','codex-desktop','claude-desktop'];
 const environment=environments.includes(context?.executionEnvironment)&&context.executionEnvironment.startsWith(`${host}-`)?context.executionEnvironment:null;
 const role=ROUTING_ROLES.includes(assignment?.role)?assignment.role:null;
 const result={decision:'hold',routeStatus:'held',supportStatus:'unverified',route:null,executionEnvironment:environment,hostPlatform:host,role,requested:null,authentication:null,reasons:[]};
 const reasons=new Set(['capacity_unverified','permission_scope_unverified','model_effort_observer_unavailable']);
 let release,config;
 try{
  if(!host||!environment||!role||typeof expectedRevision!=='string'||!expectedRevision)throw Error('Invalid request');
  const homes={codex:resolveConfigHome('codex',context),claude:resolveConfigHome('claude',context)};
  release=await acquireLock(homes.codex);
  config=await readActivation(homes,expectedRevision);
  const requested=config.roles[role];result.requested={...requested};result.route=requested.platform===host?'native':'bridge';
  const cli=resolveLocalCli(requested.platform,context);
  if(cli.reason)result.authentication={status:cli.reason==='cli_not_found'?'Not Avaliable':'Incomplete',reason:cli.reason};
  else{
   const auth=await probePlatformAuth(cli);
   result.authentication={status:auth.authStatus==='authenticated'?'Avaliable':auth.authStatus==='unauthorized'?'Unauthorized':'Incomplete',...(auth.reason?{reason:auth.reason}:{})};
  }
 }catch{reasons.add('activation_unverified');}
 finally{if(release&&!await release())reasons.add('activation_unverified');}
 if(result.route==='native'){reasons.add('native_provider_unavailable');reasons.add('native_profile_reload_unverified');}
 result.reasons=[...reasons].map(reason);return result;
}
