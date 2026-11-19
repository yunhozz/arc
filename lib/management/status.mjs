import {readInstallMode,inspectStandaloneProfile} from '../installer/install-mode.mjs';
import path from 'node:path';
import {resolveTarget,resolveTargets,inspectPath} from '../installer/targets.mjs';
import {installerRegistryOf} from '../platforms/index.mjs';
import {parseSettings} from '../installer/language.mjs';
import {parseLimits} from '../installer/limits.mjs';
import {loadModelConfig} from '../models/index.mjs';
import {removeManagedBlock} from '../installer/global-config.mjs';
import {removeShellCompletion} from '../installer/shell-completion.mjs';
import {resolveLocalCli,probePlatformAuth,probeCodexAuthStatus,probeCodexLoginStatus,probeCliVersion} from '../runtime/local-cli.mjs';
/** @typedef {{platform:string,target?:object,state:'absent'|'installed'|'incomplete',settings?:object,diagnostics:Error[]}} TargetStatus */
export async function collectStatus(context,{codexCheck='refresh'}={}){const registry=installerRegistryOf(context);let installation={mode:'unverified'};try{installation=readInstallMode({safeFs:context.safeFs,...resolveTargets(context),platforms:registry});}catch{}const statuses=registry.byAnchorOrder().map(({runtime:{id:platform}})=>{
 let target;try{target=resolveTarget(platform,context);const snapshot=new Map(),read=(name,kind='file')=>inspectPath(context.safeFs,name,{kind,read:true,snapshot,tree:kind==='directory',allowLinks:kind==='directory'}),arc=path.join(target.home,'skills/arc'),skill=read(arc,'directory'),profiles=installation.mode==='composite'&&installation.platforms.includes(platform)?[]:target.profileNames.map(name=>inspectStandaloneProfile({safeFs:context.safeFs,target,role:name.split('.')[0].replace('-','_'),snapshot,platforms:registry})),instruction=read(target.instructionPath),managed=instruction.exists&&removeManagedBlock(instruction.bytes).changed;
 if(!skill.exists&&!profiles.some(x=>x.exists&&x.owned)&&!managed)return{platform,target,state:'absent',residualPaths:profiles.filter(x=>x.exists&&!x.owned).map(x=>x.path),diagnostics:[]};
 const mandatory=name=>{const found=read(path.join(arc,name));if(!found.exists||!found.bytes.length)throw Error(`Incomplete ARC installation: missing ${name} at ${target.home}`);return found.bytes;};
 mandatory('SKILL.md');if(profiles.some(x=>!x.exists))throw Error(`Incomplete ARC installation: missing profile at ${target.home}`);
 const {language,runMode}=parseSettings(mandatory('settings.toml'));
 const settings={language,runMode,modelConfig:loadModelConfig(mandatory('models.toml'),platform,context),limits:parseLimits(mandatory('limits.toml'))},runtimeConfig=registry.getPlatform(platform).runtimeConfig;if(typeof runtimeConfig.readConcurrency==='function'){const native=read(target.runtimeConfigPath);if(native.exists)runtimeConfig.readConcurrency(native.bytes);}const shell=read(path.join(context.userHome,'.zshrc'));if(shell.exists)removeShellCompletion(shell.bytes);
 return{platform,target,state:'installed',settings,snapshot,residualPaths:profiles.filter(x=>x.exists&&!x.owned).map(x=>x.path),diagnostics:[]};
 }catch(error){
  const status={platform,target,state:'incomplete',diagnostics:[error]};
  if(!target)return status;
  const arc=path.join(target.home,'skills/arc');
  const read=name=>inspectPath(context.safeFs,path.join(arc,name),{kind:'file',read:true});
  const settings={};
  try{
   const found=read('settings.toml');
   if(found.exists){
    const {language,runMode}=parseSettings(found.bytes);
    Object.assign(settings,{language,runMode});
   }
  }catch{}
  try{
   const found=read('limits.toml');
   if(found.exists)settings.limits=parseLimits(found.bytes);
  }catch{}
  return Object.keys(settings).length?{...status,settings}:status;
 }
 });return Promise.all(statuses.map(async status=>{
 const runtime=registry.getPlatform(status.platform).runtime;
 if(runtime.capabilities.install.state!=='verified')return{...status,cliVersion:{version:null,reason:'capability_not_verified'},authentication:{authStatus:'unknown',reason:'capability_not_verified'}};
 const cli=resolveLocalCli(status.platform,context);
 const kind=runtime.auth.kind;
 const authentication=kind==='none'?(cli.reason?{authStatus:'unknown',reason:'auth_unverified'}:await probePlatformAuth(cli,{signal:context.signal})):cli.reason?{platform:status.platform,authStatus:'unknown',reason:cli.reason}:kind==='codex-refresh'?await (codexCheck==='local'?probeCodexLoginStatus:probeCodexAuthStatus)(cli,{signal:context.signal}):kind==='cli-status-json'?await probePlatformAuth(cli,{signal:context.signal}):{platform:status.platform,authStatus:'unknown',reason:'auth_probe_unavailable'};
 const version=kind==='none'?{cliVersion:cli.reason?{version:null,reason:cli.reason}:await probeCliVersion(cli,{signal:context.signal})}:{};
 return {...status,authentication,...version,...(installation.legacyAnchor&&installation.platforms.includes(status.platform)?{diagnostics:[...status.diagnostics,new Error('Mixed routing will move to the Claude home the next time you apply Configure.')]}:{})};
 }));}
