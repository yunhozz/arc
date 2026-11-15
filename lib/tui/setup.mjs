import {randomUUID} from 'node:crypto';
import {parsePositiveLimit} from '../limits.mjs';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {loadModelConfig,resolveModelSettings,ModelValidationError} from '../models/index.mjs';
import {ROLES} from '../models/config.mjs';
import {DEFAULT_INSTALLER_REGISTRY,installerRegistryOf,platformLabel,sortByDisplay} from '../platforms/index.mjs';
import {platformAvailability,reasonDetail,REASON_TEXT} from '../platforms/availability.mjs';
import {createPlatformRegistry} from '../runtime/platform-registry.mjs';
import {buildRoleRoutingConfig} from '../runtime/role-routing-config.mjs';
import {deriveInstallPlan} from './derive-install-plan.mjs';
import {diagramRows} from './diagram.mjs';
import {editRole} from './custom-preset.mjs';
const languageLabel = value => value === 'ko' ? 'KR' : 'EN';
export function loadRoleDefaults({context,statuses,target,readText=filename=>readFileSync(filename,'utf8')}) {
 if(!installerRegistryOf(context).isPlatformId(target))throw new ModelValidationError('Unsupported role target');
 const installed=statuses.find(status=>status.platform===target)?.settings?.modelConfig;
 const config=installed??loadModelConfig(readText(path.join(context.packageRoot,target,'skill/models.toml')),target,context);
 const resolved=resolveModelSettings(config,context);if(resolved.platform!==target)throw new ModelValidationError('Model configuration platform does not match target');
 return resolved.roles;
}
const installSettingKeys=['language','maxTotalSubagents','maxConcurrentSubagents'];
const installRoleNames=['Scouter','Planner','Implementer','QA','Reviewer'];

export function installSettingsDraft(statuses,platforms){
 const values=platforms.map(platform=>{
  const settings=statuses.find(status=>status.platform===platform&&status.state==='installed')?.settings;
  return {language:settings?.language??'en',maxTotalSubagents:settings?.limits?.max_total_subagents??100,maxConcurrentSubagents:settings?.limits?.max_concurrent_subagents??5};
 });
 const first=values[0]??{language:'en',maxTotalSubagents:100,maxConcurrentSubagents:5};
 return {...first,mixed:new Set(installSettingKeys.filter(key=>values.some(value=>value[key]!==first[key]))),touched:new Set()};
}

export function installPrepareOptions(plan,draft,catalog){
 const settings={skipGlobal:false};
 for(const key of installSettingKeys)if(!draft.settings.mixed.has(key)||draft.settings.touched.has(key))settings[key]=draft.settings[key];
 if(draft.settings.touched.has('maxConcurrentSubagents'))settings.concurrentSelected=true;
 const registry=draft.registry??DEFAULT_INSTALLER_REGISTRY;
 if(plan.rule==='D1-a'||plan.rule==='D1-b'){
  const target=plan.platforms[0],field=registry.getPlatform(target).runtime.models.effortField;
  const roles=Object.fromEntries(ROLES.map(role=>[role,{model:draft.roles[role].model,[field]:draft.roles[role].effort}]));
  return {kind:'install',target,roles,verifiedCatalog:catalog?.[target]??catalog,...settings,...(plan.rule==='D1-b'?{switchFromComposite:true}:{})};
 }
 const runtimePlatforms=createPlatformRegistry(registry.byAnchorOrder().map(descriptor=>descriptor.runtime));
 const config=buildRoleRoutingConfig({revision:randomUUID(),platforms:plan.platforms,roles:draft.roles},{runtimePlatforms});
 return {kind:'install',target:'composite',platforms:plan.platforms,config,settings};
}

export async function editInstallSettings({ui,settings}){
 let selected=0;
 const display=key=>settings.mixed.has(key)&&!settings.touched.has(key)?'(mixed)':key==='language'?'‹'+languageLabel(settings[key])+'›':String(settings[key]);
 const rows=()=>['Language              '+display('language'),'Total subagents       '+display('maxTotalSubagents'),'Concurrent subagents  '+display('maxConcurrentSubagents'),'Back'];
 const cycleLanguage=()=>{settings.language=settings.language==='ko'?'en':'ko';settings.touched.add('language');};
 while(true){
  const choice=await ui.menu('Settings',rows(),{selected,onHorizontal:({selected})=>{if(selected===0)cycleLanguage();},renderBody:state=>({rows:rows(),selected:state.selected,position:null})});
  if(choice===null||choice===3)return;
  selected=choice;
  if(choice===0){cycleLanguage();continue;}
  const key=installSettingKeys[choice];if(!key)continue;
  let raw=settings.mixed.has(key)&&!settings.touched.has(key)?'':String(settings[key]);
  while(true){
   raw=await ui.text(choice===1?'Total subagents':'Concurrent subagents',raw);if(raw===null)break;
   let value;try{value=parsePositiveLimit(raw);}catch{await ui.page('Invalid limit',['Enter a positive whole number.']);continue;}
   settings[key]=value;settings.touched.add(key);break;
  }
 }
}

