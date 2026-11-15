import {installerRegistryOf} from '../platforms/index.mjs';
import path from 'node:path';
import {inspectPath,TargetConfigurationError} from './targets.mjs';
import {inspectCompositeRemoval} from './role-routing.mjs';
import {parseRoleRoutingConfig} from '../runtime/role-routing-config.mjs';
export function isOwnedStandaloneProfile(bytes,platform,role){
 return installerRegistryOf().getPlatform(platform)?.profiles.isOwnedStandalone(bytes,role)??false;
}
export function inspectStandaloneProfile({safeFs,target,role,snapshot=new Map()}){
 const filename=path.join(target.home,'agents',`${role.replace('_','-')}.${target.platform==='codex'?'toml':'md'}`),file=inspectPath(safeFs,filename,{kind:'file',read:true,allowLeafLink:true,snapshot});
 return{path:filename,exists:file.exists,owned:file.exists&&snapshot.get(filename)?.type==='file'&&isOwnedStandaloneProfile(file.bytes,target.platform,role)};
}
export function readInstallMode({safeFs,targets,snapshot=new Map()}){
 const active=path.join(targets.codex.home,'arc-role-platform-routing.json'),homes={},residualPaths=[];
 for(const platform of ['codex','claude']){
  const result=inspectCompositeRemoval({target:targets[platform],safeFs,activeConfigPath:active,snapshot});
  homes[platform]=result.residualPaths.length?'unverified':result.removals.length?'composite':'standalone';residualPaths.push(...result.residualPaths);
 }
 const mode=homes.codex===homes.claude?homes.codex:'unverified';
 if(mode==='unverified')for(const [filename,value]of snapshot)if(value&&(/arc-role-platform-routing|arc-routing-/.test(filename)))residualPaths.push(filename);
 let config=null;if(mode==='composite')config=parseRoleRoutingConfig(inspectPath(safeFs,active,{kind:'file',read:true,snapshot}).bytes.toString('utf8'));
 return{mode,homes,config,residualPaths:[...new Set(residualPaths)]};
}
export function assertVerifiedInstallMode(options){
 const state=readInstallMode(options);if(state.mode==='unverified'){const error=new TargetConfigurationError('Claude & Codex configuration cannot be verified.');error.residualPaths=state.residualPaths;throw error;}return state;
}
