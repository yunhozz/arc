import {parsePositiveLimit} from '../limits.mjs';
export function initialSettings(statuses){return Object.fromEntries(['codex','claude'].map(platform=>{const settings=statuses.find(s=>s.platform===platform)?.settings;return[platform,{preset:settings?.modelConfig?.preset??'balanced',language:settings?.language??'en',maxTotalSubagents:settings?.limits?.max_total_subagents??100,maxConcurrentSubagents:settings?.limits?.max_concurrent_subagents??5,skipGlobal:false}];}));}
export function setupOptions(draft,target){if(target==='all'&&JSON.stringify(draft.codex)!==JSON.stringify(draft.claude))throw Error('Target settings differ. Explicitly select common values before applying to both.');return{...draft[target==='all'?'codex':target],target};}
export async function runSetup({ui,statuses,draft,kind,prepare}){
 for(const[key,value]of Object.entries(initialSettings(statuses)))draft[key]??=value;
 let selectedTarget=0;
 while(true){const targetIndex=await ui.menu(kind==='preset'?'Change Preset':'Install / Update',['Codex','Claude','Both targets'],{selected:selectedTarget});if(targetIndex===null)return null;selectedTarget=targetIndex;const target=['codex','claude','all'][targetIndex];
  if(target==='all'&&JSON.stringify(draft.codex)!==JSON.stringify(draft.claude)){
   const choice=await ui.menu('Target settings differ',['Back','Use Codex values for both','Use Claude values for both'],{info:['Codex: '+summary(draft.codex),'Claude: '+summary(draft.claude),'Choosing common values replaces the other target values.']});if(choice===null||choice===0)continue;const source=choice===1?'codex':'claude';draft.codex={...draft[source]};draft.claude={...draft[source]};
  }
  const settings=draft[target==='all'?'codex':target];let editing=true,selectedField=kind==='preset'?1:0;
  while(editing){const labels=kind==='preset'?['Preset: '+settings.preset,'Apply']:['Preset: '+settings.preset,'Harness language: '+settings.language,'Total subagents: '+settings.maxTotalSubagents,'Concurrent subagents: '+settings.maxConcurrentSubagents,'Apply global settings: '+!settings.skipGlobal,'Execute'];const field=await ui.menu('Settings — '+target,labels,{selected:selectedField,separatorBefore:labels.length-1});if(field===null)break;selectedField=field;
   if(field===0){const value=await ui.menu('Performance preset',['Economy','Balanced','Smart'],{selected:['economy','balanced','smart'].indexOf(settings.preset)});if(value!==null)settings.preset=['economy','balanced','smart'][value];if(kind==='preset')selectedField=1;}
   else if(kind==='install'&&field===1){const value=await ui.menu('Harness output language',['English','Korean'],{selected:settings.language==='ko'?1:0});if(value!==null)settings.language=['en','ko'][value];}
   else if(kind==='install'&&(field===2||field===3)){const key=field===2?'maxTotalSubagents':'maxConcurrentSubagents';const raw=await ui.text(field===2?'Maximum total subagents':'Maximum concurrent subagents',String(settings[key]));if(raw!==null)try{settings[key]=parsePositiveLimit(raw);}catch{await ui.page('Invalid limit',['Enter a positive safe ASCII decimal integer.']);}}
   else if(kind==='install'&&field===4)settings.skipGlobal=!settings.skipGlobal;
   else{if(target==='all')draft.claude={...settings};return prepare({kind,...setupOptions(draft,target)});}
  }
 }
}
export function summary(s){return`preset=${s.preset}, language=${s.language}, total=${s.maxTotalSubagents}, concurrent=${s.maxConcurrentSubagents}, global=${!s.skipGlobal}`;}
