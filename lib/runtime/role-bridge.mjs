// A caller's JSON, local hook or child process ID cannot authorize execution.
// run-dispatch only asks the supervisor (the sole child spawner) to start; observe reads and records state under the routing lock.
import fsp from 'node:fs/promises';
import path from 'node:path';
import {DEFAULT_POLICY, reason, profileName, bridgeGateReasons, environmentReasons} from './role-dispatch-policy.mjs';
import {readLease, writeLease, listLeases, readHostLimits, NON_TERMINAL_STATES, readHeartbeat, requestCancel, clearCancel, TERMINAL_STATES} from './role-dispatch-store.mjs';
import {withRoutingLock, readActivation, readRevision, authenticate, versionOf} from './role-routing.mjs';
import {resolveConfigHome} from './local-cli.mjs';
import {startSupervisor, processAlive, resolveWorktree, artifactDirectory, segmentDirectory, buildBridgeInvocation} from './role-supervisor.mjs';

export const heldRoutingResult=(code,releaseCondition)=>({decision:'hold',routeStatus:'held',supportStatus:'unverified',route:null,executionEnvironment:null,hostPlatform:null,role:null,requested:null,authentication:null,reasons:[{code,releaseCondition}]});

const ID=/^[A-Za-z0-9._-]{1,128}$/;
const NATIVE_EVENTS={started:['reserved','running'],completed:['running','completed'],failed:['running','failed'],cancelled:['running','cancelled']};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const hostOf=context=>['codex','claude'].includes(context?.hostPlatform)?context.hostPlatform:null;
const environmentOf=(context,host)=>['codex-cli','claude-cli','codex-desktop','claude-desktop'].includes(context?.executionEnvironment)&&host&&context.executionEnvironment.startsWith(`${host}-`)?context.executionEnvironment:null;
const validContext=context=>{const host=hostOf(context);return Boolean(host&&environmentOf(context,host)&&typeof context.workflowId==='string'&&context.workflowId&&typeof context.cwd==='string');};
const blank=(context,dispatchId,decision,code)=>({decision,routeStatus:'held',supportStatus:'unverified',dispatchId:typeof dispatchId==='string'&&ID.test(dispatchId)?dispatchId:null,route:null,profileName:null,executionEnvironment:context?.executionEnvironment??null,hostPlatform:context?.hostPlatform??null,role:null,requested:null,authentication:null,cliVersion:null,claims:null,reasons:[reason(code)]});
const bridgeTarget=lease=>lease.route==='native'?lease.hostPlatform:lease.hostPlatform==='codex'?'claude':'codex';
const supportOf=lease=>lease.route==='bridge'&&lease.state==='completed'&&lease.reasons.length===0&&['identity','model','effort','permissions','terminal'].every(key=>lease.claims?.[key]?.level==='runtime-observed')?'verified':'unverified';
/** Result view of a lease. failed and unknown hold dependent work; every other observed state is reported as allow. */
function fromLease(lease,decision=['failed','unknown'].includes(lease.state)?'hold':'allow'){
 const platform=bridgeTarget(lease);
 return {decision,routeStatus:lease.state,supportStatus:supportOf(lease),dispatchId:lease.dispatchId,route:lease.route,profileName:profileName(platform,lease.role),executionEnvironment:lease.executionEnvironment,hostPlatform:lease.hostPlatform,role:lease.role,requested:{platform,model:lease.claims?.model?.requested??null,effort:lease.claims?.effort?.requested??null},authentication:null,cliVersion:null,claims:lease.claims,reasons:lease.reasons,resultPath:lease.resultPath};
}
const homesOf=context=>({codex:resolveConfigHome('codex',context),claude:resolveConfigHome('claude',context)});
const residualOf=error=>Array.isArray(error?.residualPaths)?error.residualPaths:undefined;
const hold=(context,dispatchId,code,error)=>{const result=blank(context,dispatchId,'hold',code);const residual=residualOf(error);if(residual)result.residualPaths=residual;return result;};
const classifyLock=error=>{const code=error?.code==='ARC_ROUTING_LOCK_RELEASE'&&error.failure?error.failure.code:error?.code;return code==='ARC_HOST_SANDBOX'?'host_sandbox_blocked':'activation_unverified';};

