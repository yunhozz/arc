import readline from 'node:readline';
import {EventEmitter} from 'node:events';
function inputError(message){return Object.assign(new Error(message),{code:'ARC_CLI_INPUT'});}
function cancelled(){return Object.assign(new Error('Installation cancelled.'),{code:'ARC_CANCELLED'});}
export async function selectChoices(options,{input=process.stdin,output=process.stdout,targetOnly=false,languageDefault}={}){
 if(languageDefault===undefined&&options.target&&(targetOnly||options.preset)||languageDefault!==undefined&&options.language)return options;
 if(!input.isTTY||!output.isTTY)throw inputError(targetOnly?'Non-interactive execution requires --target':'Non-interactive execution requires --target and --preset');
 const menus=languageDefault!==undefined?[['language',['English','한국어'],['en','ko'],languageDefault==='ko'?1:0]]:[['target',['Claude','Codex','All'],['claude','codex','all'],0],['preset',['Economy','Balanced','Smart'],['economy','balanced','smart'],1]].filter(([key])=>!options[key]&&(!targetOnly||key==='target'));
 const wasRaw=input.isRaw,wasFlowing=input.readableFlowing,listeners=new Map(['data','newListener'].map(event=>[event,input.listeners(event)]));
 let menu=0,index=menus[0][3];
 const draw=(redraw=false)=>{const [key,labels]=menus[menu];if(redraw)output.write(`\x1b[${labels.length}A\r`);else output.write(`Select ${key==='target'?'an installation target':key==='language'?'an output language':'a performance preset'} [Up/Down]:\n`);output.write(labels.map((label,i)=>`\x1b[2K${i===index?'>':' '} ${label}`).join('\n')+'\n');};
 const keys=new EventEmitter();let onKey,onData,onEnd,onError,abort;
 try{return await new Promise((resolve,reject)=>{
  abort=()=>reject(cancelled());onEnd=abort;onError=reject;
  onKey=(str,key={})=>{try{if(key.name==='c'&&key.ctrl||key.name==='d'&&key.ctrl)return abort();if(key.name==='up'||key.name==='down'){index=(index+(key.name==='up'?-1:1)+menus[menu][1].length)%menus[menu][1].length;draw(true);}else if(key.name==='return'||key.name==='enter'){const [name,,values]=menus[menu];options[name]=values[index];output.write('\n');if(++menu===menus.length){keys.removeListener('keypress',onKey);resolve(options);}else{index=menus[menu][3];draw();}}}catch(error){reject(error);}};
  keys.on('keypress',onKey);readline.emitKeypressEvents(keys);onData=chunk=>keys.emit('data',chunk);input.on('data',onData);input.once('end',onEnd);input.once('error',onError);process.once('SIGINT',abort);
  if(input.setRawMode)input.setRawMode(true);input.resume();draw();
 });}finally{
  keys.removeAllListeners();input.removeListener('data',onData);input.removeListener('end',onEnd);input.removeListener('error',onError);process.removeListener('SIGINT',abort);
  for(const [event,before]of listeners)for(const listener of input.listeners(event))if(!before.includes(listener))input.removeListener(event,listener);
  if(input.setRawMode)input.setRawMode(Boolean(wasRaw));if(wasFlowing!==true)input.pause();
 }
}

export async function selectLimits(options,selections,{input=process.stdin,output=process.stdout}={}){
 const{parsePositiveLimit}=await import('../limits.mjs');
 const fields=[['maxTotalSubagents','max_total_subagents',100,'total'],['maxConcurrentSubagents','max_concurrent_subagents',5,'concurrent']].filter(([key])=>options[key]===undefined);
 if(!fields.length)return options;
 const wasRaw=input.isRaw,wasFlowing=input.readableFlowing,listeners=new Map(['data','newListener'].map(event=>[event,input.listeners(event)]));
 let index=0,value='',onKey,onData,onEnd,onError,abort;
 const draw=()=>{const[,,fallback,label]=fields[index];output.write(`Maximum ${label} subagents [Default=${fallback}]: `);};
 try{return await new Promise((resolve,reject)=>{
  abort=()=>reject(cancelled());onEnd=abort;onError=reject;
  onKey=(str,key={})=>{if(key.ctrl&&(key.name==='c'||key.name==='d'))return abort();if(key.name==='return'||key.name==='enter'){
   const[name,,,label]=fields[index];if(value.trim()){try{options[name]=parsePositiveLimit(value,label);}catch(cause){output.write(`\n${cause.message}\n`);value='';draw();return;}}
   if(name==='maxConcurrentSubagents')options.concurrentSelected=true;output.write('\n');value='';if(++index===fields.length){input.removeListener('keypress',onKey);resolve(options);}else draw();
  }else if(key.name==='backspace'){value=value.slice(0,-1);output.write('\b \b');}else if(str&&!key.ctrl&&!key.meta){value+=str;output.write(str);}};
  onData=chunk=>{for(const character of chunk.toString()){if(index===fields.length)break;const name=character==='\r'||character==='\n'?'return':character==='\x03'?'c':character==='\x04'?'d':character==='\x7f'||character==='\b'?'backspace':undefined;onKey(character,{name,ctrl:character==='\x03'||character==='\x04'});}};
  input.on('data',onData);input.once('end',onEnd);input.once('error',onError);process.once('SIGINT',abort);if(input.setRawMode)input.setRawMode(true);input.resume();draw();
 });}finally{
  input.removeListener('data',onData);input.removeListener('end',onEnd);input.removeListener('error',onError);process.removeListener('SIGINT',abort);
  for(const[event,before]of listeners)for(const listener of input.listeners(event))if(!before.includes(listener))input.removeListener(event,listener);
  if(input.setRawMode)input.setRawMode(Boolean(wasRaw));if(wasFlowing!==true)input.pause();
 }
}

export async function selectLanguage(options,languageDefault,io={}){return selectChoices(options,{...io,languageDefault});}
