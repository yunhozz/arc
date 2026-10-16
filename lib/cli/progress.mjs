export function startProgress({output,label,intervalMs=80,setInterval=globalThis.setInterval,clearInterval=globalThis.clearInterval}){
 const frames=['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];let frame=0,stopped=false,timer;
 const clear=()=>output.write('\r\x1b[2K');
 const render=()=>output.write(`${frames[frame]} ${label}`);
 if(output.isTTY){render();timer=setInterval(()=>{clear();frame=(frame+1)%frames.length;render();},intervalMs);}else output.write(label+'\n');
 return{
  write(text){if(output.isTTY&&!stopped){clear();output.write(text);render();}else output.write(text);},
  stop(){if(stopped)return;stopped=true;if(timer!==undefined)clearInterval(timer);if(output.isTTY){clear();output.write('\n');}}
 };
}
