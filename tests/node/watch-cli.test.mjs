import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {EventEmitter, once} from 'node:events';
import {spawn, execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {makeHomes} from './fixtures/watch/homes.mjs';
import * as watch from '../../lib/watch/index.mjs';
import {DEFAULT_PLATFORM_REGISTRY} from '../../lib/runtime/platform-registry.mjs';
import {runRoot} from '../../lib/cli/root.mjs';
import {WATCH_KINDS, WATCH_LIMITS} from '../../lib/watch/model.mjs';
import * as renderer from '../../lib/watch/render.mjs';
import {GIT_ALLOWED, createGitRunner} from '../../lib/watch/git.mjs';

const {parseWatchArgs, runWatch, WATCH_HELP} = watch;
const supported = registry => registry.byDisplayOrder().filter(d => d.capabilities.watch.state === 'verified');
const follow = (args, io, platforms = supported(DEFAULT_PLATFORM_REGISTRY).map(d => d.id)) =>
  watch.followWatch(parseWatchArgs(args).options, {...io, platforms});

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
class Input extends EventEmitter {
  isTTY = false;
  rawModes = [];
  resumes = 0;
  pauses = 0;
  setRawMode(value) { this.rawModes.push(value); }
  resume() { this.resumes++; }
  pause() { this.pauses++; }
}
function setup(t) {
  const h = makeHomes(t), cwd = path.join(h.root,'repo');
  fs.mkdirSync(cwd);
  let tick, clearCount = 0, clock = TIME, ready, argsJson = false;
  const started = new Promise(resolve => ready = resolve), controller = new AbortController();
  const output = new Output(), error = new Output(), proc = new EventEmitter(), calls = [];
  const io = {input:new Input(),output,error,process:proc,userHome:h.userHome,cwd,env:{},signal:controller.signal,now:()=>clock,
    git:async (dir,args)=>{calls.push({dir,args});assert.ok(GIT_ALLOWED.some(a=>JSON.stringify(a)===JSON.stringify(args)));return null;},
    setInterval(fn,ms){assert.equal(ms,output.isTTY&&!argsJson?100:WATCH_LIMITS.filePollMs);tick=fn;ready();return 17;},
    clearInterval(id){assert.equal(id,17);clearCount++;},
  };
  const write = (id,dir=cwd,lines=[msg('hello')]) => h.writeRollout(['2026','11','11'],`rollout-${id}.jsonl`,[
    {timestamp:iso(TIME),type:'session_meta',payload:{id,cwd:dir,originator:'codex-tui'}},...lines,
  ],{mtime:TIME});
  async function start(args=[], platforms) {
    argsJson=args.includes('--json');
    const result=follow(args,io,platforms);t.after(()=>controller.abort());
    await Promise.race([started,result.then(code=>{throw Error(`watch exited before live: ${code}: ${error.text}`);})]);
    return {result};
  }
  return {h,cwd,io,output,error,proc,controller,calls,write,start,step:async(ms=500)=>{clock+=ms;await tick();},cleared:()=>clearCount,advance:ms=>clock+=ms};
}

// Catch missing parsing branches, bad defaults, duplicate options and invalid values.
test('watch finds an anchor from all registered platforms despite the source filter', async t => {
  const s = setup(t);
  s.h.writeMarker('claude', s.h.claudeHome);
  s.h.writeLease({dispatchId:'filtered-anchor', state:'running', sessionId:'source', updatedAt:iso(TIME)}, s.h.claudeHome);
  s.write('source');
  const gcd = path.join(s.cwd,'.git');
  s.io.git = async (_dir,args) => args[0]==='worktree'?`worktree ${s.cwd}\0\0`:args.includes('--show-toplevel')?s.cwd:gcd;
  s.h.writeArtifacts(gcd,'wf','dispatches/filtered-anchor',{'events.jsonl':'{"kind":"thread","threadId":"source"}\n'});
  const before = await s.h.snapshot(), {result} = await s.start(['--json'], ['codex']);
  s.controller.abort();
  assert.equal(await result, 0);
  const rows = s.output.text.trim().split('\n').map(JSON.parse);
  assert.ok(rows.some(event => event.dispatchId === 'filtered-anchor'));
  assert.ok(rows.some(event => event.sessionId === 'source'));
  assert.deepEqual(await s.h.snapshot(), before);
});

test('a Codex anchor marker preserves current composite watch output', async t => {
  const s = setup(t);
  s.write('composite');
  s.h.writeLease({dispatchId:'current-anchor', state:'running', sessionId:'composite', role:'arc_qa', updatedAt:iso(TIME)});
  const {result} = await s.start(['--json']);
  s.controller.abort();
  assert.equal(await result, 0);
  const baseline = s.output.text, controller = new AbortController(), output = new Output();
  s.h.writeMarker('codex', s.h.codexHome);
  s.h.writeMarker('claude', s.h.claudeHome, s.h.codexHome);
  assert.equal(await follow(['--json'], {...s.io, output, signal:controller.signal,
    setInterval(){controller.abort();return 17;}}), 0);
  assert.equal(output.text, baseline);
});

test('followWatch passes the user home for host skill roots',async t=>{
  const s=setup(t), skillFile=path.join(s.h.userHome,'host-skills/arc/SKILL.md');
  s.write('host-skill',s.cwd,[
    {type:'world_state',payload:{state:{host_skills:{body:'r1 = ~/host-skills'}}}},
    {type:'event_msg',payload:{type:'item_completed',item:{type:'CommandExecution',command:'cat SKILL.md',
      parsed_cmd:[{type:'read',path:skillFile}],exit_code:0}}},
  ]);
  const {result}=await s.start();s.controller.abort();assert.equal(await result,0);
  assert.match(s.output.text,/SKILL    arc/);
  assert.doesNotMatch(s.output.text,/CMD|SKILL\.md|host-skills/);
});
test('parseWatchArgs accepts each documented option in both value forms', () => {
  assert.deepEqual(parseWatchArgs([]),{ok:true,options:{tail:20,verbose:false,json:false,width:null,help:false}});
  for (const [name,value,key,want] of [['tail','5','tail',5],['width','80','width',80]]) {
    for(const args of [[`--${name}`,value],[`--${name}=${value}`]]) {const r=parseWatchArgs(args);assert.equal(r.ok,true);assert.deepEqual(r.options[key],want);}
  }
  for(const flag of ['verbose','json','help']) assert.equal(parseWatchArgs([`--${flag}`]).options[flag],true);
});
test('usage errors exit 2 with a message',async t=>{
  const s=setup(t);
  for(const args of [['--foo'],['x'],['--tail','1','--tail','2'],['--tail','-1'],['--tail','1001'],['--tail','1.5'],['--width','39'],['--width','2001'],['--json=true'],['--help','--help'],['--tail='],['--width']]) {
    s.error.text='';assert.equal(await runWatch(args,{...s.io,setInterval(){throw Error('Invalid arguments started the watcher');}}),2,JSON.stringify(args));assert.match(s.error.text,/arc watch --help/);assert.equal(s.output.text,'');
  }
});
test('watch help explains platform choice, worktree scope and event output',async t=>{
  const s=setup(t);
  assert.equal(await runWatch(['--help'],s.io),0);
  assert.equal(s.output.text,WATCH_HELP+'\n');
  assert.match(s.output.text,/Choose All or one platform in the menu/);
  assert.match(s.output.text,/current Git worktree, or the current directory outside Git/);
  assert.match(s.output.text,/Requires an interactive terminal/);
  assert.match(s.output.text,/each session's working directory at that point/);
  assert.match(s.output.text,/SKILL and PLUGIN lines/);
  assert.doesNotMatch(s.output.text,/--(?:cwd|all|session|platform)\b/);
  assert.equal(s.error.text,'');
});
test('root lists watch and keeps other behavior',async t=>{
  const s=setup(t);assert.equal(await runRoot(['--help'],s.io),0);
  assert.ok(s.output.text.startsWith('Usage: arc\n       arc watch [options]\n       arc --help\n       arc --version\n'));
  assert.match(s.output.text,/Run arc watch in an interactive terminal to choose platforms and follow session activity in the current worktree\.\n$/);
  s.output.text='';assert.equal(await runRoot(['watch','--help'],s.io),0);assert.equal(s.output.text,WATCH_HELP+'\n');
  assert.equal(await runRoot(['install'],s.io),2);assert.match(s.error.text,/Unsupported arguments/);assert.match(s.error.text,/arc watch \[options\]/);
  s.output.text='';assert.equal(await runRoot(['--version'],s.io),0);assert.equal(s.output.text,JSON.parse(fs.readFileSync(path.join(root,'package.json'))).version+'\n');
  assert.equal(await runRoot([],s.io),2);assert.match(s.error.text,/interactive terminal/);
});
test('no usable source exits 1',async t=>{
  const s=setup(t);
  for(const [platforms,env] of [[['claude'],{CLAUDE_CONFIG_DIR:'/elsewhere'}],[undefined,{CODEX_HOME:'',CLAUDE_CONFIG_DIR:'/elsewhere'}]]) {
    s.error.text='';assert.equal(await follow([],{...s.io,env},platforms),1);assert.equal(s.error.text.trim().split('\n').length,1);assert.equal(s.output.text,'');
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
  assert.equal(await follow([],s.io),0);assert.equal(s.error.text,'');assert.equal(s.output.text.split('\n').filter(Boolean).length,1);
});
test('unexpected exceptions return 1 with one stderr line',async t=>{const s=setup(t);s.io.git=async()=>{throw Error('unexpected\nfailure');};assert.equal(await follow([],s.io),1);assert.equal(s.error.text.trim().split('\n').length,1);});
test('color and width follow TTY, NO_COLOR, json and resize',async t=>{
  for(const [tty,env,args,ansi,width] of [[true,{},[],true,100],[true,{NO_COLOR:'1'},[],false,100],[true,{},['--json'],false,null],[false,{},[],false,200],[true,{},['--width','80'],true,80],[true,{},[],true,60]]) {
    const s=setup(t);s.output.isTTY=tty;s.output.columns=width===60?30:100;s.io.env=env;
    const f=s.write('width',s.cwd,[command('x'.repeat(400)),{type:'event_msg',payload:{type:'task_complete'}}]);
    const {result}=await s.start(args);assert.equal(s.output.text.includes('\x1b['),ansi);
    if(width)assert.ok(s.output.text.trimEnd().split('\n').every(line=>[...strip(line)].length<=width));
    if(tty&&!args.length&&width===100){s.output.text='';s.output.columns=70;s.output.emit('resize');fs.appendFileSync(f,[command('y'.repeat(400)),{type:'event_msg',payload:{type:'task_complete'}}].map(JSON.stringify).join('\n')+'\n');await s.step();assert.ok(s.output.text.startsWith('\r\x1b[2K'));assert.ok(s.output.text.slice('\r\x1b[2K'.length).trimEnd().split('\n').every(line=>[...strip(line)].length<=70));}
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
    const {result}=await s.start(['--verbose','--tail','1000',...(json?['--json']:[])]);
    for(let i=0;i<3;i++){fs.appendFileSync(file,JSON.stringify(msg('token=hidden'))+'\n');await s.step();}
    s.controller.abort();assert.equal(await result,0);assert.ok(!s.output.text.includes('WATCH_MARKER_'));assert.ok(!s.output.text.includes('hidden'));assert.match(s.output.text,/\*\*\*/);
  }
});
test('directory scope follows only activity under the invoking directory',async t=>{
  const s=setup(t), selected=path.join(s.h.root,'selected');fs.mkdirSync(selected);s.write('in',selected,[msg('selected event')]);s.write('out',s.cwd,[msg('outside event')]);
  s.io.cwd=selected;const {result}=await s.start();s.controller.abort();assert.equal(await result,0);assert.match(s.output.text,/selected event/);assert.ok(!s.output.text.includes('outside event'));assert.equal(s.calls[0].dir,fs.realpathSync(selected));
});
test('All and individual selections isolate real linked worktrees in history and live output',async t=>{
  for(const platforms of [undefined,['codex']]) {
    const s=setup(t), tree=path.join(s.h.root,'linked-tree'), sub=path.join(tree,'src');
    const env={PATH:process.env.PATH,HOME:s.h.userHome,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'};
    const git=args=>execFileSync('git',args,{cwd:s.cwd,env,stdio:'pipe'});
    git(['init']);git(['-c','user.name=Watch','-c','user.email=watch@example.invalid','commit','--allow-empty','-m','initial']);
    git(['worktree','add','-b','linked',tree]);fs.mkdirSync(sub);
    const file=s.write('local',sub,[msg('local history')]);
    const foreign=s.write('foreign',s.cwd,[msg('foreign history')]);
    s.io.git=createGitRunner({env});s.io.cwd=sub;
    const {result}=await s.start(['--json'],platforms);
    const content=()=>s.output.text.trim().split('\n').map(JSON.parse).filter(e=>e.source!=='watch');
    assert.ok(content().some(e=>e.text==='local history'));
    assert.ok(content().every(e=>e.sessionId==='local'));
    fs.appendFileSync(file,JSON.stringify(msg('local live'))+'\n');
    fs.appendFileSync(foreign,JSON.stringify(msg('foreign live'))+'\n');
    s.advance(30000);await s.step();
    assert.ok(content().some(e=>e.text==='local live'));
    assert.ok(content().every(e=>e.sessionId==='local'));
    s.controller.abort();assert.equal(await result,0);
  }
});
test('a run leaves every watched tree unchanged and runs only allowed git commands',async t=>{
  const s=setup(t), gcd=path.join(s.cwd,'.git');fs.mkdirSync(gcd);s.write('readonly');
  s.h.writeClaude(s.cwd.replace(/[^A-Za-z0-9]/g,'-'),'claude',[{type:'user',cwd:s.cwd,sessionId:'claude',message:{content:'hello'}}],{mtime:TIME});
  s.h.writeArtifacts(gcd,'wf','dispatches/example',{'events.jsonl':'{"kind":"thread","threadId":"readonly"}\n'});
  s.io.git=async(dir,args)=>{s.calls.push({dir,args});assert.ok(GIT_ALLOWED.some(a=>JSON.stringify(a)===JSON.stringify(args)));return args[0]==='ls-files'?'':args[0]==='worktree'?`worktree ${s.cwd}\0\0`:args.includes('--show-toplevel')?s.cwd:gcd;};
  const before=await s.h.snapshot(), {result}=await s.start();for(let i=0;i<3;i++)await s.step();s.controller.abort();assert.equal(await result,0);
  assert.deepEqual(await s.h.snapshot(),before);assert.equal(fs.existsSync(path.join(s.h.codexHome,'arc-role-dispatch')),false);assert.ok(s.calls.length>=3);
});

async function childWatch(t) {
  const s=setup(t);execFileSync('git',['init','--quiet',s.cwd],{env:{PATH:process.env.PATH,HOME:s.h.userHome,TZ:'UTC'}});
  // A live source gives the broken-pipe test a write after the reader closes.
  const now=Date.now(), d=new Date(now), date=[d.getUTCFullYear(),String(d.getUTCMonth()+1).padStart(2,'0'),String(d.getUTCDate()).padStart(2,'0')];
  const file=s.h.writeRollout(date,'rollout-process.jsonl',[{timestamp:iso(now),type:'session_meta',payload:{id:'process',cwd:s.cwd,originator:'codex-tui'}}]);
  const child=spawn(process.execPath,['--input-type=module','--eval',
    "import {followWatch, parseWatchArgs} from './lib/watch/index.mjs'; process.exitCode = await followWatch(parseWatchArgs(['--tail','0']).options, {cwd:process.env.WATCH_TEST_CWD, platforms:['codex']});"],{cwd:root,env:{HOME:s.h.userHome,CODEX_HOME:s.h.codexHome,PATH:process.env.PATH,TZ:'UTC',WATCH_TEST_CWD:s.cwd}});
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
test('README and operation guide contain no Hangul',()=>{
  const readme=fs.readFileSync(path.join(root,'README.md'),'utf8'),doc=fs.readFileSync(path.join(root,'docs/harness-operation.md'),'utf8');
  assert.ok(!/[가-힣]/.test(readme+doc));
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
 const {result}=await s.start(['--json'],['claude']);
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
  assert.ok(s.output.text.includes('  --width <n>         Maximum line width; one-line events are clipped, messages and file lists wrap (default: terminal width, or 200)'));
  assert.ok(s.output.text.includes('User and agent messages and file paths are shown in full; other events use one line.\nTool and command outputs'));
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
  assert.match(s.output.text,/AGENT    PLANNER\n {25}bridge answer/);
  assert.match(s.output.text,/AGENT    QA\n {25}child answer/);
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

test('TTY status block advances, erases before events and keeps the idle location', async t => {
  for (const env of [{},{NO_COLOR:'1'}]) {
    const s=setup(t);s.output.isTTY=true;s.output.columns=200;s.io.env=env;
    const file=s.write('spinner');const {result}=await s.start();
    const erase='\r\x1b[2K\x1b[1A\x1b[2K';
    assert.ok(strip(s.output.text).endsWith(`${s.cwd}\n⠋ working…`));
    if (env.NO_COLOR) assert.doesNotMatch(s.output.text,/\x1b\[[0-9;]*m/);
    else assert.match(s.output.text,/\x1b\[38;5;\d+mw/);
    s.output.text='';await s.step();
    assert.equal(strip(s.output.text),erase+`${s.cwd}\n⠙ working…`);
    s.output.text='';fs.appendFileSync(file,JSON.stringify(msg('pending'))+'\n');await s.step(100);
    assert.equal(strip(s.output.text),erase+`${s.cwd}\n⠹ working…`);
    s.output.text='';await s.step(400);
    assert.ok(s.output.text.startsWith(erase));
    assert.match(strip(s.output.text),/USER +pending/);
    assert.ok(strip(s.output.text).endsWith(`${s.cwd}\n⠸ working…`));
    s.output.text='';fs.appendFileSync(file,JSON.stringify(msg('next'))+'\n');await s.step();
    assert.ok(s.output.text.startsWith(erase));
    assert.ok(strip(s.output.text).endsWith('⠼ working…'));
    s.output.text='';fs.appendFileSync(file,JSON.stringify({type:'event_msg',payload:{type:'task_complete'}})+'\n');await s.step();
    assert.ok(s.output.text.startsWith(erase));
    assert.ok(strip(s.output.text).endsWith(s.cwd));
    assert.doesNotMatch(s.output.text,/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);
    s.output.text='';await s.step(100);assert.equal(s.output.text,'');
    s.output.text='';s.controller.abort();assert.equal(await result,0);
    assert.equal(s.output.text,'\r\x1b[2K');
  }
});
for (const [columns,args,maxColumns] of [[40,[],39],[80,['--width','200'],79]]) {
  test(`TTY status block fits ${columns} columns and erases its physical rows`, async t => {
    const s=setup(t);s.output.isTTY=true;s.output.columns=columns;s.io.env={NO_COLOR:'1'};
    const selected=path.join(fs.realpathSync(s.cwd),'project-'+'x'.repeat(100));fs.mkdirSync(selected);
    s.write('busy',selected);
    const writes=[];s.output.on('written',text=>writes.push(text));
    s.io.cwd=selected;
    const {result}=await s.start(['--tail','0',...args]);
    const lines=writes.at(-1).split('\n');
    assert.equal(lines.length,2);
    for(const line of lines)assert.ok(renderer.displayWidth(line)<=maxColumns,JSON.stringify(line));
    const physicalRows=lines.reduce((rows,line)=>rows+Math.max(1,Math.ceil(renderer.displayWidth(line)/columns)),0);
    assert.equal(physicalRows,2);
    s.output.text='';await s.step(100);
    const erase='\r\x1b[2K\x1b[1A\x1b[2K';
    assert.equal(s.output.text,erase+selected.slice(0,maxColumns)+'\n⠙ working…');
    assert.equal((s.output.text.match(/\x1b\[2K/g)??[]).length,physicalRows);
    s.output.text='';s.controller.abort();assert.equal(await result,0);
    assert.equal(s.output.text,erase);
  });
}
test('TTY status location removes directory control sequences and line breaks', async t => {
  const s=setup(t);s.output.isTTY=true;s.output.columns=200;s.io.env={NO_COLOR:'1'};
  const parent=fs.realpathSync(s.cwd),selected=path.join(parent,'project\x1b]0;x\x07\n\rnext');fs.mkdirSync(selected);
  const writes=[];s.output.on('written',text=>writes.push(text));
  s.io.cwd=selected;
  const {result}=await s.start();
  assert.equal(writes.at(-1),path.join(parent,'project next'));
  assert.doesNotMatch(writes.at(-1),/[\x00-\x1f\x7f-\x9f]/);
  s.output.text='';await s.step();
  assert.equal(s.output.text,'\r\x1b[2K'+path.join(parent,'project next'));
  s.output.text='';s.controller.abort();assert.equal(await result,0);
  assert.equal(s.output.text,'\r\x1b[2K');
});
test('TTY status block erases both busy lines on stop', async t => {
  const s=setup(t);s.output.isTTY=true;s.write('busy');
  const {result}=await s.start();s.output.text='';s.controller.abort();
  assert.equal(await result,0);assert.equal(s.output.text,'\r\x1b[2K\x1b[1A\x1b[2K');
});
test('TTY status block shows the selected location even when idle', async t => {
  for (const mode of ['outside-home','inside-home','home']) {
    const s=setup(t);s.output.isTTY=true;s.output.columns=200;s.io.env={NO_COLOR:'1'};
    s.io.userHome=fs.realpathSync(s.h.userHome);
    const selected=path.join(s.io.userHome,'project');fs.mkdirSync(selected);
    if(mode==='inside-home')s.io.cwd=selected;
    if(mode==='home')s.io.cwd=s.io.userHome;
    const label=mode==='inside-home'?'~/project':mode==='home'?'~':s.cwd;
    const {result}=await s.start();
    assert.ok(s.output.text.endsWith(label),`${mode}: ${JSON.stringify(s.output.text)}`);
    assert.doesNotMatch(s.output.text,/working…/);
    s.controller.abort();assert.equal(await result,0);
  }
});
test('TTY shimmer tick continues when the spinner glyph wraps', async t => {
  const s=setup(t);s.output.isTTY=true;s.write('busy');
  const {result}=await s.start();
  for(let i=0;i<5;i++){s.output.text='';await s.step(100);}
  const first=s.output.text.split('\n').at(-1);
  for(let i=0;i<10;i++){s.output.text='';await s.step(100);}
  const later=s.output.text.split('\n').at(-1);
  assert.equal(strip(first),'⠴ working…');assert.equal(strip(later),'⠴ working…');
  assert.notEqual(first,later);
  s.controller.abort();assert.equal(await result,0);
});
test('TERM=dumb keeps plain working text without shimmer', async t => {
  const s=setup(t);s.output.isTTY=true;s.io.env={TERM:'dumb'};s.write('busy');
  const {result}=await s.start();
  assert.equal(s.output.text.split('\n').at(-1),'⠋ working…');
  assert.doesNotMatch(s.output.text,/\x1b\[38;5;\d+mw/);
  s.controller.abort();assert.equal(await result,0);
});
test('non-TTY and JSON output never include spinner controls', async t => {
  for(const [tty,args] of [[false,[]],[false,['--json']],[true,['--json']]]) {
    const s=setup(t);s.output.isTTY=tty;s.write('busy');
    const {result}=await s.start(args);await s.step();s.controller.abort();assert.equal(await result,0);
    assert.doesNotMatch(s.output.text,/[\r⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);
    assert.doesNotMatch(s.output.text,/\x1b/);
    assert.ok(!s.output.text.split('\n').includes(s.cwd));
    if(args.includes('--json'))for(const line of s.output.text.trim().split('\n'))assert.doesNotThrow(()=>JSON.parse(line));
  }
});

test('TTY Ctrl-L redraws busy and idle status blocks and Ctrl-C restores input', async t => {
  for (const env of [{},{NO_COLOR:'1'}]) {
    const s=setup(t), input=s.io.input;input.isTTY=true;s.output.isTTY=true;s.output.columns=200;s.io.env=env;
    const file=s.write('keys');const {result}=await s.start();
    assert.deepEqual(input.rawModes,[true]);assert.equal(input.resumes,1);
    s.output.text='';input.emit('data','ignored\x0c');
    assert.equal(strip(s.output.text),'\x1b[H\x1b[2J\x1b[3J'+`${s.cwd}\n⠙ working…`);
    if(env.NO_COLOR)assert.doesNotMatch(s.output.text,/\x1b\[[0-9;]*m/);
    else assert.match(s.output.text,/\x1b\[38;5;\d+mw/);
    fs.appendFileSync(file,JSON.stringify({type:'event_msg',payload:{type:'task_complete'}})+'\n');await s.step();
    s.output.text='';input.emit('data',Buffer.from([0x61,0x0c]));
    assert.equal(strip(s.output.text),'\x1b[H\x1b[2J\x1b[3J'+s.cwd);
    input.emit('data',Buffer.from([0x03,0x0c]));assert.equal(await result,0);
    assert.equal(strip(s.output.text),'\x1b[H\x1b[2J\x1b[3J'+s.cwd+'\r\x1b[2K');
    assert.deepEqual(input.rawModes,[true,false]);assert.equal(input.pauses,1);assert.equal(input.listenerCount('data'),0);
  }
});
test('signals and abort restore TTY input exactly once', async t => {
  for (const signal of ['SIGINT','SIGTERM','SIGHUP','abort']) {
    const s=setup(t), input=s.io.input;input.isTTY=true;s.output.isTTY=true;
    const {result}=await s.start();
    if(signal==='abort')s.controller.abort();else s.proc.emit(signal);
    s.controller.abort();s.proc.emit('SIGINT');assert.equal(await result,0);
    assert.deepEqual(input.rawModes,[true,false]);assert.equal(input.pauses,1);assert.equal(input.listenerCount('data'),0);
  }
});
test('startup and output errors restore TTY input even when raw mode restoration throws', async t => {
  for (const failure of ['startup','output','closed']) {
    const s=setup(t), input=s.io.input;input.isTTY=true;s.output.isTTY=true;
    if(failure==='startup')s.io.git=async()=>{throw Error('startup failed');};
    if(failure==='closed')input.setRawMode=value=>{input.rawModes.push(value);if(!value)throw Error('closed TTY');};
    let result;
    if(failure==='startup')result=follow([],s.io);
    else {
      ({result}=await s.start());
      if(failure==='output')s.output.emit('error',Object.assign(Error('pipe'),{code:'EPIPE'}));
      else s.controller.abort();
    }
    assert.equal(await result,failure==='startup'?1:0);
    assert.deepEqual(input.rawModes,[true,false]);assert.equal(input.pauses,1);assert.equal(input.listenerCount('data'),0);
  }
});
test('non-TTY, JSON and input without raw mode leave stdin and output untouched', async t => {
  for(const [inputTTY,outputTTY,args,raw] of [[false,true,[],true],[true,false,[],true],[true,true,['--json'],true],[true,true,[],false]]) {
    const s=setup(t), input=s.io.input;input.isTTY=inputTTY;s.output.isTTY=outputTTY;
    if(!raw)input.setRawMode=undefined;
    s.write('untouched');const {result}=await s.start(args);const before=s.output.text;
    input.emit('data',Buffer.from([0x0c,0x03]));assert.equal(s.output.text,before);
    assert.deepEqual(input.rawModes,[]);assert.equal(input.resumes,0);assert.equal(input.pauses,0);assert.equal(input.listenerCount('data'),0);
    s.controller.abort();assert.equal(await result,0);
  }
});

test('non-TTY messages stay on one line unless --width requests wrapping', async t => {
  const text='한글메시지😀'.repeat(60);
  for (const args of [[],['--width','60'],['--width','60','--json']]) {
    const s=setup(t);
    s.write('wrap',s.cwd,[msg(text)]);
    const {result}=await s.start(args);
    s.controller.abort();assert.equal(await result,0);
    if (args.includes('--json')) {
      assert.equal(s.output.text.trim().split('\n').map(JSON.parse).find(e=>e.kind==='user').text,text);
      continue;
    }
    const lines=s.output.text.trimEnd().split('\n');
    const at=lines.findIndex(line=>line.includes('USER'));
    assert.ok(at>=0);
    const bodyLines=[lines[at]];
    for (const line of lines.slice(at+1)) {
      if (!line.startsWith(' '.repeat(25))) break;
      bodyLines.push(line);
    }
    if (!args.length) {
      assert.equal(bodyLines[0].slice(25),text);
      assert.equal(bodyLines.length,1);
    } else {
      assert.ok(bodyLines.length>1);
      assert.ok(lines.every(line=>renderer.displayWidth(strip(line))<=60));
      assert.ok(bodyLines.slice(1).every(line=>line.startsWith(' '.repeat(25))));
      assert.equal(bodyLines.map(line=>line.slice(25)).join(''),text);
    }
  }
});

const descriptors = DEFAULT_PLATFORM_REGISTRY.byDisplayOrder();
const unsupported = descriptors.find(d => d.capabilities.watch.state !== 'verified');

function menuTerminal(s, keys) {
  const {input} = s.io, {output} = s;
  input.isTTY = output.isTTY = true;
  output.columns = 100;
  output.rows = 24;
  const timeline = [];
  let menus = 0;
  const setRawMode = input.setRawMode.bind(input);
  input.setRawMode = value => {
    timeline.push(value);
    setRawMode(value);
  };
  output.on('written', text => {
    timeline.push(text);
    if (!text.includes('Which platform to watch?')) return;
    const key = keys[menus++];
    if (key === 'eof') queueMicrotask(() => input.emit('end'));
    else if (key) queueMicrotask(() => input.emit('data', Buffer.from(key)));
  });
  return timeline;
}

test('removed scope options are unknown', async t => {
  for (const args of [['--cwd','x'],['--all'],['--session','s'],['--platform','codex']]) {
    const s = setup(t);
    s.io.setInterval = () => s.controller.abort();
    assert.equal(await runWatch(args,s.io),2);
    assert.equal(s.error.text,'Error: Unknown option: '+args[0]+'. Run arc watch --help for usage.\n');
    assert.equal(s.output.text,'');
  }
});

test('non-TTY and json require an interactive terminal', async t => {
  for (const [stdin,stdout] of [[false,false],[true,false],[false,true]]) {
    for (const args of [[],['--json']]) {
      const s = setup(t);
      s.io.input.isTTY = stdin;
      s.output.isTTY = stdout;
      s.io.setInterval = () => s.controller.abort();
      assert.equal(await runWatch(args,s.io),2);
      assert.equal(s.error.text,'Error: arc watch needs an interactive terminal to choose platforms.\n');
      assert.equal(s.output.text,'');
    }
  }
});

test('menu rows come from registry watch capability', async () => {
  const file = new URL('../../lib/watch/menu.mjs',import.meta.url);
  assert.ok(fs.existsSync(file),'watch menu module is missing');
  const {watchMenuRows} = await import(file.href);
  const zeta = {id:'zeta',label:'Zeta',capabilities:{watch:{state:'off'}}};
  const eta = {id:'eta',label:'Eta',capabilities:{watch:{state:'verified'}}};
  const beta = {id:'beta',label:'Beta',capabilities:{watch:{state:'verified'}}};
  assert.deepEqual(watchMenuRows({byDisplayOrder:()=>[zeta,eta,beta]}),[
    {label:'All',platforms:['eta','beta']},
    {label:'Zeta  (not supported)',platforms:null},
    {label:'Eta',platforms:['eta']},
    {label:'Beta',platforms:['beta']},
  ]);
});

test('unsupported row is not selectable', async t => {
  const s = setup(t);
  const timeline = menuTerminal(s,[
    ...Array(descriptors.indexOf(unsupported)+1).fill('\x1b[B'),'\r','\x1b',
  ]);
  s.io.setInterval = () => s.controller.abort();
  assert.equal(await runWatch([],s.io),0);
  const screens = timeline.filter(frame => typeof frame === 'string' && frame.includes('Which platform to watch?'));
  assert.ok(screens.length>1);
  const first = strip(screens[0]);
  const labels = ['All',...descriptors.map(d => d.label+(d.capabilities.watch.state==='verified'?'':'  (not supported)')),'Back'];
  const indexes = labels.map(label => first.indexOf(label));
  assert.ok(indexes.every((index,i) => index>=0 && (!i || index>indexes[i-1])),first);
  assert.ok(strip(screens.at(-1)).includes(unsupported.label+' is not supported by arc watch.'));
  assert.deepEqual(s.calls,[]);
});

test('menu cancel restores terminal and never starts watcher', async t => {
  for (const [keys,code] of [[['\x1b[A','\r'],0],[['\x1b'],0],[['eof'],0],[['\x03'],130]]) {
    const s = setup(t);
    const timeline = menuTerminal(s,keys);
    s.io.setInterval = () => s.controller.abort();
    assert.equal(await runWatch([],s.io),code);
    assert.deepEqual(s.io.input.rawModes,[true,false]);
    assert.ok(timeline.some(frame => typeof frame==='string' && frame.includes('\x1b[?1049l')));
    assert.deepEqual(s.calls,[]);
  }
});

test('menu dispose precedes watch raw mode and first output', async t => {
  for (const [keys,expected] of [
    [['\r'],['local claude','local codex']],
    [[...Array(descriptors.findIndex(d => d.id==='claude')+1).fill('\x1b[B'),'\r'],['local claude']],
  ]) {
    const s = setup(t);
    const timeline = menuTerminal(s,keys);
    s.write('local',s.cwd,[msg('local codex')]);
    s.write('foreign',s.h.root,[msg('foreign codex')]);
    s.h.writeClaude(s.cwd.replace(/[^A-Za-z0-9]/g,'-'),'local-claude',[
      {type:'user',cwd:s.cwd,sessionId:'local-claude',timestamp:iso(TIME),message:{content:'local claude'}},
    ],{mtime:TIME});
    s.io.setInterval = () => {s.controller.abort();return 17;};
    assert.equal(await runWatch([],s.io),0);
    const restored = timeline.indexOf(false);
    const leftMenu = timeline.findIndex(frame => typeof frame==='string' && frame.includes('\x1b[?1049l'));
    const watchRaw = timeline.lastIndexOf(true);
    const firstWatch = timeline.findIndex(frame => typeof frame==='string' && frame.includes('arc watch: scope'));
    assert.ok(restored>=0 && restored<leftMenu && leftMenu<watchRaw && watchRaw<firstWatch);
    const output = timeline.slice(firstWatch).filter(frame => typeof frame==='string').map(strip).join('');
    assert.deepEqual([...output.matchAll(/local (?:claude|codex)$/gm)].map(match => match[0]).sort(),expected);
    assert.doesNotMatch(output,/foreign codex/);
  }
});