/** Starts the detached supervisor for a reserved bridge lease; the supervisor, not this function, spawns the child. */
export async function runBridgeDispatch({context,dispatchId,brief,now=Date.now(),policy=DEFAULT_POLICY,startSupervisor:starter=startSupervisor}={}){
 if(!validContext(context)||typeof dispatchId!=='string'||!ID.test(dispatchId)||dispatchId.startsWith('.')||typeof brief!=='string'){return blank(context,dispatchId,'deny','invalid_request');}
 const bytes=Buffer.byteLength(brief,'utf8');
 if(bytes<1||bytes>policy.briefMaxBytes)return blank(context,dispatchId,'deny','invalid_request');
 let homes,result,residual;
 try{homes=homesOf(context);}catch{return blank(context,dispatchId,'hold','activation_unverified');}
 try{
  await withRoutingLock(homes.codex,async()=>{
   const lease=await readLease(homes.codex,dispatchId);
   if(!lease||lease.workflowId!==context.workflowId||lease.hostPlatform!==context.hostPlatform||lease.route!=='bridge'||lease.state!=='reserved'){result=blank(context,dispatchId,'deny','invalid_request');return;}
   let config;try{config=await readActivation(homes,lease.revision);}catch{result=blank(context,dispatchId,'hold','activation_unverified');return;}
   let target;try{target=await resolveWorktree(context.cwd);}catch{result=blank(context,dispatchId,'hold','activation_unverified');return;}
   const directory=artifactDirectory(target,lease.workflowId,dispatchId),resultPath=path.join(directory,'result.md');
   let invocation;try{invocation=await buildBridgeInvocation({lease,config,homes,worktree:target.realpath,resultPath,policy});}catch(error){result=blank(context,dispatchId,'hold',error.reasonCode??'activation_unverified');return;}
   await fsp.mkdir(directory,{recursive:true,mode:0o700});await fsp.chmod(directory,0o700);
   await fsp.writeFile(path.join(directory,'brief.md'),brief,{mode:0o600,flag:'w'});await fsp.chmod(path.join(directory,'brief.md'),0o600);
   let supervisor;
   try{supervisor=await starter({codexHome:homes.codex,dispatchId,cwd:target.realpath,userHome:context.userHome,env:context.env??process.env});}
   catch{result=blank(context,dispatchId,'hold','host_sandbox_blocked');return;}
   const next=await writeLease(homes.codex,{...lease,state:'starting',supervisor,argsDigest:invocation.argsDigest,resultPath},{now});
   result=fromLease(next,'allow');
  },{retryMs:policy.lockRetryMs});
 }catch(error){
  if(error?.code==='ARC_ROUTING_LOCK_RELEASE'&&!error.failure&&result){residual=residualOf(error);}
  else return hold(context,dispatchId,classifyLock(error),error);
 }
 if(residual)result.residualPaths=residual;
 return result;
}

