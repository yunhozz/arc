import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {buildInstallPlan,validatePlanSet} from './plan.mjs';
import {assertPlanSnapshot} from './transaction.mjs';
import {inspectPath} from './targets.mjs';
import {renderManagedBlock,removeManagedBlock,agentsBlockBody} from './global-config.mjs';
import {renderShellCompletion} from './shell-completion.mjs';
import {verifyPayload} from './manifest.mjs';
import {installTargets} from './install.mjs';
import {acquireExternalSkills} from './acquisition.mjs';
export function buildUpgradePlans({payload,state,safeFs}){
 for(const entry of state.targets)assertPlanSnapshot(entry,{safeFs});
 const plans=state.targets.map(entry=>{
  const {target,language,modelConfig,limits}=entry;
  const plan=buildInstallPlan({payload,target,language,modelConfig,preset:modelConfig.preset,limits,skipGlobal:true,safeFs});
  for(const [name,value]of entry.snapshot)plan.snapshot.set(name,value);
  const current=inspectPath(safeFs,target.instructionPath,{kind:'file',read:true,snapshot:plan.snapshot});
  if(current.exists&&removeManagedBlock(current.bytes).changed){const rendered=renderManagedBlock(current.bytes,agentsBlockBody(target.home,target.userHome,language,target.platform));plan.managedPaths.push(target.instructionPath);if(!rendered.content.equals(current.bytes))plan.globalChanges.push({path:target.instructionPath,original:current.bytes,...rendered});}
  return plan;
 });
 const first=plans[0];if(first){const filename=path.join(first.target.userHome,'.zshrc'),current=inspectPath(safeFs,filename,{kind:'file',read:true,snapshot:first.snapshot});
  if(current.exists){const content=renderShellCompletion(current.bytes);if(current.bytes.includes(Buffer.from('# >>> arc completion >>>'))){first.managedPaths.push(filename);if(!content.equals(current.bytes))first.globalChanges.push({path:filename,original:current.bytes,content,action:'update completion'});}}
  for(const plan of plans.slice(1))plan.snapshot.delete(filename);
 }
 validatePlanSet(plans);return plans;
}
export async function upgradeInstalledTargets({packageRoot,state,safeFs,signal,acquisition}){
 const payload=verifyPayload({packageRoot,safeFs}),version=JSON.parse(payload.files.get('package.json').toString('utf8')).version,plans=buildUpgradePlans({payload,state,safeFs});
 const acquire=acquisition??(async()=>{const work=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'arc-acquire-'));let acquired;
  try{acquired=await acquireExternalSkills({work,safeFs,signal});}catch(error){if(!error.residualPaths?.length)try{fs.rmdirSync(work);}catch(cleanup){throw Object.assign(new AggregateError([error,cleanup],'Cannot clean private acquisition work'),{code:'ARC_ACQUISITION_CLEANUP',residualPaths:[work]});}throw error;}
  return{...acquired,dispose:async()=>{await acquired.dispose();fs.rmdirSync(work);}};});
 return{version,...await installTargets(plans,{safeFs,signal,acquisition:acquire})};
}
