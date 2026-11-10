import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {COOPERATIVE_RUNTIME_MODULES, cooperativeVersions} from './bootstrap.mjs';
import {inspectPath} from './scope.mjs';
import {resolveConfigHome, resolveLocalCli, probePlatformAuth, probeCliVersion} from './local-cli.mjs';
import {ROUTING_ROLES, parseRoleRoutingConfig} from './role-routing-config.mjs';
import {DEFAULT_POLICY, reason, profileName, revisionTag, bridgeGateReasons, environmentReasons, initialClaims} from './role-dispatch-policy.mjs';
import {NON_TERMINAL_STATES, createLease, listLeases, pruneTerminalLeases, readHostLimits} from './role-dispatch-store.mjs';

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
export async function readActivation(homes,expectedRevision){
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


const HOST_ERRORS=['EACCES','EPERM','EROFS'];
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
const hostOf=context=>['codex','claude'].includes(context?.hostPlatform)?context.hostPlatform:null;
const environmentOf=(context,host)=>['codex-cli','claude-cli','codex-desktop','claude-desktop'].includes(context?.executionEnvironment)&&host&&context.executionEnvironment.startsWith(`${host}-`)?context.executionEnvironment:null;
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
async function authenticate(platform,context,policy){
 const cli=resolveLocalCli(platform,context);
 if(cli.reason)return {cli:null,authentication:{status:cli.reason==='cli_not_found'?'Not Avaliable':'Incomplete',reason:cli.reason}};
 const auth=await probePlatformAuth(cli,{timeoutMs:policy.probeTimeoutMs});
 return {cli,authentication:{status:auth.authStatus==='authenticated'?'Avaliable':auth.authStatus==='unauthorized'?'Unauthorized':'Incomplete',...(auth.reason?{reason:auth.reason}:{})}};
}
const versionOf=(cli,policy)=>cli?probeCliVersion(cli,{timeoutMs:policy.probeTimeoutMs,policy}):{version:null,supported:false,reason:'cli_not_found'};
async function readRevision(homes){
 const bytes=await readStable(path.join(homes.codex,'arc-role-platform-routing.json'),[]);
 return parseRoleRoutingConfig(bytes.toString('utf8')).revision;
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
 let homes;
 try{homes={codex:resolveConfigHome('codex',context),claude:resolveConfigHome('claude',context)};}
 catch{result.reasons=[reason('activation_unverified')];return result;}
 try{
  await withRoutingLock(homes.codex,async()=>{
   result.pruned=await pruneTerminalLeases(homes.codex,{now,retentionMs:policy.leaseRetentionMs});
   let config;try{config=await readActivation(homes,await readRevision(homes));}catch{result.reasons=[reason('activation_unverified')];return;}
   result.revision=config.revision;result.roles={};
   for(const role of ROUTING_ROLES){const requested=config.roles[role];result.roles[role]={route:requested.platform===host?'native':'bridge',platform:requested.platform,model:requested.model,effort:requested.effort,profileName:profileName(requested.platform,role),revisionTag:revisionTag(config.revision)};}
   result.platforms={};
   for(const platform of ['codex','claude'].filter(name=>name===host||ROUTING_ROLES.some(role=>config.roles[role].platform===name))){
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
 const codes=new Set();let duplicate=false,homes;
 try{homes={codex:resolveConfigHome('codex',context),claude:resolveConfigHome('claude',context)};}
 catch{result.reasons=[reason('activation_unverified')];return result;}
 try{
  await withRoutingLock(homes.codex,async()=>{
   await pruneTerminalLeases(homes.codex,{now,retentionMs:policy.leaseRetentionMs});
   let config;try{config=await readActivation(homes,expectedRevision);}catch{result.reasons=[reason('activation_unverified')];return;}
   const requested=config.roles[role],route=requested.platform===host?'native':'bridge';
   result.requested={...requested};result.route=route;result.profileName=profileName(requested.platform,role);
   const {cli,authentication}=await authenticate(requested.platform,context,policy);
   result.authentication=authentication;
   if(authentication.status!=='Avaliable')codes.add(authentication.status);
   if(route==='bridge'){
    result.cliVersion=await versionOf(cli,policy);
    if(cli&&!result.cliVersion.supported)codes.add('permission_scope_unverified');
   }
   for(const code of environmentReasons(environment,policy))codes.add(code);
   const leases=await listLeases(homes.codex);
   const live=leases.filter(lease=>NON_TERMINAL_STATES.includes(lease.state));
   if(leases.some(lease=>lease.requestId===assignment.requestId)||live.some(lease=>lease.workflowId===context.workflowId&&lease.taskId===assignment.taskId&&lease.role===role)){duplicate=true;codes.add('duplicate_dispatch');}
   if(route==='bridge'){
    let limits;try{limits=readHostLimits(resolveConfigHome(host,context));}catch{codes.add('activation_unverified');}
    if(limits){
     const bridges=leases.filter(lease=>lease.route==='bridge');
     if(bridges.filter(lease=>NON_TERMINAL_STATES.includes(lease.state)).length>=limits.maxConcurrent||bridges.filter(lease=>lease.workflowId===context.workflowId).length>=limits.maxTotal)codes.add('capacity_exhausted');
    }
    for(const code of bridgeGateReasons({platform:requested.platform,role,hostPlatform:host,policy}))codes.add(code);
   }
   result.reasons=[...codes].map(reason);
   if(codes.size){result.decision=duplicate?'deny':'hold';return;}
   const claims=initialClaims(route,policy,requested),iso=new Date(now).toISOString(),dispatchId=crypto.randomUUID();
   const lease=await createLease(homes.codex,{version:1,dispatchId,workflowId:context.workflowId,taskId:assignment.taskId,requestId:assignment.requestId,role,route,hostPlatform:host,executionEnvironment:environment,revision:config.revision,profileHash:await readProfileHash(homes[requested.platform],role),argsDigest:null,state:'reserved',supervisor:null,child:null,sessionId:null,timeoutMinutes:policy.roleTimeoutMinutes[role],claims,reasons:[],allowedPaths:assignment.allowedPaths??[],resultPath:null,segment:0,nativeAgentId:null,createdAt:iso,updatedAt:iso});
   Object.assign(result,{decision:'allow',routeStatus:'reserved',dispatchId:lease.dispatchId,claims});
  },{retryMs:policy.lockRetryMs});
 }catch(error){
  if(error?.code==='ARC_ROUTING_LOCK_RELEASE'&&!error.failure&&result.decision==='allow'){
   // The lease was written but lock ownership could not be verified: report it as held and keep the id for inspection.
   {const base=reason('activation_unverified');Object.assign(result,{decision:'hold',routeStatus:'held',claims:null,reasons:[result.dispatchId?{...base,releaseCondition:`${base.releaseCondition} Reserved dispatch ${result.dispatchId} remains reserved and must be cleaned up with cancel.`}:base]});}
  }else{
   Object.assign(result,{decision:'hold',routeStatus:'held',dispatchId:null,claims:null,reasons:[reason(classify(error))]});
  }
  const residual=residualOf(error);if(residual)result.residualPaths=residual;
 }
 return result;
}

/** Denial for requests whose keys do not match the documented set. */
export function invalidRoutingRequest(context){
 const host=hostOf(context);
 return {...blankResult(host,environmentOf(context,host),null),decision:'deny',reasons:[reason('invalid_request')]};
}
