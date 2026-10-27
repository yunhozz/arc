const presetLabel=value=>({economy:'Economy',balanced:'Balanced',smart:'Smart'}[value]??value);
const languageLabel=value=>({en:'EN',ko:'KR'}[value]??value);
import {parsePositiveLimit} from '../limits.mjs';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {loadModelConfig,applyPreset,resolveModelSettings,ModelValidationError} from '../models/index.mjs';
import {escapeTerminalText,wrapDetailRows} from './render.mjs';
const presets=['economy','balanced','smart'];
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
export function presetPreviewRows(roleRows,{columns=80,rows=24}={}){
 const values=roleRows.map(({role,model,effort})=>({role:escapeTerminalText(role),model:escapeTerminalText(model),effort:escapeTerminalText(effort)}));
 const compact=values.map(({role,model,effort})=>role+' / '+model+' / effort: '+effort),budget=Math.max(0,rows-10);
 const cells=value=>[...value].reduce((total,character)=>total+(/[\p{Mark}]/u.test(character)?0:/[\u2190-\u2193\u2500-\u257f\u2588]/u.test(character)?1:character.codePointAt(0)>=0x1100?2:1),0);
 if(columns>=80&&rows>=24&&values.every(value=>[value.role,value.model,'effort: '+value.effort].every(line=>cells(line)<=20))){
  const border=(left,right,junction)=>{const line=[left,...'─'.repeat(22),right];if(junction)line[12]=junction;return line.join('');};
  const box=({role,model,effort},up)=>[border('┌','┐',up?'┴':null),...[role,model,'effort: '+effort].map(value=>'│ '+value+' '.repeat(20-cells(value))+' │'),border('└','┘',up?null:'┬')];
  const group=(indices,indent,up)=>{const boxes=indices.map(index=>box(values[index],up));return Array.from({length:5},(_,row)=>' '.repeat(indent)+boxes.map(lines=>lines[row]).join('  '));};
  const bus=(left,right,branches)=>{const line=Array(77).fill(' ');for(let index=left;index<=right;index++)line[index]='─';for(const index of branches)line[index]=index===38?'┼':'┬';return line.join('').trimEnd();};
  return[...group([0,1,2],0,false),bus(12,64,[12,38,64]),' '.repeat(32)+'Orchestrator',bus(25,51,[25,38,51]),...group([3,4],13,true)];
 }
 return wrapDetailRows(compact,columns).length<=budget?compact:[];
}
export function initialSettings(statuses){return Object.fromEntries(['codex','claude'].map(platform=>{const settings=statuses.find(s=>s.platform===platform)?.settings;return[platform,{preset:settings?.modelConfig?.preset??'balanced',language:settings?.language??'en',maxTotalSubagents:settings?.limits?.max_total_subagents??100,maxConcurrentSubagents:settings?.limits?.max_concurrent_subagents??5,skipGlobal:false}];}));}
export function setupOptions(draft,target){if(!['codex','claude'].includes(target))throw Object.assign(Error('Unsupported setup target'),{code:'ARC_CLI_INPUT'});return{...draft[target],target};}
export async function runSetup({ui,statuses,draft,kind,prepare,loadPreviewConfig}){
 for(const[key,value]of Object.entries(initialSettings(statuses)))draft[key]??=value;
 let selectedTarget=0;
 while(true){const targetIndex=await ui.menu(kind==='preset'?'Change Preset':'Install / Update',['Codex','Claude'],{selected:selectedTarget,backRow:true});if(targetIndex===null)return null;selectedTarget=targetIndex;const target=['codex','claude'][targetIndex];
  const settings=draft[target];let editing=true,selectedField=0;
  while(editing){const labels=kind==='preset'?['Preset: '+presetLabel(settings.preset),'Apply','Back']:['Preset: '+presetLabel(settings.preset),'Harness language: '+languageLabel(settings.language),'Total subagents: '+settings.maxTotalSubagents,'Concurrent subagents: '+settings.maxConcurrentSubagents,'Apply global settings: '+!settings.skipGlobal,'Apply','Back'];const field=await ui.menu('Settings — '+target,labels,{selected:selectedField,separatorBefore:labels.length-2});if(field===null||field===labels.length-1)break;selectedField=field;
   if(field===0){const config=loadPreviewConfig(target);let preview=presets.indexOf(settings.preset);const value=await ui.menu('Performance preset',['Economy','Balanced','Smart'],{backRow:true,selected:preview,info:({selected,columns,rows})=>{if(selected<presets.length)preview=selected;return presetPreviewRows(presetRoleRows(config,presets[preview]),{columns,rows});}});if(value!==null)settings.preset=presets[value];if(kind==='preset')selectedField=1;}
   else if(kind==='install'&&field===1){const value=await ui.menu('Harness output language',['EN','KR'],{backRow:true,selected:settings.language==='ko'?1:0});if(value!==null)settings.language=['en','ko'][value];}
   else if(kind==='install'&&(field===2||field===3)){const key=field===2?'maxTotalSubagents':'maxConcurrentSubagents';let raw=String(settings[key]);while(true){raw=await ui.text(field===2?'Maximum total subagents':'Maximum concurrent subagents',raw);if(raw===null)break;let value;try{value=parsePositiveLimit(raw);}catch{await ui.page('Invalid limit',['Enter a positive safe ASCII decimal integer.']);continue;}settings[key]=value;break;}}
   else if(kind==='install'&&field===4)settings.skipGlobal=!settings.skipGlobal;
   else{return prepare({kind,...setupOptions(draft,target)});}
  }
 }
}
export function summary(s){return`preset=${presetLabel(s.preset)}, language=${languageLabel(s.language)}, total=${s.maxTotalSubagents}, concurrent=${s.maxConcurrentSubagents}, global=${!s.skipGlobal}`;}
