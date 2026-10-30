import path from 'node:path';
import {inspectPath,TargetConfigurationError} from './targets.mjs';
import {loadModelConfig,applyPreset,applyCustomRoles,serializeModelConfig,resolveModelSettings,renderProfiles} from '../models/index.mjs';
import {assertPlanSnapshot,applyTransaction} from './transaction.mjs';
import {assertCatalogRoles} from '../models/catalog.mjs';
import {validatePlanSet} from './plan.mjs';
export function buildPresetPlan({target,preset,safeFs,customRoles,verifiedCatalog}){
 const snapshot=new Map(),modelsPath=path.join(target.home,'skills/arc/models.toml'),managedPaths=[modelsPath,...target.profileNames.map(name=>path.join(target.home,'agents',name))];
 const read=filename=>{const found=inspectPath(safeFs,filename,{kind:'file',read:true,snapshot});if(!found.exists)throw new TargetConfigurationError(`Installed ARC file missing: ${filename}`);return found.bytes;};
 const originalModels=read(modelsPath),config=loadModelConfig(originalModels,target.platform);
 if(preset==='custom'||customRoles!==undefined)assertCatalogRoles({platform:target.platform,roles:customRoles,catalog:verifiedCatalog});
 const next=customRoles!==undefined?applyPreset(applyCustomRoles(config,customRoles),preset):applyPreset(config,preset),originalProfiles=new Map(target.profileNames.map((name,i)=>[name,read(managedPaths[i+1])]));
 const profiles=renderProfiles(originalProfiles,resolveModelSettings(next)),specs=[];
 if(config.preset!==preset||(customRoles!==undefined&&(!config.custom||Object.keys(next.custom).some(role=>Object.keys(next.custom[role]).some(key=>config.custom[role]?.[key]!==next.custom[role][key])))))specs.push({path:modelsPath,bytes:Buffer.from(serializeModelConfig(next))});
 for(const[name,bytes]of profiles)if(!bytes.equals(originalProfiles.get(name)))specs.push({path:path.join(target.home,'agents',name),bytes});
 return{target,preset,snapshot,managedPaths,externalPaths:[],specs};
}
export async function switchPresetTargets(plans,{safeFs,signal,hooks={}}){
 const results=plans.map(plan=>({platform:plan.target.platform,status:'not-started',rollback:'not-needed',residualPaths:[],error:null}));
 try{validatePlanSet(plans);}catch(error){return{results:results.map(item=>({...item,status:'failed',error})),interrupted:false};}
 let invalid=false;for(let i=0;i<plans.length;i++)try{assertPlanSnapshot(plans[i],{safeFs});}catch(error){results[i]={...results[i],status:'failed',error};invalid=true;}
 if(invalid)return{results,interrupted:false};
 for(let i=0;i<plans.length;i++){
  if(signal?.aborted)return{results,interrupted:true};const plan=plans[i];
  try{assertPlanSnapshot(plan,{safeFs});const applied=plan.specs.length?applyTransaction(plan,{safeFs,signal,hooks,specs:plan.specs}):{residualPaths:[],cleanupError:null};results[i]={...results[i],status:plan.specs.length?'updated':'unchanged',residualPaths:applied.residualPaths,error:applied.cleanupError};if(applied.cleanupError)break;}
  catch(error){results[i]={...results[i],status:'failed',rollback:error.rollback??'not-needed',residualPaths:error.residualPaths??[],error};return{results,interrupted:Boolean(signal?.aborted)};}
 }
 return{results,interrupted:false};
}
