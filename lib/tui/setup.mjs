const presetLabel=value=>({economy:'Economy',balanced:'Balanced',smart:'Smart',custom:'Custom'}[value]??value);
const languageLabel=value=>({en:'EN',ko:'KR'}[value]??value);
import {parsePositiveLimit} from '../limits.mjs';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {loadModelConfig,applyPreset,applyCustomRoles,resolveModelSettings,ModelValidationError} from '../models/index.mjs';
import {escapeTerminalText,wrapDetailRows} from './render.mjs';
import {editCustomPreset,editCompositeCustomPreset,selectCatalogPair} from './custom-preset.mjs';
import {assertCompositeCatalogRoles} from '../models/static-catalog.mjs';
import {assertCatalogRoles} from '../models/catalog.mjs';
import {ROLES,effortField,validateRoles} from '../models/config.mjs';
import {validateRoleRoutingConfig} from '../runtime/role-routing-config.mjs';
import {randomUUID} from 'node:crypto';
const presets=['economy','balanced','smart','custom'];
const roleNames=['Scouter','Planner','Implementer','QA','Reviewer'];
export function loadPresetPreviewConfig({context,statuses,kind,target,readText=filename=>readFileSync(filename,'utf8')}){
 if(!['codex','claude'].includes(target)||!['install','preset'].includes(kind))throw Object.assign(Error('Unsupported preset preview target or operation'),{code:'ARC_CLI_INPUT'});
 if(kind==='install')return loadModelConfig(readText(path.join(context.packageRoot,target,'skill/models.toml')),target);
 const config=statuses.find(status=>status.platform===target)?.settings?.modelConfig;
 if(!config)throw new ModelValidationError('Installed model configuration unavailable for '+target);
 const validated=applyPreset(config,config.preset);
 if(validated.platform!==target)throw new ModelValidationError('Model configuration platform does not match target');
 return validated;
}
export function presetRoleRows(config,preset){const resolved=resolveModelSettings(applyPreset(config,preset));return ROLES.map((role,index)=>({role:roleNames[index],model:resolved.roles[role].model,effort:resolved.roles[role][resolved.platform==='codex'?'model_reasoning_effort':'effort']}));}
export function presetPreviewRows(roleRows,{columns=80,rows=24,selectedRole,blink=true,compact=false}={}){
 const values=roleRows.map(({role,model,effort})=>({role:escapeTerminalText(role),model:escapeTerminalText(model),effort:escapeTerminalText(effort)}));
 const cells=value=>[...value].reduce((total,character)=>total+(/[\p{Mark}]/u.test(character)?0:/[\u2190-\u2193\u2500-\u257f\u2588]/u.test(character)?1:character.codePointAt(0)>=0x1100?2:1),0);
 const width=Math.max(20,...values.flatMap(value=>[cells(value.role)+2,cells(value.model),cells('effort: '+value.effort)])),boxWidth=width+4,total=boxWidth*3+4,requiredRows=24;
 if(columns<total+3||rows<requiredRows){
  if(compact){
   const available=Math.max(2,Math.floor(Number(columns)||80)-3),shorten=(value,limit)=>{if(cells(value)<=limit)return value;const suffix=cells('…')<=limit?'…':'';let result='',used=0;for(const character of value){const size=cells(character);if(used+size>Math.max(0,limit-cells(suffix)))break;result+=character;used+=size;}return result+suffix;};
   const roleRow=value=>{const prefix=value.role+': ',room=Math.max(0,available-cells(prefix)-cells(' / ')),modelLimit=Math.min(cells(value.model),Math.ceil(room/2)),effortLimit=Math.min(cells(value.effort),room-modelLimit);return shorten(prefix+shorten(value.model,room-effortLimit)+' / '+shorten(value.effort,effortLimit),available);};
   return [...values.map(roleRow),''];
  }
  return [`Diagram requires ${total+3} columns and ${requiredRows} rows.`];
 }
 const border=(left,right,junction,hidden)=>{const line=[left,...'─'.repeat(width+2),right];if(junction)line[Math.floor(boxWidth/2)]=junction;return hidden?' '.repeat(boxWidth):line.join('');};
 const box=(value,index,up)=>{const hidden=index===selectedRole&&!blink,edge=hidden?' ':'│',label=(index===selectedRole?'> ':'')+value.role;return [border('┌','┐',up?'┴':null,hidden),...[label,value.model,'effort: '+value.effort].map(text=>edge+' '+text+' '.repeat(width-cells(text))+' '+edge),border('└','┘',up?null:'┬',hidden)];};
 const group=(indices,indent,up)=>{const boxes=indices.map(index=>box(values[index],index,up));return Array.from({length:5},(_,row)=>' '.repeat(indent)+boxes.map(lines=>lines[row]).join('  '));};
 const center=Math.floor(boxWidth/2),middle=boxWidth+2+center,right=2*(boxWidth+2)+center,indent=Math.floor((total-(boxWidth*2+2))/2),bottomLeft=indent+center,bottomRight=bottomLeft+boxWidth+2;
 const bus=(left,right,branches,up=false)=>{const line=Array(total).fill(' ');for(let index=left;index<=right;index++)line[index]='─';for(const index of branches)line[index]=index===middle?'┼':up?'┴':'┬';return line.join('').trimEnd();};
 return [...group([0,1,2],0,false),bus(center,right,[center,middle,right],true),' '.repeat(Math.max(0,middle-6))+'Orchestrator',bus(bottomLeft,bottomRight,[bottomLeft,middle,bottomRight]),...group([3,4],indent,true)];
}
export function initialSettings(statuses){return Object.fromEntries(['codex','claude'].map(platform=>{const settings=statuses.find(s=>s.platform===platform)?.settings,custom=settings?.modelConfig?.custom;return[platform,{preset:settings?.modelConfig?.preset??'balanced',language:settings?.language??'en',maxTotalSubagents:settings?.limits?.max_total_subagents??100,maxConcurrentSubagents:settings?.limits?.max_concurrent_subagents??5,skipGlobal:false,...(custom?{customRoles:structuredClone(custom)}:{})}];}));}
export function setupOptions(draft,target,verifiedCatalog,kind){if(!['codex','claude'].includes(target))throw Object.assign(Error('Unsupported setup target'),{code:'ARC_CLI_INPUT'});const {customEdited,customRoles,...settings}=draft[target];return{...settings,target,...(settings.preset==='custom'||customEdited?{customRoles,verifiedCatalog}:kind==='install'&&customRoles?{preservedCustomRoles:customRoles}:{})};}
export async function runSetup({ui,statuses,draft,kind,prepare,loadPreviewConfig,loadCatalog,loadCompositeConfig}){
 for(const[key,value]of Object.entries(initialSettings(statuses)))draft[key]??=value;
 const catalogs=new Map();
 async function catalogFor(target){
  if(catalogs.has(target))return catalogs.get(target);
  let result,invalid=false;try{result=typeof loadCatalog==='function'?await(ui.busy?ui.busy(()=>loadCatalog(target)):loadCatalog(target)):null;}catch(error){if(['ARC_CANCELLED','ARC_TUI_EOF','ARC_TUI_HOME'].includes(error?.code))throw error;}
  if(result?.status==='ready'&&result.catalog?.platform===target&&Array.isArray(result.catalog.pairs)&&result.catalog.pairs.length){try{const pair=result.catalog.pairs[0],field=effortField(target),sample=Object.fromEntries(ROLES.map(role=>[role,{model:pair.model,[field]:pair.effort}]));assertCatalogRoles({platform:target,roles:sample,catalog:result.catalog});for(const candidate of result.catalog.pairs)validateRoles(Object.fromEntries(ROLES.map(role=>[role,{model:candidate.model,[field]:candidate.effort}])),target);catalogs.set(target,result.catalog);return result.catalog;}catch{invalid=true;}}
  if(result?.status==='ready')invalid=true;
  await ui.page('Catalog unavailable',[`${target === 'codex' ? 'Codex' : 'Claude'} model catalog could not be loaded.`,invalid?'The model or effort data is invalid.':'The static catalog is missing or invalid.']);return null;
 }
 async function prepareSettings(target,settings){let catalog;if(settings.preset==='custom'||settings.customEdited){catalog=await catalogFor(target);if(!catalog)return null;try{assertCatalogRoles({platform:target,roles:settings.customRoles,catalog});}catch{await ui.page('Custom preset unavailable',['Select an available model and effort for each role.']);return null;}}return prepare({kind,...setupOptions(draft,target,catalog,kind)});}
 async function composite(){
  const codex=await catalogFor('codex');if(!codex)return null;
  const claude=await catalogFor('claude');if(!claude)return null;
  const platformCatalogs={codex,claude};
  const existing=typeof loadCompositeConfig==='function'?await loadCompositeConfig():null;
  const configs={codex:loadPreviewConfig('codex'),claude:loadPreviewConfig('claude')};
  let presetChoice=existing?null:'balanced',lastBuiltinPreset=null;
  const presetSources=preset=>Object.fromEntries(['codex','claude'].map(platform=>[platform,resolveModelSettings(applyPreset(configs[platform],preset)).roles]));
  const assignment=(platform,role,source)=>({platform,model:source[role].model,effort:source[role][effortField(platform)]});
  const defaultPlatform=index=>[1,4].includes(index)?'claude':'codex';
  const standardRoles=preset=>{const sources=presetSources(preset);return Object.fromEntries(ROLES.map((role,index)=>{const platform=defaultPlatform(index);return[role,assignment(platform,role,sources[platform])];}));};
  let roles=existing?structuredClone(existing.roles):standardRoles(presetChoice);
  let selected=0;
  const missing=value=>!platformCatalogs[value.platform].pairs.some(pair=>pair.model===value.model&&pair.effort===value.effort);
  async function chooseCompositePreset(){
   const current=presetChoice??'balanced';let preview=Math.max(0,presets.indexOf(current));
   while(true){
    const value=await ui.menu('Performance preset',presets.map(presetLabel),{selected:preview,backRow:true,info:({selected,columns,rows})=>{
     const focused=presets[selected]??current,sources=focused==='custom'?null:presetSources(focused);
     const rolePreview=ROLES.map((role,index)=>{const platform=roles[role].platform,value=sources?assignment(platform,role,sources[platform]):roles[role];return{role:roleNames[index]+(missing(value)?' !':''),model:`${platform==='codex'?'Codex':'Claude'} / ${value.model}`,effort:value.effort};});
     return presetPreviewRows(rolePreview,{columns,rows,compact:true});
    }});
    if(value===null)return false;
    preview=value;const chosen=presets[value];
    if(chosen==='custom'){
     const edited=await editCompositeCustomPreset({ui,initialRoles:roles,catalogs:platformCatalogs});
     if(!edited)continue;
     roles=edited;presetChoice='custom';return true;
    }
    if(chosen){
     presetChoice=chosen;lastBuiltinPreset=chosen;const sources=presetSources(chosen);
     for(const role of ROLES){const platform=roles[role].platform;roles[role]=assignment(platform,role,sources[platform]);}
     return true;
    }
   }
  }
  let selectingPreset=true;
  while(true){
   if(selectingPreset){if(!await chooseCompositePreset())return null;selectingPreset=false;}
   const rows=ROLES.map((role,index)=>`${roleNames[index]}${missing(roles[role])?' !':''}: ${roles[role].platform==='codex'?'Codex':'Claude'} / ${escapeTerminalText(roles[role].model)} / ${escapeTerminalText(roles[role].effort)}`);
   const rolePreview=ROLES.map((role,index)=>({role:roleNames[index]+(missing(roles[role])?' !':''),model:`${roles[role].platform==='codex'?'Codex':'Claude'} / ${roles[role].model}`,effort:roles[role].effort}));
   const resetAvailable=ROLES.some((role,index)=>roles[role].platform!==defaultPlatform(index)),controlRows=[`Preset: ${presetChoice?presetLabel(presetChoice):'Select'}`,...(resetAvailable?['Use default role mapping']:[])];
   const choice=await ui.menu('Claude & Codex', [...rows,...controlRows,'Apply'],{selected,backRow:true,refreshMs:600,renderBody:({selected,blink,columns,rows:viewportRows})=>{
    const diagram=presetPreviewRows(rolePreview,{columns,rows:viewportRows,selectedRole:selected<ROLES.length?selected:undefined,blink});
    if(diagram.length===1||diagram.length+controlRows.length+2+4>viewportRows){
     if(columns<40||viewportRows<16)return{rows:['Menu requires 40 columns and 16 rows.'],selected:undefined,position:null};
     const summary=presetPreviewRows(rolePreview,{columns,rows:viewportRows,compact:true}).slice(0,ROLES.length);
     return{rows:[...summary,...controlRows,'Apply','Back'],selected,position:null};
    }
    return{rows:[...diagram,...controlRows,'Apply','Back'],selected:selected<3?1:selected<ROLES.length?9:diagram.length+selected-ROLES.length,showSelection:selected>=ROLES.length};
   }});
   if(choice===null){selectingPreset=true;continue;}
   if(choice===ROLES.length){
    selected=choice;await chooseCompositePreset();continue;
   }
   if(resetAvailable&&choice===ROLES.length+1){
    const preset=lastBuiltinPreset??'balanced';
    if(presetChoice==='custom'||presetChoice===null){
     const sources=presetSources(preset);
     for(const [index,role] of ROLES.entries()){const platform=defaultPlatform(index);if(roles[role].platform!==platform)roles[role]=assignment(platform,role,sources[platform]);}
     presetChoice='custom';
    }else{presetChoice??=preset;roles=standardRoles(presetChoice);}
    selected=ROLES.length;continue;
   }
   if(choice===ROLES.length+controlRows.length){
    const config={version:1,revision:randomUUID(),roles};
    try{validateRoleRoutingConfig(config);assertCompositeCatalogRoles({roles,catalogs:platformCatalogs});}
    catch(error){await ui.page('Composite settings unavailable',[error.message]);continue;}
    return prepare({kind,target:'composite',config});
   }
   if(!ROLES[choice])continue;selected=choice;const role=ROLES[choice],current=roles[role];
   const platformChoice=await ui.menu(`Platform — ${roleNames[choice]}`,['Codex','Claude'],{selected:current.platform==='claude'?1:0,backRow:true});if(platformChoice===null)continue;
   const platform=['codex','claude'][platformChoice];if(!platform)continue;
   const pair=await selectCatalogPair({ui,catalog:platformCatalogs[platform],current,roleName:roleNames[choice]});
   if(pair){roles[role]={platform,...pair};presetChoice='custom';}
  }
 }
 let selectedTarget=0;
 while(true){const targetIndex=await ui.menu(kind==='preset'?'Change Preset':'Install / Update',['Codex','Claude','Claude & Codex'],{selected:selectedTarget,backRow:true});if(targetIndex===null)return null;selectedTarget=targetIndex;if(targetIndex===2){const prepared=await composite();if(prepared)return prepared;continue;}const target=['codex','claude'][targetIndex];
  const settings=draft[target];let editing=true,selectedField=0,openPresetOnEntry=kind==='preset';
  while(editing){const labels=kind==='preset'?['Preset: '+presetLabel(settings.preset),'Apply','Back']:['Preset: '+presetLabel(settings.preset),'Harness language: '+languageLabel(settings.language),'Total subagents: '+settings.maxTotalSubagents,'Concurrent subagents: '+settings.maxConcurrentSubagents,'Apply global settings: '+!settings.skipGlobal,'Apply','Back'];const enteredDirectly=openPresetOnEntry,field=enteredDirectly?0:await ui.menu('Settings — '+target,labels,{selected:selectedField,separatorBefore:labels.length-2});openPresetOnEntry=false;if(field===null||field===labels.length-1)break;selectedField=field;
   if(field===0){
    const config=loadPreviewConfig(target);let preview=presets.indexOf(settings.preset);if(preview<0)preview=1;
    while(true){
     const value=await ui.menu('Performance preset',['Economy','Balanced','Smart','Custom'],{backRow:true,selected:preview,info:({selected,columns,rows})=>{
      const custom=settings.customRoles??config.custom;
      const choice=selected>=presets.length||selected===3&&!custom?settings.preset:presets[selected];
      const previewConfig=choice==='custom'&&custom?applyCustomRoles(config,custom):config;
      return presetPreviewRows(presetRoleRows(previewConfig,choice),{columns,rows,compact:true});
     }});
     if(value===null){if(enteredDirectly)editing=false;break;}
     preview=value;
     if(value<3){
      const choice=presets[value],confirmation=await ui.menu('Performance preset',['Apply'],{backRow:true,renderBody:({selected,columns,rows})=>{
       const previewRows=presetPreviewRows(presetRoleRows(config,choice),{columns,rows,compact:true});
       const compactFooter=rows<9,visible=previewRows.slice(0,Math.max(0,rows-(compactFooter?5:8)));
       return {rows:[...visible,'Are you sure?','','Apply','Back'],selected:visible.length+2+selected,compactFooter,position:null};
      }});
      if(confirmation===null)continue;
      settings.preset=choice;
     }else{
      const catalog=await catalogFor(target);if(!catalog)continue;
      const initial=settings.customRoles??config.custom??resolveModelSettings(applyPreset(config,settings.preset==='custom'?'balanced':settings.preset)).roles;
      const roles=await editCustomPreset({ui,config,initialRoles:initial,catalog});if(!roles)continue;
      settings.customRoles=roles;settings.customEdited=true;settings.preset='custom';
     }
     if(kind==='preset'){const prepared=await prepareSettings(target,settings);if(prepared)return prepared;continue;}
     break;
    }
   }
   else if(kind==='install'&&field===1){const value=await ui.menu('Harness output language',['EN','KR'],{backRow:true,selected:settings.language==='ko'?1:0});if(value!==null)settings.language=['en','ko'][value];}
   else if(kind==='install'&&(field===2||field===3)){const key=field===2?'maxTotalSubagents':'maxConcurrentSubagents';let raw=String(settings[key]);while(true){raw=await ui.text(field===2?'Maximum total subagents':'Maximum concurrent subagents',raw);if(raw===null)break;let value;try{value=parsePositiveLimit(raw);}catch{await ui.page('Invalid limit',['Enter a positive safe ASCII decimal integer.']);continue;}settings[key]=value;break;}}
   else if(kind==='install'&&field===4)settings.skipGlobal=!settings.skipGlobal;
   else{const prepared=await prepareSettings(target,settings);if(prepared)return prepared;}
  }
 }
}
export function summary(s){return`preset=${presetLabel(s.preset)}, language=${languageLabel(s.language)}, total=${s.maxTotalSubagents}, concurrent=${s.maxConcurrentSubagents}, global=${!s.skipGlobal}`;}
