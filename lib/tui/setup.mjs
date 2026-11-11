import {parsePositiveLimit} from '../limits.mjs';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {loadModelConfig,resolveModelSettings,ModelValidationError} from '../models/index.mjs';
import {escapeTerminalText} from './render.mjs';
import {editPlatformRoles,editCompositeRoles} from './custom-preset.mjs';
import {assertCatalogRoles} from '../models/catalog.mjs';
import {ROLES,effortField,validateRoles} from '../models/config.mjs';
import {validateRoleRoutingConfig} from '../runtime/role-routing-config.mjs';
import {randomUUID} from 'node:crypto';
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
 const cells=value=>[...value].reduce((total,character)=>total+(/[\p{Mark}]/u.test(character)?0:/[\u2190-\u2193\u2500-\u257f\u2588]/u.test(character)?1:character.codePointAt(0)>=0x1100?2:1),0);
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
