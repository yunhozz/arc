import test from 'node:test';import assert from 'node:assert/strict';
import {makeTerminal} from './helpers/tui-terminal.mjs';
const api=await import('../../lib/tui/terminal.mjs').catch(()=>({}));
function session(t,options){assert.equal(typeof api.createTerminalSession,'function');const io=makeTerminal(options),session=api.createTerminalSession(io);t.after(()=>session.dispose());return{...io,session};}
test('split-byte arrows, enter, back and EOF normalize in input order',async t=>{
 const io=session(t),events=[];for(const chunks of [['\x1b','[','B'],['\r'],['\x7f'],['\x04']]){for(const chunk of chunks)io.send(chunk);events.push(await io.session.nextEvent());}
 assert.deepEqual(events.map(event=>event.name),['down','enter','back','eof']);assert.ok(events.every(event=>Number.isInteger(event.sequence)));
});
test('UTF-8 and bracketed paste stay text, including pasted confirmation characters',async t=>{
 const io=session(t);const bytes=Buffer.from('한');io.send(bytes.subarray(0,1));io.send(bytes.subarray(1));assert.deepEqual((await io.session.nextEvent()).text,'한');
 for(const part of ['\x1b[20','0~yes\r','\x1b[B','\x1b[201~'])io.send(part);
 const event=await io.session.nextEvent();assert.equal(event.name,'paste');assert.equal(event.text,'yes\r\x1b[B');
});
test('busy input and queued enter never reach the next confirmation screen',async t=>{
 const io=session(t);io.send('\r\r');assert.equal((await io.session.nextEvent()).name,'enter');io.session.setBusy(true);io.send('\r');io.session.setBusy(false);
 io.session.render({title:'Review',rows:['Apply'],requiresConfirmation:true});io.send('\x1b[B');assert.equal((await io.session.nextEvent()).name,'down');
});
test('small confirmation blocks enter and resize recalculates required visibility',async t=>{
 const io=session(t,{rows:3});const screen={title:'Review',rows:['Destination','Changes','Apply'],requiresConfirmation:true};io.session.render(screen);io.send('\r');assert.equal((await io.session.nextEvent()).name,'blocked');
 io.resize(80,24);assert.equal((await io.session.nextEvent()).name,'resize');io.send('\r');assert.equal((await io.session.nextEvent()).name,'enter');
 io.resize(80,2);assert.equal((await io.session.nextEvent()).name,'resize');io.send('\r');assert.equal((await io.session.nextEvent()).name,'blocked');
});
for(const ending of ['end','close','SIGINT','SIGTERM','error','render-error','dispose'])test('restores raw mode, flow and owned listeners on '+ending,async t=>{
 assert.equal(typeof api.createTerminalSession,'function');const io=makeTerminal({raw:true});const existing=()=>{};io.input.on('data',existing);io.input.pause();
 const before=io.input.listeners('data'),session=api.createTerminalSession(io);t.after(()=>session.dispose());
 if(ending==='SIGINT'||ending==='SIGTERM')io.signals.emit(ending);else if(ending==='error')io.input.emit('error',new Error('read failed'));else if(ending==='render-error')assert.throws(()=>session.render({get title(){throw Error('render failed');}}),/render failed/);else if(ending==='dispose')session.dispose();else io.input.emit(ending);
 session.dispose();session.dispose();assert.equal(io.input.isRaw,true);assert.equal(io.input.readableFlowing,false);assert.deepEqual(io.input.listeners('data'),before);assert.equal(io.signals.listenerCount('SIGINT'),0);assert.equal(io.signals.listenerCount('SIGTERM'),0);assert.equal(io.output.listenerCount('resize'),0);assert.match(io.text(),/\x1b\[\?25h/);
});
test('lone escape means back and dispose cancels its pending timer',async t=>{
 const io=session(t);io.send('\x1b');assert.equal((await io.session.nextEvent()).name,'back');io.send('\x1b');io.session.dispose();assert.equal((await io.session.nextEvent()).name,'eof');
});
test('split CRLF is one enter, preventing a second unintended confirmation',async t=>{
 const io=session(t);io.send('\r');io.send('\n');io.send('x');assert.equal((await io.session.nextEvent()).name,'enter');assert.deepEqual(await io.session.nextEvent(),{name:'text',text:'x',sequence:3});
});
test('output failure during display restores terminal before propagating the error',t=>{
 const io=session(t);const write=io.output.write.bind(io.output);let failed=false;
 io.output.write=chunk=>{if(!failed&&String(chunk).includes('Review')){failed=true;throw Error('output failed');}return write(chunk);};
 assert.throws(()=>io.session.render({title:'Review',rows:['Apply']}),/output failed/);assert.equal(io.input.isRaw,false);assert.equal(io.input.listenerCount('data'),0);assert.match(io.text(),/\x1b\[\?25h/);
});
test('output error events settle waiting readers and restore raw mode',async t=>{
 const io=session(t);const pending=io.session.nextEvent(),error=Error('write failed');io.output.emit('error',error);
 const event=await pending;assert.equal(event.name,'error');assert.equal(event.error,error);assert.equal(io.input.isRaw,false);assert.equal(io.output.listenerCount('resize'),0);
});
test('dispose clears the owned escape timer immediately',t=>{
 const activeTimers=new Set(),realSetTimeout=globalThis.setTimeout,realClearTimeout=globalThis.clearTimeout;
 t.mock.method(globalThis,'setTimeout',(callback,delay)=>{const timer=realSetTimeout(()=>{activeTimers.delete(timer);callback();},delay);activeTimers.add(timer);return timer;});
 t.mock.method(globalThis,'clearTimeout',timer=>{activeTimers.delete(timer);return realClearTimeout(timer);});
 const io=session(t);io.send('\x1b');assert.equal(activeTimers.size,1);io.session.dispose();assert.equal(activeTimers.size,0);
});

for(const chunks of [['\r\x04'],['\r','\x04']])test('EOF discards unread confirmation input '+JSON.stringify(chunks),async t=>{
 const io=session(t);for(const chunk of chunks)io.send(chunk);
 assert.equal((await io.session.nextEvent()).name,'eof');assert.equal((await io.session.nextEvent()).name,'eof');
});
test('pending reader receives EOF instead of Enter from the same shutdown chunk',async t=>{
 const io=session(t),pending=io.session.nextEvent();io.send('\r\x04');assert.equal((await pending).name,'eof');assert.equal((await io.session.nextEvent()).name,'eof');
});
test('EOF retains already consumed event order and discards later queued Enter',async t=>{
 const io=session(t);io.send('\x1b[B');assert.equal((await io.session.nextEvent()).name,'down');io.send('\r');assert.equal((await io.session.nextEvent()).name,'enter');io.send('\r');io.send('\x04');assert.equal((await io.session.nextEvent()).name,'eof');
});

test('viewport follows resize and only fixed home wordmark receives trusted colors',async t=>{
 const io=session(t);assert.equal(typeof io.session.viewport,'function');assert.deepEqual(io.session.viewport(),{columns:80,rows:24});
 io.session.render({title:'ARC',wordmark:true,rows:['Update\x1b[2J']});assert.match(io.text(),/\x1b\[37m/);assert.match(io.text(),/\x1b\[32m/);assert.match(io.text(),/Update\\x1b\[2J/);
 io.resize(100,30);assert.equal((await io.session.nextEvent()).name,'resize');assert.deepEqual(io.session.viewport(),{columns:100,rows:30});
 io.session.dispose();assert.match(io.text(),/\x1b\[0m\x1b\[\?2004l/);
});

test('home outline stays white while rule and selected action are green, with styles reset before other content',t=>{
 const io=session(t);io.session.render({title:'ARC',wordmark:true,rows:['Codex: Installed','Configure','Update'],selected:1});
 const text=io.text();assert.ok(text.includes('\x1b[37m╔════╗  ╦════╗  ╔════╗\x1b[0m'));assert.match(text,/\x1b\[32m─+\x1b\[0m/);
 assert.match(text,/\x1b\[48;2;16;55;26m\x1b\[38;2;220;245;224m> Configure +\x1b\[0m/);assert.match(text,/\x1b\[2K  Update\n/);assert.doesNotMatch(text,/\nARC\n/);
 io.resize(32,18);assert.match(io.text(),/> Configure/);io.session.dispose();assert.match(io.text(),/\x1b\[0m\x1b\[\?2004l/);
});
