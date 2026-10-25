import {buildInstallPlan,validatePlanSet} from './plan.mjs';
import {assertPlanSnapshot} from './transaction.mjs';
import {inspectPath} from './targets.mjs';
import {renderManagedBlock,removeManagedBlock,agentsBlockBody} from './global-config.mjs';
import {attachShellCompletionCleanup} from './shell-completion.mjs';
import {verifyPayload} from './manifest.mjs';
import {installTargets} from './install.mjs';
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
 attachShellCompletionCleanup(plans,{safeFs});
 validatePlanSet(plans);return plans;
}
export async function upgradeInstalledTargets({packageRoot,state,safeFs,signal}){
 const payload=verifyPayload({packageRoot,safeFs}),version=JSON.parse(payload.files.get('package.json').toString('utf8')).version,plans=buildUpgradePlans({payload,state,safeFs});
 return{version,...await installTargets(plans,{safeFs,signal})};
}