export async function editHosts({ui,hosts,rolePlatforms,availabilityOf,registry=DEFAULT_INSTALLER_REGISTRY}){
 const ids=registry.byDisplayOrder().map(descriptor=>descriptor.runtime.id),locked=new Set(rolePlatforms),checked=new Set([...hosts,...rolePlatforms]);
 let selected=0;
 while(true){
  const availability=ids.map(id=>availabilityOf(id));
  const rows=ids.map((id,index)=>`[${checked.has(id)?'x':' '}] ${platformLabel(id,registry)}`+(locked.has(id)?'          (used by roles)':'')+(availability[index].selectable?'':` - Unavailable  (${REASON_TEXT[availability[index].reason]})`)+(availability[index].warning==='auth_unverified'?' (auth unverified)':''));
  const info=({selected})=>{
   const id=ids[selected];if(!id)return [];
   const detail=reasonDetail(id,availability[selected],availability[selected].status,registry);
   return detail?[detail]:[];
  };
  const choice=await ui.menu('Hosts — CLIs you will work in',[...rows,'Done'],{selected,backRow:true,info});
  if(choice===null)return null;
  if(choice===ids.length)return ids.filter(id=>checked.has(id));
  selected=choice;const id=ids[choice];if(!id||locked.has(id))continue;
  if(checked.has(id))checked.delete(id);else if(availability[choice].selectable)checked.add(id);
 }
}

