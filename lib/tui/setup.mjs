const presetLabel=value=>({economy:'Economy',balanced:'Balanced',smart:'Smart'}[value]??value);
const languageLabel=value=>({en:'EN',ko:'KR'}[value]??value);
import {parsePositiveLimit} from '../limits.mjs';
export function initialSettings(statuses){return Object.fromEntries(['codex','claude'].map(platform=>{const settings=statuses.find(s=>s.platform===platform)?.settings;return[platform,{preset:settings?.modelConfig?.preset??'balanced',language:settings?.language??'en',maxTotalSubagents:settings?.limits?.max_total_subagents??100,maxConcurrentSubagents:settings?.limits?.max_concurrent_subagents??5,skipGlobal:false}];}));}
export function setupOptions(draft,target){if(target==='all'&&JSON.stringify(draft.codex)!==JSON.stringify(draft.claude))throw Error('Target settings differ. Explicitly select common values before applying to both.');return{...draft[target==='all'?'codex':target],target};}
export async function runSetup({ui,statuses,draft,kind,prepare}){
 for(const[key,value]of Object.entries(initialSettings(statuses)))draft[key]??=value;
 let selectedTarget=0;
 while(true){const targetIndex=await ui.menu(kind==='preset'?'Change Preset':'Install / Update',['Codex','Claude','Both targets'],{selected:selectedTarget,backRow:true});if(targetIndex===null)return null;selectedTarget=targetIndex;const target=['codex','claude','all'][targetIndex];
  if(target==='all'&&JSON.stringify(draft.codex)!==JSON.stringify(draft.claude)){
   const choice=await ui.menu('Target settings differ',['Use Codex values for both','Use Claude values for both'],{backRow:true,info:['Codex: '+summary(draft.codex),'Claude: '+summary(draft.claude),'Choosing common values replaces the other target values.']});if(choice===null)continue;const source=choice===0?'codex':'claude';draft.codex={...draft[source]};draft.claude={...draft[source]};
  }
  const settings=draft[target==='all'?'codex':target];let editing=true,selectedField=kind==='preset'?1:0;
  while(editing){const labels=kind==='preset'?['Preset: '+presetLabel(settings.preset),'Apply','Back']:['Preset: '+presetLabel(settings.preset),'Harness language: '+languageLabel(settings.language),'Total subagents: '+settings.maxTotalSubagents,'Concurrent subagents: '+settings.maxConcurrentSubagents,'Apply global settings: '+!settings.skipGlobal,'Apply','Back'];const field=await ui.menu('Settings — '+target,labels,{selected:selectedField,separatorBefore:labels.length-2});if(field===null||field===labels.length-1)break;selectedField=field;
   if(field===0){const value=await ui.menu('Performance preset',['Economy','Balanced','Smart'],{backRow:true,selected:['economy','balanced','smart'].indexOf(settings.preset)});if(value!==null)settings.preset=['economy','balanced','smart'][value];if(kind==='preset')selectedField=1;}
   else if(kind==='install'&&field===1){const value=await ui.menu('Harness output language',['EN','KR'],{backRow:true,selected:settings.language==='ko'?1:0});if(value!==null)settings.language=['en','ko'][value];}
   else if(kind==='install'&&(field===2||field===3)){const key=field===2?'maxTotalSubagents':'maxConcurrentSubagents';let raw=String(settings[key]);while(true){raw=await ui.text(field===2?'Maximum total subagents':'Maximum concurrent subagents',raw);if(raw===null)break;let value;try{value=parsePositiveLimit(raw);}catch{await ui.page('Invalid limit',['Enter a positive safe ASCII decimal integer.']);continue;}settings[key]=value;if(target==='all')draft.claude={...settings};return prepare({kind,...setupOptions(draft,target)});}}
   else if(kind==='install'&&field===4)settings.skipGlobal=!settings.skipGlobal;
   else{if(target==='all')draft.claude={...settings};return prepare({kind,...setupOptions(draft,target)});}
  }
 }
}
export function summary(s){return`preset=${presetLabel(s.preset)}, language=${languageLabel(s.language)}, total=${s.maxTotalSubagents}, concurrent=${s.maxConcurrentSubagents}, global=${!s.skipGlobal}`;}
