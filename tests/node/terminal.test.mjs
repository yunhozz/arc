import test from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
const api=await import('../../lib/cli/terminal.mjs').catch(()=>({}));
function streams(){const input=new PassThrough(),output=new PassThrough();input.isTTY=output.isTTY=true;input.isRaw=false;input.setRawMode=value=>{input.isRaw=value;};return{input,output,error:output};}
test('terminal gating never opens a controlling tty for CI or unsupported systems',()=>{
 assert.equal(typeof api.openInstallerTerminal,'function');
 for(const options of [{platform:'win32',env:{}},{platform:'linux',env:{CI:'true'}},{platform:'darwin',env:{CONTINUOUS_INTEGRATION:'1'}}]){
  const terminal=api.openInstallerTerminal({...options,...streams(),openTty(){throw Error('must not open');}});assert.equal(terminal.kind,'skip');
 }
});
test('piped npm stdio uses an owned tty and disposes it once, restoring raw mode',()=>{
 for(const wasRaw of [false,true]){const io=streams();io.input.isRaw=wasRaw;let closed=0;
  const terminal=api.openInstallerTerminal({platform:'linux',env:{},input:{},output:{},error:{},openTty:()=>({io,dispose(){closed++;}})});
  assert.equal(terminal.kind,'interactive');assert.equal(terminal.io.input,io.input);io.input.setRawMode(!wasRaw);terminal.dispose();terminal.dispose();assert.equal(io.input.isRaw,wasRaw);assert.equal(closed,1);
 }
});
test('unavailable controlling terminal skips and reused streams stay open',()=>{
 assert.equal(api.openInstallerTerminal({platform:'linux',env:{},input:{},output:{},openTty(){throw Error('ENXIO');}}).kind,'skip');
 const io=streams(),terminal=api.openInstallerTerminal({platform:'linux',env:{},...io});terminal.dispose();assert.equal(io.input.destroyed,false);assert.equal(io.output.destroyed,false);
});
