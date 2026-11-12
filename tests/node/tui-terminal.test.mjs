import test from 'node:test';import assert from 'node:assert/strict';
import {makeTerminal} from './helpers/tui-terminal.mjs';
const api=await import('../../lib/tui/terminal.mjs').catch(()=>({}));
function session(t,options){assert.equal(typeof api.createTerminalSession,'function');const io=makeTerminal(options),session=api.createTerminalSession({...io,env:options?.env??{COLORTERM:'truecolor'}});t.after(()=>session.dispose());return{...io,session};}
test('split-byte arrows, enter, back and EOF normalize in input order',async t=>{
 const io=session(t),events=[];for(const chunks of [['\x1b','[','B'],['\r'],['\x7f'],['\x04']]){for(const chunk of chunks)io.send(chunk);events.push(await io.session.nextEvent());}
 assert.deepEqual(events.map(event=>event.name),['down','enter','backspace','eof']);assert.ok(events.every(event=>Number.isInteger(event.sequence)));
});
test('UTF-8 and bracketed paste stay text, including pasted confirmation characters',async t=>{
 const io=session(t);const bytes=Buffer.from('€');io.send(bytes.subarray(0,1));io.send(bytes.subarray(1));assert.deepEqual((await io.session.nextEvent()).text,'€');
 for(const part of ['\x1b[20','0~yes\r','\x1b[B','\x1b[201~'])io.send(part);
 const event=await io.session.nextEvent();assert.equal(event.name,'paste');assert.equal(event.text,'yes\r\x1b[B');
});
test('busy input and queued enter never reach the next selection screen',async t=>{
 const io=session(t);io.send('\r\r');assert.equal((await io.session.nextEvent()).name,'enter');io.session.setBusy(true);io.send('\r');io.session.setBusy(false);
 io.session.render({title:'Settings',rows:['Apply'],selected:0});io.send('\x1b[B');assert.equal((await io.session.nextEvent()).name,'down');
});
test('hidden menu selection blocks Enter and resize recalculates visibility',async t=>{
 const io=session(t,{rows:3});const screen={title:'Settings',rows:['Preset','Language','Apply'],selected:2};io.session.render(screen);io.send('\r');assert.equal((await io.session.nextEvent()).name,'blocked');
 io.resize(80,24);assert.equal((await io.session.nextEvent()).name,'resize');io.send('\r');assert.equal((await io.session.nextEvent()).name,'enter');
 io.resize(80,2);assert.equal((await io.session.nextEvent()).name,'resize');io.send('\r');assert.equal((await io.session.nextEvent()).name,'blocked');
});
test('text selections and page navigation refresh the Enter gate on every screen',async t=>{
 const io=session(t,{rows:4});
 io.session.render({title:'Maximum total subagents',mode:'text',rows:['100','Apply','Back'],selected:1});io.send('\r');assert.equal((await io.session.nextEvent()).name,'blocked');
 io.resize(80,24);assert.equal((await io.session.nextEvent()).name,'resize');
 for(const selected of [1,2]){io.session.render({title:'Maximum total subagents',mode:'text',rows:['100','Apply','Back'],selected});io.send('\r');assert.equal((await io.session.nextEvent()).name,'enter');}
 io.session.render({title:'Result',mode:'page',rows:['Installed']});io.send('\r');assert.equal((await io.session.nextEvent()).name,'enter');
 io.resize(80,3);assert.equal((await io.session.nextEvent()).name,'resize');io.send('\r');assert.equal((await io.session.nextEvent()).name,'enter');
 io.session.render({title:'Settings',rows:['Apply'],selected:0});io.send('\r');assert.equal((await io.session.nextEvent()).name,'blocked');
});
for(const ending of ['end','close','SIGINT','SIGTERM','error','render-error','dispose'])test('restores raw mode, flow and owned listeners on '+ending,async t=>{
 assert.equal(typeof api.createTerminalSession,'function');const io=makeTerminal({raw:true});const existing=()=>{};io.input.on('data',existing);io.input.pause();
 const before=io.input.listeners('data'),session=api.createTerminalSession(io);t.after(()=>session.dispose());
 if(ending==='SIGINT'||ending==='SIGTERM')io.signals.emit(ending);else if(ending==='error')io.input.emit('error',new Error('read failed'));else if(ending==='render-error')assert.throws(()=>session.render({get title(){throw Error('render failed');}}),/render failed/);else if(ending==='dispose')session.dispose();else io.input.emit(ending);
 session.dispose();session.dispose();assert.equal(io.input.isRaw,true);assert.equal(io.input.readableFlowing,false);assert.deepEqual(io.input.listeners('data'),before);assert.equal(io.signals.listenerCount('SIGINT'),0);assert.equal(io.signals.listenerCount('SIGTERM'),0);assert.equal(io.output.listenerCount('resize'),0);assert.match(io.text(),/\x1b\[\?25h/);
});
test('lone escape means back and dispose cancels its pending timer',async t=>{
 const io=session(t);io.send('\x1b');assert.equal((await io.session.nextEvent()).name,'escape');io.send('\x1b');io.session.dispose();assert.equal((await io.session.nextEvent()).name,'eof');
});
test('split CRLF is one enter, preventing a second unintended confirmation',async t=>{
 const io=session(t);io.send('\r');io.send('\n');io.send('x');assert.equal((await io.session.nextEvent()).name,'enter');assert.deepEqual(await io.session.nextEvent(),{name:'text',text:'x',sequence:3});
});
test('output failure during display restores terminal before propagating the error',t=>{
 const io=session(t);const write=io.output.write.bind(io.output);let failed=false;
 io.output.write=chunk=>{if(!failed&&String(chunk).includes('Settings')){failed=true;throw Error('output failed');}return write(chunk);};
 assert.throws(()=>io.session.render({title:'Settings',rows:['Apply'],selected:0}),/output failed/);assert.equal(io.input.isRaw,false);assert.equal(io.input.listenerCount('data'),0);assert.match(io.text(),/\x1b\[\?25h/);
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

test('escape and backspace have distinct events',async t=>{const io=session(t);for(const [bytes,want] of [['\x1b','escape'],['\x7f','backspace'],['\b','backspace']]){io.send(bytes);assert.equal((await io.session.nextEvent()).name,want);}});

test('viewport follows resize while screen data remains escaped',async t=>{
 const io=session(t);assert.deepEqual(io.session.viewport(),{columns:80,rows:24});io.session.render({wordmark:true,rows:['Update\x1b[2J']});assert.match(io.text(),/Update\\x1b\[2J/);io.resize(100,30);assert.equal((await io.session.nextEvent()).name,'resize');assert.deepEqual(io.session.viewport(),{columns:100,rows:30});
});
test('truecolor emits run colors and resets after each run',t=>{
 const io=session(t);io.session.render({wordmark:true,rows:['Configure','Update'],selected:0});assert.ok(io.text().includes('\x1b[0;1;38;2;236;253;245;48;2;6;95;70m> Configure'));assert.ok(io.text().includes('\x1b[2K  Update\n'));
 assert.equal(api.formatLine('a b',{runs:[{from:0,to:1,role:'logo',fg:[1,2,3]},{from:2,to:3,role:'shadow',fg:[4,5,6]}]},'truecolor'),'\x1b[0;38;2;1;2;3ma\x1b[0m \x1b[0;38;2;4;5;6mb\x1b[0m');
});
test('selected label, hint segments and titles stay contiguous',t=>{
 const io=session(t);io.session.render({title:'Check Version',rows:['Upgrade','Back'],selected:0});for(const value of ['> Upgrade','Esc Home','Check Version'])assert.ok(io.text().includes(value));
});
test('256-color terminals use 38;5 indexes',t=>{
 const io=session(t,{env:{TERM:'xterm-256color'}});io.session.render({wordmark:true});assert.match(io.text(),/\x1b\[0;[0-9;]*38;5;\d+m█/);assert.doesNotMatch(io.text(),/38;2/);
 assert.equal(api.formatLine('x',{runs:[{from:0,to:1,role:'selected',fg:[236,253,245],bg:[6,95,70],bold:true}]},'256'),'\x1b[0;1;38;5;231;48;5;29mx\x1b[0m');
});
test('basic terminals keep bright green logo',t=>{
 const io=session(t,{env:{TERM:'xterm'}});io.session.render({wordmark:true});assert.ok(io.text().includes('\x1b[0;92m█'));assert.doesNotMatch(io.text(),/38;[25]/);
});
for(const env of [{COLORTERM:'truecolor',NO_COLOR:''},{TERM:'dumb',TERM_PROGRAM:'cmux'}])test('color disable emits no SGR on any styled screen '+JSON.stringify(env),t=>{
 const io=session(t,{env});for(const screen of [{wordmark:true,rows:['Configure'],selected:0},{title:'Check Version',rows:['Upgrade'],selected:0},{title:'Working',mode:'busy',rows:['Running']}])io.session.render(screen);assert.doesNotMatch(io.text(),/\x1b\[[0-9;]*m/);
});
for(const name of ['ghostty','cmux'])test(name+' explicit identity enables RGB on all filled logo cells only',t=>{
 const io=session(t,{env:{TERM_PROGRAM:name,TERM:'xterm-256color'}});io.session.render({wordmark:true});const heading=io.text().split('\n').slice(0,6).join('\n');assert.equal([...heading.matchAll(/\x1b\[0;38;2;[0-9;]+m█/g)].length,[...heading].filter(character=>character==='█').length);assert.doesNotMatch(heading,/\x1b\[0;38;2;[0-9;]+m /);assert.ok(heading.includes('\x1b[0;38;2;170;243;211m█'));
});
test('reported color depth selects 256 or truecolor',t=>{
 for(const [depth,pattern] of [[8,/38;5;/],[24,/38;2;/]]){const io=makeTerminal();io.output.getColorDepth=()=>depth;const terminal=api.createTerminalSession({...io,env:{TERM:'xterm'}});t.after(()=>terminal.dispose());terminal.render({wordmark:true});assert.match(io.text(),pattern);}
});
test('toAnsi256 maps the cube',()=>{assert.equal(api.toAnsi256([0,0,0]),16);assert.equal(api.toAnsi256([255,255,255]),231);assert.equal(api.toAnsi256([16,185,129]),43);});
test('formatLine clamps colors and ignores unknown roles',()=>{
 assert.equal(api.formatLine('ab',{line:0,runs:[{from:0,to:1,role:'logo',fg:[300,-5,12.6]},{from:1,to:2,role:'bogus',fg:[1,2,3]}]},'truecolor'),'\x1b[0;38;2;255;0;13ma\x1b[0mb');
 assert.equal(api.formatLine('😀x',{runs:[{from:0,to:1,role:'logo',fg:[1,2,3]}]},'truecolor'),'\x1b[0;38;2;1;2;3m😀\x1b[0mx');assert.equal(api.formatLine('plain',{runs:[{from:0,to:5,role:'title',bold:true}]},'none'),'plain');
});

test('status tones vanish without color',t=>{
 const screen={wordmark:true,rows:['Claude: Available / Codex: Not Available','Codex: Unauthorized','Codex: Incomplete'],rowTones:['status','status','status']};
 for(const env of [{NO_COLOR:'',COLORTERM:'truecolor'},{TERM:'dumb'}]){const io=session(t,{env});io.session.render(screen);assert.doesNotMatch(io.text(),/\x1b\[[0-9;]*m/);assert.match(io.text(),/Claude: Available \/ Codex: Not Available/);}
 const basic=session(t,{env:{TERM:'xterm'}});basic.session.render(screen);assert.ok(basic.text().includes('\x1b[0;32mAvailable'));assert.ok(basic.text().includes('\x1b[0;2mNot Available'));assert.ok(basic.text().includes('\x1b[0;31mUnauthorized'));assert.ok(basic.text().includes('\x1b[0;33mIncomplete'));
});

test('repaint keeps a pending lone Escape and split arrows',async t=>{
 const io=session(t),screen={title:'Settings',rows:['Back'],selected:0};io.session.render(screen);
 io.send('\x1b');io.session.repaint(screen);assert.equal((await io.session.nextEvent()).name,'escape');
 io.send('\x1b[');io.session.repaint(screen);io.send('B');assert.equal((await io.session.nextEvent()).name,'down');
 io.send('x');io.session.repaint(screen);assert.equal((await io.session.nextEvent()).text,'x');
});
test('repaint skips identical frames and resize forces a redraw',t=>{
 const io=session(t),screen={wordmark:true,rows:['Exit'],selected:0};io.session.render(screen);const first=io.text().length;
 io.session.repaint(screen);assert.equal(io.text().length,first);io.session.repaint({...screen,frame:9});assert.ok(io.text().length>first);
 const animated=io.text().length;io.resize(100,30);assert.ok(io.text().length>animated);const resized=io.text().length;
 io.session.repaint({...screen,frame:9});assert.equal(io.text().length,resized);
});
test('frames are wrapped in synchronized output',t=>{
 const io=session(t),writes=[],write=io.output.write.bind(io.output);io.output.write=chunk=>{writes.push(String(chunk));return write(chunk);};
 io.session.render({title:'Settings',rows:['Back'],selected:0});assert.equal(writes.length,1);assert.match(writes[0],/^\x1b\[\?2026h[\s\S]*\x1b\[2K[\s\S]*\x1b\[\?2026l$/);
});
test('frameMs is 80 unless TERM is dumb',t=>{for(const [env,want] of [[{},80],[{TERM:'dumb'},0],[{NO_COLOR:''},80]])assert.equal(session(t,{env}).session.frameMs,want);});
test('repaint after dispose is a no-op',t=>{const io=session(t);io.session.dispose();const before=io.text();assert.deepEqual(io.session.repaint({title:'Closed'}),{selectionEnabled:false,text:''});assert.equal(io.text(),before);});

test('basic and 256-color formatting merges adjacent runs with identical SGR',()=>{
 for(const [depth,colors,params] of [['16',[[1,2,3],[240,250,245]],'92'],['256',[[1,2,3],[10,12,15]],'38;5;16'],['truecolor',[[1,2,3],[1,2,3]],'38;2;1;2;3']]){
  const runs=colors.map((fg,index)=>({from:index,to:index+1,role:index?'sparkle':'logo',fg}));
  assert.equal(api.formatLine('ab',{runs},depth),'\x1b[0;'+params+'mab\x1b[0m');
  assert.equal(api.formatLine('a b',{runs:[runs[0],{...runs[1],from:2,to:3}]},depth),'\x1b[0;'+params+'ma\x1b[0m \x1b[0;'+params+'mb\x1b[0m');
 }
});
test('basic home frames stay identical throughout shimmer',async t=>{
 const{renderScreen}=await import('../../lib/tui/render.mjs'),home={wordmark:true,rows:['Exit'],selected:0};
 const formatted=frame=>{const result=renderScreen({...home,frame});return result.text.split('\n').map((line,index)=>api.formatLine(line,result.styles.find(style=>style.line===index),'16')).join('\n');};
 assert.equal(formatted(9),formatted(0));
 const io=session(t,{env:{TERM:'xterm'}});io.session.render(home);const before=Buffer.byteLength(io.text());for(let frame=1;frame<=36;frame++)io.session.repaint({...home,frame});assert.equal(Buffer.byteLength(io.text())-before,0);
});