export async function runInstallFlow({ui,statuses,draft,installState,currentConfig,prepare,loadRoleDefaults:defaults,loadCatalog,registry=DEFAULT_INSTALLER_REGISTRY}){
 const ids=registry.byDisplayOrder().map(descriptor=>descriptor.runtime.id),catalogs=new Map(),availability=new Map();
 const statusOf=id=>statuses.find(status=>status.platform===id);
 // editRole retains these objects while loading catalogs for synchronous arrow keys.
 const availabilityOf=(id,usage='role')=>{
  const key=usage+':'+id,value=platformAvailability(id,{status:statusOf(id),catalog:catalogs.get(id),usage,registry});
  if(!availability.has(key))availability.set(key,{});
  return Object.assign(availability.get(key),value,{status:statusOf(id)});
 };
 const catalogFor=async id=>{
  if(catalogs.has(id))return catalogs.get(id);
  let result;
  try{
   result=await loadCatalog(id);
   const catalog=result?.catalog,runtime=registry.getPlatform(id).runtime;
   if(result?.status!=='ready'||catalog?.platform!==id||!Array.isArray(catalog.pairs)||!catalog.pairs.length||catalog.pairs.some(pair=>!runtime.routing.validatePair(pair.model,pair.effort)))result={status:'catalog_error',code:'catalog_error'};
  }catch{result={status:'catalog_error',code:'catalog_error'};}
  catalogs.set(id,result);
  for(const usage of ['role','host','standalone'])availabilityOf(id,usage);
  return result;
 };
 const defaultsCache=new Map();
 const defaultsFor=async id=>{
  if(!defaultsCache.has(id))defaultsCache.set(id,await defaults(id));
  return defaultsCache.get(id);
 };
 if(!draft.roles){
  if(installState.mode==='composite'&&currentConfig){draft.roles=structuredClone(currentConfig.roles);draft.hosts??=[...installState.platforms];}
  else{
   const initial=ids.find(id=>statusOf(id)?.state==='installed')??ids.find(id=>availabilityOf(id).selectable)??ids[0];
   const source=await defaultsFor(initial),field=registry.getPlatform(initial).runtime.models.effortField;
   draft.roles=Object.fromEntries(ROLES.map(role=>[role,{platform:initial,model:source[role].model,effort:source[role][field]}]));
   draft.hosts??=[initial];
  }
 }
 draft.hosts??=[...new Set(Object.values(draft.roles).map(role=>role.platform))];
 let selected=0,highlightReason=false;
 while(true){
  const plan=deriveInstallPlan({roles:draft.roles,hosts:draft.hosts,current:installState,registry});
  const settings=installSettingsDraft(statuses,plan.platforms);
  if(draft.settings)for(const key of installSettingKeys)if(draft.settings.touched.has(key)){settings[key]=draft.settings[key];settings.touched.add(key);}
  draft.settings=settings;
  for(const id of plan.platforms)await catalogFor(id);
  const rolePlatforms=new Set(Object.values(draft.roles).map(role=>role.platform));
  const gates=new Map(plan.platforms.map(id=>[id,availabilityOf(id,plan.platforms.length===1?'standalone':rolePlatforms.has(id)?'role':'host')]));
  const blocked=new Set(),roleRows=ROLES.map((role,index)=>{
   if(!gates.get(draft.roles[role].platform).selectable)blocked.add(index);
   return {role:installRoleNames[index],...draft.roles[role]};
  });
  const firstRole=[...blocked][0],firstId=firstRole===undefined?plan.platforms.find(id=>!gates.get(id).selectable):draft.roles[ROLES[firstRole]].platform;
  const reason=firstId?`! ${firstRole===undefined?'Hosts':installRoleNames[firstRole]}: ${platformLabel(firstId,registry)} - Unavailable (${REASON_TEXT[gates.get(firstId).reason]})`:null;
  const info=['Hosts: '+sortByDisplay(draft.hosts,registry).map(id=>platformLabel(id,registry)).join(', '),'Mode:  '+plan.modeLabel,...(reason?[reason]:[])];
  const controls=['Hosts','Settings','Apply','Back'];
  const choice=await ui.menu('Install / Update',[...installRoleNames,...controls.slice(0,-1)],{
   selected,backRow:true,refreshMs:600,info,
   renderBody:state=>{
    const diagram=diagramRows(roleRows,{...state,selectedRole:state.selected<ROLES.length?state.selected:undefined,blocked,footerRows:info.length+controls.length,registry});
    if(diagram.mode==='guard')return {rows:diagram.rows,selected:undefined,position:null};
    const diagramBody=diagram.mode==='compact'?diagram.rows.slice(0,ROLES.length):diagram.rows;
    const rows=[...diagramBody,...info,...controls],reasonIndex=diagramBody.length+2;
    const selected=highlightReason&&reason&&state.selected===7?reasonIndex:state.selected<ROLES.length?(diagram.mode==='compact'?state.selected:state.selected<3?0:8):diagramBody.length+info.length+state.selected-ROLES.length;
    return {rows,selected,showSelection:highlightReason&&reason&&state.selected===7||diagram.mode==='compact'||state.selected>=ROLES.length,position:null};
   },
  });
  if(choice===null)return null;
  selected=choice;highlightReason=false;
  if(choice<ROLES.length){
   const role=ROLES[choice],edited=await editRole({ui,roleName:installRoleNames[choice],current:draft.roles[role],availabilityOf:id=>availabilityOf(id),loadCatalog:catalogFor,defaultsFor:async(id,name)=>{
    const values=await defaultsFor(id),value=values[ROLES[installRoleNames.indexOf(name)]],field=registry.getPlatform(id).runtime.models.effortField;
    return {model:value.model,effort:value[field]};
   },registry});
   if(edited)draft.roles[role]=edited;
  }else if(choice===5){
   const hosts=await editHosts({ui,hosts:draft.hosts,rolePlatforms:[...rolePlatforms],availabilityOf:id=>availabilityOf(id,'host'),registry});
   if(hosts!==null)draft.hosts=hosts;
  }else if(choice===6)await editInstallSettings({ui,settings:draft.settings});
  else if(choice===7){
   if(reason){highlightReason=true;continue;}
   if(plan.rule==='D1-f'){
    await ui.page('Operation unavailable',[installState.reason??'Mixed routing configuration cannot be verified.',...(installState.residualPaths??[]).map(value=>'Residual path: '+value),'No changes were applied.']);continue;
   }
   if(plan.rule==='D1-b'){
    const confirm=await ui.menu('Switch to '+platformLabel(plan.platforms[0],registry),['Continue'],{backRow:true,selected:1,info:['Mixed routing will be turned off.']});
    if(confirm!==0)continue;
   }
   const prepared=await prepare(installPrepareOptions(plan,{...draft,registry},Object.fromEntries([...catalogs].map(([id,result])=>[id,result.catalog]))));
   if(prepared)return prepared;
  }
 }
}
