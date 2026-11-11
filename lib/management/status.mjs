import {readInstallMode} from '../installer/install-mode.mjs';
import path from 'node:path';
import {resolveTarget,inspectPath} from '../installer/targets.mjs';
import {parseLanguage} from '../installer/language.mjs';
import {parseLimits} from '../installer/limits.mjs';
import {loadModelConfig} from '../models/index.mjs';
import {removeManagedBlock} from '../installer/global-config.mjs';
import {readRuntimeConcurrency} from '../installer/runtime-config.mjs';
import {removeShellCompletion} from '../installer/shell-completion.mjs';
import {resolveLocalCli,probePlatformAuth,probeCodexAuthStatus,probeCodexLoginStatus} from '../runtime/local-cli.mjs';
/** @typedef {{platform:string,target?:object,state:'absent'|'installed'|'incomplete',settings?:object,diagnostics:Error[]}} TargetStatus */
export async function collectStatus(context,{codexCheck='refresh'}={}){let mode='unverified';try{mode=readInstallMode({safeFs:context.safeFs,targets:Object.fromEntries(['codex','claude'].map(p=>[p,resolveTarget(p,context)]))}).mode;}catch{}const statuses=['codex','claude'].map(platform=>{
 let target;try{target=resolveTarget(platform,context);const snapshot=new Map(),read=(name,kind='file')=>inspectPath(context.safeFs,name,{kind,read:true,snapshot,tree:kind==='directory',allowLinks:kind==='directory'}),arc=path.join(target.home,'skills/arc'),skill=read(arc,'directory'),profiles=mode==='composite'?[]:target.profileNames.map(name=>read(path.join(target.home,'agents',name))),instruction=read(target.instructionPath),managed=instruction.exists&&removeManagedBlock(instruction.bytes).changed;
 if(!skill.exists&&!profiles.some(x=>x.exists)&&!managed)return{platform,target,state:'absent',diagnostics:[]};
 const mandatory=name=>{const found=read(path.join(arc,name));if(!found.exists||!found.bytes.length)throw Error(`Incomplete ARC installation: missing ${name} at ${target.home}`);return found.bytes;};
 mandatory('SKILL.md');if(profiles.some(x=>!x.exists||!x.bytes.length))throw Error(`Incomplete ARC installation: missing profile at ${target.home}`);
 const settings={language:parseLanguage(mandatory('settings.toml')).language,modelConfig:loadModelConfig(mandatory('models.toml'),platform),limits:parseLimits(mandatory('limits.toml'))};const native=read(target.runtimeConfigPath);if(native.exists)readRuntimeConcurrency(platform,native.bytes);const shell=read(path.join(context.userHome,'.zshrc'));if(shell.exists)removeShellCompletion(shell.bytes);
 return{platform,target,state:'installed',settings,snapshot,diagnostics:[]};
 }catch(error){return{platform,target,state:'incomplete',diagnostics:[error]};}
 });return Promise.all(statuses.map(async status=>{
 const cli=resolveLocalCli(status.platform,context);
 const authentication=cli.reason?{platform:status.platform,authStatus:'unknown',reason:cli.reason}:await (status.platform==='codex'?(codexCheck==='local'?probeCodexLoginStatus:probeCodexAuthStatus)(cli,{signal:context.signal}):probePlatformAuth(cli,{signal:context.signal}));
 return {...status,authentication};
 }));}
