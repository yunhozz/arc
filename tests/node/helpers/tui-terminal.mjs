import {PassThrough, Writable} from 'node:stream';
import {EventEmitter} from 'node:events';
export function makeTerminal({keys=[],columns=80,rows=24,raw=false}={}){
 const input=new PassThrough();input.isTTY=true;input.isRaw=raw;const modes=[];
 input.setRawMode=value=>{input.isRaw=value;modes.push(value);};
 let text='';const output=new Writable({write(chunk,encoding,done){text+=chunk;done();}});
 Object.assign(output,{isTTY:true,columns,rows});const signals=new EventEmitter();
 return{input,output,signals,modes,text:()=>text,send(value){input.write(value);},start(){for(const key of keys)input.write(key);},resize(columns,rows){Object.assign(output,{columns,rows});output.emit('resize');}};
}
