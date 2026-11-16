import {readFileSync} from 'node:fs';
import {createTerminalSession} from './terminal.mjs';
import {escapeTerminalText,navigationHint,statusSpans,wrapDetailRows,wordmarkRows} from './render.mjs';
import {createManagementContext,prepareOperation,executeOperation,readCompositeConfig,currentInstallState} from '../management/operations.mjs';
import {collectStatus} from '../management/status.mjs';
import {runInstallFlow,loadRoleDefaults} from './setup.mjs';
import {loadStaticModelCatalog} from '../models/static-catalog.mjs';
import {homeStatusLine,homeModeLine} from './mode.mjs';
import {installerRegistryOf,platformLabel} from '../platforms/index.mjs';
const packageVersion=JSON.parse(readFileSync(new URL('../../package.json',import.meta.url),'utf8')).version;
const home=[{id:'install',label:'Install / Update'},{id:'version',label:'Check Version'},{id:'uninstall',label:'Uninstall'},{id:'exit',label:'Exit'}];
function goHome(){throw Object.assign(Error('Return home'),{code:'ARC_TUI_HOME'});}
function interrupted(){return Object.assign(Error('Session interrupted'),{code:'ARC_CANCELLED'});}
export function createTuiInterface(session,{input,controller}={}){
 async function event(){const e=await session.nextEvent();if(e.name==='interrupt')throw interrupted();if(e.name==='eof')throw Object.assign(Error('Session closed'),{code:'ARC_TUI_EOF'});if(e.name==='error')throw e.error;return e;}
 async function menu(title,rows,{selected=0,info=[],infoTones,backRow=false,backLabel='back',wordmark=false,version,renderBody,onHorizontal,refreshMs}={}){
  const actions=backRow?[...rows,'Back']:rows;
  selected=actions.length?Math.max(0,Math.min(selected,actions.length-1)):0;
  const animate=wordmark&&session.frameMs>0,tickMs=animate?session.frameMs:refreshMs;
  let pending,settled,wake,timer,blink=true,frame=0,repainting=false;
  try{while(true){
   const viewport=session.viewport(),display=actions,displayIndex=selected,information=[],tones=[],spans=[];
   const details=typeof info==='function'?info({selected,...viewport}):info;
   for(const [index,row] of details.entries()){const wrapped=wrapDetailRows([row],viewport.columns),tone=infoTones?.[index],states=tone==='status'?statusSpans(row):[];let offset=0;for(const [line,text] of wrapped.entries()){const end=offset+[...text].length;information.push(text);tones.push(line&&tone==='diagnostic'?'diagnostic-cont':tone);spans.push(states.filter(span=>span.from<end&&span.to>offset).map(span=>({...span,from:Math.max(span.from,offset)-offset,to:Math.min(span.to,end)-offset})));offset=end;}}
   while(information.at(-1)===''){information.pop();tones.pop();}if(information.length){information.push('');tones.push(undefined);}
   const capacity=Math.max(1,viewport.rows-(wordmark?wordmarkRows(viewport):1)-information.length-4),offset=Math.max(0,Math.min(displayIndex-capacity+1,display.length-capacity)),visible=display.slice(offset,offset+capacity);
   const screen={title,wordmark,version,frame,rows:[...information,...visible],selected:actions.length?information.length+displayIndex-offset:undefined,hint:navigationHint('menu',{backLabel,horizontal:typeof onHorizontal==='function'}),...(display.length>capacity?{position:(offset+1)+'-'+Math.min(offset+capacity,display.length)+'/'+display.length}:{})};
   if(infoTones){screen.rowTones=[...tones,...visible.map(()=>undefined)];screen.rowStatusSpans=spans;}
   const body=renderBody?.({selected,blink,...viewport});if(body){delete screen.rowTones;delete screen.rowStatusSpans;screen.rows=body.rows;screen.selected=body.selected;screen.showSelection=body.showSelection;screen.compactFooter=body.compactFooter;if(Object.hasOwn(body,'position'))screen.position=body.position;}
   const rendered=(repainting?(session.repaint??session.render):session.render).call(session,screen);pending??=event().then(e=>{settled={e};wake?.();},error=>{settled={error};wake?.();});
   if(tickMs>0){if(!settled)await new Promise(resolve=>{wake=resolve;timer=setTimeout(resolve,tickMs);});clearTimeout(timer);timer=undefined;wake=undefined;if(!settled){if(animate)frame++;else blink=!blink;repainting=true;continue;}}else await pending;
   if(Object.hasOwn(settled,'error'))throw settled.error;const e=settled.e;pending=undefined;settled=undefined;repainting=false;
   if(e.name==='up'&&actions.length)selected=(selected+actions.length-1)%actions.length;else if(e.name==='down'&&actions.length)selected=(selected+1)%actions.length;else if((e.name==='left'||e.name==='right')&&onHorizontal)onHorizontal({direction:e.name,selected,...viewport});else if(e.name==='escape'){if(backLabel==='exit')return null;goHome();}else if(e.name==='enter'&&actions.length&&rendered.selectionEnabled!==false)return backRow&&selected===rows.length?null:selected;
  }}finally{if(timer!==undefined)clearTimeout(timer);}
 }
 async function text(title,initial=''){let value=initial,selected=2;while(true){const rendered=session.render({title,mode:'text',rows:[value,'','Save','Back',''],selected,hint:navigationHint('text')});const e=await event();if(e.name==='text'||e.name==='paste')value+=e.text;else if(e.name==='backspace')value=[...value].slice(0,-1).join('');else if(e.name==='up'||e.name==='down')selected=selected===2?3:2;else if(e.name==='escape')goHome();else if(e.name==='enter'&&rendered.selectionEnabled!==false)return selected===2?value:null;}}
 async function page(title,rows){
  let offset=0;
  while(true){const viewport=session.viewport(),wrapped=wrapDetailRows(rows,viewport.columns),size=Math.max(1,viewport.rows-4),last=Math.max(0,wrapped.length-size);
   offset=Math.min(offset,last);const slice=wrapped.slice(offset,offset+size);
   session.render({title,mode:'page',rows:slice,position:`Rows ${offset+1}-${Math.min(offset+size,wrapped.length)} of ${wrapped.length}`,hint:navigationHint('page')});const e=await event();
   if(e.name==='down')offset=Math.min(last,offset+1);else if(e.name==='up')offset=Math.max(0,offset-1);else if(e.name==='escape')goHome();else if(e.name==='enter')return true;
  }
 }
 async function busy(action){let frame=0,timer;const screen={title:'Working',mode:'busy',rows:[],hint:navigationHint('busy'),frame};session.render(screen);session.setBusy(true);const wasFlowing=input?.readableFlowing;const abort=()=>{if(!controller?.signal.aborted)controller?.abort();},onData=chunk=>{if(String(chunk).includes('\x03')||String(chunk).includes('\x04'))abort();};input?.on('data',onData);input?.prependListener('end',abort);input?.prependListener('close',abort);try{if(input?.readableEnded||input?.destroyed){abort();throw interrupted();}if(controller?.signal.aborted)throw interrupted();if(session.frameMs>0)timer=setInterval(()=>{try{(session.repaint??session.render).call(session,{...screen,frame:++frame});}catch{clearInterval(timer);}},session.frameMs);const result=await (session.frameMs>0?Promise.resolve().then(action):action());if(controller?.signal.aborted){if(typeof result?.code!=='number')throw interrupted();return{...result,code:130,interrupted:true};}return result;}catch(error){if(controller?.signal.aborted&&(['ARC_CANCELLED','ARC_NPM_CANCELLED','ARC_ACQUISITION_CANCELLED','ARC_INSTALL_CANCELLED','ABORT_ERR'].includes(error?.code)||error?.name==='AbortError'))throw interrupted();throw error;}finally{clearInterval(timer);input?.removeListener('data',onData);input?.removeListener('end',abort);input?.removeListener('close',abort);if(wasFlowing!==true)input?.pause?.();session.setBusy(false);session.discardInput();}}
 return{menu,text,page,busy};
}
export function resultRows(result,registry=installerRegistryOf()){
 const clean=text=>text.replace(/; rollback: [^\r\n]*/g,''),label=platform=>platformLabel(platform,registry),errorLine=error=>clean(error.message.split(/[\r\n]/)[0]);
 const residualRows=new Set();
 const removed=result.code===0&&['removed','absent'].includes(result.cli?.status);
 return[...(result.messages??[]).map(s=>clean(s.trim())),...[result.stdout,result.stderr].flatMap(text=>text?text.trimEnd().split(/\r?\n/).map(clean):[]),...(result.results??[]).flatMap(item=>{const platform=item.platform??item.target?.platform??'Target';return[...(removed&&item.status==='uninstalled'?[]:[item.status==='installed'?`ARC installed for ${label(platform)}.`:item.status==='uninstalled'?`Removed from ${label(platform)}.`:`${platform}: ${item.status}`]),...(item.residualPaths??[]).map(p=>'Residual path: '+p),...(item.error?['Error: '+errorLine(item.error)]:[])];}),...(removed?[result.cli.status==='removed'?'Removed ARC and CLI.':'Removed ARC.']:result.cli?['CLI: '+result.cli.status,...(result.cli.error?['CLI error: '+errorLine(result.cli.error)]:[])]:[]),...(result.error?['Error: '+errorLine(result.error)]:[]),...(result.code!==0?['Exit code: '+result.code]:[]),...(result.exitSession?[result.cli?'CLI removal ended this session.':'CLI replacement ended this session.']:[])].filter(row=>{if(!row.startsWith('Residual path: '))return true;if(residualRows.has(row))return false;residualRows.add(row);return true;});
}
export async function runTui(options={}){
 let session=options.session,code=0,finalReport;const controller=new AbortController(),signals=options.signals??process;const abort=()=>controller.abort();signals.on('SIGINT',abort);signals.on('SIGTERM',abort);
 try{session??=createTerminalSession(options);const ui=createTuiInterface(session,{input:options.input??process.stdin,controller}),api={collectStatus,prepareOperation,executeOperation,currentInstallState,...options.services},context=options.context?{...options.context,signal:controller.signal}:await createManagementContext({...options.contextOptions,signal:controller.signal});const registry=installerRegistryOf(context),draft={};let selected=0;
  async function loadInstallState(){
   // A failed preview is unverified; prepareOperation still validates at Apply.
   try{return typeof api.currentInstallState==='function'?await api.currentInstallState(context):{mode:'unverified',platforms:[]};}
   catch{return {mode:'unverified',platforms:[]};}
  }
  async function execute(prepared){
   if(!prepared)return;const result=await ui.busy(()=>api.executeOperation(context,prepared));code=result.code;
   if(code===0&&['install','preset','switch','composite'].includes(prepared.kind))for(const key of Object.keys(draft))delete draft[key];
   const rows=prepared.kind==='update'&&code===0?[`Upgraded to ${prepared.latestVersion}.`]:resultRows(result,registry);
   if(code===130||result.exitSession){finalReport=rows;if(result.exitSession)session.render({title:'Result',rows:finalReport,hint:'Session ended'});return true;}
   await ui.page('Result',rows);return false;
  }
  async function uninstall(statuses){
   let selected=0;const platforms=registry.byDisplayOrder(),installed=id=>statuses.some(status=>status.platform===id&&status.state!=='absent');
   while(true){const choice=await ui.menu('Uninstall',[...platforms.map(({runtime:{id,label}})=>label+(installed(id)?'':'  (not installed)')),'Everything (incl. CLI)'],{selected,backRow:true});if(choice===null)return null;selected=choice;
    const single=choice<platforms.length,target=single?platforms[choice].runtime.id:'all';if(single&&!installed(target))continue;
    const state=single?await loadInstallState():null,switching=single&&state.mode==='composite'&&state.platforms.includes(target);
    const proceed=await ui.menu('Uninstall',['Remove'],{backRow:true,selected:1,info:[single?`Remove ARC from ${platformLabel(target,registry)}?`:'Remove ARC from all platforms and the arc CLI?',...(switching?['Mixed routing will be turned off.']:[])]});
    if(proceed===0)return ui.busy(()=>api.prepareOperation(context,{kind:'uninstall',target,removeCli:!single,...(switching?{switchFromComposite:true}:{})}));
   }
  }
  while(true){const statuses=await api.collectStatus(context),installState=await loadInstallState();
   const ordered=registry.byDisplayOrder().flatMap(({runtime:{id}})=>statuses.filter(status=>status.platform===id));
   const info=[homeStatusLine(statuses,registry),'Mode: '+homeModeLine(installState,statuses,registry),...ordered.flatMap(status=>[...(status.diagnostics??[]).map(error=>platformLabel(status.platform,registry)+': '+error.message),...(status.authentication?.authStatus==='unknown'&&status.authentication.reason?[platformLabel(status.platform,registry)+': '+status.authentication.reason]:[])])];
   const choice=await ui.menu('ARC',home.map(action=>action.label),{selected,info,infoTones:info.map((_,index)=>index===0?'status':index===1?undefined:'diagnostic'),backLabel:'exit',wordmark:true,version:packageVersion});
   const action=home[choice]?.id;if(choice===null||action==='exit')return code;selected=choice;
   try{
    let prepared;
    if(action==='install'){const currentConfig=installState.mode==='composite'?await (api.readCompositeConfig?api.readCompositeConfig(context):readCompositeConfig(context)):undefined;prepared=await runInstallFlow({ui,statuses,draft,installState,currentConfig,loadRoleDefaults:target=>loadRoleDefaults({context,statuses,target}),loadCatalog:target=>api.loadCatalog?api.loadCatalog(target):loadStaticModelCatalog(target,{signal:controller.signal}),prepare:settings=>ui.busy(()=>api.prepareOperation(context,settings)),registry});}
    else if(action==='version'){prepared=await ui.busy(()=>api.prepareOperation(context,{kind:'update'}));const action=await ui.menu('Check Version',prepared.canUpgrade?['Upgrade']:[],{backRow:true,info:prepared.canUpgrade?[`${prepared.currentVersion} → ${prepared.latestVersion}`]:prepared.latestVersion!=null?[`Up to date (${prepared.currentVersion})`]:[`${prepared.currentVersion} (latest unavailable)`,...(prepared.latestError?[prepared.latestError.message.split(/[\r\n]/)[0]]:[])]});if(action!==0||!prepared.canUpgrade)prepared=null;}
    else if(action==='uninstall')prepared=await uninstall(statuses);
    if(await execute(prepared))return code;
   }catch(error){if(error.code==='ARC_TUI_HOME')continue;if(['ARC_CANCELLED','ARC_TUI_EOF'].includes(error.code))throw error;code=error.code==='ARC_CLI_INPUT'?2:1;try{await ui.page('Operation unavailable',[error.message,...(error.residualPaths??[]).map(p=>'Residual path: '+p),'No changes were applied.']);}catch(navigation){if(navigation.code!=='ARC_TUI_HOME')throw navigation;}}
  }

 }catch(error){if(error.code==='ARC_CANCELLED')return 130;if(error.code==='ARC_TUI_EOF')return code;if(error.code==='ARC_TUI_TERMINAL')return 2;throw error;}finally{signals.removeListener('SIGINT',abort);signals.removeListener('SIGTERM',abort);session?.dispose();if(finalReport)(options.output??process.stdout).write(finalReport.map(row=>escapeTerminalText(row)).join('\n')+'\n');}
}
