import {buildInstallPlan,validatePlanSet} from './plan.mjs';
import {assertPlanSnapshot} from './transaction.mjs';
import {inspectPath} from './targets.mjs';
import {renderManagedBlock,removeManagedBlock,agentsBlockBody} from './global-config.mjs';
import {attachShellCompletionCleanup} from './shell-completion.mjs';
import {verifyPayload} from './manifest.mjs';
import {installTargets} from './install.mjs';
import {installerRegistryOf} from '../platforms/index.mjs';
import {createPlatformRegistry} from '../runtime/platform-registry.mjs';
import path from 'node:path';
export function buildUpgradePlans({payload,state,safeFs,registry=state.registry}){
 const platforms=installerRegistryOf({platforms:registry}),runtimePlatforms=createPlatformRegistry(platforms.byAnchorOrder().map(descriptor=>descriptor.runtime));
 for(const entry of state.targets)assertPlanSnapshot(entry,{safeFs});
 const plans=state.targets.map(entry=>{
  const {target,language,runMode,modelConfig,limits}=entry;
  const plan=buildInstallPlan({payload,target,profiles:state.mode==='composite'&&state.platforms.includes(target.platform)?'omit':'write',language,runMode,modelConfig,limits,skipGlobal:true,safeFs,platforms,runtimePlatforms});
  for(const [name,value]of entry.snapshot)plan.snapshot.set(name,value);
  const current=inspectPath(safeFs,target.instructionPath,{kind:'file',read:true,snapshot:plan.snapshot});
  if(current.exists&&removeManagedBlock(current.bytes).changed){const rendered=renderManagedBlock(current.bytes,agentsBlockBody(target.home,target.userHome,language,target.platform,runMode));plan.managedPaths.push(target.instructionPath);if(!rendered.content.equals(current.bytes))plan.globalChanges.push({path:target.instructionPath,original:current.bytes,...rendered});}
  return plan;
 });
 const writePaths=plans.map(plan=>new Set(plan.managedPaths));
 for(const [index,plan]of plans.entries())for(const filename of state.targets[index].modeKeys??[]){
  if(writePaths.some((paths,other)=>other!==index&&[...paths].some(written=>filename===written||filename.startsWith(written+path.sep)||written.startsWith(filename+path.sep))))plan.snapshot.delete(filename);
 }
 attachShellCompletionCleanup(plans,{safeFs});
 validatePlanSet(plans);return plans;
}
export async function upgradeInstalledTargets({packageRoot,state,safeFs,signal,registry=state.registry}){
 const platforms=installerRegistryOf({platforms:registry}),runtimePlatforms=createPlatformRegistry(platforms.byAnchorOrder().map(descriptor=>descriptor.runtime));
 const payload=verifyPayload({packageRoot,safeFs,platforms,runtimePlatforms}),version=JSON.parse(payload.files.get('package.json').toString('utf8')).version,plans=buildUpgradePlans({payload,state,safeFs,registry:platforms});
 return{version,residualPaths:state.residualPaths??[],...await installTargets(plans,{safeFs,signal,platforms})};
}
