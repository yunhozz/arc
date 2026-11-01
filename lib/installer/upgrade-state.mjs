import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {resolveTarget,inspectPath,TargetConfigurationError} from './targets.mjs';
import {loadModelConfig,renderProfiles,resolveModelSettings} from '../models/index.mjs';
import {parseToml} from '../models/config.mjs';
import {verifyPayload} from './manifest.mjs';
import {parseLanguage} from './language.mjs';
import {parseLimits} from './limits.mjs';
import {removeManagedBlock} from './global-config.mjs';
import {removeShellCompletion} from './shell-completion.mjs';
import {readRuntimeConcurrency} from './runtime-config.mjs';
const fail=message=>{throw new TargetConfigurationError(message);};
export function collectInstalledState({safeFs,userHome,env={},cwd,packageRoot=fileURLToPath(new URL('../../',import.meta.url))}){
 if(env.CODEX_HOME!==undefined&&!path.isAbsolute(env.CODEX_HOME)&&env.CODEX_HOME!=='~'&&!env.CODEX_HOME.startsWith('~/')&&(!cwd||!path.isAbsolute(cwd)))fail('A verified invocation cwd is required for relative CODEX_HOME');
 const payload=verifyPayload({safeFs,packageRoot}),targets=[];
 for(const platform of ['codex','claude']){
  const target=resolveTarget(platform,{userHome,env,cwd}),snapshot=new Map(),arc=path.join(target.home,'skills/arc');
  const skill=inspectPath(safeFs,arc,{kind:'directory',tree:true,allowLinks:true,snapshot});
  const profiles=target.profileNames.map(name=>inspectPath(safeFs,path.join(target.home,'agents',name),{kind:'file',read:true,snapshot}));
  const instruction=inspectPath(safeFs,target.instructionPath,{kind:'file',read:true,snapshot}),managed=instruction.exists?removeManagedBlock(instruction.bytes):{changed:false};
  if(!skill.exists){if(profiles.some(item=>item.exists)||managed.changed)fail(`Incomplete ARC installation: ${target.home}`);continue;}
  function mandatory(name){const found=inspectPath(safeFs,path.join(arc,name),{kind:'file',read:true,snapshot});if(!found.exists||!found.bytes.length)fail(`Incomplete ARC installation: missing ${name} at ${target.home}`);return found.bytes;}
  mandatory('SKILL.md');
  let language,modelConfig,limits,legacy;try{language=parseLanguage(mandatory('settings.toml')).language;const raw=mandatory('models.toml'),parsed=parseToml(raw);legacy=parsed.version<3n&&!Object.hasOwn(parsed.roles??{},'arc_orchestrator');const defaults=loadModelConfig(payload.modelInputs[platform].models,platform);modelConfig=loadModelConfig(raw,platform,defaults);limits=parseLimits(mandatory('limits.toml'));}catch(cause){throw new TargetConfigurationError(`Invalid installed ARC settings at ${target.home}: ${cause.message}`,{cause});}
  if(profiles.some((item,index)=>(!item.exists||!item.bytes.length)&&!(legacy&&index===profiles.length-1&&!item.exists)))fail(`Incomplete ARC installation: missing profile at ${target.home}`);
  try{renderProfiles(new Map(target.profileNames.map((name,index)=>[name,profiles[index].bytes??payload.modelInputs[platform].profiles.get(name)])),resolveModelSettings(modelConfig));}catch(cause){throw new TargetConfigurationError(`Invalid installed ARC profile at ${target.home}: ${cause.message}`,{cause});}
  const native=inspectPath(safeFs,target.runtimeConfigPath,{kind:'file',read:true,snapshot});if(native.exists)try{readRuntimeConcurrency(platform,native.bytes);}catch(cause){throw new TargetConfigurationError(`Invalid native configuration at ${target.runtimeConfigPath}: ${cause.message}`,{cause});}
  const shell=inspectPath(safeFs,path.join(userHome,'.zshrc'),{kind:'file',read:true,snapshot});if(shell.exists)removeShellCompletion(shell.bytes);
  targets.push({target,language,modelConfig,limits,snapshot,legacy});
 }
 const hash=createHash('sha256');for(const entry of targets){hash.update(entry.target.platform+'\0'+entry.target.home+'\0');const missing=path.join(entry.target.home,'agents',entry.target.profileNames.at(-1));for(const [name,value]of [...entry.snapshot].sort(([a],[b])=>a.localeCompare(b))){if(entry.legacy&&name===missing&&value===null)continue;hash.update(JSON.stringify([name,value],(key,value)=>key==='atimeNs'?undefined:typeof value==='bigint'?value.toString():value));}}
 return{targets,stateToken:hash.digest('hex')};
}