const TEXT=/^[^\p{Cc}]{1,256}$/u;
async function markLostIfDue(homes,lease,{now,lostMs,policy}){
 if(!['starting','running'].includes(lease.state)||!lease.supervisor)return lease;
 const heartbeat=await readHeartbeat(homes.codex,lease.dispatchId);
 const lastSeen=Math.max(heartbeat?.at??0,Date.parse(lease.updatedAt)||0);
 if(now-lastSeen<=lostMs||processAlive(lease.supervisor))return lease;
 try{
  return await withRoutingLock(homes.codex,async()=>{
   const current=await readLease(homes.codex,lease.dispatchId);
   if(!current||!['starting','running'].includes(current.state))return current??lease;
   return writeLease(homes.codex,{...current,state:'unknown',claims:{...(current.claims??{}),terminal:{level:'unverified',source:'none'}},reasons:[reason('terminal_state_unverified')]},{now});
  },{retryMs:policy.lockRetryMs});
 }catch{return lease;}// a busy lock only delays the transition; the next observe retries it
}
async function recordNativeEvent({context,homes,dispatchId,event,nativeAgentId,now,policy}){
 let result;
 try{
  await withRoutingLock(homes.codex,async()=>{
   const lease=await readLease(homes.codex,dispatchId);
   const rule=NATIVE_EVENTS[event];
   if(!lease||lease.route!=='native'||lease.workflowId!==context.workflowId||lease.state!==rule[0]||(event==='started')!==(nativeAgentId!==undefined)){result=blank(context,dispatchId,'deny','invalid_request');return;}
   const attested={level:'operator-attested',source:'orchestrator'};
   const claims={...lease.claims,...(event==='started'?{identity:{...attested,observed:nativeAgentId}}:{terminal:{...attested,observed:event}})};
   const next=await writeLease(homes.codex,{...lease,state:rule[1],claims,nativeAgentId:nativeAgentId??lease.nativeAgentId,reasons:event==='failed'?[reason('execution_failed')]:[]},{now});
   result=fromLease(next);
  },{retryMs:policy.lockRetryMs});
 }catch(error){return hold(context,dispatchId,classifyLock(error),error);}
 return result;
}

/** bridge: waits up to waitMs for a state change and marks a lost supervisor unknown. native: records operator events. */
export async function recordRoleObservation({context,dispatchId,waitMs,event,nativeAgentId,now,lostMs,pollMs=500,policy=DEFAULT_POLICY}={}){
 if(!validContext(context)||typeof dispatchId!=='string'||!ID.test(dispatchId)||dispatchId.startsWith('.'))return blank(context,dispatchId,'deny','invalid_request');
 if(waitMs!==undefined&&(!Number.isInteger(waitMs)||waitMs<0||waitMs>policy.observeMaxWaitMs))return blank(context,dispatchId,'deny','invalid_request');
 if(event!==undefined&&!Object.hasOwn(NATIVE_EVENTS,event))return blank(context,dispatchId,'deny','invalid_request');
 if(nativeAgentId!==undefined&&(typeof nativeAgentId!=='string'||!TEXT.test(nativeAgentId)))return blank(context,dispatchId,'deny','invalid_request');
 let homes,lease;
 try{homes=homesOf(context);lease=await readLease(homes.codex,dispatchId);}catch{return blank(context,dispatchId,'hold','activation_unverified');}
 if(!lease||lease.workflowId!==context.workflowId||lease.hostPlatform!==context.hostPlatform)return blank(context,dispatchId,'deny','invalid_request');
 if(lease.route==='native'){
  if(waitMs!==undefined||event===undefined)return blank(context,dispatchId,'deny','invalid_request');
  return recordNativeEvent({context,homes,dispatchId,event,nativeAgentId,now:now??Date.now(),policy});
 }
 if(event!==undefined||nativeAgentId!==undefined)return blank(context,dispatchId,'deny','invalid_request');
 const initial=lease.state,end=Date.now()+(waitMs??0),lost=lostMs??policy.supervisorLostMs;
 try{
  for(;;){
   lease=await markLostIfDue(homes,lease,{now:now??Date.now(),lostMs:lost,policy});
   if(lease.state!==initial||TERMINAL_STATES.includes(lease.state)||Date.now()>=end)return fromLease(lease);
   await sleep(Math.min(pollMs,Math.max(0,end-Date.now())));
   lease=await readLease(homes.codex,dispatchId)??lease;
  }
 }catch{return blank(context,dispatchId,'hold','activation_unverified');}
}

