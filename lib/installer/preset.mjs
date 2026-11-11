import path from 'node:path';
import {inspectStandaloneProfile} from './install-mode.mjs';
import {inspectPath,TargetConfigurationError} from './targets.mjs';
import {loadModelConfig,withRoles,serializeModelConfig,resolveModelSettings,renderProfiles} from '../models/index.mjs';
import {assertPlanSnapshot,applyTransaction} from './transaction.mjs';
import {readModelFileVersion} from '../models/config.mjs';
import {isDeepStrictEqual} from 'node:util';
import {assertCatalogRoles} from '../models/catalog.mjs';
import {validatePlanSet,renderStandaloneProfiles} from './plan.mjs';
import {parseLanguage} from './language.mjs';
export function buildPresetPlan({target,roles,safeFs,verifiedCatalog,payload,loadPayload}){
 const snapshot=new Map(),modelsPath=path.join(target.home,'skills/arc/models.toml'),managedPaths=[modelsPath],residualPaths=[];
 const read=filename=>{const found=inspectPath(safeFs,filename,{kind:'file',read:true,snapshot});if(!found.exists)throw new TargetConfigurationError(`Installed ARC file missing: ${filename}`);return found.bytes;};
 const originalModels=read(modelsPath),config=loadModelConfig(originalModels,target.platform);
 if(roles!==undefined)assertCatalogRoles({platform:target.platform,roles,catalog:verifiedCatalog});
 const next=roles!==undefined?withRoles(config,roles):config,originalProfiles=new Map();
 for(const name of target.profileNames){const found=inspectStandaloneProfile({safeFs,target,role:name.split('.')[0].replace('-','_'),snapshot});if(!found.exists)throw new TargetConfigurationError(`Installed ARC file missing: ${found.path}`);if(!found.owned){residualPaths.push(found.path);continue;}originalProfiles.set(name,read(found.path));managedPaths.push(found.path);}
 const profileInputs=residualPaths.length?renderStandaloneProfiles({payload:payload??loadPayload(),target,modelConfig:next,language:parseLanguage(read(path.join(target.home,'skills/arc/settings.toml'))).language}):new Map();
 for(const entry of originalProfiles)profileInputs.set(...entry);
 const profiles=renderProfiles(profileInputs,resolveModelSettings(next)),specs=[];
 if(readModelFileVersion(originalModels)<3||!isDeepStrictEqual(config.roles,next.roles))specs.push({path:modelsPath,bytes:Buffer.from(serializeModelConfig(next))});
 for(const[name,bytes]of profiles)if(originalProfiles.has(name)&&!bytes.equals(originalProfiles.get(name)))specs.push({path:path.join(target.home,'agents',name),bytes});
 return{target,roles:next.roles,snapshot,managedPaths,residualPaths,externalPaths:[],specs};
}
export async function switchPresetTargets(plans,{safeFs,signal,hooks={}}){
 const results=plans.map(plan=>({platform:plan.target.platform,status:'not-started',rollback:'not-needed',residualPaths:[],error:null}));
 try{validatePlanSet(plans);}catch(error){return{results:results.map(item=>({...item,status:'failed',error})),interrupted:false};}
 let invalid=false;for(let i=0;i<plans.length;i++)try{assertPlanSnapshot(plans[i],{safeFs});}catch(error){results[i]={...results[i],status:'failed',error};invalid=true;}
 if(invalid)return{results,interrupted:false};
 for(let i=0;i<plans.length;i++){
  if(signal?.aborted)return{results,interrupted:true};const plan=plans[i];
  try{assertPlanSnapshot(plan,{safeFs});const applied=plan.specs.length?applyTransaction(plan,{safeFs,signal,hooks,specs:plan.specs}):{residualPaths:[],cleanupError:null};results[i]={...results[i],status:plan.specs.length?'updated':'unchanged',residualPaths:[...new Set([...(plan.residualPaths??[]),...applied.residualPaths])],error:applied.cleanupError};if(applied.cleanupError)break;}
  catch(error){results[i]={...results[i],status:'failed',rollback:error.rollback??'not-needed',residualPaths:error.residualPaths??[],error};return{results,interrupted:Boolean(signal?.aborted)};}
 }
 return{results,interrupted:false};
}
