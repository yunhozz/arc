import {readInstallMode,inspectStandaloneProfile} from './install-mode.mjs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {resolveTarget,inspectPath,TargetConfigurationError} from './targets.mjs';
import {loadModelConfig} from '../models/index.mjs';
import {parseLanguage} from './language.mjs';
import {parseLimits} from './limits.mjs';
import {removeManagedBlock} from './global-config.mjs';
import {removeShellCompletion} from './shell-completion.mjs';
import {readRuntimeConcurrency} from './runtime-config.mjs';
const fail=message=>{throw new TargetConfigurationError(message);};
export function collectInstalledState({safeFs,userHome,env={},cwd}){
 if(env.CODEX_HOME!==undefined&&!path.isAbsolute(env.CODEX_HOME)&&env.CODEX_HOME!=='~'&&!env.CODEX_HOME.startsWith('~/')&&(!cwd||!path.isAbsolute(cwd)))fail('A verified invocation cwd is required for relative CODEX_HOME');
 const modeSnapshot=new Map(),mode=readInstallMode({safeFs,targets:Object.fromEntries(['codex','claude'].map(p=>[p,resolveTarget(p,{userHome,env,cwd})])),snapshot:modeSnapshot}).mode,targets=[],residualPaths=[];
 for(const platform of ['codex','claude']){
  const target=resolveTarget(platform,{userHome,env,cwd}),snapshot=new Map(),arc=path.join(target.home,'skills/arc');
  const skill=inspectPath(safeFs,arc,{kind:'directory',tree:true,allowLinks:true,snapshot});
  const profiles=mode==='composite'?[]:target.profileNames.map(name=>inspectStandaloneProfile({safeFs,target,role:name.split('.')[0].replace('-','_'),snapshot}));
  const instruction=inspectPath(safeFs,target.instructionPath,{kind:'file',read:true,snapshot}),managed=instruction.exists?removeManagedBlock(instruction.bytes):{changed:false};
  if(!skill.exists){if(profiles.some(item=>item.exists&&item.owned)||managed.changed)fail(`Incomplete ARC installation: ${target.home}`);residualPaths.push(...profiles.filter(item=>item.exists&&!item.owned).map(item=>item.path));continue;}
  function mandatory(name){const found=inspectPath(safeFs,path.join(arc,name),{kind:'file',read:true,snapshot});if(!found.exists||!found.bytes.length)fail(`Incomplete ARC installation: missing ${name} at ${target.home}`);return found.bytes;}
  mandatory('SKILL.md');if(profiles.some(item=>!item.exists))fail(`Incomplete ARC installation: missing profile at ${target.home}`);
  let language,modelConfig,limits;try{language=parseLanguage(mandatory('settings.toml')).language;modelConfig=loadModelConfig(mandatory('models.toml'),platform);limits=parseLimits(mandatory('limits.toml'));}catch(cause){throw new TargetConfigurationError(`Invalid installed ARC settings at ${target.home}: ${cause.message}`,{cause});}
  const native=inspectPath(safeFs,target.runtimeConfigPath,{kind:'file',read:true,snapshot});if(native.exists)try{readRuntimeConcurrency(platform,native.bytes);}catch(cause){throw new TargetConfigurationError(`Invalid native configuration at ${target.runtimeConfigPath}: ${cause.message}`,{cause});}
  const shell=inspectPath(safeFs,path.join(userHome,'.zshrc'),{kind:'file',read:true,snapshot});if(shell.exists)removeShellCompletion(shell.bytes);
  if(mode==='composite')for(const [filename,value]of modeSnapshot)if(value)snapshot.set(filename,value);
  for(const [filename,value]of snapshot)if(!value)snapshot.delete(filename);
  targets.push({target,language,modelConfig,limits,snapshot,residualPaths:profiles.filter(item=>item.exists&&!item.owned).map(item=>item.path)});
 }
 const hash=createHash('sha256');for(const entry of targets){hash.update(entry.target.platform+'\0'+entry.target.home+'\0');for(const [name,value]of [...entry.snapshot].sort(([a],[b])=>a.localeCompare(b)))hash.update(JSON.stringify([name,value],(key,value)=>key==='atimeNs'?undefined:typeof value==='bigint'?value.toString():value));}
 return{targets,mode,residualPaths,stateToken:hash.digest('hex')};
}