/** Continues a completed or failed bridge dispatch in its recorded session. The input carries no session id; only the lease value is used. */
export async function resumeRoleDispatch({context,dispatchId,brief,now=Date.now(),policy=DEFAULT_POLICY,startSupervisor:starter=startSupervisor}={}){
 if(!validContext(context)||typeof dispatchId!=='string'||!ID.test(dispatchId)||dispatchId.startsWith('.')||typeof brief!=='string'){return blank(context,dispatchId,'deny','invalid_request');}
 const bytes=Buffer.byteLength(brief,'utf8');
 if(bytes<1||bytes>policy.briefMaxBytes)return blank(context,dispatchId,'deny','invalid_request');
 let homes,result,residual;
 try{homes=homesOf(context);}catch{return blank(context,dispatchId,'hold','activation_unverified');}
 try{
  await withRoutingLock(homes.codex,async()=>{
   const lease=await readLease(homes.codex,dispatchId);
   if(!lease||lease.workflowId!==context.workflowId||lease.hostPlatform!==context.hostPlatform||lease.route!=='bridge'||!['completed','failed'].includes(lease.state)){result=blank(context,dispatchId,'deny','invalid_request');return;}
   if(!lease.sessionId){result=blank(context,dispatchId,'hold','execution_identity_unverified');return;}
   let config;
   try{config=await readActivation(homes,lease.revision);}
   catch{
    let active=null;try{active=await readRevision(homes);}catch{/* unreadable activation stays unverified */}
    result=blank(context,dispatchId,'hold',active!==null&&active!==lease.revision?'revision_changed':'activation_unverified');return;
   }
   const requested=config.roles[lease.role],platform=requested.platform,codes=new Set();
   const {cli,authentication}=await authenticate(platform,context,policy);
   if(authentication.status!=='Avaliable')codes.add(authentication.status);
   const version=await versionOf(cli,policy);
   if(cli&&!version.supported)codes.add('permission_scope_unverified');
   for(const code of environmentReasons(context.executionEnvironment,policy))codes.add(code);
   for(const code of bridgeGateReasons({platform,role:lease.role,hostPlatform:context.hostPlatform,policy}))codes.add(code);
   // The dispatch itself is terminal here, so only other non-terminal bridge leases occupy slots. The workflow total is not increased by a follow-up segment.
   let limits;try{limits=readHostLimits(homes[context.hostPlatform]);}catch{codes.add('activation_unverified');}
   if(limits&&(await listLeases(homes.codex)).filter(item=>item.route==='bridge'&&NON_TERMINAL_STATES.includes(item.state)).length+1>limits.maxConcurrent)codes.add('capacity_exhausted');
   if(codes.size){result=blank(context,dispatchId,'hold','activation_unverified');result.reasons=[...codes].map(reason);return;}
   let target;try{target=await resolveWorktree(context.cwd);}catch{result=blank(context,dispatchId,'hold','activation_unverified');return;}
   const segment=lease.segment+1,directory=segmentDirectory(target,lease.workflowId,dispatchId,segment),resultPath=path.join(directory,'result.md');
   let invocation;try{invocation=await buildBridgeInvocation({lease:{...lease,segment},config,homes,worktree:target.realpath,resultPath,policy});}catch(error){result=blank(context,dispatchId,'hold',error.reasonCode??'activation_unverified');return;}
   await fsp.mkdir(directory,{recursive:true,mode:0o700});await fsp.chmod(path.dirname(directory),0o700);await fsp.chmod(directory,0o700);
   await fsp.writeFile(path.join(directory,'brief.md'),brief,{mode:0o600,flag:'w'});await fsp.chmod(path.join(directory,'brief.md'),0o600);
   await clearCancel(homes.codex,dispatchId);
   let supervisor;
   try{supervisor=await starter({codexHome:homes.codex,dispatchId,cwd:target.realpath,userHome:context.userHome,env:context.env??process.env});}
   catch{result=blank(context,dispatchId,'hold','host_sandbox_blocked');return;}
   const claims=lease.claims?{...lease.claims,terminal:{level:'unverified',source:'none'}}:null;
   const next=await writeLease(homes.codex,{...lease,state:'starting',supervisor,child:null,argsDigest:invocation.argsDigest,resultPath,segment,claims,reasons:[]},{now});
   result={...fromLease(next,'allow'),segment};
  },{retryMs:policy.lockRetryMs});
 }catch(error){
  if(error?.code==='ARC_ROUTING_LOCK_RELEASE'&&!error.failure&&result){residual=residualOf(error);}
  else return hold(context,dispatchId,classifyLock(error),error);
 }
 if(residual)result.residualPaths=residual;
 return result;
}

