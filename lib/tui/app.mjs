import {createTerminalSession} from './terminal.mjs';
import {escapeTerminalText,navigationHint,wrapDetailRows} from './render.mjs';
import {createManagementContext,prepareOperation,executeOperation} from '../management/operations.mjs';
import {collectStatus} from '../management/status.mjs';
import {runSetup,loadPresetPreviewConfig} from './setup.mjs';
import {loadCustomCatalog} from './custom-preset.mjs';
const home=['Install / Update','Change Preset','Check Version','Uninstall','Exit'];
function goHome(){throw Object.assign(Error('Return home'),{code:'ARC_TUI_HOME'});}
function interrupted(){return Object.assign(Error('Session interrupted'),{code:'ARC_CANCELLED'});}
export function createTuiInterface(session,{input,controller}={}){
 async function event(){const e=await session.nextEvent();if(e.name==='interrupt')throw interrupted();if(e.name==='eof')throw Object.assign(Error('Session closed'),{code:'ARC_TUI_EOF'});if(e.name==='error')throw e.error;return e;}
 async function menu(title,rows,{selected=0,info=[],separatorBefore,backRow=false,backLabel='back',escapeBack=false,wordmark=false,renderBody,refreshMs}={}){
  const actions=backRow?[...rows,'Back']:rows;
  selected=actions.length?Math.max(0,Math.min(selected,actions.length-1)):0;
  let pending,timer,blink=true;
  try{while(true){
   const viewport=session.viewport(),display=actions.flatMap((row,index)=>(index===separatorBefore||backRow&&index===rows.length)?['',row]:[row]),displayIndex=selected+(Number.isInteger(separatorBefore)&&selected>=separatorBefore?1:0)+(backRow&&selected===rows.length?1:0),information=wrapDetailRows(typeof info==='function'?info({selected,...viewport}):info,viewport.columns);
   if(wordmark&&information.length)information.push('');
   const capacity=Math.max(1,viewport.rows-(wordmark?6:1)-information.length-4),offset=Math.max(0,Math.min(displayIndex-capacity+1,display.length-capacity)),visible=display.slice(offset,offset+capacity);
   const screen={title,wordmark,rows:[...information,...visible],selected:actions.length?information.length+displayIndex-offset:undefined,hint:navigationHint('menu',{backLabel}),...(display.length>capacity?{position:(offset+1)+'-'+Math.min(offset+capacity,display.length)+'/'+display.length}:{})};
   const body=renderBody?.({selected,blink,...viewport});if(body){screen.rows=body.rows;screen.selected=body.selected;}
   const rendered=session.render(screen);pending??=event();
   let e;if(refreshMs>0){e=await Promise.race([pending,new Promise(resolve=>{timer=setTimeout(()=>resolve(null),refreshMs);})]);clearTimeout(timer);timer=undefined;if(e===null){blink=!blink;continue;}}else e=await pending;pending=undefined;
   if(e.name==='up'&&actions.length)selected=(selected+actions.length-1)%actions.length;else if(e.name==='down'&&actions.length)selected=(selected+1)%actions.length;else if(e.name==='escape'){if(backLabel==='exit'||escapeBack)return null;goHome();}else if(e.name==='enter'&&actions.length&&rendered.selectionEnabled!==false)return backRow&&selected===rows.length?null:selected;
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
 async function busy(action){session.render({title:'Working',mode:'busy',rows:['Operation in progress. Please wait.'],hint:navigationHint('busy')});session.setBusy(true);const wasFlowing=input?.readableFlowing;const onData=chunk=>{if(String(chunk).includes('\x03')||String(chunk).includes('\x04'))controller?.abort();};input?.on('data',onData);try{const result=await action();if(controller?.signal.aborted){if(typeof result?.code!=='number')throw interrupted();return{...result,code:130,interrupted:true};}return result;}finally{input?.removeListener('data',onData);if(wasFlowing!==true)input?.pause?.();session.setBusy(false);session.discardInput();}}
 return{menu,text,page,busy};
}
export function resultRows(result){
 const clean=text=>text.replace(/; rollback: [^\r\n]*/g,''),label=platform=>({codex:'Codex',claude:'Claude'}[platform]??platform);
 const removed=result.code===0&&['removed','absent'].includes(result.cli?.status);
 return[...(result.messages??[]).map(s=>clean(s.trim())),...[result.stdout,result.stderr].flatMap(text=>text?text.trimEnd().split(/\r?\n/).map(clean):[]),...(result.results??[]).flatMap(item=>{const platform=item.platform??item.target?.platform??'Target';return[...(removed&&item.status==='uninstalled'?[]:[item.status==='installed'?`ARC installed for ${label(platform)}.`:item.status==='uninstalled'?`${label(platform)} ARC settings removed.`:`${platform}: ${item.status}`]),...(item.residualPaths??[]).map(p=>'Residual path: '+p),...(item.error?['Error: '+item.error.message]:[])];}),...(removed?[result.cli.status==='removed'?'ARC settings and CLI removed.':'ARC settings removed. CLI is not installed.']:result.cli?['CLI: '+result.cli.status,...(result.cli.error?['CLI error: '+result.cli.error.message]:[])]:[]),...(result.error?['Error: '+result.error.message]:[]),'Exit code: '+result.code,...(result.exitSession?[result.cli?'CLI removal ended this session.':'CLI replacement ended this session.']:[])];
}
export async function runTui(options={}){
 let session=options.session,code=0,finalReport;const controller=new AbortController(),signals=options.signals??process;const abort=()=>controller.abort();signals.on('SIGINT',abort);signals.on('SIGTERM',abort);
 try{session??=createTerminalSession(options);const ui=createTuiInterface(session,{input:options.input??process.stdin,controller}),api={collectStatus,prepareOperation,executeOperation,...options.services},context=options.context?{...options.context,signal:controller.signal}:await createManagementContext({...options.contextOptions,signal:controller.signal});const draft={};let selected=0;
  async function execute(prepared){
   if(!prepared)return;const result=await ui.busy(()=>api.executeOperation(context,prepared));code=result.code;
   if(code===0&&['install','preset'].includes(prepared.kind))for(const plan of prepared.plans??[]){const platform=plan.target?.platform;if(draft[platform])delete draft[platform].customEdited;}
   const rows=prepared.kind==='update'&&code===0?[`ARC updated to ${prepared.latestVersion}.`,'Start a new agent session to use the updated settings.']:resultRows(result);
   if(code===130||result.exitSession){finalReport=rows;if(result.exitSession)session.render({title:'Result',rows:finalReport,hint:'Session ended'});return true;}
   await ui.page('Result',rows);return false;
  }
  async function uninstall(){
   let selected=0,target=0;
   while(true){const choice=await ui.menu('Uninstall',['Settings','Remove CLI'],{selected,backRow:true});if(choice===null)return null;selected=choice;
    if(choice===0){const next=await ui.menu('Uninstall settings',['Codex','Claude'],{selected:target,backRow:true});if(next===null)continue;target=next;return ui.busy(()=>api.prepareOperation(context,{kind:'uninstall',target:['codex','claude'][target],removeCli:false}));}
    const proceed=await ui.menu('Remove CLI',['Continue','Back'],{selected:1,escapeBack:true,info:['Removes ARC settings for Codex and Claude, then removes the ARC CLI.','']});
    if(proceed===0)return ui.busy(()=>api.prepareOperation(context,{kind:'uninstall',target:'all',removeCli:true}));
   }
  }
  while(true){const statuses=await api.collectStatus(context),ordered=[...statuses].sort((a,b)=>({claude:0,codex:1}[a.platform]??2)-({claude:0,codex:1}[b.platform]??2));
   const label=status=>({codex:'Codex',claude:'Claude'}[status.platform]??status.platform),state=status=>({installed:'Installed',absent:'Not installed',incomplete:'Incomplete'}[status.state]??status.state);
   const info=ordered.length?[ordered.map(status=>label(status)+': '+state(status)).join(' / '),...ordered.flatMap(status=>(status.diagnostics??[]).map(error=>label(status)+': '+error.message))]:[];const choice=await ui.menu('ARC',home,{selected,info,backLabel:'exit',wordmark:true});if(choice===null||choice===4)return code;selected=choice;
   try{
    let prepared;
    if(choice===0||choice===1){const kind=choice===0?'install':'preset';prepared=await runSetup({ui,statuses,draft,kind,loadPreviewConfig:target=>loadPresetPreviewConfig({context,statuses,kind,target}),loadCatalog:target=>api.loadCatalog?api.loadCatalog(target):loadCustomCatalog({platform:target,env:context.env??process.env,invocationCwd:context.cwd??process.cwd(),userHome:context.userHome,signal:controller.signal}),prepare:settings=>ui.busy(()=>api.prepareOperation(context,settings))});}
    else if(choice===2){prepared=await ui.busy(()=>api.prepareOperation(context,{kind:'update'}));const action=await ui.menu('Check Version',prepared.canUpgrade?['Version Upgrade']:[],{backRow:true,info:['Current version: '+prepared.currentVersion,'Latest version: '+(prepared.latestVersion??'Unavailable'),...(prepared.latestError?[prepared.latestError.message]:[]),...(prepared.canUpgrade?['Continue?']:[])]});if(action!==0)prepared=null;}
    else prepared=await uninstall();
    if(await execute(prepared))return code;
   }catch(error){if(error.code==='ARC_TUI_HOME')continue;if(['ARC_CANCELLED','ARC_TUI_EOF'].includes(error.code))throw error;code=error.code==='ARC_CLI_INPUT'?2:1;try{await ui.page('Operation unavailable',[error.message,'No changes were applied.']);}catch(navigation){if(navigation.code!=='ARC_TUI_HOME')throw navigation;}}
  }

 }catch(error){if(error.code==='ARC_CANCELLED')return 130;if(error.code==='ARC_TUI_EOF')return code;if(error.code==='ARC_TUI_TERMINAL')return 2;throw error;}finally{signals.removeListener('SIGINT',abort);signals.removeListener('SIGTERM',abort);session?.dispose();if(finalReport)(options.output??process.stdout).write(finalReport.map(row=>escapeTerminalText(row)).join('\n')+'\n');}
}
