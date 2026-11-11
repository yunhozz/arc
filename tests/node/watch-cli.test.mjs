import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {EventEmitter, once} from 'node:events';
import {spawn, execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {makeHomes} from './fixtures/watch/homes.mjs';
import {parseWatchArgs, runWatch, WATCH_HELP} from '../../lib/watch/index.mjs';
import {runRoot} from '../../lib/cli/root.mjs';
import {WATCH_KINDS, WATCH_LIMITS} from '../../lib/watch/model.mjs';
import {GIT_ALLOWED} from '../../lib/watch/git.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const TIME = Date.parse('2026-11-11T12:00:00Z');
const iso = n => new Date(n).toISOString();
const msg = text => ({timestamp:iso(TIME),type:'event_msg',payload:{type:'item_completed',item:{type:'UserMessage',content:[{text}]}}});
const command = text => ({timestamp:iso(TIME),type:'event_msg',payload:{type:'item_completed',item:{type:'CommandExecution',command:text,exit_code:0}}});
const strip = s => s.replace(/\x1b\[[0-9;]*m/g,'');
class Output extends EventEmitter {
  text = '';
  write(s) { this.text += s; this.emit('written',s); return true; }
}
function setup(t) {
  const h = makeHomes(t), cwd = path.join(h.root,'repo');
  fs.mkdirSync(cwd);
  let tick, clearCount = 0, clock = TIME, ready;
  const started = new Promise(resolve => ready = resolve), controller = new AbortController();
  const output = new Output(), error = new Output(), proc = new EventEmitter(), calls = [];
  const io = {output,error,process:proc,userHome:h.userHome,cwd,env:{},signal:controller.signal,now:()=>clock,
    git:async (dir,args)=>{calls.push({dir,args});assert.ok(GIT_ALLOWED.some(a=>JSON.stringify(a)===JSON.stringify(args)));return null;},
    setInterval(fn,ms){assert.equal(ms,WATCH_LIMITS.filePollMs);tick=fn;ready();return 17;},
    clearInterval(id){assert.equal(id,17);clearCount++;},
  };
  const write = (id,dir=cwd,lines=[msg('hello')]) => h.writeRollout(['2026','11','11'],`rollout-${id}.jsonl`,[
    {timestamp:iso(TIME),type:'session_meta',payload:{id,cwd:dir,originator:'codex-tui'}},...lines,
  ],{mtime:TIME});
  async function start(args=[]) {
    const result=runWatch(args,io);t.after(()=>controller.abort());
    await Promise.race([started,result.then(code=>{throw Error(`watch exited before live: ${code}: ${error.text}`);})]);
    return {result};
  }
  return {h,cwd,io,output,error,proc,controller,calls,write,start,step:async()=>{clock+=500;await tick();},cleared:()=>clearCount,advance:ms=>clock+=ms};
}

// Catch missing parsing branches, bad defaults, duplicate options and invalid values.
test('parseWatchArgs accepts each documented option in both value forms', t => {
  const s=setup(t);
  assert.deepEqual(parseWatchArgs([]),{ok:true,options:{mode:'default',dir:null,session:null,platforms:['codex','claude'],tail:20,verbose:false,json:false,width:null,help:false}});
  for (const [name,value,key,want] of [['tail','5','tail',5],['platform','claude','platforms',['claude']],['width','80','width',80],['cwd',s.cwd,'dir',fs.realpathSync(s.cwd)],['session','abc-1','session','abc-1']]) {
    for(const args of [[`--${name}`,value],[`--${name}=${value}`]]) {const r=parseWatchArgs(args);assert.equal(r.ok,true);assert.deepEqual(r.options[key],want);}
  }
  for(const flag of ['verbose','json','help']) assert.equal(parseWatchArgs([`--${flag}`]).options[flag],true);
  assert.equal(parseWatchArgs(['--all']).options.mode,'all');
});
test('usage errors exit 2 with a message',async t=>{
  const s=setup(t);
  for(const args of [['--foo'],['x'],['--tail','1','--tail','2'],['--cwd',s.cwd,'--all'],['--all','--session','x'],['--platform','both'],['--tail','-1'],['--tail','1001'],['--tail','1.5'],['--width','39'],['--width','2001'],['--session','a/b'],['--cwd'],['--cwd','/nonexistent-arc-watch'],['--json=true'],['--help','--help'],['--tail='],['--session',''],['--width'],['--cwd='],['--cwd','']]) {
    s.error.text='';assert.equal(await runWatch(args,{...s.io,setInterval(){throw Error('Invalid arguments started the watcher');}}),2,JSON.stringify(args));assert.match(s.error.text,/arc watch --help/);assert.equal(s.output.text,'');
  }
});
test('watch help matches the spec text',async t=>{
  const s=setup(t), spec=fs.readFileSync(path.join(root,'docs/superpowers/specs/2026-11-11-arc-watch-design.md'),'utf8');
  const expected=spec.split('### 5.3 ')[1].split('```')[1].replace(/^\n|\n$/g,'');
  assert.equal(WATCH_HELP,expected);assert.equal(await runWatch(['--help'],s.io),0);assert.equal(s.output.text,WATCH_HELP+'\n');
  assert.match(WATCH_HELP,/host_sandbox_blocked/);assert.match(WATCH_HELP,/Codex Desktop/);
});
test('root lists watch and keeps other behavior',async t=>{
  const s=setup(t);assert.equal(await runRoot(['--help'],s.io),0);
  assert.ok(s.output.text.startsWith('Usage: arc\n       arc watch [options]\n       arc --help\n       arc --version\n'));
  assert.match(s.output.text,/Run arc watch to follow Claude Code and Codex session activity\.\n$/);
  s.output.text='';assert.equal(await runRoot(['watch','--help'],s.io),0);assert.equal(s.output.text,WATCH_HELP+'\n');
  assert.equal(await runRoot(['install'],s.io),2);assert.match(s.error.text,/Unsupported arguments/);assert.match(s.error.text,/arc watch \[options\]/);
  s.output.text='';assert.equal(await runRoot(['--version'],s.io),0);assert.equal(s.output.text,JSON.parse(fs.readFileSync(path.join(root,'package.json'))).version+'\n');
  assert.equal(await runRoot([],s.io),2);assert.match(s.error.text,/interactive terminal/);
});
test('no usable source exits 1',async t=>{
  const s=setup(t);
  for(const [args,env] of [[['--platform','claude'],{CLAUDE_CONFIG_DIR:'/elsewhere'}],[[],{CODEX_HOME:'',CLAUDE_CONFIG_DIR:'/elsewhere'}]]) {
    s.error.text='';assert.equal(await runWatch(args,{...s.io,env}),1);assert.equal(s.error.text.trim().split('\n').length,1);assert.equal(s.output.text,'');
  }
});
test('one disabled platform emits a notice and keeps the other live',async t=>{
  const s=setup(t);s.io.env={CODEX_HOME:''};const {result}=await s.start(['--json']);s.controller.abort();assert.equal(await result,0);
  const rows=s.output.text.trim().split('\n').map(JSON.parse);assert.ok(rows.some(e=>e.text.includes('codex')&&e.kind==='notice'));assert.ok(rows.some(e=>e.text==='live'));assert.equal(s.error.text,'');
});
test('abort stops timers and resolves 0',async t=>{
  const s=setup(t);const {result}=await s.start();s.controller.abort();assert.equal(await result,0);assert.equal(s.cleared(),1);
  for(const signal of ['SIGINT','SIGTERM','SIGHUP'])assert.equal(s.proc.listenerCount(signal),0);
  assert.equal(s.output.listenerCount('resize'),0);assert.equal(s.output.listenerCount('error'),0);
});
test('already aborted signal does not start timers',async t=>{const s=setup(t);s.controller.abort();assert.equal(await runWatch([],s.io),0);assert.equal(s.cleared(),0);assert.equal(s.output.text,'');});
test('EPIPE resolves 0 silently',async t=>{
  const s=setup(t);s.output.once('written',()=>s.output.emit('error',Object.assign(Error('pipe'),{code:'EPIPE'})));
  assert.equal(await runWatch([],s.io),0);assert.equal(s.error.text,'');assert.equal(s.output.text.split('\n').filter(Boolean).length,1);
});
test('unexpected exceptions return 1 with one stderr line',async t=>{const s=setup(t);s.io.git=async()=>{throw Error('unexpected\nfailure');};assert.equal(await runWatch([],s.io),1);assert.equal(s.error.text.trim().split('\n').length,1);});
test('color and width follow TTY, NO_COLOR, json and resize',async t=>{
  for(const [tty,env,args,ansi,width] of [[true,{},[],true,100],[true,{NO_COLOR:'1'},[],false,100],[true,{},['--json'],false,null],[false,{},[],false,200],[true,{},['--width','80'],true,80],[true,{},[],true,60]]) {
    const s=setup(t);s.output.isTTY=tty;s.output.columns=width===60?30:100;s.io.env=env;
    const f=s.write('width',s.cwd,[command('x'.repeat(400))]);
    const {result}=await s.start(args);assert.equal(s.output.text.includes('\x1b['),ansi);
    if(width)assert.ok(s.output.text.trimEnd().split('\n').every(line=>[...strip(line)].length<=width));
    if(tty&&!args.length&&width===100){s.output.text='';s.output.columns=70;s.output.emit('resize');fs.appendFileSync(f,JSON.stringify(command('y'.repeat(400)))+'\n');await s.step();assert.ok(s.output.text.length>0);assert.ok(s.output.text.trimEnd().split('\n').every(line=>[...strip(line)].length<=70));}
    s.controller.abort();assert.equal(await result,0);
  }
});
test('json lines follow schema v1',async t=>{
  const s=setup(t);s.write('schema');const {result}=await s.start(['--json']);s.controller.abort();assert.equal(await result,0);
  const rows=s.output.text.trim().split('\n').map(JSON.parse);assert.ok(rows.some(e=>e.kind==='user'));
  for(const e of rows){assert.equal(e.v,1);for(const k of ['ts','observedAt','kind','source'])assert.ok(e[k]);assert.ok(WATCH_KINDS.includes(e.kind));assert.ok(Object.values(e).every(v=>v!==null));if(e.kind==='notice')assert.equal('platform'in e,false);}
});
test('markers never appear and secrets are masked in human and json modes',async t=>{
  for(const json of [false,true]){
    const s=setup(t), dir=path.join(root,'tests/node/fixtures/watch');
    for(const name of fs.readdirSync(dir).filter(n=>n.endsWith('.jsonl'))){
      const rows=fs.readFileSync(path.join(dir,name),'utf8').trim().split('\n').map(JSON.parse);
      if(name.startsWith('codex')){const meta=rows.find(r=>r.type==='session_meta');if(meta){meta.payload.cwd=s.cwd;meta.payload.originator='codex-tui';s.h.writeRollout(['2026','11','11'],`rollout-${name}`,rows,{mtime:TIME});}}
      else s.h.writeClaude(s.cwd.replace(/[^A-Za-z0-9]/g,'-'),name,rows.map(r=>({...r,cwd:s.cwd})),{mtime:TIME});
    }
    const file=s.write('secret',s.cwd,[msg('password=hidden sk-abcdefghijklmnopqrst')]);
    const {result}=await s.start(['--all','--verbose','--tail','1000',...(json?['--json']:[])]);
    for(let i=0;i<3;i++){fs.appendFileSync(file,JSON.stringify(msg('token=hidden'))+'\n');await s.step();}
    s.controller.abort();assert.equal(await result,0);assert.ok(!s.output.text.includes('WATCH_MARKER_'));assert.ok(!s.output.text.includes('hidden'));assert.match(s.output.text,/\*\*\*/);
  }
});
test('--cwd uses the selected directory rather than the invoking directory',async t=>{
  const s=setup(t), selected=path.join(s.h.root,'selected');fs.mkdirSync(selected);s.write('in',selected,[msg('selected event')]);s.write('out',s.cwd,[msg('outside event')]);
  s.io.cwd=s.h.root;const {result}=await s.start(['--cwd','selected']);s.controller.abort();assert.equal(await result,0);assert.match(s.output.text,/selected event/);assert.ok(!s.output.text.includes('outside event'));assert.equal(s.calls[0].dir,fs.realpathSync(selected));
});
test('a run leaves every watched tree unchanged and runs only allowed git commands',async t=>{
  const s=setup(t), gcd=path.join(s.cwd,'.git');fs.mkdirSync(gcd);s.write('readonly');
  s.h.writeClaude(s.cwd.replace(/[^A-Za-z0-9]/g,'-'),'claude',[{type:'user',cwd:s.cwd,sessionId:'claude',message:{content:'hello'}}],{mtime:TIME});
  s.h.writeArtifacts(gcd,'wf','dispatches/example',{'events.jsonl':'{"kind":"thread","threadId":"readonly"}\n'});
  s.io.git=async(dir,args)=>{s.calls.push({dir,args});assert.ok(GIT_ALLOWED.some(a=>JSON.stringify(a)===JSON.stringify(args)));return args[0]==='worktree'?`worktree ${s.cwd}\0\0`:args.includes('--show-toplevel')?s.cwd:gcd;};
  const before=await s.h.snapshot(), {result}=await s.start();for(let i=0;i<3;i++)await s.step();s.controller.abort();assert.equal(await result,0);
  assert.deepEqual(await s.h.snapshot(),before);assert.equal(fs.existsSync(path.join(s.h.codexHome,'arc-role-dispatch')),false);assert.ok(s.calls.length>=3);
});

async function childWatch(t) {
  const s=setup(t);execFileSync('git',['init','--quiet',s.cwd],{env:{PATH:process.env.PATH,HOME:s.h.userHome,TZ:'UTC'}});
  // A live source gives the broken-pipe test a write after the reader closes.
  const now=Date.now(), d=new Date(now), date=[d.getUTCFullYear(),String(d.getUTCMonth()+1).padStart(2,'0'),String(d.getUTCDate()).padStart(2,'0')];
  const file=s.h.writeRollout(date,'rollout-process.jsonl',[{timestamp:iso(now),type:'session_meta',payload:{id:'process',cwd:s.cwd,originator:'codex-tui'}}]);
  const child=spawn(process.execPath,[path.join(root,'bin/arc.mjs'),'watch','--tail','0'],{cwd:s.cwd,env:{HOME:s.h.userHome,CODEX_HOME:s.h.codexHome,PATH:process.env.PATH,TZ:'UTC'}});
  let stderr='',stdout='';child.stderr.on('data',s=>stderr+=s);
  t.after(()=>{if(child.exitCode===null)child.kill('SIGKILL');});
  const closed=once(child,'close');
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error(`no live output: ${stderr}`)),10000);
    const done=()=>clearTimeout(timer);
    child.once('error',e=>{done();reject(e);});child.once('exit',(code,signal)=>{done();reject(Error(`early exit ${code}/${signal}: ${stderr}`));});
    child.stdout.on('data',chunk=>{stdout+=chunk;if(stdout.includes('live')){done();resolve();}});
  });
  return {child,closed,stderr:()=>stderr,file};
}
test('SIGINT, SIGTERM and SIGHUP exit 0',{timeout:20000},async t=>{
  for(const signal of ['SIGINT','SIGTERM','SIGHUP']){const s=await childWatch(t);s.child.kill(signal);const [code,received]=await s.closed;assert.equal(code,0);assert.equal(received,null);assert.equal(s.stderr(),'');}
});
test('closing the reading end exits 0 within 3 seconds',{timeout:15000},async t=>{
  const s=await childWatch(t);s.child.stdout.destroy();fs.appendFileSync(s.file,JSON.stringify(msg('pipe closed'))+'\n');
  let timer;try {const [code,signal]=await Promise.race([s.closed,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('EPIPE shutdown exceeded 3 seconds')),3000);})]);assert.equal(code,0);assert.equal(signal,null);assert.equal(s.stderr(),'');}finally{clearTimeout(timer);}
});
test('docs describe the public watch command',()=>{
  const readme=fs.readFileSync(path.join(root,'README.md'),'utf8'),doc=fs.readFileSync(path.join(root,'docs/harness-operation.md'),'utf8');
  assert.ok(readme.includes('The TUI requires terminal input and output. Public commands: `arc`, `arc watch`, `arc --help`, `arc --version`; help, version and `arc watch` also work without a TTY.'));
  const section=readme.split('## Watch sessions\n')[1]?.split('\n## ')[0];assert.ok(section);assert.match(section,/host_sandbox_blocked/);assert.match(section,/Codex Desktop/);
  assert.match(doc,/Public syntax:[^\n]*`arc watch`/);assert.match(doc,/### Watch/);assert.ok(!/[가-힣]/.test(readme+doc));
});

// Catch overlapping asynchronous refreshes and cleanup racing an in-flight tick.
test('ticks never overlap and abort waits for an in-flight tick', async t => {
  const s=setup(t), gcd=path.join(s.cwd,'.git');
  let release, entered, refreshing=false, count=0;
  const blocked=new Promise(resolve=>release=resolve), waiting=new Promise(resolve=>entered=resolve);
  s.io.git=async (dir,args)=>{
    assert.ok(GIT_ALLOWED.some(a=>JSON.stringify(a)===JSON.stringify(args)));
    if(args[0]==='worktree'){
      if(refreshing){count++;entered();await blocked;}
      return `worktree ${s.cwd}\0\0`;
    }
    return args.includes('--show-toplevel')?s.cwd:gcd;
  };
  const {result}=await s.start();
  refreshing=true;s.advance(30000);const first=s.step();await waiting;
  await s.step();assert.equal(count,1);
  let settled=false;result.then(()=>settled=true);s.controller.abort();
  await Promise.resolve();assert.equal(settled,false);
  release();await first;assert.equal(await result,0);assert.equal(s.cleared(),1);
});


test('R1 M1 Claude-only watch reads Codex dispatch leases and Claude init artifacts', async t => {
 const s=setup(t), gcd=path.join(s.cwd,'.git');fs.mkdirSync(gcd);
 s.io.env={CODEX_HOME:s.h.codexHome,CLAUDE_CONFIG_DIR:s.h.claudeHome};
 s.io.git=async (dir,args)=>args[0]==='worktree'?`worktree ${s.cwd}\0\0`:args.includes('--show-toplevel')?s.cwd:gcd;
 s.h.writeClaude(s.cwd.replace(/[^A-Za-z0-9]/g,'-'),'bridge',[{type:'user',cwd:s.cwd,sessionId:'bridge',message:{content:'hello'}}],{mtime:TIME-300000});
 s.h.writeLease({dispatchId:'1234-dispatch',role:'arc_planner',state:'running',updatedAt:iso(TIME)});
 s.h.writeArtifacts(gcd,'wf','dispatches/1234-dispatch',{'events.jsonl':'{"kind":"init","sessionId":"bridge"}\n'});
 const {result}=await s.start(['--platform','claude','--json']);
 const events=s.output.text.trim().split('\n').map(JSON.parse);
 assert.ok(events.some(e=>e.sessionId==='bridge'&&e.label==='planner@1234'));
 assert.ok(events.some(e=>e.kind==='dispatch'&&e.platform==='claude'&&e.label==='planner@1234'));
 s.controller.abort();assert.equal(await result,0);
});


test('human output has no session labels while json keeps label', async t => {
  for(const json of [false,true]) {
    const s=setup(t), gcd=path.join(s.cwd,'.git');fs.mkdirSync(gcd);
    s.io.git=async(dir,args)=>args[0]==='worktree'?`worktree ${s.cwd}\0\0`:args.includes('--show-toplevel')?s.cwd:gcd;
    s.write('top1234');
    s.h.writeClaude(s.cwd.replace(/[^A-Za-z0-9]/g,'-'),'bridge',[{type:'user',cwd:s.cwd,sessionId:'bridge',message:{content:'hello'}}],{mtime:TIME-300000});
    s.h.writeLease({dispatchId:'1234-dispatch',role:'arc_planner',state:'running',updatedAt:iso(TIME)});
    s.h.writeArtifacts(gcd,'wf','dispatches/1234-dispatch',{'events.jsonl':'{"kind":"init","sessionId":"bridge"}\n'});
    const {result}=await s.start(json?['--json']:[]);
    s.controller.abort();assert.equal(await result,0);
    if(json) {
      const rows=s.output.text.trim().split('\n').map(JSON.parse);
      for(const e of rows) assert.equal(e.label,e.source==='watch'?'watch':e.sessionId==='top1234'?'tui#1234':'planner@1234');
      assert.ok(rows.some(e=>e.sessionId==='bridge'&&e.label==='planner@1234'));
      assert.ok(rows.some(e=>e.kind==='dispatch'&&e.label==='planner@1234'));
    } else assert.doesNotMatch(s.output.text,/(tui|exec|main)[^ ]*#[0-9a-z]{4}|\b[a-z]+@[0-9a-z]{4}\b/);
  }
});
test('help describes one-line width and full messages', async t => {
  const s=setup(t);
  assert.equal(await runWatch(['--help'],s.io),0);
  assert.ok(s.output.text.includes('  --width <n>         Maximum width of one-line events (default: terminal width, or 200)'));
  assert.ok(s.output.text.includes('User and agent messages are shown in full; other events use one line.\nTool and command outputs'));
});


test('bridge and subagent AGENT lines show the role', async t => {
  const s=setup(t), gcd=path.join(s.cwd,'.git');fs.mkdirSync(gcd);
  s.io.git=async(dir,args)=>args[0]==='worktree'?`worktree ${s.cwd}\0\0`:args.includes('--show-toplevel')?s.cwd:gcd;
  s.write('parent1234');
  s.h.writeRollout(['2026','11','11'],'rollout-child.jsonl',[
    {timestamp:iso(TIME),type:'session_meta',payload:{id:'child',cwd:s.cwd,originator:'codex-tui',source:{subagent:{thread_spawn:{parent_thread_id:'parent1234',depth:1,agent_role:'arc_qa'}}}}},
    {timestamp:iso(TIME),type:'event_msg',payload:{type:'item_completed',item:{type:'AgentMessage',content:[{type:'Text',text:'child answer'}]}}},
  ],{mtime:TIME});
  s.h.writeClaude(s.cwd.replace(/[^A-Za-z0-9]/g,'-'),'bridge',[
    {type:'user',cwd:s.cwd,sessionId:'bridge',message:{content:'hello'}},
    {type:'assistant',timestamp:iso(TIME),cwd:s.cwd,sessionId:'bridge',message:{role:'assistant',content:[{type:'text',text:'bridge answer'}]}},
  ],{mtime:TIME-300000});
  s.h.writeLease({dispatchId:'1234-dispatch',role:'arc_planner',state:'running',updatedAt:iso(TIME)});
  s.h.writeArtifacts(gcd,'wf','dispatches/1234-dispatch',{'events.jsonl':'{"kind":"init","sessionId":"bridge"}\n'});
  const {result}=await s.start();s.controller.abort();assert.equal(await result,0);
  assert.match(s.output.text,/AGENT\(planner\) bridge answer/);
  assert.match(s.output.text,/AGENT\(qa\) child answer/);
});


for (const json of [false,true]) for (const verbose of [false,true]) {
  test(`AC-W29 compact summaries obey verbose policy in ${json?'JSON':'human'} output (${verbose})`, async t => {
    const s=setup(t), body='PRIVATE_COMPACT_BODY\n'+'x'.repeat(12000);
    s.h.writeClaude('project','compact-session',[
      {type:'user',sessionId:'compact-session',cwd:s.cwd,timestamp:iso(TIME),isCompactSummary:true,isVisibleInTranscriptOnly:true,message:{content:body}},
      {type:'user',sessionId:'compact-session',cwd:s.cwd,timestamp:iso(TIME),message:{content:'ordinary user'}},
    ],{mtime:TIME});
    const {result}=await s.start([...(json?['--json']:[]),...(verbose?['--verbose']:[])]);
    s.controller.abort();assert.equal(await result,0);
    assert.doesNotMatch(s.output.text,/PRIVATE_COMPACT_BODY|x{100}/);
    if (json) {
      const events=s.output.text.trim().split('\n').map(JSON.parse);
      assert.deepEqual(events.filter(e=>e.kind==='user').map(e=>e.text),['ordinary user']);
      assert.deepEqual(events.filter(e=>e.text?.startsWith('compact summary')).map(e=>[e.kind,e.text]),
        verbose?[['notice',`compact summary (${body.length} chars)`]]:[]);
    } else {
      assert.equal(s.output.text.includes(`compact summary (${body.length} chars)`),verbose);
      if (verbose) assert.match(s.output.text,/NOTICE +compact summary \(\d+ chars\)/);
      assert.match(s.output.text,/USER +ordinary user/);
    }
  });
}