const groupExists=pid=>{try{process.kill(-pid,0);return true;}catch(error){return error.code!=='ESRCH';}};
const pidExists=pid=>{try{process.kill(pid,0);return true;}catch(error){return error.code!=='ESRCH';}};
const signalGroup=(pid,signal)=>{try{process.kill(-pid,signal);}catch{/* group already gone */}};
/** Reserved leases have no child and are cleaned up at once. A live supervisor receives a cancel marker and records cancelled itself after observing the exit. An unknown lease (or one whose supervisor is gone) is stopped here only for a process identified by pid and start time, and cancelled only after the group is observed gone. */
export async function cancelRoleDispatch({context,dispatchId,now=Date.now(),policy=DEFAULT_POLICY}={}){
 if(!validContext(context)||typeof dispatchId!=='string'||!ID.test(dispatchId)||dispatchId.startsWith('.'))return blank(context,dispatchId,'deny','invalid_request');
 let homes,result,direct=null,residual;
 try{homes=homesOf(context);}catch{return blank(context,dispatchId,'hold','activation_unverified');}
 const graceMs=policy.cancelGraceMs;
 try{
  await withRoutingLock(homes.codex,async()=>{
   const lease=await readLease(homes.codex,dispatchId);
   if(!lease||lease.workflowId!==context.workflowId||lease.hostPlatform!==context.hostPlatform||lease.route!=='bridge'){result=blank(context,dispatchId,'deny','invalid_request');return;}
   if(TERMINAL_STATES.includes(lease.state)){result=fromLease(lease,'allow');return;}
   if(lease.state==='reserved'){result=fromLease(await writeLease(homes.codex,{...lease,state:'cancelled',reasons:[]},{now}),'allow');return;}
   const supervised=['starting','running'].includes(lease.state)&&lease.supervisor&&processAlive(lease.supervisor);
   if(supervised){
    await requestCancel(homes.codex,dispatchId);
    if(lease.child&&processAlive(lease.child))signalGroup(lease.child.pid,'SIGTERM');
    result={...fromLease(lease,'allow'),routeStatus:'cancelling'};return;
   }
   if(lease.child&&processAlive(lease.child)){signalGroup(lease.child.pid,'SIGTERM');direct={lease,identified:true};}
   else if(lease.child&&!groupExists(lease.child.pid)&&!pidExists(lease.child.pid))direct={lease,identified:false};
   else result=fromLease(lease,'hold');
  },{retryMs:policy.lockRetryMs});
 }catch(error){
  if(error?.code==='ARC_ROUTING_LOCK_RELEASE'&&!error.failure&&(result||direct)){residual=residualOf(error);}
  else return hold(context,dispatchId,classifyLock(error),error);
 }
 if(direct){
  const pid=direct.lease.child.pid,begin=Date.now();let killed=false,gone=!groupExists(pid);
  while(!gone&&Date.now()<begin+2*graceMs){
   if(!killed&&Date.now()>=begin+graceMs){signalGroup(pid,'SIGKILL');killed=true;}
   await sleep(25);gone=!groupExists(pid);
  }
  if(!gone)result=fromLease(direct.lease,'hold');
  else{
   try{
    await withRoutingLock(homes.codex,async()=>{
     const current=await readLease(homes.codex,dispatchId);
     if(!current||TERMINAL_STATES.includes(current.state)||current.child?.pid!==pid){result=current?fromLease(current,'allow'):blank(context,dispatchId,'deny','invalid_request');return;}
     const claims={...(current.claims??{}),terminal:{level:'runtime-observed',source:'cancel-group-gone',observed:{pid}}};
     result=fromLease(await writeLease(homes.codex,{...current,state:'cancelled',claims,reasons:[]},{now:Date.now()}),'allow');
    },{retryMs:policy.lockRetryMs});
   }catch(error){
    if(error?.code==='ARC_ROUTING_LOCK_RELEASE'&&!error.failure&&result){residual=residualOf(error);}
    else return hold(context,dispatchId,classifyLock(error),error);
   }
  }
 }
 if(residual)result.residualPaths=residual;
 return result;
}
