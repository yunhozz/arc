import {readFileSync} from 'node:fs';
import {createTerminalSession} from './terminal.mjs';
import {escapeTerminalText,cellWidth,fitChoiceRow} from './render.mjs';
import {createTuiInterface} from './interface.mjs';
export {createTuiInterface};
import {createManagementContext,prepareOperation,executeOperation,forceFinishBlockingDispatches,readCompositeConfig,currentInstallState} from '../management/operations.mjs';
import {collectStatus} from '../management/status.mjs';
import {runInstallFlow,loadRoleDefaults,roleDisplayName} from './setup.mjs';
import {loadStaticModelCatalog} from '../models/static-catalog.mjs';
import {statusInfo,statusVersion} from './mode.mjs';
import {installerRegistryOf,platformLabel,sortByDisplay} from '../platforms/index.mjs';
const packageVersion=JSON.parse(readFileSync(new URL('../../package.json',import.meta.url),'utf8')).version;
const home=[{id:'install',label:'Configure'},{id:'status',label:'Status'},{id:'uninstall',label:'Uninstall'},{id:'exit',label:'Exit'}];
export function resultRows(result,registry=installerRegistryOf(),{version,kind,latestVersion,previousStates}={}){
 version=result.version??version;
 const clean=text=>text.replace(/; rollback: [^\r\n]*/g,''),label=platform=>platformLabel(platform,registry),errorLine=error=>clean(error.message.split(/[\r\n]/)[0]);
 const items=result.results??[],platformOf=item=>item.platform??item.target?.platform??'Target';
 const messages=(result.messages??[]).map(s=>clean(s.trim())),residualPaths=item=>(item.residualPaths??[]).map(p=>'Residual path: '+p);
 const isResidual=row=>row.startsWith('Residual path: '),residualRows=new Set();
 const uniqueResiduals=rows=>rows.filter(row=>{if(!isResidual(row))return true;if(residualRows.has(row))return false;residualRows.add(row);return true;});
 const cliRemoved=result.cli?.status==='removed',cliAbsent=result.cli?.status==='absent';
 if(result.code===0&&kind==='update'){
  const residuals=(result.stdout??'').split(/\r?\n/).filter(isResidual);
  return uniqueResiduals([`🚀 Upgraded to ARC ${latestVersion}.`,'Restart ARC to check.',...residuals]);
 }
 if(result.code===0&&!result.error&&!result.cli?.error&&(!result.cli||cliRemoved||cliAbsent)&&items.every(item=>['installed','uninstalled'].includes(item.status)&&!item.error)){
  const rows=[];
  if(cliRemoved){
   rows.push('👋 ARC and the arc CLI removed.');
   if(result.exitSession)rows.push('CLI removal ended this session.');
  }else if(cliAbsent){
   rows.push('👋 ARC removed.');
  }else{
   const displayOrder=ids=>[...sortByDisplay(ids.filter(id=>registry.getPlatform(id)),registry),...ids.filter(id=>!registry.getPlatform(id))];
   const installed=displayOrder(items.filter(item=>item.status==='installed').map(platformOf));
   const existing=platform=>['installed','incomplete'].includes(previousStates?.[platform]);
   const newPlatforms=installed.filter(platform=>!existing(platform)),existingPlatforms=installed.filter(existing);
   if(newPlatforms.length)rows.push(`✨ ARC installed for ${newPlatforms.map(label).join(', ')}.`);
   if(existingPlatforms.length)rows.push(`🔧 Settings applied to ${existingPlatforms.map(label).join(', ')}.`);
   if(installed.length)rows.push('Restart ARC to check.');
   for(const platform of displayOrder(items.filter(item=>item.status==='uninstalled').map(platformOf)))rows.push(`🧹 Removed ARC from ${label(platform)}.`);
  }
  return uniqueResiduals([...rows,...messages,...items.flatMap(residualPaths)]);
 }
 return uniqueResiduals([...messages,...[result.stdout,result.stderr].flatMap(text=>text?text.trimEnd().split(/\r?\n/).map(clean):[]),...items.flatMap(item=>{const platform=platformOf(item);return[item.status==='installed'?`ARC${version==null?'':' '+version} installed for ${label(platform)}.`:item.status==='uninstalled'?`Removed from ${label(platform)}.`:`${platform}: ${item.status}`,...residualPaths(item),...(item.error?['Error: '+errorLine(item.error)]:[])];}),...(result.cli?['CLI: '+result.cli.status,...(result.cli.error?['CLI error: '+errorLine(result.cli.error)]:[])]:[]),...(result.error?['Error: '+errorLine(result.error)]:[]),...(result.code!==0?['Exit code: '+result.code]:[]),...(result.exitSession?[result.cli?'CLI removal ended this session.':'CLI replacement ended this session.']:[])]);
}
function formatElapsed(ms){
 const minutes=Math.floor(ms/60000),hours=Math.floor(minutes/60),days=Math.floor(hours/24);
 if(minutes<1)return '<1m';if(hours<1)return `${minutes}m`;if(days<1)return `${hours}h ${minutes%60}m`;return `${days}d ${hours%24}h`;
}
function blockingInfo(entries,now){
 const liveBridge=entry=>entry.route==='bridge'&&!entry.forceFinishable,eligible=entries.filter(entry=>entry.forceFinishable).length;
 const summary=`${entries.length} active ${entries.length===1?'dispatch blocks':'dispatches block'} this change. ${eligible?`${eligible} can be force finished.`:'None can be force finished here.'}`;
 const table=[['ID','Role','Workflow','Route','State','Age'],...entries.map(entry=>[
  entry.dispatchId.slice(0,8),roleDisplayName(entry.role),entry.workflowId,entry.route+(liveBridge(entry)?'*':''),entry.state,Number.isFinite(Date.parse(entry.updatedAt))?formatElapsed(now-Date.parse(entry.updatedAt)):'unknown'
 ])].map(row=>row.map(escapeTerminalText));
 const width=text=>[...text].reduce((sum,character)=>sum+cellWidth(character),0),widths=table[0].map((_,index)=>Math.max(...table.map(row=>width(row[index]))));
 const info=({columns})=>{
  const available=Math.max(2,Math.floor(Number(columns)||80)-3),sizes=[...widths],overflow=sizes.reduce((sum,size)=>sum+size,10)-available;
  if(overflow>0)sizes[2]=Math.max(8,sizes[2]-overflow);
  const rows=table.map(row=>fitChoiceRow(row.map((value,index)=>{
   const text=index===2?fitChoiceRow(value,sizes[index]+3):value;
   return text+(index<row.length-1?' '.repeat(Math.max(0,sizes[index]-width(text))):'');
  }).join('  '),columns));
  return[summary,'',...rows];
 };
 const notice=[],commands=new Set();
 for(const entry of entries.filter(liveBridge)){
  const key=JSON.stringify([entry.home,entry.workflowId]);if(commands.has(key))continue;commands.add(key);
  if(notice.length===0)notice.push('* Live bridge is not force finished. Cancel it first:');
  notice.push(`  node ${entry.home}/skills/arc/runtime/cli.mjs cancel --cwd <project> --workflow ${entry.workflowId} --input -`);
 }
 if(eligible)notice.push('Force finish marks the native/reserved entries cancelled. Native agents in other sessions are not stopped.');
 return{info,infoTones:[undefined,undefined,undefined,...entries.map(entry=>liveBridge(entry)?'note':undefined)],notice};
}
export async function runTui(options={}){
 let session=options.session,code=0,finalReport;const controller=new AbortController(),signals=options.signals??process;const abort=()=>controller.abort();signals.on('SIGINT',abort);signals.on('SIGTERM',abort);
 try{session??=createTerminalSession(options);const ui=createTuiInterface(session,{input:options.input??process.stdin,controller}),api={collectStatus,prepareOperation,executeOperation,forceFinishBlockingDispatches,currentInstallState,...options.services},context=options.context?{...options.context,signal:controller.signal}:await createManagementContext({...options.contextOptions,signal:controller.signal});const registry=installerRegistryOf(context),draft={};let selected=0,lastRequest;
  function prepareRequest(request){lastRequest=request;return api.prepareOperation(context,request);}
  async function loadInstallState(){
   // A failed preview is unverified; prepareOperation still validates at Apply.
   try{return typeof api.currentInstallState==='function'?await api.currentInstallState(context):{mode:'unverified',platforms:[]};}
   catch{return {mode:'unverified',platforms:[]};}
  }
  async function execute(prepared,{retried=false,request,statuses=[]}={}){
   if(!prepared)return;const result=await ui.busy(()=>api.executeOperation(context,prepared));code=result.code;
   if(code!==130&&!result.exitSession&&!retried&&['composite','switch'].includes(prepared.kind)&&result.error?.blockingDispatches?.length){
    const entries=result.error.blockingDispatches,eligible=entries.some(entry=>entry.forceFinishable);
    if(await ui.menu('Active dispatches',eligible?['Force finish and retry']:[],{backRow:true,actionKinds:eligible?['confirm']:[],selected:1,...blockingInfo(entries,Date.now())})===0){
     const notRetried='Configure was not retried.';let finished;
     try{finished=await ui.busy(()=>api.forceFinishBlockingDispatches(context,entries));}
     catch(error){if(['ARC_CANCELLED','ARC_TUI_EOF','ARC_TUI_HOME'].includes(error.code))throw error;await ui.page('Force finish',[...(error.forceFinish?.finished??[]).map(id=>'Finished: '+id),error.message,...(error.residualPaths??[]).map(p=>'Residual path: '+p),notRetried]);return false;}
     if(finished.skipped.length||finished.residualPaths.length){await ui.page('Force finish',[...finished.finished.map(id=>'Finished: '+id),...finished.skipped.map(s=>`Skipped: ${s.dispatchId} (${s.reason})`),...finished.residualPaths.map(p=>'Residual path: '+p),notRetried]);return false;}
     if(!request){await ui.page('Force finish',['The original operation request is unavailable.',notRetried]);return false;}
     let next;
     try{next=await ui.busy(()=>api.prepareOperation(context,request));}
     catch(error){if(['ARC_CANCELLED','ARC_TUI_EOF','ARC_TUI_HOME'].includes(error.code))throw error;await ui.page('Force finish',[error.message,notRetried]);return false;}
     return execute(next,{retried:true,request,statuses});
    }
   }
   if(code===0&&['install','preset','switch','composite'].includes(prepared.kind))for(const key of Object.keys(draft))delete draft[key];
   const previousStates=Object.fromEntries(statuses.map(status=>[status.platform,status.state]));
   const rows=resultRows(result,registry,{version:packageVersion,kind:prepared.kind,latestVersion:prepared.latestVersion,previousStates});
   if(code===130||result.exitSession){finalReport=rows;if(result.exitSession)session.render({title:'Result',rows:finalReport,hint:'Session ended'});return true;}
   await ui.page('Result',rows);return false;
  }
  async function uninstall(statuses){
   let selected=0;const platforms=registry.byDisplayOrder(),installed=id=>statuses.some(status=>status.platform===id&&status.state!=='absent');
   while(true){const choice=await ui.menu('Uninstall',[...platforms.map(({runtime:{id,label}})=>label+(installed(id)?'':'  (not installed)')),'Everything (incl. CLI)'],{selected,backRow:true});if(choice===null)return null;selected=choice;
    const single=choice<platforms.length,target=single?platforms[choice].runtime.id:'all';if(single&&!installed(target))continue;
    const state=single?await loadInstallState():null,switching=single&&state.mode==='composite'&&state.platforms.includes(target);
    const proceed=await ui.menu('Uninstall',['Remove'],{backRow:true,actionKinds:['danger'],selected:1,info:[single?`Remove ARC from ${platformLabel(target,registry)}?`:'Remove ARC from all platforms and the arc CLI?',...(switching?['Mixed routing will be turned off.']:[])]});
    if(proceed===0)return ui.busy(()=>prepareRequest({kind:'uninstall',target,removeCli:!single,...(switching?{switchFromComposite:true}:{})}));
   }
  }
  while(true){const statuses=await api.collectStatus(context),installState=await loadInstallState();
   const choice=await ui.menu('ARC',home.map(action=>action.label),{selected,backLabel:'exit',wordmark:true,version:packageVersion});
   const action=home[choice]?.id;if(choice===null||action==='exit')return code;selected=choice;
   try{
    let prepared;
    if(action==='install'){const currentConfig=installState.mode==='composite'?await (api.readCompositeConfig?api.readCompositeConfig(context):readCompositeConfig(context)):undefined;prepared=await runInstallFlow({ui,statuses,draft,installState,currentConfig,loadRoleDefaults:target=>loadRoleDefaults({context,statuses,target}),loadCatalog:target=>api.loadCatalog?api.loadCatalog(target):loadStaticModelCatalog(target,{signal:controller.signal}),prepare:settings=>ui.busy(()=>prepareRequest(settings)),registry});}
    else if(action==='status'){
     let failed;
     try{prepared=await ui.busy(()=>prepareRequest({kind:'update'}));}
     catch(error){if(['ARC_CANCELLED','ARC_TUI_EOF','ARC_TUI_HOME'].includes(error.code))throw error;failed=error;}
     const version=statusVersion({prepared,failed,packageVersion}),showUpgrade=version.canUpgrade;
     const choice=await ui.menu('Status',showUpgrade?['Upgrade']:[],{backRow:true,actionKinds:showUpgrade?['confirm']:[],selected:showUpgrade?1:0,...statusInfo(installState,statuses,registry,{version})});
     if(choice!==0||!showUpgrade)prepared=null;
    }
    else if(action==='uninstall')prepared=await uninstall(statuses);
    if(await execute(prepared,{request:lastRequest,statuses}))return code;
   }catch(error){if(error.code==='ARC_TUI_HOME')continue;if(['ARC_CANCELLED','ARC_TUI_EOF'].includes(error.code))throw error;code=error.code==='ARC_CLI_INPUT'?2:1;try{await ui.page('Operation unavailable',[error.message,...(error.residualPaths??[]).map(p=>'Residual path: '+p),'No changes were applied.']);}catch(navigation){if(navigation.code!=='ARC_TUI_HOME')throw navigation;}}
  }

 }catch(error){if(error.code==='ARC_CANCELLED')return 130;if(error.code==='ARC_TUI_EOF')return code;if(error.code==='ARC_TUI_TERMINAL')return 2;throw error;}finally{signals.removeListener('SIGINT',abort);signals.removeListener('SIGTERM',abort);session?.dispose();if(finalReport)(options.output??process.stdout).write(finalReport.map(row=>escapeTerminalText(row)).join('\n')+'\n');}
}
