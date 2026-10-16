import readline from 'node:readline';
function inputError(message){return Object.assign(new Error(message),{code:'ARC_CLI_INPUT'});}
function cancelled(){return Object.assign(new Error('Installation cancelled.'),{code:'ARC_CANCELLED'});}
export async function selectChoices(options,{input=process.stdin,output=process.stdout,targetOnly=false}={}){
 if(options.target&&(targetOnly||options.preset))return options;
 if(!input.isTTY||!output.isTTY)throw inputError(targetOnly?'Non-interactive execution requires --target':'Non-interactive execution requires --target and --preset');
 const menus=[['target',['Claude','Codex','All'],['claude','codex','all'],0],['preset',['Economy','Balanced','Smart'],['economy','balanced','smart'],1]].filter(([key])=>!options[key]&&(!targetOnly||key==='target'));
 const wasRaw=input.isRaw,wasFlowing=input.readableFlowing,listeners=new Map(['data','newListener'].map(event=>[event,input.listeners(event)]));
 let menu=0,index=menus[0][3];
 const draw=(redraw=false)=>{const [key,labels]=menus[menu];if(redraw)output.write('\x1b[3A\r');else output.write(`Select ${key==='target'?'an installation target':'a performance preset'}:\n`);output.write(labels.map((label,i)=>`\x1b[2K${i===index?'>':' '} ${label}`).join('\n')+'\n\x1b[2KUse Up/Down and Enter.');};
 let onKey,onEnd,onError,abort;
 try{return await new Promise((resolve,reject)=>{
  abort=()=>reject(cancelled());onEnd=abort;onError=reject;
  onKey=(str,key={})=>{try{if(key.name==='c'&&key.ctrl||key.name==='d'&&key.ctrl)return abort();if(key.name==='up'||key.name==='down'){index=(index+(key.name==='up'?-1:1)+3)%3;draw(true);}else if(key.name==='return'||key.name==='enter'){const [name,,values]=menus[menu];options[name]=values[index];output.write('\n');if(++menu===menus.length){input.removeListener('keypress',onKey);resolve(options);}else{index=menus[menu][3];draw();}}}catch(error){reject(error);}};
  input.on('keypress',onKey);input.once('end',onEnd);input.once('error',onError);process.once('SIGINT',abort);
  readline.emitKeypressEvents(input);if(input.setRawMode)input.setRawMode(true);input.resume();draw();
 });}finally{
  input.removeListener('keypress',onKey);input.removeListener('end',onEnd);input.removeListener('error',onError);process.removeListener('SIGINT',abort);
  for(const [event,before]of listeners)for(const listener of input.listeners(event))if(!before.includes(listener))input.removeListener(event,listener);
  if(input.setRawMode)input.setRawMode(Boolean(wasRaw));if(wasFlowing!==true)input.pause();
 }
}
