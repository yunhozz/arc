import path from 'node:path';
import {inspectPath} from './targets.mjs';
import {validatePlanSet} from './plan.mjs';
import {removeManagedBlock} from './global-config.mjs';
export function buildUninstallPlan({target,safeFs,skipGlobal=false}){
 const snapshot=new Map(),removals=[],managedPaths=[path.join(target.home,'skills/arc'),...target.profileNames.map(name=>path.join(target.home,'agents',name))],globalChanges=[];
 for(const filename of managedPaths){const directory=filename===managedPaths[0];const found=inspectPath(safeFs,filename,{kind:directory?'directory':'file',tree:directory,snapshot});if(found.exists)removals.push(filename);}
 if(!skipGlobal){const filename=target.instructionPath??target.globalPaths[0],found=inspectPath(safeFs,filename,{kind:'file',read:true,snapshot});managedPaths.push(filename);if(found.exists){const removed=removeManagedBlock(found.bytes);if(removed.changed)globalChanges.push({path:filename,content:removed.content});}}
 return{target,skipGlobal,snapshot,removals,managedPaths,externalPaths:[],globalChanges,summary:[target.platform==='codex'?'Codex config.toml wait settings and native concurrency key are preserved.':'Claude settings.json native concurrency key is preserved.']};
}
import {assertPlanSnapshot,applyUninstallTransaction} from './transaction.mjs';
export async function uninstallTargets(plans,{safeFs,signal,hooks={}}){
 const results=plans.map(plan=>({platform:plan.target.platform,status:'not-started',rollback:'not-needed',residualPaths:[],error:null}));let invalid=false;
 try{validatePlanSet(plans);}catch(error){return{results:results.map(item=>({...item,status:'failed',error})),interrupted:false};}
 for(let i=0;i<plans.length;i++)try{assertPlanSnapshot(plans[i],{safeFs});}catch(error){results[i]={...results[i],status:'failed',error};invalid=true;}
 if(invalid)return{results,interrupted:false};

 for(let i=0;i<plans.length;i++){
  if(signal?.aborted)return{results,interrupted:true};const plan=plans[i];
  try{assertPlanSnapshot(plan,{safeFs});const applied=applyUninstallTransaction(plan,{safeFs,signal,hooks});results[i]={...results[i],status:'uninstalled',residualPaths:[...results[i].residualPaths,...applied.residualPaths],error:applied.cleanupError??null};if(applied.cleanupError)break;}
  catch(error){results[i]={...results[i],status:'failed',rollback:error.rollback??'not-needed',residualPaths:[...results[i].residualPaths,...(error.residualPaths??[])],error};return{results,interrupted:Boolean(signal?.aborted)};}
 }
 return{results,interrupted:false};
}
