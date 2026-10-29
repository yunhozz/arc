const presetLabel=value=>({economy:'Economy',balanced:'Balanced',smart:'Smart',custom:'Custom'}[value]??value);
const languageLabel=value=>({en:'EN',ko:'KR'}[value]??value);
import {parsePositiveLimit} from '../limits.mjs';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {loadModelConfig,applyPreset,applyCustomRoles,resolveModelSettings,ModelValidationError} from '../models/index.mjs';
import {escapeTerminalText,wrapDetailRows} from './render.mjs';
import {editCustomPreset} from './custom-preset.mjs';
import {assertCatalogRoles} from '../models/catalog.mjs';
import {ROLES,effortField,validateRoles} from '../models/config.mjs';
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
export function presetRoleRows(config,preset){const resolved=resolveModelSettings(applyPreset(config,preset));return Object.values(resolved.roles).map((settings,index)=>({role:roleNames[index],model:settings.model,effort:settings[resolved.platform==='codex'?'model_reasoning_effort':'effort']}));}
export function presetPreviewRows(roleRows,{columns=80,rows=24,selectedRole,blink=true,compact=false}={}){
 const values=roleRows.map(({role,model,effort})=>({role:escapeTerminalText(role),model:escapeTerminalText(model),effort:escapeTerminalText(effort)}));
 const cells=value=>[...value].reduce((total,character)=>total+(/[\p{Mark}]/u.test(character)?0:/[\u2190-\u2193\u2500-\u257f\u2588]/u.test(character)?1:character.codePointAt(0)>=0x1100?2:1),0);
 const width=Math.max(20,...values.flatMap(value=>[cells(value.role)+2,cells(value.model),cells('effort: '+value.effort)])),boxWidth=width+4,total=boxWidth*3+4,requiredRows=24;
 if(columns<total+3||rows<requiredRows){
  if(compact){
   const available=Math.max(2,Math.floor(Number(columns)||80)-3),shorten=(value,limit)=>{if(cells(value)<=limit)return value;let result='',used=0;for(const character of value){const size=cells(character);if(used+size>Math.max(0,limit-1))break;result+=character;used+=size;}return result+'…';};
   const roleRow=value=>{const limit=Math.max(1,available-cells(value.role)-cells(':  / '+value.effort));return value.role+': '+shorten(value.model,limit)+' / '+value.effort;};
   return [...values.map(roleRow),''];
  }
  return [`Diagram requires ${total+3} columns and ${requiredRows} rows.`];
 }
 const border=(left,right,junction,hidden)=>{const line=[left,...'─'.repeat(width+2),right];if(junction)line[Math.floor(boxWidth/2)]=junction;return hidden?' '.repeat(boxWidth):line.join('');};
 const box=(value,index,up)=>{const hidden=index===selectedRole&&!blink,edge=hidden?' ':'│',label=(index===selectedRole?'> ':'')+value.role;return [border('┌','┐',up?'┴':null,hidden),...[label,value.model,'effort: '+value.effort].map(text=>edge+' '+text+' '.repeat(width-cells(text))+' '+edge),border('└','┘',up?null:'┬',hidden)];};
 const group=(indices,indent,up)=>{const boxes=indices.map(index=>box(values[index],index,up));return Array.from({length:5},(_,row)=>' '.repeat(indent)+boxes.map(lines=>lines[row]).join('  '));};
 const center=Math.floor(boxWidth/2),middle=boxWidth+2+center,right=2*(boxWidth+2)+center,indent=Math.floor((total-(boxWidth*2+2))/2),bottomLeft=indent+center,bottomRight=bottomLeft+boxWidth+2;
 const bus=(left,right,branches)=>{const line=Array(total).fill(' ');for(let index=left;index<=right;index++)line[index]='─';for(const index of branches)line[index]=index===middle?'┼':'┬';return line.join('').trimEnd();};
 return [...group([0,1,2],0,false),bus(center,right,[center,middle,right]),' '.repeat(Math.max(0,middle-6))+'Orchestrator',bus(bottomLeft,bottomRight,[bottomLeft,middle,bottomRight]),...group([3,4],indent,true)];
}
export function initialSettings(statuses){return Object.fromEntries(['codex','claude'].map(platform=>{const settings=statuses.find(s=>s.platform===platform)?.settings,custom=settings?.modelConfig?.custom;return[platform,{preset:settings?.modelConfig?.preset??'balanced',language:settings?.language??'en',maxTotalSubagents:settings?.limits?.max_total_subagents??100,maxConcurrentSubagents:settings?.limits?.max_concurrent_subagents??5,skipGlobal:false,...(custom?{customRoles:structuredClone(custom)}:{})}];}));}
export function setupOptions(draft,target,verifiedCatalog,kind){if(!['codex','claude'].includes(target))throw Object.assign(Error('Unsupported setup target'),{code:'ARC_CLI_INPUT'});const {customEdited,customRoles,...settings}=draft[target];return{...settings,target,...(settings.preset==='custom'||customEdited?{customRoles,verifiedCatalog}:kind==='install'&&customRoles?{preservedCustomRoles:customRoles}:{})};}
export async function runSetup({ui,statuses,draft,kind,prepare,loadPreviewConfig,loadCatalog}){
 for(const[key,value]of Object.entries(initialSettings(statuses)))draft[key]??=value;
 const catalogs=new Map();
 async function catalogFor(target){
  if(catalogs.has(target))return catalogs.get(target);
  let result;try{result=typeof loadCatalog==='function'?await(ui.busy?ui.busy(()=>loadCatalog(target)):loadCatalog(target)):null;}catch(error){if(['ARC_CANCELLED','ARC_TUI_EOF','ARC_TUI_HOME'].includes(error?.code))throw error;}
  if(result?.status==='ready'&&result.catalog?.platform===target&&Array.isArray(result.catalog.pairs)&&result.catalog.pairs.length){try{const pair=result.catalog.pairs[0],field=effortField(target),sample=Object.fromEntries(ROLES.map(role=>[role,{model:pair.model,[field]:pair.effort}]));assertCatalogRoles({platform:target,roles:sample,catalog:result.catalog});for(const candidate of result.catalog.pairs)validateRoles(Object.fromEntries(ROLES.map(role=>[role,{model:candidate.model,[field]:candidate.effort}])),target);catalogs.set(target,result.catalog);return result.catalog;}catch{}}
  await ui.page('Catalog unavailable',['Model catalog could not be loaded.']);return null;
 }
 let selectedTarget=0;
 while(true){const targetIndex=await ui.menu(kind==='preset'?'Change Preset':'Install / Update',['Codex','Claude'],{selected:selectedTarget,backRow:true});if(targetIndex===null)return null;selectedTarget=targetIndex;const target=['codex','claude'][targetIndex];
  const settings=draft[target];let editing=true,selectedField=0;
  while(editing){const labels=kind==='preset'?['Preset: '+presetLabel(settings.preset),'Apply','Back']:['Preset: '+presetLabel(settings.preset),'Harness language: '+languageLabel(settings.language),'Total subagents: '+settings.maxTotalSubagents,'Concurrent subagents: '+settings.maxConcurrentSubagents,'Apply global settings: '+!settings.skipGlobal,'Apply','Back'];const field=await ui.menu('Settings — '+target,labels,{selected:selectedField,separatorBefore:labels.length-2});if(field===null||field===labels.length-1)break;selectedField=field;
   if(field===0){
    const config=loadPreviewConfig(target);let preview=presets.indexOf(settings.preset);if(preview<0)preview=1;
    const value=await ui.menu('Performance preset',['Economy','Balanced','Smart','Custom'],{backRow:true,selected:preview,info:({selected,columns,rows})=>{
     const custom=settings.customRoles??config.custom;
     const choice=selected>=presets.length||selected===3&&!custom?settings.preset:presets[selected];
     const previewConfig=choice==='custom'&&custom?applyCustomRoles(config,custom):config;
     return presetPreviewRows(presetRoleRows(previewConfig,choice),{columns,rows,compact:true});
    }});
    if(value!==null&&value<3)settings.preset=presets[value];
    else if(value===3){const catalog=await catalogFor(target);if(catalog){const initial=settings.customRoles??config.custom??resolveModelSettings(applyPreset(config,settings.preset==='custom'?'balanced':settings.preset)).roles;const roles=await editCustomPreset({ui,config,initialRoles:initial,catalog});if(roles){settings.customRoles=roles;settings.customEdited=true;settings.preset='custom';}}}
    if(kind==='preset')selectedField=1;
   }
   else if(kind==='install'&&field===1){const value=await ui.menu('Harness output language',['EN','KR'],{backRow:true,selected:settings.language==='ko'?1:0});if(value!==null)settings.language=['en','ko'][value];}
   else if(kind==='install'&&(field===2||field===3)){const key=field===2?'maxTotalSubagents':'maxConcurrentSubagents';let raw=String(settings[key]);while(true){raw=await ui.text(field===2?'Maximum total subagents':'Maximum concurrent subagents',raw);if(raw===null)break;let value;try{value=parsePositiveLimit(raw);}catch{await ui.page('Invalid limit',['Enter a positive safe ASCII decimal integer.']);continue;}settings[key]=value;break;}}
   else if(kind==='install'&&field===4)settings.skipGlobal=!settings.skipGlobal;
   else{let catalog;if(settings.preset==='custom'||settings.customEdited){catalog=await catalogFor(target);if(!catalog)continue;try{assertCatalogRoles({platform:target,roles:settings.customRoles,catalog});}catch{await ui.page('Custom preset unavailable',['Select an available model and effort for each role.']);continue;}}return prepare({kind,...setupOptions(draft,target,catalog,kind)});}
  }
 }
}
export function summary(s){return`preset=${presetLabel(s.preset)}, language=${languageLabel(s.language)}, total=${s.maxTotalSubagents}, concurrent=${s.maxConcurrentSubagents}, global=${!s.skipGlobal}`;}
