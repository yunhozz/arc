import {StringDecoder} from 'node:string_decoder';
import {renderScreen} from './render.mjs';

/** Events are {name, sequence, ...detail}. Names: up/down/left/right, enter,
 * back, text/paste (text), resize (columns,rows), blocked, eof, interrupt
 * (signal), error (error). Every data chunk gets a sequence; paste is one event.
 * render/discardInput/setBusy invalidate buffered input. While busy all data is
 * discarded. Only one nextEvent waiter is allowed. dispose is idempotent,
 * restores owned terminal state, and settles a waiting reader with eof. Shutdown
 * discards unread events; a chunk is fully decoded before resolving a reader,
 * so an Enter followed by EOF in that chunk cannot escape shutdown.
 */
export function createTerminalSession({input=process.stdin,output=process.stdout,signals=process,env=process.env}={}){
 if(!input.isTTY||!output.isTTY)throw Object.assign(Error('An interactive terminal is required.'),{code:'ARC_TUI_TERMINAL'});
 const wasRaw=Boolean(input.isRaw),wasFlowing=input.readableFlowing;
 const colorEnabled=env.NO_COLOR===undefined&&env.TERM!=='dumb';
 const truecolor=colorEnabled&&(/^(truecolor|24bit)$/i.test(env.COLORTERM??'')||/^(ghostty|cmux)$/i.test(env.TERM_PROGRAM??'')||/-direct$/.test(env.TERM??'')||(output.getColorDepth?.()??0)>=24);
 let disposed=false,busy=false,parsing=false,pending='',paste=null,sequence=0,escapeTimer,waiter,queue=[],screen,lastLines=0,applyEnabled=true;
 let decoder=new StringDecoder('utf8'),lastWasCR=false;
 const clearTimer=()=>{clearTimeout(escapeTimer);escapeTimer=undefined;};
 function deliver(name,detail={}){
  const event={name,sequence,...detail};if(waiter&&!parsing){const resolve=waiter;waiter=undefined;resolve(event);}else queue.push(event);
 }
 function discardInput(){clearTimer();pending='';paste=null;decoder=new StringDecoder('utf8');queue=[];}
 function dispose(){
  if(disposed)return;disposed=true;clearTimer();pending='';paste=null;queue=[];
  input.removeListener('data',onData);input.removeListener('end',onEnd);input.removeListener('close',onEnd);input.removeListener('error',onError);
  output.removeListener('resize',onResize);output.removeListener('error',onError);signals.removeListener('SIGINT',onSigint);signals.removeListener('SIGTERM',onSigterm);
  try{if(input.setRawMode&&!input.destroyed)input.setRawMode(wasRaw);}finally{
   try{if(wasFlowing!==true)input.pause();}finally{
    try{output.write('\x1b[0m\x1b[?2004l\x1b[?25h\n');}finally{if(waiter){const resolve=waiter;waiter=undefined;resolve({name:'eof',sequence});}}
   }
  }
 }
 function finish(name,detail){const resolve=waiter;waiter=undefined;dispose();if(resolve)resolve({name,sequence,...detail});else deliver(name,detail);}
 function onEnd(){if(!disposed)finish('eof');}
 function onError(error){if(!disposed)finish('error',{error});}
 function onSigint(){if(!disposed)finish('interrupt',{signal:'SIGINT'});}
 function onSigterm(){if(!disposed)finish('interrupt',{signal:'SIGTERM'});}
 function draw(){
  const result=renderScreen(screen,{columns:output.columns,rows:output.rows});applyEnabled=result.applyEnabled;
  if(lastLines)output.write(`\x1b[${lastLines}A\r`);
  const lines=result.text.split('\n');
  for(let index=0;index<Math.max(lastLines,lines.length);index++){
   let line=lines[index]??'';const style=result.styles.find(style=>style.line===index);
   if(style&&colorEnabled){
    if(style.color==='logo'&&truecolor){const cells=new Map(style.cells.map(cell=>[cell.column,cell.rgb]));line=[...line].map((character,column)=>cells.has(column)?'\x1b[38;2;'+cells.get(column).join(';')+'m'+character+'\x1b[0m':character).join('');}
    else{const color=style.color==='logo'?'\x1b[92m':style.color==='selected'?(truecolor?'\x1b[48;2;16;55;26m\x1b[38;2;220;245;224m':'\x1b[42;30m'):'\x1b[32m';line=color+line+'\x1b[0m';}
   }
   output.write('\x1b[2K'+line+'\n');
  }

  if(lastLines>lines.length)output.write(`\x1b[${lastLines-lines.length}A\r`);
  lastLines=lines.length;return result;
 }
 function render(value){if(disposed)return{applyEnabled:false,text:''};discardInput();screen=value;try{return draw();}catch(error){dispose();throw error;}}
 function onResize(){if(disposed)return;discardInput();try{if(screen)draw();deliver('resize',{columns:output.columns,rows:output.rows});}catch(error){onError(error);}}
 function parse(){
  while(pending&&!disposed){
   if(paste!==null){const end=pending.indexOf('\x1b[201~');if(end<0){const tail=pending.lastIndexOf('\x1b');if(tail<0){paste+=pending;pending='';}else{paste+=pending.slice(0,tail);pending=pending.slice(tail);}return;}paste+=pending.slice(0,end);pending=pending.slice(end+6);deliver('paste',{text:paste});paste=null;continue;}
   if(pending.startsWith('\x1b[200~')){pending=pending.slice(6);paste='';continue;}
   const arrow=/^\x1b(?:\[|O)([ABCD])/.exec(pending);
   if(arrow){pending=pending.slice(arrow[0].length);deliver({A:'up',B:'down',C:'right',D:'left'}[arrow[1]]);continue;}
   if(pending[0]==='\x1b'){
    if(pending==='\x1b'||['\x1b[','\x1bO','\x1b[2','\x1b[20','\x1b[200'].includes(pending)){escapeTimer=setTimeout(()=>{escapeTimer=undefined;pending='';deliver('back');},35);return;}
    // Unknown escape sequences are consumed as text, never executed as keys.
    const unknown=/^\x1b\[[0-9;?]*[ -/]*[@-~]/.exec(pending);if(unknown){pending=pending.slice(unknown[0].length);continue;}
    pending=pending.slice(1);deliver('back');continue;
   }
   const character=[...pending][0];pending=pending.slice(character.length);const skipLF=lastWasCR&&character==='\n';lastWasCR=character==='\r';if(skipLF)continue;
   if(character==='\x03'){onSigint();return;}if(character==='\x04'){onEnd();return;}
   if(character==='\r'||character==='\n')deliver(applyEnabled?'enter':'blocked');
   else if(character==='\x7f'||character==='\b')deliver('back');
   else if(!/[\p{Cc}]/u.test(character))deliver('text',{text:character});
  }
 }
 function onData(chunk){if(disposed||busy)return;sequence++;clearTimer();pending+=typeof chunk==='string'?chunk:decoder.write(chunk);parsing=true;try{parse();}finally{parsing=false;if(waiter&&queue.length){const resolve=waiter;waiter=undefined;resolve(queue.shift());}}}
 input.on('data',onData);input.on('end',onEnd);input.on('close',onEnd);input.on('error',onError);output.on('resize',onResize);output.on('error',onError);signals.on('SIGINT',onSigint);signals.on('SIGTERM',onSigterm);
 try{input.setRawMode?.(true);input.resume();output.write('\x1b[?25l\x1b[?2004h');}catch(error){dispose();throw error;}
 return{render,discardInput,dispose,viewport(){return{columns:output.columns??80,rows:output.rows??24};},setBusy(value){busy=Boolean(value);discardInput();},nextEvent(){if(queue.length)return Promise.resolve(queue.shift());if(disposed)return Promise.resolve({name:'eof',sequence});if(waiter)return Promise.reject(Error('Only one terminal event reader is allowed.'));return new Promise(resolve=>{waiter=resolve;});}};
}
