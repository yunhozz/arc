import path from 'node:path';
import {resolveTarget,inspectPath} from '../installer/targets.mjs';
import {parseLanguage} from '../installer/language.mjs';
import {parseLimits} from '../installer/limits.mjs';
import {loadModelConfig,renderProfiles,resolveModelSettings} from '../models/index.mjs';
import {parseToml} from '../models/config.mjs';
import {verifyPayload} from '../installer/manifest.mjs';
import {removeManagedBlock} from '../installer/global-config.mjs';
import {readRuntimeConcurrency} from '../installer/runtime-config.mjs';
import {removeShellCompletion} from '../installer/shell-completion.mjs';
/** @typedef {{platform:string,target?:object,state:'absent'|'installed'|'incomplete',settings?:object,diagnostics:Error[]}} TargetStatus */
export async function collectStatus(context){const payload=verifyPayload(context);return ['codex','claude'].map(platform=>{
 let target;try{target=resolveTarget(platform,context);const snapshot=new Map(),read=(name,kind='file')=>inspectPath(context.safeFs,name,{kind,read:true,snapshot,tree:kind==='directory',allowLinks:kind==='directory'}),arc=path.join(target.home,'skills/arc'),skill=read(arc,'directory'),profiles=target.profileNames.map(name=>read(path.join(target.home,'agents',name))),instruction=read(target.instructionPath),managed=instruction.exists&&removeManagedBlock(instruction.bytes).changed;
 if(!skill.exists&&!profiles.some(x=>x.exists)&&!managed)return{platform,target,state:'absent',diagnostics:[]};
 const mandatory=name=>{const found=read(path.join(arc,name));if(!found.exists||!found.bytes.length)throw Error(`Incomplete ARC installation: missing ${name} at ${target.home}`);return found.bytes;};
 mandatory('SKILL.md');const raw=mandatory('models.toml'),parsed=parseToml(raw),legacy=parsed.version<3n&&!Object.hasOwn(parsed.roles??{},'arc_orchestrator');
 const settings={language:parseLanguage(mandatory('settings.toml')).language,modelConfig:loadModelConfig(raw,platform,loadModelConfig(payload.modelInputs[platform].models,platform)),limits:parseLimits(mandatory('limits.toml'))};if(profiles.some((x,index)=>(!x.exists||!x.bytes.length)&&!(legacy&&index===profiles.length-1&&!x.exists)))throw Error(`Incomplete ARC installation: missing profile at ${target.home}`);renderProfiles(new Map(target.profileNames.map((name,index)=>[name,profiles[index].bytes??payload.modelInputs[platform].profiles.get(name)])),resolveModelSettings(settings.modelConfig));const native=read(target.runtimeConfigPath);if(native.exists)readRuntimeConcurrency(platform,native.bytes);const shell=read(path.join(context.userHome,'.zshrc'));if(shell.exists)removeShellCompletion(shell.bytes);
 return{platform,target,state:'installed',settings,snapshot,diagnostics:[]};
 }catch(error){return{platform,target,state:'incomplete',diagnostics:[error]};}
 }).map(status=>({...status,canonicalModelConfig:loadModelConfig(payload.modelInputs[status.platform].models,status.platform)}));}
