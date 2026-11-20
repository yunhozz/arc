import {runtimeRegistryOf, routingProfileFile} from './platform-registry.mjs';
import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {COOPERATIVE_RUNTIME_MODULES, cooperativeVersions} from './bootstrap.mjs';
import {inspectPath} from './scope.mjs';
import {resolveConfigHome, resolveLocalCli, probePlatformAuth, probeCodexAuthStatus, probeCliVersion} from './local-cli.mjs';
import {ROUTING_ROLES, parseRoleRoutingConfig} from './role-routing-config.mjs';
import {DEFAULT_POLICY, HOST_SANDBOX_GATES, reason, profileName, revisionTag, hostGateReasons, bridgeGateReasons, environmentReasons, initialClaims, capabilityReasons} from './role-dispatch-policy.mjs';
import {NON_TERMINAL_STATES, createLease, listLeases, pruneTerminalLeases, readHostLimits} from './role-dispatch-store.mjs';
import {allowedPathsCoverControl} from './role-observe.mjs';

const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const hash=bytes=>'sha256:'+crypto.createHash('sha256').update(bytes).digest('hex');
const equalStat=(a,b)=>['dev','ino','mode','size','mtimeNs','ctimeNs'].every(key=>a[key]===b[key]);
const validHash=value=>typeof value==='string'&&/^sha256:[a-f0-9]{64}$/.test(value);

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
export async function acquireRoleRoutingLock(home){
 await inspectPath(home,{directory:true});
 const filename=path.join(home,'arc-role-platform-routing.lock'),operationId=crypto.randomUUID();
 const handle=await fs.open(filename,'wx',0o600);let identity,closed=false;
 try{
  identity=await handle.stat({bigint:true});
  if(!identity.isFile())throw Error('Created lock is not a regular file');
  await handle.writeFile(JSON.stringify({version:1,operationId,pid:process.pid,createdAt:new Date().toISOString()})+'\n');
  await handle.sync();
  await handle.close();closed=true;
 }catch(cause){
  let residual=true;
  try{
   if(!identity?.isFile())throw Error('Created lock identity is unavailable');
   const opened=await handle.stat({bigint:true}),named=await fs.lstat(filename,{bigint:true});
   if(!opened.isFile()||!named.isFile()||named.isSymbolicLink()||opened.dev!==identity.dev||opened.ino!==identity.ino||named.dev!==identity.dev||named.ino!==identity.ino)throw Error('Created lock identity changed');
   await fs.unlink(filename);residual=false;
  }catch{}
  if(!closed)try{await handle.close();}catch{}
  const error=new Error(residual?'Composite lock initialization failed; inspect the residual path':'Composite lock initialization failed',{cause});
  error.code='ARC_ROUTING_LOCK_INITIALIZATION';if(residual)error.residualPaths=[filename];throw error;
 }
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
export function resolveRuntimeHomes(context){
 const homes={};
 for(const id of runtimeRegistryOf(context).platformIds()){
  try{homes[id]=resolveConfigHome(id,context);}catch{/* unresolved homes are omitted */}
 }
 return homes;
}
export function matchRegisteredHome({dir,homes}){
 const resolved=path.resolve(dir);
 for(const [id,home] of Object.entries(homes))if(path.resolve(home)===resolved)return id;
 return null;
}
export async function locateAnchorHome({host,homes}){
 const home=homes[host];if(typeof home!=='string'||!path.isAbsolute(home))throw Error('Invalid host home');
 const marker=JSON.parse((await readStable(path.join(home,'arc-role-platform-routing.prepared.json'),[])).toString('utf8'));
 if(!exact(marker,['version','revision','platform','targetHome','activeConfigPath','configHash','runtime','profiles'])||marker.version!==1||typeof marker.revision!=='string'||!marker.revision||marker.platform!==host||marker.targetHome!==home||!validHash(marker.configHash)||!exact(marker.runtime,['version','hash','policyHash'])||typeof marker.runtime.version!=='string'||!marker.runtime.version||!validHash(marker.runtime.hash)||!validHash(marker.runtime.policyHash)||!marker.profiles||typeof marker.profiles!=='object'||Array.isArray(marker.profiles))throw Error('Invalid marker');
 const active=marker.activeConfigPath;
 if(typeof active!=='string'||!path.isAbsolute(active)||path.normalize(active)!==active||path.basename(active)!=='arc-role-platform-routing.json')throw Error('Invalid marker');
 const anchorHome=path.dirname(active);
 if(matchRegisteredHome({dir:anchorHome,homes})===null)throw Error('Unregistered anchor home');
 return anchorHome;
}
export async function readActivation(homes,expectedRevision,{anchorHome=homes.codex,host,runtimePlatforms}={}){
 const snapshot=[],activePath=path.join(anchorHome,'arc-role-platform-routing.json');
 const configBytes=await readStable(activePath,snapshot),config=parseRoleRoutingConfig(configBytes.toString('utf8'),{runtimePlatforms});
 if(anchorHome!==homes[config.platforms[0]])throw Error('Anchor mismatch');
 if(host!==undefined&&!config.platforms.includes(host))throw Error('Host outside participating platforms');
 if(config.revision!==expectedRevision)throw Error('Revision mismatch');
 const versions=await cooperativeVersions();
 for(const platform of config.platforms){
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
   const relative=`agents/${routingProfileFile(runtimeRegistryOf({runtimePlatforms}).getPlatform(platform),role)}`,entry=marker.profiles[role];
   if(!exact(entry,['path','hash'])||entry.path!==relative||!validHash(entry.hash)||hash(await readStable(path.join(home,relative),snapshot))!==entry.hash)throw Error('Profile mismatch');
  }
 }
 await checkSnapshot(snapshot);
 if(host!==undefined&&await locateAnchorHome({host,homes})!==anchorHome)throw Error('Host marker changed');
 return config;
}


