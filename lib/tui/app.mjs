import {createTerminalSession} from './terminal.mjs';
import {escapeTerminalText,navigationHint,wrapDetailRows} from './render.mjs';
import {createManagementContext,prepareOperation,executeOperation} from '../management/operations.mjs';
import {collectStatus} from '../management/status.mjs';
import {runSetup} from './setup.mjs';
const home=['Install / Update','Change Preset','Check Version','Uninstall','Exit'];
function goHome(){throw Object.assign(Error('Return home'),{code:'ARC_TUI_HOME'});}
function interrupted(){return Object.assign(Error('Session interrupted'),{code:'ARC_CANCELLED'});}
export function createTuiInterface(session,{input,controller}={}){
 async function event(){const e=await session.nextEvent();if(e.name==='interrupt')throw interrupted();if(e.name==='eof')throw Object.assign(Error('Session closed'),{code:'ARC_TUI_EOF'});if(e.name==='error')throw e.error;return e;}
 async function menu(title,rows,{selected=0,info=[],separatorBefore,backRow=false,backLabel='back',wordmark=false}={}){
  const actions=backRow?[...rows,'Back']:rows;
  selected=actions.length?Math.max(0,Math.min(selected,actions.length-1)):0;
  while(true){
   const viewport=session.viewport(),display=actions.flatMap((row,index)=>(index===separatorBefore||backRow&&index===rows.length)?['',row]:[row]),displayIndex=selected+(Number.isInteger(separatorBefore)&&selected>=separatorBefore?1:0)+(backRow&&selected===rows.length?1:0),information=wrapDetailRows(info,viewport.columns);
   if(wordmark&&information.length)information.push('');
   const capacity=Math.max(1,viewport.rows-(wordmark?6:1)-information.length-4),offset=Math.max(0,Math.min(displayIndex-capacity+1,display.length-capacity)),visible=display.slice(offset,offset+capacity);
   const screen={title,wordmark,rows:[...information,...visible],selected:actions.length?information.length+displayIndex-offset:undefined,hint:navigationHint('menu',{backLabel}),...(display.length>capacity?{position:(offset+1)+'-'+Math.min(offset+capacity,display.length)+'/'+display.length}:{})};
   const rendered=session.render(screen),e=await event();
   if(e.name==='up'&&actions.length)selected=(selected+actions.length-1)%actions.length;else if(e.name==='down'&&actions.length)selected=(selected+1)%actions.length;else if(e.name==='escape'){if(backLabel==='exit')return null;goHome();}else if(e.name==='enter'&&actions.length&&rendered.selectionEnabled!==false)return backRow&&selected===rows.length?null:selected;
  }
 }
 async function text(title,initial=''){let value=initial,selected=2;while(true){const rendered=session.render({title,mode:'text',rows:[value,'','Apply','Back',''],selected,hint:navigationHint('text')});const e=await event();if(e.name==='text'||e.name==='paste')value+=e.text;else if(e.name==='backspace')value=[...value].slice(0,-1).join('');else if(e.name==='up'||e.name==='down')selected=selected===2?3:2;else if(e.name==='escape')goHome();else if(e.name==='enter'&&rendered.selectionEnabled!==false)return selected===2?value:null;}}
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
export function resultRows(result){return[...(result.messages??[]).map(s=>s.trim()),...[result.stdout,result.stderr].flatMap(text=>text?text.trimEnd().split(/\r?\n/):[]),...(result.results??[]).flatMap(item=>[`${item.platform??item.target?.platform??'Target'}: ${item.status}; rollback: ${item.rollback??'not needed'}`,...(item.residualPaths??[]).map(p=>'Residual path: '+p),...(item.error?['Error: '+item.error.message]:[])]),...(result.cli?['CLI: '+result.cli.status,...(result.cli.error?['CLI error: '+result.cli.error.message]:[])]:[]),...(result.error?['Error: '+result.error.message]:[]),'Exit code: '+result.code,...(result.code===0?['Open a new agent session to use changed harness settings.']:['Review the failed target and retry from the menu.']),...(result.exitSession?[(result.cli?'CLI removal':'CLI replacement')+' ended this session. Run arc again for further management.']:[])];}
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
   while(true){const nextTarget=await ui.menu('Uninstall target',['Codex','Claude','Both targets'],{selected:target,backRow:true});if(nextTarget===null)return null;target=nextTarget;
    while(true){const nextGlobal=await ui.menu('Global ARC instructions',['Remove ARC blocks','Preserve ARC blocks'],{selected:global,backRow:true});if(nextGlobal===null)break;global=nextGlobal;
     return ui.busy(()=>api.prepareOperation(context,{kind:'uninstall',target:['codex','claude','all'][target],skipGlobal:global===1}));
    }
   }
  }
  while(true){const statuses=await api.collectStatus(context),ordered=[...statuses].sort((a,b)=>({claude:0,codex:1}[a.platform]??2)-({claude:0,codex:1}[b.platform]??2));
   const label=status=>({codex:'Codex',claude:'Claude'}[status.platform]??status.platform),state=status=>({installed:'Installed',absent:'Not installed',incomplete:'Incomplete'}[status.state]??status.state);
   const info=ordered.length?[ordered.map(status=>label(status)+': '+state(status)).join(' / '),...ordered.flatMap(status=>(status.diagnostics??[]).map(error=>label(status)+': '+error.message))]:[];const choice=await ui.menu('ARC',home,{selected,info,backLabel:'exit',wordmark:true});if(choice===null||choice===4)return code;selected=choice;
   try{
    let prepared;
    if(choice===0||choice===1)prepared=await runSetup({ui,statuses,draft,kind:choice===0?'install':'preset',prepare:settings=>ui.busy(()=>api.prepareOperation(context,settings))});
    else if(choice===2){prepared=await ui.busy(()=>api.prepareOperation(context,{kind:'update'}));const action=await ui.menu('Check Version',prepared.canUpgrade?['Version Upgrade']:[],{backRow:true,info:['Current version: '+prepared.currentVersion,'Latest version: '+(prepared.latestVersion??'Unavailable'),...(prepared.latestError?[prepared.latestError.message]:[]),...(prepared.canUpgrade?['Continue?']:[])]});if(action!==0)prepared=null;}
    else prepared=await uninstall();
    if(await execute(prepared))return code;
   }catch(error){if(error.code==='ARC_TUI_HOME')continue;if(['ARC_CANCELLED','ARC_TUI_EOF'].includes(error.code))throw error;code=error.code==='ARC_CLI_INPUT'?2:1;try{await ui.page('Operation unavailable',[error.message,'No changes were applied.']);}catch(navigation){if(navigation.code!=='ARC_TUI_HOME')throw navigation;}}
  }

 }catch(error){if(error.code==='ARC_CANCELLED')return 130;if(error.code==='ARC_TUI_EOF')return code;if(error.code==='ARC_TUI_TERMINAL')return 2;throw error;}finally{signals.removeListener('SIGINT',abort);signals.removeListener('SIGTERM',abort);session?.dispose();if(finalReport)(options.output??process.stdout).write(finalReport.map(row=>escapeTerminalText(row)).join('\n')+'\n');}
}
