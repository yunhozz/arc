import {installerRegistryOf} from '../platforms/index.mjs';
import {createPlatformRegistry,standaloneProfileFile} from '../runtime/platform-registry.mjs';
import path from 'node:path';
import {inspectPath,TargetConfigurationError} from './targets.mjs';
import {inspectCompositeRemoval} from './role-routing.mjs';
import {parseRoleRoutingConfig} from '../runtime/role-routing-config.mjs';
export function isOwnedStandaloneProfile(bytes,platform,role,context={}){
 return installerRegistryOf(context).getPlatform(platform)?.profiles.isOwnedStandalone(bytes,role)??false;
}
export function inspectStandaloneProfile({safeFs,target,role,snapshot=new Map(),platforms}){
 const descriptor=installerRegistryOf({platforms}).getPlatform(target.platform);
 const filename=path.join(target.home,'agents',standaloneProfileFile(descriptor.runtime,role)),file=inspectPath(safeFs,filename,{kind:'file',read:true,allowLeafLink:true,snapshot});
 return{path:filename,exists:file.exists,owned:file.exists&&snapshot.get(filename)?.type==='file'&&isOwnedStandaloneProfile(file.bytes,target.platform,role,{platforms})};
}
export function readInstallMode({safeFs,targets,unresolved=[],snapshot=new Map(),platforms}){
 const registry=installerRegistryOf({platforms}),runtimePlatforms=createPlatformRegistry(registry.byAnchorOrder().map(descriptor=>descriptor.runtime));
 const homes={},candidates=[],routing=new Map(),unresolvedIds=new Set(unresolved.map(item=>typeof item==='string'?item:item.platform));
 for(const id of registry.platformIds()){
  const target=targets[id];if(unresolvedIds.has(id)||!target){homes[id]='unresolved';continue;}
  const active=path.join(target.home,'arc-role-platform-routing.json'),file=inspectPath(safeFs,active,{kind:'file',read:true,snapshot});
  if(file.exists)candidates.push({id,path:active,bytes:file.bytes});
  const marker=path.join(target.home,'arc-role-platform-routing.prepared.json'),found=inspectPath(safeFs,marker,{kind:'file',read:true,snapshot});
  const paths=found.exists?[marker]:[],agents=path.join(target.home,'agents');
  inspectPath(safeFs,agents,{kind:'directory',tree:true,allowLinks:true,snapshot});
  for(const [filename,value]of snapshot)if(value&&path.dirname(filename)===agents&&path.basename(filename).startsWith('arc-routing-'))paths.push(filename);
  routing.set(id,paths);homes[id]='standalone';
 }
 let config=null,participating=[],anchor=null;
 const finish=(mode,residualPaths=[])=>({mode,platforms:participating,anchor,homes,config,residualPaths:[...new Set(residualPaths)]});
 const unverified=()=>{
  for(const id of Object.keys(homes))if(homes[id]!=='unresolved'&&(routing.get(id)?.length||candidates.some(candidate=>candidate.id===id)||participating.includes(id)))homes[id]='unverified';
  return finish('unverified',[...candidates.map(candidate=>candidate.path),...[...routing.values()].flat()]);
 };
 if(!candidates.length)return[...routing.values()].some(paths=>paths.length)?unverified():finish('standalone');
 if(candidates.length!==1)return unverified();
 const active=candidates[0];
 try{config=parseRoleRoutingConfig(active.bytes.toString('utf8'),{runtimePlatforms});}catch{return unverified();}
 participating=config.platforms;anchor=participating[0];
 if(participating.some(id=>homes[id]==='unresolved'||!targets[id])||targets[anchor].home!==path.dirname(active.path))return unverified();
 for(let i=0;i<participating.length;i++)for(let j=0;j<i;j++){
  const a=targets[participating[i]].home,b=targets[participating[j]].home;
  if(a===b||a.startsWith(b+path.sep)||b.startsWith(a+path.sep))return unverified();
 }
 for(const [id,paths]of routing)if(!participating.includes(id)&&paths.length)return unverified();
 for(const id of participating){
  const target=targets[id],result=inspectCompositeRemoval({target,safeFs,activeConfigPath:active.path,anchor:target.home===path.dirname(active.path),snapshot,runtimePlatforms});
  if(result.residualPaths.length||!result.removals.length)return unverified();
  if(routing.get(id).some(filename=>!result.removals.includes(filename)))return unverified();
 }
 for(const id of participating)homes[id]='composite';
 return finish('composite');
}
export function assertVerifiedInstallMode(options){
 const state=readInstallMode(options);if(state.mode==='unverified'){const error=new TargetConfigurationError('Mixed routing configuration cannot be verified.');error.residualPaths=state.residualPaths;throw error;}return state;
}
