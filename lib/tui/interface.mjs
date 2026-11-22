import {navigationHint,statusSpans,platformStatusSpans,wrapDetailRow,wrapDetailRows,wordmarkRows,fitChoiceRow} from './render.mjs';

function goHome(){throw Object.assign(Error('Return home'),{code:'ARC_TUI_HOME'});}
function interrupted(){return Object.assign(Error('Session interrupted'),{code:'ARC_CANCELLED'});}
export function createTuiInterface(session,{input,controller}={}){
 async function event(){const e=await session.nextEvent();if(e.name==='interrupt')throw interrupted();if(e.name==='eof')throw Object.assign(Error('Session closed'),{code:'ARC_TUI_EOF'});if(e.name==='error')throw e.error;return e;}
 async function menu(title,rows,{selected=0,info=[],infoTones,rowTones,notice=[],fitRows=false,backRow=false,actionKinds,backLabel='back',wordmark=false,version,renderBody,onHorizontal,refreshMs,hint='menu'}={}){
  const actions=backRow?[...rows,'Back']:rows,kinds=rows.map((_,index)=>actionKinds?.[index]);if(backRow)kinds.push('cancel');
  selected=actions.length?Math.max(0,Math.min(selected,actions.length-1)):0;
  const animate=wordmark&&session.frameMs>0,pulse=typeof onHorizontal==='function'&&session.motion===true,tickMs=animate||pulse?session.frameMs:refreshMs;
  let pending,settled,wake,timer,blink=true,frame=0,blinkElapsed=0,repainting=false;
  try{while(true){
   const viewport=session.viewport(),display=actions,displayIndex=selected,information=[],tones=[],spans=[];
   const details=typeof info==='function'?info({selected,...viewport}):info;
   for(const [index,row] of details.entries()){const wrapped=wrapDetailRow(row,viewport.columns),tone=infoTones?.[index],states=tone==='status'?statusSpans(row):tone==='platform-status'?platformStatusSpans(row):[];for(const [line,{text,from,to,prefix}] of wrapped.entries()){information.push(text);tones.push(line&&tone==='diagnostic'?'diagnostic-cont':tone);spans.push(states.filter(span=>span.from<to&&span.to>from).map(span=>({...span,from:Math.max(span.from,from)-from+prefix,to:Math.min(span.to,to)-from+prefix})));}}
   while(information.at(-1)===''){information.pop();tones.pop();}if(information.length){information.push('');tones.push(undefined);}
   const notices=typeof notice==='function'?notice({selected,...viewport}):notice,noticeRows=wrapDetailRows(notices,viewport.columns);while(noticeRows.at(-1)==='')noticeRows.pop();
   const capacity=Math.max(1,viewport.rows-(wordmark?wordmarkRows(viewport):1)-information.length-noticeRows.length-4),offset=Math.max(0,Math.min(displayIndex-capacity+1,display.length-capacity)),visible=display.slice(offset,offset+capacity).map(row=>fitRows?fitChoiceRow(row,viewport.columns):row);
   const screen={title,wordmark,version,frame,notices,rows:[...information,...visible],selected:actions.length?information.length+displayIndex-offset:undefined,hint:navigationHint(hint,{backLabel,horizontal:typeof onHorizontal==='function'}),...(display.length>capacity?{position:(offset+1)+'-'+Math.min(offset+capacity,display.length)+'/'+display.length}:{})};
   if(infoTones||rowTones){screen.rowTones=[...tones,...visible.map((_,index)=>rowTones?.[offset+index])];screen.rowStatusSpans=spans;}
   if(backRow||actionKinds)screen.rowKinds=[...information.map(()=>undefined),...kinds.slice(offset,offset+capacity)];
   const body=renderBody?.({selected,blink,frame,...viewport});if(body){delete screen.rowTones;delete screen.rowStatusSpans;delete screen.rowKinds;if(body.rowKinds)screen.rowKinds=body.rowKinds;screen.rows=body.rows;screen.selected=body.selected;screen.showSelection=body.showSelection;screen.compactFooter=body.compactFooter;if(Object.hasOwn(body,'notices'))screen.notices=body.notices;if(Object.hasOwn(body,'position'))screen.position=body.position;}
   const rendered=(repainting?(session.repaint??session.render):session.render).call(session,screen);pending??=event().then(e=>{settled={e};wake?.();},error=>{settled={error};wake?.();});
   if(tickMs>0){if(!settled)await new Promise(resolve=>{wake=resolve;timer=setTimeout(resolve,tickMs);});clearTimeout(timer);timer=undefined;wake=undefined;if(!settled){if(animate||pulse)frame++;if(refreshMs>0){blinkElapsed+=tickMs;while(blinkElapsed>=refreshMs){blink=!blink;blinkElapsed-=refreshMs;}}repainting=true;continue;}}else await pending;
   if(Object.hasOwn(settled,'error'))throw settled.error;const e=settled.e;pending=undefined;settled=undefined;repainting=false;
   if(e.name==='up'&&actions.length)selected=(selected+actions.length-1)%actions.length;else if(e.name==='down'&&actions.length)selected=(selected+1)%actions.length;else if((e.name==='left'||e.name==='right')&&onHorizontal)onHorizontal({direction:e.name,selected,...viewport});else if(e.name==='escape'){if(backLabel==='exit')return null;goHome();}else if(e.name==='enter'&&actions.length&&rendered.selectionEnabled!==false)return backRow&&selected===rows.length?null:selected;
  }}finally{if(timer!==undefined)clearTimeout(timer);}
 }
 async function text(title,initial=''){let value=initial,selected=2;while(true){const rendered=session.render({title,mode:'text',rows:[value,'','Save','Back',''],rowKinds:[undefined,undefined,'confirm','cancel',undefined],selected,hint:navigationHint('text')});const e=await event();if(e.name==='text'||e.name==='paste')value+=e.text;else if(e.name==='backspace')value=[...value].slice(0,-1).join('');else if(e.name==='up'||e.name==='down')selected=selected===2?3:2;else if(e.name==='escape')goHome();else if(e.name==='enter'&&rendered.selectionEnabled!==false)return selected===2?value:null;}}
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
