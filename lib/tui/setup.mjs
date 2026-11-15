import {parsePositiveLimit} from '../limits.mjs';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {loadModelConfig,resolveModelSettings,ModelValidationError} from '../models/index.mjs';
import {escapeTerminalText,cellWidth} from './render.mjs';
import {editPlatformRoles,editCompositeRoles} from './custom-preset.mjs';
import {assertCatalogRoles} from '../models/catalog.mjs';
import {ROLES,effortField,validateRoles} from '../models/config.mjs';
import {validateRoleRoutingConfig} from '../runtime/role-routing-config.mjs';
import {randomUUID} from 'node:crypto';
import {DEFAULT_INSTALLER_REGISTRY,platformLabel,sortByDisplay} from '../platforms/index.mjs';
import {platformAvailability,reasonDetail,REASON_TEXT} from '../platforms/availability.mjs';
import {createPlatformRegistry} from '../runtime/platform-registry.mjs';
import {buildRoleRoutingConfig} from '../runtime/role-routing-config.mjs';
import {deriveInstallPlan} from './derive-install-plan.mjs';
import {diagramRows} from './diagram.mjs';
import {editRole} from './custom-preset.mjs';
const label = value => ({codex:'Codex',claude:'Claude',composite:'Claude & Codex'}[value]);
const languageLabel = value => value === 'ko' ? 'KR' : 'EN';
export function loadRoleDefaults({context,statuses,target,readText=filename=>readFileSync(filename,'utf8')}) {
 if(!['codex','claude'].includes(target))throw new ModelValidationError('Unsupported role target');
 const installed=statuses.find(status=>status.platform===target)?.settings?.modelConfig;
 const config=installed??loadModelConfig(readText(path.join(context.packageRoot,target,'skill/models.toml')),target);
 const resolved=resolveModelSettings(config);if(resolved.platform!==target)throw new ModelValidationError('Model configuration platform does not match target');
 return resolved.roles;
}
export function presetPreviewRows(roleRows,{columns=80,rows=24,selectedRole,blink=true,compact=false}={}){
 const values=roleRows.map(({role,model,effort,platform})=>({role:escapeTerminalText(role),model:escapeTerminalText(model),effort:escapeTerminalText(effort),platform:{codex:'Codex',claude:'Claude'}[platform]}));
 const cells=value=>[...value].reduce((total,character)=>total+cellWidth(character),0);
 const width=Math.max(20,...values.flatMap(value=>[cells(value.role)+2,cells(value.model),cells('effort: '+value.effort)])),boxWidth=width+4,total=boxWidth*3+4,requiredRows=24;
 if(columns<total+3||rows<requiredRows){
  if(compact){
   const available=Math.max(2,Math.floor(Number(columns)||80)-3),shorten=(value,limit)=>{if(cells(value)<=limit)return value;const suffix=cells('…')<=limit?'…':'';let result='',used=0;for(const character of value){const size=cells(character);if(used+size>Math.max(0,limit-cells(suffix)))break;result+=character;used+=size;}return result+suffix;};
   const roleRow=value=>{const model=value.platform?value.platform+' / '+value.model:value.model,prefix=value.role+': ',room=Math.max(0,available-cells(prefix)-cells(' / ')),modelLimit=Math.min(cells(model),Math.ceil(room/2)),effortLimit=Math.min(cells(value.effort),room-modelLimit);return shorten(prefix+shorten(model,room-effortLimit)+' / '+shorten(value.effort,effortLimit),available);};
   return [...values.map(roleRow),''];
  }
  return [`Diagram requires ${total+3} columns and ${requiredRows} rows.`];
 }
 const border=(left,right,junction,hidden,platform)=>{const line=[left,...'─'.repeat(width+2),right];if(junction)line[Math.floor(boxWidth/2)]=junction;if(platform)[...` ${platform} `].forEach((character,offset)=>{line[2+offset]=character;});return hidden?line.map((character,index)=>platform&&index>=2&&index<4+cells(platform)?character:' ').join(''):line.join('');};
 const box=(value,index,up)=>{const hidden=index===selectedRole&&!blink,edge=hidden?' ':'│',label=(index===selectedRole?'> ':'')+value.role;return [border('┌','┐',up?'┴':null,hidden,value.platform),...[label,value.model,'effort: '+value.effort].map(text=>edge+' '+text+' '.repeat(width-cells(text))+' '+edge),border('└','┘',up?null:'┬',hidden)];};
 const group=(indices,indent,up)=>{const boxes=indices.map(index=>box(values[index],index,up));return Array.from({length:5},(_,row)=>' '.repeat(indent)+boxes.map(lines=>lines[row]).join('  '));};
 const center=Math.floor(boxWidth/2),middle=boxWidth+2+center,right=2*(boxWidth+2)+center,indent=Math.floor((total-(boxWidth*2+2))/2),bottomLeft=indent+center,bottomRight=bottomLeft+boxWidth+2;
 const bus=(left,right,branches,up=false)=>{const line=Array(total).fill(' ');for(let index=left;index<=right;index++)line[index]='─';for(const index of branches)line[index]=index===middle?'┼':up?'┴':'┬';return line.join('').trimEnd();};
 return [...group([0,1,2],0,false),bus(center,right,[center,middle,right],true),' '.repeat(Math.max(0,middle-6))+'Orchestrator',bus(bottomLeft,bottomRight,[bottomLeft,middle,bottomRight]),...group([3,4],indent,true)];
}
export function initialSettings(statuses) {
 return Object.fromEntries(['codex','claude'].map(platform=>{
  const settings=statuses.find(status=>status.platform===platform)?.settings;
  return [platform,{language:settings?.language??'en',maxTotalSubagents:settings?.limits?.max_total_subagents??100,maxConcurrentSubagents:settings?.limits?.max_concurrent_subagents??5,skipGlobal:false}];
 }));
}
export function setupOptions(draft,target,verifiedCatalog,kind) {
 if(!['codex','claude'].includes(target))throw Object.assign(Error('Unsupported setup target'),{code:'ARC_CLI_INPUT'});
 return {target,...draft[target],verifiedCatalog};
}
async function editSettings(ui,target,settings) {
 let selected=0;
 while(true){
  const choice=await ui.menu('Settings — '+label(target),['Language: '+languageLabel(settings.language),'Total subagents: '+settings.maxTotalSubagents,'Concurrent subagents: '+settings.maxConcurrentSubagents,'Global config: '+(settings.skipGlobal?'Off':'On'),'Back'],{selected});
  if(choice===null||choice===4)return;selected=choice;
  if(choice===0){const value=await ui.menu('Language',['EN','KR'],{backRow:true,selected:settings.language==='ko'?1:0});if(value!==null)settings.language=['en','ko'][value];}
  else if(choice===1||choice===2){
   const key=choice===1?'maxTotalSubagents':'maxConcurrentSubagents';let raw=String(settings[key]);
   while(true){raw=await ui.text(choice===1?'Total subagents':'Concurrent subagents',raw);if(raw===null)break;
    let value;try{value=parsePositiveLimit(raw);}catch{await ui.page('Invalid limit',['Enter a positive whole number.']);continue;}
    settings[key]=value;if(choice===2)settings.concurrentSelected=true;break;
   }
  }else if(choice===3)settings.skipGlobal=!settings.skipGlobal;
 }
}
export async function runSetup({ui,statuses,draft,kind,prepare,loadRoleDefaults:defaults,loadCatalog,loadCompositeConfig,loadInstallMode}) {
 for(const [key,value] of Object.entries(initialSettings(statuses)))draft[key]??=value;
 const catalogs=new Map();
 async function catalogFor(platform){
  if(catalogs.has(platform))return catalogs.get(platform);
  try{
   const result=await (ui.busy?ui.busy(()=>loadCatalog(platform)):loadCatalog(platform));
   const catalog=result?.catalog;
   if(result?.status==='ready'&&catalog?.platform===platform&&Array.isArray(catalog.pairs)&&catalog.pairs.length){
    const field=effortField(platform);
    for(const pair of catalog.pairs){const roles=Object.fromEntries(ROLES.map(role=>[role,{model:pair.model,[field]:pair.effort}]));validateRoles(roles,platform);assertCatalogRoles({platform,roles,catalog});}
    catalogs.set(platform,catalog);return catalog;
   }
  }catch(error){if(['ARC_CANCELLED','ARC_TUI_EOF','ARC_TUI_HOME'].includes(error?.code))throw error;}
  await ui.page('Catalog unavailable',[label(platform)+' model catalog is missing or invalid.']);return null;
 }
 async function composite(){
  const codex=await catalogFor('codex');if(!codex)return null;
  const claude=await catalogFor('claude');if(!claude)return null;
  if(!draft.composite){
   const existing=await loadCompositeConfig?.();
   if(existing)draft.composite=structuredClone(existing.roles);
   else{
    const sources={codex:await defaults('codex'),claude:await defaults('claude')};
    draft.composite=Object.fromEntries(ROLES.map((role,index)=>{const platform=[1,4].includes(index)?'claude':'codex',value=sources[platform][role];return [role,{platform,model:value.model,effort:value[effortField(platform)]}];}));
   }
  }
  if(kind==='install'&&!draft.compositeSettings){const existing=['codex','claude'].map(p=>statuses.find(s=>s.platform===p&&s.state==='installed')).find(Boolean);draft.compositeSettings={...initialSettings(statuses)[existing?.platform??'codex']};}
  while(true){
   const edited=await editCompositeRoles({ui,initialRoles:draft.composite,catalogs:{codex,claude},settingsRow:kind==='install'});if(!edited)return null;
   draft.composite=edited.roles;
   if(edited.action==='settings'){await editSettings(ui,'composite',draft.compositeSettings);continue;}
   const config={version:1,revision:randomUUID(),roles:edited.roles};
   try{validateRoleRoutingConfig(config);}catch(error){await ui.page('Claude & Codex unavailable',[error.message]);continue;}
   return prepare({kind,target:'composite',config,...(kind==='install'?{settings:{...draft.compositeSettings}}:{})});
  }
 }
 let selectedTarget=0;
 while(true){
  const targetIndex=await ui.menu(kind==='preset'?'Change Models':'Install / Update',['Codex','Claude','Claude & Codex'],{selected:selectedTarget,backRow:true});
  if(targetIndex===null)return null;selectedTarget=targetIndex;
  if(targetIndex===2){const prepared=await composite();if(prepared)return prepared;continue;}
  const target=['codex','claude'][targetIndex];if(!target)continue;
  let switchFromComposite=false;
  if(await loadInstallMode?.()==='composite'){
   const choice=await ui.menu('Switch to '+label(target),['Continue'],{backRow:true,selected:1,info:['Claude & Codex will be turned off.']});
   if(choice!==0)continue;switchFromComposite=true;
  }
  const catalog=await catalogFor(target);if(!catalog)continue;
  if(switchFromComposite)draft[target].roles=await defaults(target);
  else draft[target].roles??=await defaults(target);
  while(true){
   const edited=await editPlatformRoles({ui,title:label(target),platform:target,initialRoles:draft[target].roles,catalog,settingsRow:kind==='install'});if(!edited)break;
   draft[target].roles=edited.roles;
   if(edited.action==='settings'){await editSettings(ui,target,draft[target]);continue;}
   const prepared=await prepare({kind,...setupOptions(draft,target,catalog,kind),...(switchFromComposite?{switchFromComposite:true}:{})});if(prepared)return prepared;
  }
 }
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
