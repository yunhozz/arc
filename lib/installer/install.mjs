import {inspectPath,sameObjectIdentity} from './targets.mjs';
import {validatePlanSet} from './plan.mjs';
import {recoverTargetStages} from './recovery.mjs';
import {assertPlanSnapshot,applyTransaction,rebaseCommittedLinkDependencies} from './transaction.mjs';
function pending(plan){return{platform:plan.target.platform,status:'not-started',rollback:'not-needed',backupPath:null,recoveryPaths:[],error:null};}
export async function installTargets(plans,{safeFs,acquisition,signal,hooks={}}){
 const ordered=[...plans].sort((a,b)=>(a.target.platform==='codex'?0:1)-(b.target.platform==='codex'?0:1));const results=ordered.map(pending);let interrupted=false;const committed=[];
 let invalid=false;
 for(let index=0;index<ordered.length;index++){
  try{validatePlanSet([ordered[index]]);assertPlanSnapshot(ordered[index],{safeFs});}catch(error){results[index]={...results[index],status:'failed',error};invalid=true;}
 }
 for(let first=0;first<ordered.length;first++)for(let second=first+1;second<ordered.length;second++){
  if(results[first].status==='failed'||results[second].status==='failed')continue;
  try{validatePlanSet([ordered[first],ordered[second]]);}catch(error){results[first]={...results[first],status:'failed',error};results[second]={...results[second],status:'failed',error};invalid=true;}
 }
 if(invalid)return{results,interrupted};
 if(!signal?.aborted){
  for(let index=0;index<ordered.length;index++){try{results[index].recoveryPaths=recoverTargetStages(ordered[index].target,{safeFs});}catch(error){results[index]={...results[index],status:'failed',error,recoveryPaths:[...results[index].recoveryPaths,...(error.recoveryPaths??[])]};return{results,interrupted};}}
  // Recovery changes only these parent directories. Revalidate every other
  // snapshot entry before refreshing their metadata, retaining link dependencies.
  const changed=new Set(ordered.flatMap(plan=>results.find(result=>result.platform===plan.target.platform).recoveryPaths.length?[plan.target.home,...['skills','agents','backups'].map(name=>plan.target.home+'/'+name)]:[]));
  for(let index=0;index<ordered.length;index++){const plan=ordered[index];try{assertPlanSnapshot({...plan,snapshot:new Map([...plan.snapshot].filter(([name])=>!changed.has(name)))},{safeFs});const next=new Map(plan.snapshot);for(const name of changed){if(!plan.snapshot.has(name))continue;const fresh=new Map();inspectPath(safeFs,name,{kind:'directory',snapshot:fresh});const expected=plan.snapshot.get(name),actual=fresh.get(name);if(expected&&!sameObjectIdentity(expected,actual??{}))throw Object.assign(Error('Recovery parent identity changed: '+name),{code:'ARC_INSTALL_DRIFT'});for(const entry of fresh)next.set(...entry);}plan.snapshot=next;assertPlanSnapshot(plan,{safeFs});}catch(error){results[index]={...results[index],status:'failed',error};return{results,interrupted};}}
 }
 for(let index=0;index<ordered.length;index++){
  const plan=ordered[index];if(signal?.aborted){interrupted=true;break;}
  let acquired,failed=false;
  try{
   for(const previous of committed)rebaseCommittedLinkDependencies(plan,previous.plan,previous.installed,{safeFs});
   hooks.fault?.({phase:'before-acquisition',plan});assertPlanSnapshot(plan,{safeFs});
   acquired=await acquisition(plan,{signal});
   hooks.fault?.({phase:'after-acquisition',plan});assertPlanSnapshot(plan,{safeFs});
   const installed=applyTransaction(plan,{safeFs,acquired,signal,hooks});
   results[index]={...results[index],status:'installed',backupPath:installed.backupRoot,error:installed.cleanupError??null,recoveryPaths:[...results[index].recoveryPaths,...(installed.recoveryPaths??[])]};committed.push({plan,installed});if(installed.cleanupError)failed=true;
  }catch(error){const cancelled=signal?.aborted||error.code==='ARC_ACQUISITION_CANCELLED'||error.code==='ARC_INSTALL_CANCELLED';interrupted=Boolean(cancelled);results[index]={...results[index],status:'failed',rollback:error.rollback??'not-needed',backupPath:error.backupRoot??null,recoveryPaths:[...results[index].recoveryPaths,...(error.recoveryPaths??[])],error};failed=true;}finally{if(acquired?.dispose){try{const disposal=await acquired.dispose();if(disposal?.recoveryPaths)results[index].recoveryPaths=[...new Set([...results[index].recoveryPaths,...disposal.recoveryPaths])];}catch(cleanup){const result=results[index];result.error=result.error?new AggregateError([result.error,cleanup],'Installation and acquisition cleanup reported failures'):cleanup;result.recoveryPaths=[...new Set([...result.recoveryPaths,...(cleanup.recoveryPaths??[acquired.work])])];failed=true;}}}
  if(failed)break;
 }
 return{results,interrupted};
}
