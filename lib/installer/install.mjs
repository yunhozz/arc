import {validatePlanSet} from './plan.mjs';
import {assertPlanSnapshot,applyTransaction} from './transaction.mjs';
function pending(plan){return{platform:plan.target.platform,status:'not-started',rollback:'not-needed',residualPaths:[],error:null};}
export async function installTargets(plans,{safeFs,signal,hooks={}}){
 const ordered=[...plans].sort((a,b)=>(a.target.platform==='codex'?0:1)-(b.target.platform==='codex'?0:1));const results=ordered.map(pending);let interrupted=false;
 let invalid=false;
 for(let index=0;index<ordered.length;index++){
  try{validatePlanSet([ordered[index]]);assertPlanSnapshot(ordered[index],{safeFs});}catch(error){results[index]={...results[index],status:'failed',error};invalid=true;}
 }
 for(let first=0;first<ordered.length;first++)for(let second=first+1;second<ordered.length;second++){
  if(results[first].status==='failed'||results[second].status==='failed')continue;
  try{validatePlanSet([ordered[first],ordered[second]]);}catch(error){results[first]={...results[first],status:'failed',error};results[second]={...results[second],status:'failed',error};invalid=true;}
 }
 if(invalid)return{results,interrupted};
 for(let index=0;index<ordered.length;index++){
  const plan=ordered[index];if(signal?.aborted){interrupted=true;break;}
  let failed=false;
  try{
   assertPlanSnapshot(plan,{safeFs});
   const installed=applyTransaction(plan,{safeFs,signal,hooks});
   results[index]={...results[index],status:'installed',error:installed.cleanupError??null,residualPaths:[...results[index].residualPaths,...(installed.residualPaths??[])]};if(installed.cleanupError)failed=true;
  }catch(error){const cancelled=signal?.aborted||error.code==='ARC_INSTALL_CANCELLED';interrupted=Boolean(cancelled);results[index]={...results[index],status:'failed',rollback:error.rollback??'not-needed',residualPaths:[...results[index].residualPaths,...(error.residualPaths??[])],error};failed=true;}
  if(failed)break;
 }
 return{results,interrupted};
}