const HOST_ERRORS=['EACCES','EPERM','EROFS'];
export async function probeHomeWritable(home, {unlink = fs.unlink} = {}) {
 const file = path.join(home, '.arc-host-probe-' + crypto.randomUUID());
 let handle;
 try {
  handle = await fs.open(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
 } catch (error) {
  return {ok: false, code: HOST_ERRORS.includes(error?.code) ? 'host_sandbox_blocked' : 'activation_unverified'};
 }
 let closed = false;
 try {
  await handle.close();
  closed = true;
 } catch { /* Attempt to remove the file even if close fails. */ }
 try {
  await unlink(file);
 } catch {
  return {ok: false, code: 'host_sandbox_blocked', residualPaths: [file]};
 }
 return closed ? {ok: true} : {ok: false, code: 'activation_unverified'};
}

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const lockFile=codexHome=>path.join(codexHome,'arc-role-platform-routing.lock');
/** Runs fn under the shared routing lock. Only EEXIST is retried; the lock file is never removed except by its owner. */
export async function withRoutingLock(codexHome,fn,{retryMs=DEFAULT_POLICY.lockRetryMs}={}){
 const deadline=Date.now()+retryMs;let release;
 for(;;){
  try{release=await acquireRoleRoutingLock(codexHome);break;}
  catch(error){
   if(error?.code==='EEXIST'){
    if(Date.now()>=deadline){const busy=new Error('Routing lock is busy; inspect the residual path',{cause:error});busy.code='ARC_ROUTING_LOCK_BUSY';busy.residualPaths=[lockFile(codexHome)];throw busy;}
    await sleep(50);continue;
   }
   if(HOST_ERRORS.includes(error?.code)){const denied=new Error('The host denied access to the routing lock',{cause:error});denied.code='ARC_HOST_SANDBOX';throw denied;}
   throw error;
  }
 }
 let value,failure,failed=false;
 try{value=await fn();}catch(error){failed=true;failure=error;}
 let released=false;try{released=await release();}catch{}
 if(!released){
  const error=new Error('Routing lock ownership could not be verified; inspect the residual path');
  error.code='ARC_ROUTING_LOCK_RELEASE';error.residualPaths=[lockFile(codexHome)];if(failed)error.failure=failure;else error.value=value;throw error;
 }
 if(failed)throw failure;return value;
}

const textValue=value=>typeof value==='string'&&/^[^\p{Cc}]{1,256}$/u.test(value);
const validRelativePath=value=>typeof value==='string'&&value.length>0&&value.length<=1024&&!value.includes('\0')&&!value.startsWith('/')&&!/^[A-Za-z]:/.test(value)&&value.replace(/\/$/,'').split('/').every(part=>part&&part!=='..');
const hostOf=context=>runtimeRegistryOf(context).isPlatformId(context?.hostPlatform)?context.hostPlatform:null;
const environmentOf=(context,host)=>runtimeRegistryOf(context).getPlatform(host)?.executionEnvironments.includes(context?.executionEnvironment)?context.executionEnvironment:null;
function validateAssignment(assignment,expectedRevision,context){
 const role=assignment?.role;
 if(!ROUTING_ROLES.includes(role)||!textValue(assignment.requestId)||!textValue(assignment.taskId)||!textValue(expectedRevision)||!textValue(context?.workflowId))return false;
 const paths=assignment.allowedPaths;
 if(role==='arc_implementer')return Array.isArray(paths)&&paths.length>0&&paths.every(validRelativePath);
 if(paths===undefined)return true;
 return role==='arc_qa'&&Array.isArray(paths)&&paths.every(validRelativePath);
}
const blankResult=(host,environment,role)=>({decision:'hold',routeStatus:'held',supportStatus:'unverified',dispatchId:null,route:null,profileName:null,executionEnvironment:environment,hostPlatform:host,role,requested:null,authentication:null,cliVersion:null,claims:null,reasons:[]});
const classify=error=>{
 const code=error?.code==='ARC_ROUTING_LOCK_RELEASE'&&error.failure?error.failure.code:error?.code;
 return code==='ARC_HOST_SANDBOX'||HOST_ERRORS.includes(code)?'host_sandbox_blocked':'activation_unverified';
};
export async function authenticate(platform,context,policy){
 const cli=resolveLocalCli(platform,context);
 if(cli.reason)return {cli:null,authentication:{status:cli.reason==='cli_not_found'?'Not Available':'Incomplete',reason:cli.reason}};
 const kind=runtimeRegistryOf(context).getPlatform(platform).auth.kind;
 const auth=await (kind==='codex-refresh'?probeCodexAuthStatus:probePlatformAuth)(cli,{timeoutMs:policy.probeTimeoutMs});
 if(kind==='none')return {cli,authentication:auth};
 return {cli,authentication:{status:auth.authStatus==='authenticated'?'Available':auth.authStatus==='unauthorized'?'Unauthorized':'Incomplete',...(auth.reason?{reason:auth.reason}:{})}};
}
export const versionOf=(cli,policy)=>cli?probeCliVersion(cli,{timeoutMs:policy.probeTimeoutMs}):{version:null,reason:'cli_not_found'};
export async function readRevision(homes,{anchorHome=homes.codex,runtimePlatforms}={}){
 const bytes=await readStable(path.join(anchorHome,'arc-role-platform-routing.json'),[]);
 return parseRoleRoutingConfig(bytes.toString('utf8'),{runtimePlatforms}).revision;
}
export async function readProfileHash(home,role){
 const marker=JSON.parse(await fs.readFile(path.join(home,'arc-role-platform-routing.prepared.json'),'utf8'));
 const hashValue=marker?.profiles?.[role]?.hash;if(!validHash(hashValue))throw Error('Invalid profile hash');return hashValue;
}
const residualOf=error=>Array.isArray(error?.residualPaths)?error.residualPaths:undefined;

/** Reports the active revision, per-role routes, profile names, authentication and CLI versions. Never reserves a lease. */
export async function routingStatus({context,now=Date.now(),policy=DEFAULT_POLICY}={}){
 const host=hostOf(context),environment=environmentOf(context,host);
 const result={decision:'hold',revision:null,hostPlatform:host,executionEnvironment:environment,roles:null,platforms:null,pruned:{removed:0,errors:0},reasons:[]};
 if(!host||!environment){result.decision='deny';result.reasons=[reason('invalid_request')];return result;}
 const homes=resolveRuntimeHomes(context),runtimePlatforms=runtimeRegistryOf(context);let anchorHome;
 try{anchorHome=await locateAnchorHome({host,homes});}
 catch{result.reasons=[reason('activation_unverified')];return result;}
 try{
  await withRoutingLock(anchorHome,async()=>{
   let config;try{config=await readActivation(homes,await readRevision(homes,{anchorHome,runtimePlatforms}),{anchorHome,host,runtimePlatforms});}catch{result.reasons=[reason('activation_unverified')];return;}
   result.pruned=await pruneTerminalLeases(anchorHome,{now,retentionMs:policy.leaseRetentionMs,runtimePlatforms});
   result.revision=config.revision;result.roles={};
   for(const role of ROUTING_ROLES){const requested=config.roles[role];result.roles[role]={route:requested.platform===host?'native':'bridge',platform:requested.platform,model:requested.model,effort:requested.effort,profileName:profileName(requested.platform,role,{runtimePlatforms}),revisionTag:revisionTag(config.revision)};}
   result.platforms={};
   for(const platform of config.platforms.filter(name=>name===host||ROUTING_ROLES.some(role=>config.roles[role].platform===name))){
    const {cli,authentication}=await authenticate(platform,context,policy);
    result.platforms[platform]={authentication,cliVersion:await versionOf(cli,policy)};
   }
   result.decision='allow';
  },{retryMs:policy.lockRetryMs});
 }catch(error){
  result.decision='hold';result.revision=null;result.roles=null;result.platforms=null;result.reasons=[reason(classify(error))];
  const residual=residualOf(error);if(residual)result.residualPaths=residual;
 }
 return result;
}

/** Applies the pre-start decision table and reserves a lease only when no reason remains. */
export async function prepareRoleDispatch({context,assignment,expectedRevision,now=Date.now(),policy=DEFAULT_POLICY}={}){
 const host=hostOf(context),environment=environmentOf(context,host),role=ROUTING_ROLES.includes(assignment?.role)?assignment.role:null;
 const result=blankResult(host,environment,role);
 if(!host||!environment||!validateAssignment(assignment,expectedRevision,context)){result.decision='deny';result.reasons=[reason('invalid_request')];return result;}
 const codes=new Set();let duplicate=false,anchorHome;
 const homes=resolveRuntimeHomes(context),runtimePlatforms=runtimeRegistryOf(context);
 try{anchorHome=await locateAnchorHome({host,homes});}
 catch{result.reasons=[reason('activation_unverified')];return result;}
 try{
  await withRoutingLock(anchorHome,async()=>{
   let config;try{config=await readActivation(homes,expectedRevision,{anchorHome,host,runtimePlatforms});}catch{result.reasons=[reason('activation_unverified')];return;}
   const requested=config.roles[role],route=requested.platform===host?'native':'bridge';
   result.requested={...requested};result.route=route;result.profileName=profileName(requested.platform,role,{runtimePlatforms});
   if(route==='bridge'&&allowedPathsCoverControl(assignment.allowedPaths??[])){result.reasons=[reason('permission_scope_unverified')];return;}
   const capabilities=capabilityReasons({hostPlatform:host,targetPlatform:requested.platform,route,runtimePlatforms});
   if(capabilities.length){result.reasons=capabilities.map(reason);return;}
   await pruneTerminalLeases(anchorHome,{now,retentionMs:policy.leaseRetentionMs,runtimePlatforms});
   const {cli,authentication}=await authenticate(requested.platform,context,policy);
   result.authentication=authentication;
   if(authentication.status!=='Available'&&!(runtimePlatforms.getPlatform(requested.platform).auth.kind==='none'&&authentication.authStatus==='unknown'&&authentication.reason==='auth_unverified'))codes.add(authentication.status??'Incomplete');
   if(route==='bridge'){
    result.cliVersion=await versionOf(cli,policy);
   }
   for(const code of environmentReasons(environment,policy))codes.add(code);
   const leases=await listLeases(anchorHome,{runtimePlatforms});
   const live=leases.filter(lease=>NON_TERMINAL_STATES.includes(lease.state));
   if(leases.some(lease=>lease.requestId===assignment.requestId)||live.some(lease=>lease.workflowId===context.workflowId&&lease.taskId===assignment.taskId&&lease.role===role)){duplicate=true;codes.add('duplicate_dispatch');}
   for(const code of hostGateReasons({hostPlatform:host,policy}))codes.add(code);
   if(route==='bridge'){
    let limits;try{limits=readHostLimits(resolveConfigHome(host,context));}catch{codes.add('activation_unverified');}
    if(limits){
     const bridges=leases.filter(lease=>lease.route==='bridge');
     if(bridges.filter(lease=>NON_TERMINAL_STATES.includes(lease.state)).length>=limits.maxConcurrent||bridges.filter(lease=>lease.workflowId===context.workflowId).length>=limits.maxTotal)codes.add('capacity_exhausted');
    }
    if(Object.hasOwn(HOST_SANDBOX_GATES,host)){
     const probe=await probeHomeWritable(homes[requested.platform]);
     if(!probe.ok){
      codes.add(probe.code);
      if(probe.residualPaths)result.residualPaths=probe.residualPaths;
     }
    }
    for(const code of bridgeGateReasons({platform:requested.platform,role,hostPlatform:host,policy}))codes.add(code);
   }
   result.reasons=[...codes].map(reason);
   if(codes.size){result.decision=duplicate?'deny':'hold';return;}
   const claims=initialClaims(route,policy,requested),iso=new Date(now).toISOString(),dispatchId=crypto.randomUUID();
   const lease=await createLease(anchorHome,{version:2,targetPlatform:route==='native'?host:requested.platform,dispatchId,workflowId:context.workflowId,taskId:assignment.taskId,requestId:assignment.requestId,role,route,hostPlatform:host,executionEnvironment:environment,revision:config.revision,profileHash:await readProfileHash(homes[requested.platform],role),argsDigest:null,state:'reserved',supervisor:null,child:null,sessionId:route==='bridge'&&(requested.platform==='gemini'||requested.platform==='grok')?crypto.randomUUID():null,timeoutMinutes:policy.roleTimeoutMinutes[role],claims,reasons:[],allowedPaths:assignment.allowedPaths??[],resultPath:null,segment:0,nativeAgentId:null,createdAt:iso,updatedAt:iso},{runtimePlatforms,config});
   Object.assign(result,{decision:'allow',routeStatus:'reserved',dispatchId:lease.dispatchId,claims});
  },{retryMs:policy.lockRetryMs});
 }catch(error){
  if(error?.code==='ARC_ROUTING_LOCK_RELEASE'&&!error.failure&&result.decision==='allow'){
   // The lease was written but lock ownership could not be verified: report it as held and keep the id for inspection.
   {const base=reason('activation_unverified');Object.assign(result,{decision:'hold',routeStatus:'held',claims:null,reasons:[result.dispatchId?{...base,releaseCondition:`${base.releaseCondition} Reserved dispatch ${result.dispatchId} remains reserved and must be cleaned up with cancel (native or bridge route).`}:base]});}
  }else{
   Object.assign(result,{decision:'hold',routeStatus:'held',dispatchId:null,claims:null,reasons:[reason(classify(error))]});
  }
  const residual=residualOf(error);if(residual)result.residualPaths=[...(result.residualPaths??[]),...residual];
 }
 return result;
}

/** Denial for requests whose keys do not match the documented set. */
export function invalidRoutingRequest(context){
 const host=hostOf(context);
 return {...blankResult(host,environmentOf(context,host),null),decision:'deny',reasons:[reason('invalid_request')]};
}
