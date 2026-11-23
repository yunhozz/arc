import {readInstallMode,inspectStandaloneProfile} from './install-mode.mjs';
import {installerRegistryOf} from '../platforms/index.mjs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {resolveTargets,inspectPath,TargetConfigurationError} from './targets.mjs';
import {loadModelConfig} from '../models/index.mjs';
import {parseSettings} from './language.mjs';
import {parseLimits} from './limits.mjs';
import {removeManagedBlock} from './global-config.mjs';
import {removeShellCompletion} from './shell-completion.mjs';
import {inspectLegacyProfiles,legacyProfileNames} from './legacy-profiles.mjs';
import {standaloneProfileFile} from '../runtime/platform-registry.mjs';
const fail=message=>{throw new TargetConfigurationError(message);};
export function collectInstalledState({safeFs,userHome,env={},cwd,platforms,runtimePlatforms}){
 if(env.CODEX_HOME!==undefined&&!path.isAbsolute(env.CODEX_HOME)&&env.CODEX_HOME!=='~'&&!env.CODEX_HOME.startsWith('~/')&&(!cwd||!path.isAbsolute(cwd)))fail('A verified invocation cwd is required for relative CODEX_HOME');
 const registry=installerRegistryOf({platforms}),ids=registry.byAnchorOrder().map(descriptor=>descriptor.runtime.id);
 const resolved=resolveTargets({userHome,env,cwd,platforms}),modeSnapshot=new Map(),installation=readInstallMode({safeFs,...resolved,snapshot:modeSnapshot,platforms}),mode=installation.mode,targets=[],residualPaths=[];
 if(resolved.unresolved.some(({platform})=>installation.platforms.includes(platform)))fail('Mixed routing configuration cannot be verified.');
 for(const platform of ids){
  if(registry.getPlatform(platform).runtime.capabilities.install.state!=='verified')continue;
  const target=resolved.targets[platform];if(!target)continue;
  const snapshot=new Map(),arc=path.join(target.home,'skills/arc');
  const skill=inspectPath(safeFs,arc,{kind:'directory',tree:true,allowLinks:true,snapshot});
  const profiles=mode==='composite'&&installation.platforms.includes(platform)?[]:target.profileNames.map(name=>inspectStandaloneProfile({safeFs,target,role:name.split('.')[0].replace('-','_'),snapshot,platforms}));
  const instruction=inspectPath(safeFs,target.instructionPath,{kind:'file',read:true,snapshot}),managed=instruction.exists?removeManagedBlock(instruction.bytes):{changed:false};
  if(!skill.exists){if(profiles.some(item=>item.exists&&item.owned)||managed.changed)fail(`Incomplete ARC installation: ${target.home}`);residualPaths.push(...profiles.filter(item=>item.exists&&!item.owned).map(item=>item.path));continue;}
  function mandatory(name){const found=inspectPath(safeFs,path.join(arc,name),{kind:'file',read:true,snapshot});if(!found.exists||!found.bytes.length)fail(`Incomplete ARC installation: missing ${name} at ${target.home}`);return found.bytes;}
  mandatory('SKILL.md');
  const missing=profiles.filter(item=>!item.exists);
  if(missing.length){
   const agentsDir=path.join(target.home,'agents'),descriptor=registry.getPlatform(platform);
   const tester=path.join(agentsDir,standaloneProfileFile(descriptor.runtime,'arc_tester'));
   if(missing.length!==1||missing[0].path!==tester)fail(`Incomplete ARC installation: missing profile at ${target.home}`);
   const evidence=new Map(),legacy=inspectLegacyProfiles({platform,agentsDir,safeFs,snapshot:evidence,platforms});
   if(!legacy.remove.length)fail(`Incomplete ARC installation: missing profile at ${target.home}`);
   const candidate=legacyProfileNames(platform,{platforms}).map(name=>path.join(agentsDir,name)).find(name=>legacy.remove.includes(name));
   snapshot.set(candidate,evidence.get(candidate));
  }
  let language,runMode,modelConfig,limits;
  try{
   const parsed=parseSettings(mandatory('settings.toml'));
   language=parsed.language;
   runMode=parsed.runMode;
   modelConfig=loadModelConfig(mandatory('models.toml'),platform,{runtimePlatforms});
   limits=parseLimits(mandatory('limits.toml'));
  }catch(cause){throw new TargetConfigurationError(`Invalid installed ARC settings at ${target.home}: ${cause.message}`,{cause});}
  const runtimeConfig=registry.getPlatform(platform).runtimeConfig;
  if(typeof runtimeConfig.readConcurrency==='function'){const native=inspectPath(safeFs,target.runtimeConfigPath,{kind:'file',read:true,snapshot});if(native.exists)try{runtimeConfig.readConcurrency(native.bytes);}catch(cause){throw new TargetConfigurationError(`Invalid native configuration at ${target.runtimeConfigPath}: ${cause.message}`,{cause});}}
  const shell=inspectPath(safeFs,path.join(userHome,'.zshrc'),{kind:'file',read:true,snapshot});if(shell.exists)removeShellCompletion(shell.bytes);
  const modeKeys=new Set();
  if(mode==='composite')for(const [filename,value]of modeSnapshot)if(value){snapshot.set(filename,value);modeKeys.add(filename);}
  for(const [filename,value]of snapshot)if(!value)snapshot.delete(filename);
  targets.push({target,language,runMode,modelConfig,limits,snapshot,modeKeys,residualPaths:profiles.filter(item=>item.exists&&!item.owned).map(item=>item.path)});
 }
 const hash=createHash('sha256');for(const entry of targets){hash.update(entry.target.platform+'\0'+entry.target.home+'\0');for(const [name,value]of [...entry.snapshot].sort(([a],[b])=>a.localeCompare(b)))hash.update(JSON.stringify([name,value],(key,value)=>key==='atimeNs'?undefined:typeof value==='bigint'?value.toString():value));}
 return{targets,mode,platforms:installation.platforms,registry,residualPaths,stateToken:hash.digest('hex')};
}
