import fs from 'node:fs';
import tty from 'node:tty';
function openControllingTerminal(){
 let inputFd,outputFd,input,output;
 try{
  inputFd=fs.openSync('/dev/tty','r+');outputFd=fs.openSync('/dev/tty','r+');
  input=new tty.ReadStream(inputFd);inputFd=undefined;
  output=new tty.WriteStream(outputFd);outputFd=undefined;
  return{io:{input,output,error:output},dispose(){input.destroy();output.destroy();}};
 }catch(cause){input?.destroy();output?.destroy();if(inputFd!==undefined)fs.closeSync(inputFd);if(outputFd!==undefined)fs.closeSync(outputFd);throw cause;}
}
export function openInstallerTerminal({platform=process.platform,env=process.env,input=process.stdin,output=process.stdout,error=process.stderr,openTty=openControllingTerminal}={}){
 if(!['darwin','linux'].includes(platform))return{kind:'skip',reason:'unsupported platform'};
 if(['CI','CONTINUOUS_INTEGRATION','BUILD_NUMBER','RUN_ID'].some(name=>env[name]&&env[name]!=='false'&&env[name]!=='0'))return{kind:'skip',reason:'non-interactive environment'};
 let owned,io;
 try{if(input.isTTY&&output.isTTY)io={input,output,error};else{owned=openTty();io=owned.io;}if(!io.input.isTTY||!io.output.isTTY)throw Error('Terminal is not interactive');}catch{owned?.dispose();return{kind:'skip',reason:'no interactive terminal'};}
 const wasRaw=Boolean(io.input.isRaw),wasFlowing=io.input.readableFlowing;let disposed=false;
 return{kind:'interactive',io,dispose(){if(disposed)return;disposed=true;try{if(io.input.setRawMode&&!io.input.destroyed)io.input.setRawMode(wasRaw);if(wasFlowing!==true)io.input.pause();}finally{owned?.dispose();}}};
}
