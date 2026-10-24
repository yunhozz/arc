import {createTerminalSession} from './terminal.mjs';
import path from 'node:path';
import {escapeTerminalText,navigationHint,wrapDetailRows} from './render.mjs';
import {createManagementContext,prepareOperation,executeOperation} from '../management/operations.mjs';
import {collectStatus} from '../management/status.mjs';
import {runSetup,summary} from './setup.mjs';
const home=['Configure','Update','Uninstall','Exit'];
function interrupted(){return Object.assign(Error('Session interrupted'),{code:'ARC_CANCELLED'});}
function operationRows(prepared){
 const groups=new Map();
 function groupFor(plan){const target=plan.target??plan,platform=target.platform??'harness',home=target.home??'',key=platform+'\0'+home;if(!groups.has(key))groups.set(key,{platform,home,Changes:new Map(),Deletions:new Map(),Preserved:new Map(),known:new Set(),notes:new Set()});return groups.get(key);}
 function add(group,category,values){if(!Array.isArray(values))return;group.known.add(category);for(const item of values){const filename=typeof item==='string'?item:item.path??item.destination??item.relativePath;const description=typeof item==='object'?(item.action??item.description??item.note):undefined;const key=filename?path.normalize(filename):String(description??'Managed item');if(!group[category].has(key))group[category].set(key,{path:filename??'Managed item',descriptions:new Set()});if(description)group[category].get(key).descriptions.add(description);}}
 for(const plan of prepared.plans??[]){const group=groupFor(plan);if(prepared.kind!=='uninstall')add(group,'Changes',plan.managedPaths);for(const values of [plan.writes,plan.externalPaths,plan.globalChanges])add(group,'Changes',values);for(const values of [plan.deletes,plan.removals])add(group,'Deletions',values);for(const values of [plan.preserved,plan.preserve])add(group,'Preserved',values);for(const note of plan.summary??[])group.notes.add(note);}
 for(const entry of prepared.state?.targets??[])groupFor(entry);
 const targets=[...new Set([...groups.values()].map(group=>group.platform))];
 if(!targets.length&&prepared.options?.target)targets.push(prepared.options.target==='all'?'codex, claude':prepared.options.target);
 const rows=['Operation: '+prepared.kind,'Targets: '+(targets.join(', ')||'not supplied')];
 for(const group of groups.values())rows.push(group.platform+': '+['Changes','Deletions','Preserved'].map(category=>category+': '+(group.known.has(category)?group[category].size+' listed':'not supplied')).join(' | '));
 const impacts=[];
 if(prepared.kind==='install')impacts.push('Settings: '+summary(prepared.options??{}),'External references must be downloaded after applying.');
 if(prepared.kind==='preset')impacts.push('Only the performance preset and managed profiles change. Other settings are preserved.');
 if(prepared.kind==='uninstall')impacts.push('Remove ARC harness and managed profiles.',prepared.options?.skipGlobal?'Preserve ARC global instruction blocks.':'Remove selected ARC global instruction blocks.','Preserve native concurrency, user files, other skills and workflow audit state.','CLI npm package is retained.');
 if(prepared.kind==='update')impacts.push('Installed settings are preserved.','If the global CLI is replaced, this session ends. npx does not replace the global CLI.');
 rows.push(...impacts,'Counts describe unique listed paths, not every affected file.');
 if(!prepared.plans?.length)rows.push('Detailed paths are not supplied by this prepared operation.');
 for(const group of groups.values()){
  rows.push('Target: '+group.platform,...(group.home?['Destination: '+group.home]:[]));
  for(const category of ['Changes','Deletions','Preserved']){rows.push(category+': '+(group.known.has(category)?group[category].size+' listed paths':'not supplied'));for(const item of group[category].values()){rows.push(item.path);for(const description of item.descriptions)rows.push('  '+description);}}
  if(group.notes.size)rows.push('Notes:',...group.notes);
 }
 return rows;
}
export function createTuiInterface(session,{input,controller}={}){
 async function event(){const e=await session.nextEvent();if(e.name==='interrupt')throw interrupted();if(e.name==='eof')throw Object.assign(Error('Session closed'),{code:'ARC_TUI_EOF'});if(e.name==='error')throw e.error;return e;}
 async function menu(title,rows,{selected=0,info=[],requiresConfirmation=false,backLabel='back',wordmark=false}={}){
  while(true){const offset=Math.max(0,selected-7),visible=rows.slice(offset,offset+8),information=wrapDetailRows(info,session.viewport().columns);if(wordmark&&information.length)information.push('');const screen={title,wordmark,rows:[...information,...visible],selected:information.length+selected-offset,requiresConfirmation:requiresConfirmation&&rows[selected]==='Apply',hint:navigationHint('menu',{backLabel}),...(rows.length>8?{position:(offset+1)+'-'+Math.min(offset+8,rows.length)+'/'+rows.length}:{})};const rendered=session.render(screen);const e=await event();if(e.name==='up')selected=(selected+rows.length-1)%rows.length;else if(e.name==='down')selected=(selected+1)%rows.length;else if(e.name==='back')return null;else if(e.name==='enter'&&(!screen.requiresConfirmation||rendered.applyEnabled))return selected;}
 }
 async function text(title,initial=''){let value=initial;while(true){session.render({title,rows:[value],hint:navigationHint('text')});const e=await event();if(e.name==='text'||e.name==='paste')value+=e.text;else if(e.name==='left')value=[...value].slice(0,-1).join('');else if(e.name==='back')return null;else if(e.name==='enter')return value;}}
 async function page(title,rows,{requireRead=false}={}){
  let offset=0,confirmed=0,dimensions='';
  while(true){const viewport=session.viewport(),current=viewport.columns+'x'+viewport.rows;if(current!==dimensions){if(requireRead){offset=0;confirmed=0;}dimensions=current;}
   const wrapped=wrapDetailRows(rows,viewport.columns),size=Math.max(1,viewport.rows-3),last=Math.max(0,wrapped.length-size);
   offset=Math.min(offset,last);const slice=wrapped.slice(offset,offset+size),hasNext=offset+size<wrapped.length;
   const rendered=session.render({title,rows:slice,requiresConfirmation:requireRead,position:`Rows ${offset+1}-${Math.min(offset+size,wrapped.length)} of ${wrapped.length}`,hint:navigationHint(requireRead?'reviewPage':'page',{hasNext})});const e=await event();
   if(e.name==='down')offset=Math.min(requireRead?Math.min(last,confirmed):last,offset+1);else if(e.name==='up')offset=Math.max(0,offset-1);else if(e.name==='back')return false;
   else if(e.name==='enter'&&(!requireRead||rendered.applyEnabled)){
    if(!requireRead)return true;
    // Acknowledge only contiguous, fully displayed rows. Scrolling cannot jump ahead.
    if(offset<=confirmed)confirmed=Math.max(confirmed,offset+slice.length);
    if(confirmed>=wrapped.length)return true;offset=Math.min(last,confirmed);
   }
  }
 }
 async function review(title,prepared){
  const rows=operationRows(prepared),editable=prepared.kind!=='update',actions=editable?['Cancel','Edit','Apply','Details']:['Cancel','Apply','Details'];
  const info=rows.slice(0,2);for(const row of rows.slice(2)){if(row.startsWith('Target:'))break;info.push(row);}
  while(true){const choice=await menu('Review '+title,actions,{info,requiresConfirmation:true});
   if(choice===null)return editable?'edit':'cancel';const action=actions[choice];if(action==='Cancel')return'cancel';if(action==='Edit')return'edit';
   if(action==='Apply'){if(!await page('Review all changes',rows,{requireRead:true}))continue;const confirm=await menu('Confirm '+title,['Cancel','Apply'],{info:['All details reviewed. Apply the prepared snapshot?'],requiresConfirmation:true});if(confirm!==1)continue;return'apply';}
   if(action==='Details')await page('Change details',rows);
  }
 }
 async function busy(action){session.render({title:'Working',rows:['Operation in progress. Please wait.'],hint:navigationHint('busy')});session.setBusy(true);const wasFlowing=input?.readableFlowing;const onData=chunk=>{if(String(chunk).includes('\x03')||String(chunk).includes('\x04'))controller?.abort();};input?.on('data',onData);try{const result=await action();if(controller?.signal.aborted){if(typeof result?.code!=='number')throw interrupted();return{...result,code:130,interrupted:true};}return result;}finally{input?.removeListener('data',onData);if(wasFlowing!==true)input?.pause?.();session.setBusy(false);session.discardInput();}}
 return{menu,text,page,review,busy};
}
export function resultRows(result){return[...(result.messages??[]).map(s=>s.trim()),...[result.stdout,result.stderr].flatMap(text=>text?text.trimEnd().split(/\r?\n/):[]),...(result.results??[]).flatMap(item=>[`${item.platform??item.target?.platform??'Target'}: ${item.status}; rollback: ${item.rollback??'not needed'}`,...(item.residualPaths??[]).map(p=>'Residual path: '+p),...(item.error?['Error: '+item.error.message]:[])]),...(result.error?['Error: '+result.error.message]:[]),'Exit code: '+result.code,...(result.code===0?['Open a new agent session to use changed harness settings.']:['Review the failed target and retry from the menu.']),...(result.exitSession?['CLI replacement ended this session. Run arc again for further management.']:[])];}
export async function runTui(options={}){
 let session=options.session,code=0,finalReport;const controller=new AbortController(),signals=options.signals??process;const abort=()=>controller.abort();signals.on('SIGINT',abort);signals.on('SIGTERM',abort);
 try{session??=createTerminalSession(options);const ui=createTuiInterface(session,{input:options.input??process.stdin,controller}),api={collectStatus,prepareOperation,executeOperation,...options.services},context=options.context?{...options.context,signal:controller.signal}:await createManagementContext({...options.contextOptions,signal:controller.signal});const draft={};let selected=0;
  async function execute(prepared){
   if(!prepared)return;const result=await ui.busy(()=>api.executeOperation(context,prepared));code=result.code;
   if(code===130||result.exitSession){finalReport=resultRows(result);if(result.exitSession)session.render({title:'Result',rows:finalReport,hint:'Session ended'});return true;}
   await ui.page('Result',resultRows(result));return false;
  }
  async function uninstall(){
   let target=0,global=0;
   while(true){const nextTarget=await ui.menu('Uninstall target',['Codex','Claude','Both targets'],{selected:target});if(nextTarget===null)return null;target=nextTarget;
    while(true){const nextGlobal=await ui.menu('Global ARC instructions',['Remove ARC blocks','Preserve ARC blocks'],{selected:global});if(nextGlobal===null)break;global=nextGlobal;
     const prepared=await ui.busy(()=>api.prepareOperation(context,{kind:'uninstall',target:['codex','claude','all'][target],skipGlobal:global===1}));const decision=await ui.review('Uninstall',prepared);if(decision==='apply')return prepared;if(decision==='cancel')return null;
    }
   }
  }
  while(true){const statuses=await api.collectStatus(context),ordered=[...statuses].sort((a,b)=>({claude:0,codex:1}[a.platform]??2)-({claude:0,codex:1}[b.platform]??2));
   const label=status=>({codex:'Codex',claude:'Claude'}[status.platform]??status.platform),state=status=>({installed:'Installed',absent:'Not installed',incomplete:'Incomplete'}[status.state]??status.state);
   const info=ordered.length?[ordered.map(status=>label(status)+': '+state(status)).join(' / '),...ordered.flatMap(status=>(status.diagnostics??[]).map(error=>label(status)+': '+error.message))]:[];const choice=await ui.menu('ARC',home,{selected,info,backLabel:'exit',wordmark:true});if(choice===null||choice===3)return code;selected=choice;
   try{
    if(choice===0){let configured=0;while(true){const task=await ui.menu('Configure',['Install / Reconfigure','Change Preset'],{selected:configured});if(task===null)break;configured=task;
     try{const prepared=await runSetup({ui,statuses,draft,kind:task===0?'install':'preset',prepare:settings=>api.prepareOperation(context,settings)});if(await execute(prepared))return code;}catch(error){if(['ARC_CANCELLED','ARC_TUI_EOF'].includes(error.code))throw error;code=error.code==='ARC_CLI_INPUT'?2:1;await ui.page('Operation unavailable',[error.message,'No unreviewed changes were applied.']);}
    }continue;}
    let prepared;if(choice===1){prepared=await ui.busy(()=>api.prepareOperation(context,{kind:'update'}));if(await ui.review('Update',prepared)!=='apply')prepared=null;}else prepared=await uninstall();
    if(await execute(prepared))return code;
   }catch(error){if(['ARC_CANCELLED','ARC_TUI_EOF'].includes(error.code))throw error;code=error.code==='ARC_CLI_INPUT'?2:1;await ui.page('Operation unavailable',[error.message,'No unreviewed changes were applied.']);}
  }

 }catch(error){if(error.code==='ARC_CANCELLED')return 130;if(error.code==='ARC_TUI_EOF')return code;if(error.code==='ARC_TUI_TERMINAL')return 2;throw error;}finally{signals.removeListener('SIGINT',abort);signals.removeListener('SIGTERM',abort);session?.dispose();if(finalReport)(options.output??process.stdout).write(finalReport.map(row=>escapeTerminalText(row)).join('\n')+'\n');}
}
