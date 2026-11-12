import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {makeHomes} from './fixtures/watch/homes.mjs';
import {createWatcher} from '../../lib/watch/watcher.mjs';
import {renderHuman, renderJson} from '../../lib/watch/render.mjs';
import {readClaudeHead, createClaudeDiscovery} from '../../lib/watch/discover-claude.mjs';
import {readCodexMeta} from '../../lib/watch/discover-codex.mjs';
import {createDispatchIndex} from '../../lib/watch/dispatch.mjs';
import {GIT_ALLOWED} from '../../lib/watch/git.mjs';

const TIME = Date.parse('2026-11-11T12:00:00Z');
const iso = n => new Date(n).toISOString();
const msg = (text, ts = TIME, type = 'UserMessage') => ({timestamp:iso(ts), type:'event_msg', payload:{type:'item_completed', item:{type, content:[{text}]}}});
const meta = (id, cwd, originator='codex-tui', extra={}) => ({timestamp:iso(TIME-300000), type:'session_meta', payload:{id, cwd, originator, cli_version:'1.0', ...extra}});
const cm = (id,cwd,text='hello',entrypoint='cli',ts=TIME) => ({timestamp:iso(ts), type:'user', sessionId:id,cwd,entrypoint,version:'2.0',message:{content:text}});
function setup(t, options={}, kind='dir', dependencies={}) {
  const h = makeHomes(t), cwd = path.join(h.root,'repo'), gcd=path.join(h.root,'git');
  fs.mkdirSync(cwd);
  let clock=TIME, roots=[cwd];
  const scope={kind,roots:kind==='all'||kind==='session'?[]:roots,gitCommonDir:kind==='repo'?gcd:null,description:cwd};
  const git=(dir,args)=> {
    assert.ok(GIT_ALLOWED.some(a=>JSON.stringify(a)===JSON.stringify(args)));
    if (args[0]==='worktree') return roots.map(r=>`worktree ${r}\0\0`).join('');
    return args.includes('--show-toplevel')?cwd:gcd;
  };
  const w=createWatcher({options:{platforms:['codex','claude'],session:null,tail:20,verbose:false,...options},homes:{codex:h.codexHome,claude:h.claudeHome},scope,git,now:()=>clock,dependencies});
  t.after(()=>w.close());
  const c=(id,lines=[msg('hello')],{origin='codex-tui',age=300000,cwd:dir=cwd,extra={},suffix=''}={})=>h.writeRollout(['2026','11','11'],`rollout-${id}.jsonl${suffix}`,[meta(id,dir,origin,extra),...lines],{mtime:clock-age});
  const cl=(id,lines,opts={})=>h.writeClaude(cwd.replace(/[^A-Za-z0-9]/g,'-'),id,lines??[cm(id,cwd)],{mtime:clock-300000,...opts});
  const append=(file,lines)=>{fs.appendFileSync(file,lines.map(x=>JSON.stringify(x)).join('\n')+'\n'); fs.utimesSync(file,new Date(clock),new Date(clock));};
  const lease=(id,extra={})=>h.writeLease({dispatchId:id,role:'arc_qa',state:'running',route:'bridge',workflowId:'wf-3',updatedAt:iso(clock),...extra});
  const art=(id,files)=>h.writeArtifacts(gcd,'wf-3',`dispatches/${id}`,files);
  return {h,cwd,gcd,w,c,cl,append,lease,art,advance:n=>clock+=n,trees:r=>roots=r};
}
const content = events=>events.filter(e=>e.source!=='watch');
const notices = events=>events.filter(e=>e.source==='watch').map(e=>e.text);
const lines=(events,verbose=false)=>events.map(e=>renderHuman(e,{width:200,color:false,verbose}));

test('scope roots match real cwd aliases and render real-root paths', async t => {
  const s = setup(t), alias = path.join(s.h.root,'repo-alias');
  fs.symlinkSync(s.cwd,alias,'dir');
  const real = fs.realpathSync(s.cwd), file = path.join(real,'docs/x.md');
  s.c('aliased',[{type:'event_msg',payload:{type:'item_completed',item:{type:'FileChange',changes:{[file]:{}}}}}],{cwd:path.join(real,'src')});
  const w = createWatcher({options:{tail:20},homes:{codex:s.h.codexHome},scope:{kind:'dir',roots:[alias]},
    git:async () => { throw Error('scope root must avoid Git'); },now:()=>TIME});
  t.after(()=>w.close());
  const changed = content(await w.start()).find(e=>e.kind==='file_change');
  assert.equal(changed.root,alias);
  assert.equal(renderHuman(changed,{width:40,color:false}).slice(25),'repo-alias/docs/x.md');
});

test('subdirectory sessions use the longest containing scope root on both platforms', async t => {
  const s = setup(t), nested = path.join(s.cwd,'nested');
  const scope = {kind:'dir',roots:[s.cwd,nested]};
  const cwd = path.join(nested,'src');
  s.c('codex-root',undefined,{cwd});
  s.cl('claude-root',[cm('claude-root',cwd)]);
  const w = createWatcher({options:{tail:20},homes:{codex:s.h.codexHome,claude:s.h.claudeHome},scope,
    git:async () => { throw Error('scope root must avoid Git'); },now:()=>TIME});
  t.after(()=>w.close());
  const out = content(await w.start());
  assert.deepEqual([...new Set(out.map(e=>e.platform))].sort(),['claude','codex']);
  assert.ok(out.every(e=>e.root===nested));
});

test('all-scope roots use cached Git top-level results without leaking into JSON', async t => {
  const s = setup(t,{},'all'), cwd = path.join(s.cwd,'src'), file = path.join(s.cwd,'docs/x.md');
  s.c('first',[{type:'event_msg',payload:{type:'item_completed',item:{type:'FileChange',changes:{[file]:{}}}}}],{cwd});
  s.c('second',undefined,{cwd});
  let calls = 0;
  const w = createWatcher({options:{tail:20},homes:{codex:s.h.codexHome},scope:{kind:'all',roots:[]},
    git:async (dir,args) => {
      if (args===GIT_ALLOWED[0]) { assert.equal(dir,cwd); calls++; return s.cwd + '\n'; }
      return null;
    },now:()=>TIME});
  t.after(()=>w.close());
  const out = content(await w.start());
  assert.ok(out.every(e=>e.root===s.cwd));
  assert.equal(calls,1);
  const changed = out.find(e=>e.kind==='file_change');
  assert.equal(renderHuman(changed,{width:40,color:false}).slice(25),'repo/docs/x.md');
  const json = JSON.parse(renderJson(changed));
  assert.equal('root' in json,false);
  assert.deepEqual(json.paths,[file]);
});

test('missing or failed Git top-level falls back to the session cwd', async t => {
  for (const result of [null,'  ',new Error('git unavailable')]) {
    const s = setup(t), cwd = path.join(s.cwd,'src');
    s.c('fallback',undefined,{cwd});
    const w = createWatcher({options:{tail:20,session:'fallback'},homes:{codex:s.h.codexHome},scope:{kind:'dir',roots:[]},
      git:async () => { if (result instanceof Error) throw result; return result; },now:()=>TIME});
    t.after(()=>w.close());
    const out = content(await w.start());
    assert.ok(out.length>0);
    assert.ok(out.every(e=>e.root===cwd));
  }
});

test('start shows banner, the last 20 recent events in ts order, then live',async t=>{
  const s=setup(t); s.c('codex',Array.from({length:15},(_,i)=>msg(`c${i}`,TIME-300000+i*2000)));
  s.cl('claude',Array.from({length:15},(_,i)=>cm('claude',s.cwd,`a${i}`,'cli',TIME-299000+i*2000)));
  const out=await s.w.start(); assert.equal(out.length,22);
  assert.equal(out[0].text,`arc watch: scope ${s.cwd} · codex+claude · Ctrl-C to stop`);
  assert.equal(out.at(-1).text,'live');
  assert.deepEqual(content(out).map(e=>e.text),Array.from({length:10},(_,i)=>[`c${i+5}`,`a${i+5}`]).flat());
  assert.deepEqual(await s.w.tick(),[]);
});
test('tail 0 and tail 5',async t=>{for(const tail of [0,5]){const s=setup(t,{tail});s.c('one',Array.from({length:8},(_,i)=>msg(String(i))));assert.equal(content(await s.w.start()).length,tail);}});
test('sessions idle 10 to 30 minutes are followed without history',async t=>{const s=setup(t),f=s.c('old',undefined,{age:1200000});assert.equal(content(await s.w.start()).length,0);s.append(f,[msg('new')]);assert.equal(content(await s.w.tick())[0].text,'new');});
test('one tick merges appends from several files by timestamp',async t=>{const s=setup(t),a=s.c('a'),b=s.c('b');await s.w.start();s.append(a,[msg('later',TIME+20)]);s.append(b,[msg('earlier',TIME+10)]);assert.deepEqual(content(await s.w.tick()).map(e=>e.text),['earlier','later']);});
test('a new session is attached within 3 seconds',async t=>{const s=setup(t);await s.w.start();s.advance(2000);s.c('new');const out=await s.w.tick();assert.ok(content(out).some(e=>e.kind==='session'&&e.sessionId==='new'));});
test('Codex Desktop rollouts and their children are excluded in every mode',async t=>{for(const kind of ['dir','all','session']){const s=setup(t,{session:kind==='session'?'desktop':null},kind);s.c('desktop',undefined,{origin:'Codex Desktop'});s.c('child',undefined,{extra:{parent_thread_id:'desktop'}});assert.equal(content(await s.w.start()).length,0);s.advance(3000);assert.equal(content(await s.w.tick()).length,0);}});
test('out-of-scope cwd is excluded by default and included with all',async t=>{for(const kind of ['dir','all']){const s=setup(t,{},kind);s.c('outside',undefined,{cwd:path.join(s.h.root,'other')});assert.equal(content(await s.w.start()).length,kind==='all'?2:0);}});
test('a worktree added after start is in scope after 30 seconds',async t=>{
  const s=setup(t,{},'repo'),other=path.join(s.h.root,'tree');
  const file=s.c('tree',undefined,{cwd:other});
  await s.w.start();s.trees([s.cwd,other]);s.advance(30000);
  assert.deepEqual(content(await s.w.tick()),[]);
  s.append(file,[msg('new tree event')]);s.advance(2000);
  assert.deepEqual(content(await s.w.tick()).filter(e=>e.kind!=='session').map(e=>[e.sessionId,e.text]),[['tree','new tree event']]);
});
test('direct codex exec and non-cli Claude entrypoints are included with labels',async t=>{const s=setup(t);s.c('id-1234',undefined,{origin:'codex_exec'});s.cl('id-5678',[cm('id-5678',s.cwd,'hello','sdk-cli')]);const out=content(await s.w.start());assert.ok(out.some(e=>e.label==='exec#1234'));assert.ok(out.some(e=>e.label==='main:sdk-cli#5678'));assert.ok(out.some(e=>e.text===`id-1234 codex_exec 1.0 cwd=${s.cwd}`));});
test('compressed rollouts are skipped with a verbose notice',async t=>{const s=setup(t,{verbose:true});s.c('z',[],{suffix:'.zst'});assert.ok(notices(await s.w.start()).includes('compressed session skipped: rollout-z.jsonl.zst'));});
test('subagent rollouts attach under their parent at depth 1 and 2',async t=>{const s=setup(t);s.c('parent1234');s.c('child',undefined,{cwd:'/elsewhere',extra:{source:{subagent:{thread_spawn:{parent_thread_id:'parent1234',depth:1,agent_role:'arc_qa'}}}}});s.c('grand',undefined,{extra:{parent_thread_id:'child',depth:2,agent_nickname:'Aristotle'}});const out=content(await s.w.start());for(const [id,label,parentId,depth] of [['child','tui#1234/qa','parent1234',1],['grand','tui#1234/qa/Aristotle','child',2]]){const e=out.find(e=>e.sessionId===id);assert.equal(e.label,label);assert.equal(e.parentId,parentId);assert.equal(e.depth,depth);}});
test('a child found before its parent is held up to 2 seconds',async t=>{const s=setup(t,{verbose:true});s.c('child',undefined,{extra:{parent_thread_id:'parent'}});s.c('orphan',undefined,{extra:{parent_thread_id:'missing'}});assert.equal(content(await s.w.start()).length,0);s.advance(1000);s.c('parent');assert.ok(content(await s.w.tick()).some(e=>e.sessionId==='child'));s.advance(1000);const out=await s.w.tick();assert.ok(notices(out).some(x=>x.includes('orphan')));assert.ok(!content(out).some(e=>e.sessionId==='orphan'));});
test('a codex-tui rollout without parent fields is top-level',async t=>{const s=setup(t);s.c('solo1234');assert.equal(content(await s.w.start())[0].label,'tui#1234');});
test('Claude subagent labels from meta agentType with fallback',async t=>{const s=setup(t);s.cl('parent1234',undefined,{subagents:[{agentId:'qa',meta:{agentType:'arc-qa'},lines:[cm('child-qa','/outside')]},{agentId:'fallback',lines:[cm('child-fallback','/outside')]}]});const out=content(await s.w.start());assert.ok(out.some(e=>e.label==='main#1234/qa'&&e.parentId==='parent1234'));assert.ok(out.some(e=>e.label==='main#1234/agent'));});
test('codex_exec bridge rollout is labeled role@id4 from the thread event',async t=>{const s=setup(t,{},'repo');s.c('bridge',undefined,{origin:'codex_exec',cwd:'/outside'});s.lease('d123');s.art('d123',{'events.jsonl':'{"kind":"thread","threadId":"bridge"}\n'});const out=content(await s.w.start());assert.ok(out.some(e=>e.sessionId==='bridge'&&e.label==='qa@d123'&&e.source==='bridge'&&e.text.endsWith(' dispatch d123 wf-3')));assert.equal(out.find(e=>e.kind==='dispatch').platform,'codex');});
test('Claude bridge transcript is labeled from the init session id, and a resumed id maps to the same dispatch',async t=>{const s=setup(t,{},'repo');s.cl('first',[cm('first',s.cwd,'first','sdk-cli')]);s.cl('resume',[cm('resume',s.cwd,'resume','sdk-cli')]);s.lease('d123');s.art('d123',{'events.jsonl':'{"kind":"init","sessionId":"first"}\n','segments/1/events.jsonl':'{"kind":"init","sessionId":"resume"}\n'});const out=content(await s.w.start());assert.deepEqual(out.filter(e=>e.kind==='user').map(e=>[e.sessionId,e.label]).sort(),[['first','qa@d123'],['resume','qa@d123']]);});
test('dispatch without a transcript shows DISPATCH lines only',async t=>{const s=setup(t,{verbose:true},'all');s.lease('d123');const out=await s.w.start();assert.deepEqual(content(out).map(e=>e.kind),['dispatch']);assert.ok(notices(out).includes('transcript not found for dispatch d123'));});
test('late mapping emits a notice and relabels later events',async t=>{const s=setup(t,{},'repo');await s.w.start();s.advance(2000);const f=s.c('late1234',[msg('held')],{origin:'codex_exec',age:0});assert.equal(content(await s.w.tick()).length,0);s.advance(2000);assert.ok(content(await s.w.tick()).some(e=>e.text==='held'&&e.label==='exec#1234'));s.advance(500);s.lease('d123');s.art('d123',{'events.jsonl':'{"kind":"thread","threadId":"late1234"}\n'});s.advance(1500);s.append(f,[msg('mapped',TIME+6000)]);const out=await s.w.tick();assert.ok(notices(out).includes('session late1234 is dispatch d123 (qa)'));assert.ok(content(out).some(e=>e.text==='mapped'&&e.label==='qa@d123'));});
test('swapping lease hostPlatform leaves human output identical',async t=>{const s=setup(t,{},'repo');s.c('bridge',undefined,{origin:'codex_exec'});s.art('d123',{'events.jsonl':'{"kind":"thread","threadId":"bridge"}\n'});let previous;for(const hostPlatform of ['codex','claude']){s.lease('d123',{hostPlatform});const w=createWatcher({options:{platforms:['codex','claude'],tail:20,verbose:false},homes:{codex:s.h.codexHome,claude:s.h.claudeHome},scope:{kind:'repo',roots:[s.cwd],gitCommonDir:s.gcd},git:()=>null,now:()=>TIME});const out=lines(await w.start());if(previous)assert.deepEqual(out,previous);previous=out;await w.close();}});
test('held bridge lease shows raw reasons; no lease shows nothing',async t=>{const s=setup(t,{},'all');assert.equal(content(await s.w.start()).length,0);s.lease('d123',{state:'failed',reasons:['host_sandbox_blocked','permission_scope_unverified']});s.advance(2000);const out=await s.w.tick(),e=content(out)[0];assert.equal(e.platform,undefined);assert.equal(e.label,'qa@d123');assert.match(lines([e])[0],/arc\s+DISPATCH failed bridge wf-3 host_sandbox_blocked,permission_scope_unverified/);});
test('platform filter removes other-platform sessions and unknown-platform dispatches',async t=>{const s=setup(t,{platforms:['codex']},'all');s.c('codex');s.cl('claude');s.lease('unknown');const out=content(await s.w.start());assert.ok(out.length>0);assert.ok(out.every(e=>e.platform==='codex'));});
test('session filter by thread id, by dispatch id, and waiting for an unknown id',async t=>{for(const session of ['parent','d123','missing']){const s=setup(t,{session},'session');s.c('parent');s.c('child',undefined,{extra:{parent_thread_id:'parent'}});s.c('bridge',undefined,{origin:'codex_exec'});s.lease('d123',{sessionId:'bridge'});s.c('unrelated');const out=await s.w.start(),ids=[...new Set(content(out).map(e=>e.sessionId??e.dispatchId))].sort();assert.deepEqual(ids,session==='parent'?['child','parent']:session==='d123'?['bridge','d123']:[]);if(session==='missing')assert.ok(!notices(out).includes('waiting for session missing'));}});
test('more than 64 candidates follows the newest 64 with one notice',async t=>{const s=setup(t,{tail:1000});for(let i=0;i<66;i++)s.c(`id${i}`,[],{age:i*1000+10000});const out=await s.w.start();assert.equal(content(out).length,64);assert.ok(!content(out).some(e=>['id64','id65'].includes(e.sessionId)));assert.equal(notices(out).filter(x=>x==='following the newest 64 sessions; others are skipped').length,1);s.advance(2000);assert.ok(!notices(await s.w.tick()).some(x=>x.includes('newest 64')));});
test('a file idle 30 minutes is detached and reattached when it grows',async t=>{const s=setup(t,{verbose:true}),f=s.c('idle');await s.w.start();s.advance(1800000);assert.ok(notices(await s.w.tick()).includes('detached idle session idle'));s.append(f,[msg('return',TIME+1800000)]);s.advance(2000);assert.ok(content(await s.w.tick()).some(e=>e.text==='return'));});
test('verbose adds reasoning, settings and turn starts',async t=>{for(const verbose of [false,true]){const s=setup(t,{verbose});s.c('one',[{type:'event_msg',payload:{type:'thread_settings_applied',thread_settings:{model:'m'}}},{type:'event_msg',payload:{type:'task_started'}},{type:'event_msg',payload:{type:'item_completed',item:{type:'Reasoning',summary_text:['summary']}}}]);assert.deepEqual(content(await s.w.start()).map(e=>e.kind),verbose?['session','settings','turn_start','reasoning']:['session']);}});
test('transcript text is sanitized before output',async t=>{const s=setup(t,{verbose:true});s.c('one',[msg('\x1b]0;x\x07 sk-abcdefghijklmnopqrst'),{type:'event_msg',payload:{type:'item_completed',item:{type:'McpToolCall',server:'\x1b[31mx',tool:'y'}}},{type:'event_msg',payload:{type:'item_completed',item:{type:'FileChange',changes:{'\x1b[31mpassword=hidden':{}}}}}]);const out=content(await s.w.start());assert.ok(!JSON.stringify(out).includes('\\u001b'));assert.equal(out.find(e=>e.kind==='user').text,' ***');assert.equal(out.find(e=>e.kind==='tool').tool,'x.y');assert.deepEqual(out.find(e=>e.kind==='file_change').paths,['password=***']);});
test('no marker string reaches any event in verbose mode',async t=>{const s=setup(t,{verbose:true,tail:1000},'all');const dir=fileURLToPath(new URL('./fixtures/watch/',import.meta.url));for(const name of fs.readdirSync(dir).filter(n=>n.endsWith('.jsonl'))){const rows=fs.readFileSync(path.join(dir,name),'utf8').trim().split('\n').map(JSON.parse);if(name.startsWith('codex')){const m=rows.find(r=>r.type==='session_meta');if(m){m.payload.cwd=s.cwd;m.payload.originator='codex-tui';s.h.writeRollout(['2026','11','11'],`rollout-${name}`,rows,{mtime:TIME-300000});}}else{s.h.writeClaude('project',name,rows.map(r=>({...r,cwd:s.cwd})),{mtime:TIME-300000});}}assert.ok(!JSON.stringify(await s.w.start()).includes('WATCH_MARKER_'));});
test('removed and truncated session files produce verbose notices and keep other streams alive',async t=>{const s=setup(t,{verbose:true}),a=s.c('a'),b=s.c('b');await s.w.start();fs.unlinkSync(a);fs.writeFileSync(b,JSON.stringify(msg('reset'))+'\n');const out=await s.w.tick();assert.ok(notices(out).includes('session file removed: a'));assert.ok(notices(out).includes('session restarted from the beginning: b'));assert.ok(content(out).some(e=>e.text==='reset'));});
test('a failed file read detaches only that file',async t=>{const s=setup(t,{verbose:true}),bad=s.c('bad'),good=s.c('good');await s.w.start();fs.unlinkSync(bad);fs.mkdirSync(bad);s.append(good,[msg('survives')]);const out=await s.w.tick();assert.ok(content(out).some(e=>e.text==='survives'));assert.ok(notices(out).some(text=>text.startsWith('session file unreadable: bad')));assert.deepEqual(await s.w.tick(),[]);});
test('mapping during label hold releases buffered events with the bridge label',async t=>{const s=setup(t,{},'repo');await s.w.start();s.advance(2000);const f=s.c('hold1234',[msg('first')],{origin:'codex_exec',age:0});assert.equal(content(await s.w.tick()).length,0);s.advance(1000);s.lease('d123');s.art('d123',{'events.jsonl':'{"kind":"thread","threadId":"hold1234"}\n'});s.append(f,[msg('second',TIME+3000)]);const out=await s.w.tick();assert.ok(content(out).some(e=>e.text==='first'));assert.ok(content(out).every(e=>e.label==='qa@d123'));assert.ok(!notices(out).some(text=>text.includes('is dispatch')));});
test('session filter by bridge session includes its dispatch and descendants',async t=>{const s=setup(t,{session:'bridge'},'session');s.c('bridge',undefined,{origin:'codex_exec'});s.c('child',undefined,{extra:{parent_thread_id:'bridge'}});s.c('unrelated');s.lease('d123',{sessionId:'bridge'});const out=content(await s.w.start());assert.deepEqual([...new Set(out.map(e=>e.sessionId??e.dispatchId))].sort(),['bridge','child','d123']);});
test('dispatch platform falls back to followed session without using hostPlatform',async t=>{const s=setup(t,{platforms:['codex']},'all');s.c('bridge',undefined,{origin:'codex_exec'});s.lease('d123',{sessionId:'bridge',hostPlatform:'claude'});assert.equal(content(await s.w.start()).find(e=>e.kind==='dispatch').platform,'codex');});
test('start and ticks never create or modify watch inputs',async t=>{const s=setup(t,{},'all');s.c('one');s.cl('two');const before=await s.h.snapshot();await s.w.start();s.advance(2000);await s.w.tick();await s.w.close();assert.deepEqual(await s.h.snapshot(),before);assert.equal(fs.existsSync(path.join(s.h.codexHome,'arc-role-dispatch')),false);});
test('a partial line at startup is emitted after its newline arrives',async t=>{const s=setup(t),f=s.c('partial',[]);const line=JSON.stringify(msg('completed'));fs.appendFileSync(f,line.slice(0,-3));fs.utimesSync(f,new Date(TIME-300000),new Date(TIME-300000));await s.w.start();fs.appendFileSync(f,line.slice(-3)+'\n');assert.ok(content(await s.w.tick()).some(e=>e.text==='completed'));});

test('Claude SESSION text includes entrypoint and version and omits missing items', async t => {
  const s = setup(t);
  s.cl('claude-full-1234', [cm('claude-full-1234', s.cwd, 'full', 'sdk-cli')]);
  const sparse = cm('claude-sparse-5678', s.cwd, 'sparse');
  delete sparse.entrypoint;
  delete sparse.version;
  s.cl('claude-sparse-5678', [sparse]);
  const out = content(await s.w.start()).filter(e => e.kind === 'session');
  assert.equal(out.length, 2);
  assert.equal(out.find(e => e.sessionId === 'claude-full-1234').text,
    `claude-f sdk-cli 2.0 cwd=${s.cwd}`);
  const missing = out.find(e => e.sessionId === 'claude-sparse-5678');
  assert.equal(missing.text, `claude-s cwd=${s.cwd}`);
  assert.equal(missing.label, 'main#5678');
});

test('mapped Claude SESSION text appends dispatch and workflow ids', async t => {
  const s = setup(t, {}, 'repo');
  s.cl('claude-bridge-1234', [cm('claude-bridge-1234', s.cwd, 'bridge', 'sdk-cli')]);
  s.lease('d123');
  s.art('d123', {'events.jsonl':'{"kind":"init","sessionId":"claude-bridge-1234"}\n'});
  const event = content(await s.w.start()).find(e => e.kind === 'session');
  assert.equal(event.source, 'bridge');
  assert.equal(event.text, `claude-b sdk-cli 2.0 cwd=${s.cwd} dispatch d123 wf-3`);
});

test('Claude session filter follows only the selected session and its subagents', async t => {
  const s = setup(t, {session:'claude-selected'}, 'session');
  const parent = s.cl('claude-selected', undefined, {subagents:[{
    agentId:'selected-child', meta:{agentType:'arc-qa'},
    lines:[cm('claude-child', s.cwd, 'selected child')],
  }]});
  const other = s.cl('claude-other', undefined, {subagents:[{
    agentId:'other-child', lines:[cm('unrelated-child', s.cwd, 'other child')],
  }]});
  s.c('codex-other');
  const out = content(await s.w.start());
  assert.deepEqual([...new Set(out.map(e => e.sessionId))].sort(), ['agent-selected-child','claude-selected']);
  assert.equal(out.find(e => e.sessionId === 'agent-selected-child').parentId, 'claude-selected');
  s.advance(2000);
  s.append(parent, [cm('claude-selected', s.cwd, 'selected append')]);
  s.append(other, [cm('claude-other', s.cwd, 'excluded append')]);
  assert.deepEqual(content(await s.w.tick()).map(e => [e.sessionId,e.text]),
    [['claude-selected','selected append']]);
});

test('Claude bridge session filter includes its dispatch events', async t => {
  const s = setup(t, {session:'claude-selected'}, 'session');
  s.cl('claude-selected', [cm('claude-selected', s.cwd, 'selected', 'sdk-cli')]);
  s.cl('claude-other');
  s.lease('d123', {hostPlatform:'codex'});
  s.art('d123', {'events.jsonl':'{"kind":"init","sessionId":"claude-selected"}\n'});
  s.lease('other-dispatch', {sessionId:'claude-other'});
  const out = content(await s.w.start());
  assert.deepEqual([...new Set(out.map(e => e.sessionId ?? e.dispatchId))].sort(), ['claude-selected','d123']);
  assert.equal(out.find(e => e.kind === 'dispatch').platform, 'claude');
  s.advance(2000);
  const lease = s.lease('d123', {hostPlatform:'codex',state:'completed'});
  fs.utimesSync(lease, new Date(TIME+2000), new Date(TIME+2000));
  const updates = content(await s.w.tick());
  assert.deepEqual(updates.map(e => [e.kind,e.dispatchId,e.platform,e.state]),
    [['dispatch','d123','claude','completed']]);
});

test('Claude init artifacts set dispatch platform independently of the Codex host', async t => {
  const s = setup(t, {platforms:['claude']}, 'repo');
  s.lease('d123', {hostPlatform:'codex'});
  s.art('d123', {'events.jsonl':'{"kind":"init","sessionId":"absent-claude-session"}\n'});
  const out = content(await s.w.start());
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, 'dispatch');
  assert.equal(out[0].platform, 'claude');
  assert.equal(out[0].hostPlatform, 'codex');
});

// Catch extra mode words and the misplaced scope prefix in session banners.
test('banner matches all four public scope forms exactly', async t => {
  for (const kind of ['repo','dir','all','session']) {
    const s = setup(t, {session:kind === 'session' ? 'abc-1' : null, platforms:['codex']}, kind);
    const expected = {
      repo:`arc watch: scope ${s.cwd} (1 worktrees) · codex · Ctrl-C to stop`,
      dir:`arc watch: scope ${s.cwd} · codex · Ctrl-C to stop`,
      all:'arc watch: scope all · codex · Ctrl-C to stop',
      session:'arc watch: session abc-1 · codex · Ctrl-C to stop',
    };
    assert.equal((await s.w.start())[0].text, expected[kind]);
  }
});

test('an old Codex rollout seen at startup resumes only after growth without replaying history', async t => {
  const s = setup(t);
  const file = s.c('old-codex', ['old one','old two','old three'].map(text => msg(text)), {age:18000000,origin:'codex_exec'});
  assert.deepEqual(content(await s.w.start()), []);
  s.advance(2000);
  assert.deepEqual(content(await s.w.tick()), []);
  s.append(file, [msg('new only', TIME+4000)]);
  s.advance(2000);
  assert.deepEqual(content(await s.w.tick()).filter(e => e.kind !== 'session').map(e => e.text), ['new only']);
});

test('an old Claude transcript seen at startup resumes only after growth without replaying history', async t => {
  const s = setup(t);
  const file = s.cl('old-claude', ['old one','old two','old three'].map(text => cm('old-claude', s.cwd, text)), {mtime:TIME-18000000});
  assert.deepEqual(content(await s.w.start()), []);
  s.advance(2000);
  assert.deepEqual(content(await s.w.tick()), []);
  s.append(file, [cm('old-claude', s.cwd, 'new only', 'cli', TIME+4000)]);
  s.advance(2000);
  assert.deepEqual(content(await s.w.tick()).filter(e => e.kind !== 'session').map(e => e.text), ['new only']);
});

test('old Claude subagents resume from startup sizes under both recent and old parents', async t => {
  for (const parentAge of [300000,18000000]) {
    const s = setup(t);
    const parent = s.cl('parent', [cm('parent',s.cwd,'parent history')], {
      mtime:TIME-parentAge,
      subagents:[{agentId:'child',mtime:TIME-18000000,lines:[cm('child',s.cwd,'child history')]}],
    });
    const child = path.join(parent.slice(0,-6),'subagents','agent-child.jsonl');
    const initial = content(await s.w.start());
    assert.ok(!initial.some(e => e.sessionId === 'agent-child'));
    s.advance(2000);
    assert.deepEqual(content(await s.w.tick()), []);
    s.append(parent,[cm('parent',s.cwd,'parent new')]);
    s.append(child,[cm('child',s.cwd,'child new')]);
    s.advance(2000);
    const out = content(await s.w.tick()).filter(e => e.kind !== 'session');
    assert.deepEqual(out.map(e => e.text).sort(), ['child new','parent new']);
    assert.equal(out.find(e => e.sessionId === 'agent-child').parentId,'parent');
  }
});

test('Claude files outside startup project prefixes keep their startup offsets', async t => {
  const s = setup(t, {}, 'repo'), other = path.join(fs.realpathSync(s.h.root),'other-tree');
  const parent = s.h.writeClaude(other.replace(/[^A-Za-z0-9]/g,'-'),'other-parent', [cm('other-parent',other,'parent history')], {
    mtime:TIME-300000,subagents:[{agentId:'child',mtime:TIME-300000,lines:[cm('other-child',other,'child history')]}],
  });
  const child = path.join(parent.slice(0,-6),'subagents','agent-child.jsonl');
  assert.deepEqual(content(await s.w.start()), []);
  s.trees([s.cwd,other]);s.advance(30000);
  assert.deepEqual(content(await s.w.tick()), []);
  s.append(parent,[cm('other-parent',other,'parent new')]);
  s.append(child,[cm('other-child',other,'child new')]);s.advance(2000);
  const grown = await s.w.tick();
  assert.deepEqual(content(grown).filter(e => e.kind !== 'session').map(e => e.text).sort(), ['child new','parent new'], JSON.stringify(grown));
});

test('new Claude events are held at two seconds and released at four seconds without mapping', async t => {
  const s = setup(t);
  await s.w.start();
  s.c('new-codex', [msg('new Codex event')], {age:0});
  s.cl('new-claude-1234', [cm('new-claude-1234',s.cwd,'new Claude event')], {mtime:TIME});
  s.advance(2000);
  const first = content(await s.w.tick());
  assert.ok(first.some(e => e.sessionId === 'new-codex' && e.kind === 'user'));
  assert.ok(!first.some(e => e.sessionId === 'new-claude-1234'));
  s.advance(2000);
  const second = content(await s.w.tick());
  assert.deepEqual(second.map(e => [e.sessionId,e.kind,e.label]), [
    ['new-claude-1234','session','main#1234'],
    ['new-claude-1234','user','main#1234'],
  ]);
  assert.equal(second[1].text, 'new Claude event');
});

test('a newly discovered Claude transcript is buffered for label mapping rather than skipped', async t => {
  const s = setup(t, {}, 'repo');
  await s.w.start();
  s.cl('new-claude', [cm('new-claude',s.cwd,'buffered Claude event')], {mtime:TIME});
  s.advance(2000);
  assert.deepEqual(content(await s.w.tick()), []);
  s.advance(1000);
  s.lease('d123');
  s.art('d123', {'events.jsonl':'{"kind":"init","sessionId":"new-claude"}\n'});
  const out = content(await s.w.tick());
  assert.ok(out.some(e => e.kind === 'user' && e.text === 'buffered Claude event' && e.label === 'qa@d123'));
});


test('R1 H1 real Claude child shares parent sessionId without replacing its stream', async t => {
  const s=setup(t, {tail:1000}, 'all');
  const fixture=name=>fs.readFileSync(new URL(`./fixtures/watch/${name}`,import.meta.url),'utf8').trim().split('\n').map(JSON.parse);
  const main=fixture('claude-main.jsonl'), child=fixture('claude-subagent.jsonl');
  const id=main.find(r=>r.cwd&&r.sessionId).sessionId;
  assert.equal(child.find(r=>r.cwd&&r.sessionId).sessionId,id);
  const agentId=child.find(r=>r.agentId).agentId;
  const meta=JSON.parse(fs.readFileSync(new URL('./fixtures/watch/claude-subagent.meta.json',import.meta.url),'utf8'));
  const file=s.h.writeClaude('project',id,main,{mtime:TIME-300000,subagents:[{agentId,meta,lines:child,mtime:TIME-300000}]});
  const initial=content(await s.w.start());
  assert.ok(initial.some(e=>e.sessionId===`agent-${agentId}`&&e.parentId===id&&e.label===`main#${id.slice(-4)}/planner`));
  s.append(file,[cm(id,s.cwd,'parent remains live')]);
  assert.ok(content(await s.w.tick()).some(e=>e.sessionId===id&&e.text==='parent remains live'));
});

test('R1 H2 unchanged heads and child metadata are cached and dispatch scans once', async t => {
  const calls={head:0,meta:0,dispatch:0};
  const s=setup(t,{},'dir',{
    readClaudeHead:async file=>{calls.head++;return readClaudeHead(file);},
    readCodexMeta:async file=>{calls.meta++;return readCodexMeta(file);},
    createDispatchIndex:args=>{const d=createDispatchIndex(args);return {...d,scan:async args=>{calls.dispatch++;return d.scan(args);}};},
  });
  s.c('excluded',undefined,{cwd:'/outside'});
  const old=s.c('old',undefined,{age:18000000});
  s.cl('recent',undefined,{subagents:[{agentId:'child',lines:[cm('recent',s.cwd)],mtime:TIME-300000}]});
  s.cl('old-claude',undefined,{mtime:TIME-18000000});
  await s.w.start();
  assert.deepEqual(calls,{head:2,meta:1,dispatch:1});
  s.advance(2000);await s.w.tick();
  assert.deepEqual(calls,{head:2,meta:1,dispatch:2});
  s.append(old,[msg('now eligible')]);s.advance(2000);await s.w.tick();
  assert.equal(calls.meta,2);
});

test('R1 M2 cwd-less and vanished pending files stop per-tick discovery', async t => {
  let scans=0;
  const s=setup(t,{},'dir',{createClaudeDiscovery:args=>{const d=createClaudeDiscovery(args);return {...d,scan:async args=>{scans++;return d.scan(args);}};}});
  s.cl('no-cwd',[{type:'user',sessionId:'no-cwd',message:{content:'hidden'}}]);
  const gone=s.cl('gone',[{type:'user',sessionId:'gone'}]);
  await s.w.start();fs.unlinkSync(gone);
  for(let i=0;i<20;i++){s.advance(500);await s.w.tick();}
  const atTimeout=scans;
  for(let i=0;i<3;i++){s.advance(500);await s.w.tick();}
  assert.equal(scans,atTimeout);
  s.advance(500);await s.w.tick();assert.equal(scans,atTimeout+1);
});

test('R1 M3 old-date rollout growth resumes from the startup offset', async t => {
  const s=setup(t);
  const file=s.h.writeRollout(['2026','11','08'],'rollout-old-folder.jsonl',[meta('old-folder',s.cwd),msg('history')],{mtime:TIME-18000000});
  assert.deepEqual(content(await s.w.start()),[]);
  s.append(file,[msg('new in old folder')]);s.advance(2000);
  assert.deepEqual(content(await s.w.tick()).filter(e=>e.kind!=='session').map(e=>e.text),['new in old folder']);
  s.advance(1800000);await s.w.tick();
  s.append(file,[msg('after detach')]);s.advance(2000);
  assert.deepEqual(content(await s.w.tick()).filter(e=>e.kind!=='session').map(e=>e.text),['after detach']);
});

test('R1 L2 waiting for a missing session is verbose only', async t => {
  for(const verbose of [false,true]){
    const s=setup(t,{session:'missing',verbose},'session');
    assert.equal(notices(await s.w.start()).includes('waiting for session missing'),verbose);
    s.advance(2000);assert.ok(!notices(await s.w.tick()).includes('waiting for session missing'));
  }
});


test('R1 H2 child growth does not reread unchanged per-file agent metadata', async t => {
  const s=setup(t);
  const file=s.cl('parent',undefined,{subagents:[
    {agentId:'one',meta:{agentType:'arc-planner'},lines:[cm('parent',s.cwd)],mtime:TIME-300000},
    {agentId:'two',meta:{agentType:'arc-qa'},lines:[cm('parent',s.cwd)],mtime:TIME-300000},
    {agentId:'old',meta:{agentType:'arc-scouter'},lines:[cm('parent',s.cwd)],mtime:TIME-18000000},
  ]});
  s.cl('old-parent',undefined,{mtime:TIME-18000000,subagents:[
    {agentId:'old-child',meta:{agentType:'arc-scouter'},lines:[cm('old-parent',s.cwd)],mtime:TIME-18000000},
  ]});
  let reads=0;
  const open=fsp.open;
  t.mock.method(fsp,'open',function(file,...args){if(String(file).endsWith('.meta.json')) reads++;return open.call(this,file,...args);});
  await s.w.start();assert.equal(reads,2);
  s.append(path.join(file.slice(0,-6),'subagents','agent-one.jsonl'),[cm('parent',s.cwd,'growth')]);
  s.advance(2000);await s.w.tick();assert.equal(reads,2);
  const metadata=path.join(file.slice(0,-6),'subagents','agent-two.meta.json');
  fs.writeFileSync(metadata,JSON.stringify({agentType:'arc-reviewer'}));
  fs.utimesSync(metadata,new Date(TIME+4000),new Date(TIME+4000));
  s.advance(2000);await s.w.tick();assert.equal(reads,3);
});


test('user and agent text keep newlines after normalization', async t => {
  const s=setup(t);
  s.cl('multiline',[
    cm('multiline',s.cwd,'a\nb'),
    {type:'assistant',sessionId:'multiline',cwd:s.cwd,message:{content:[{type:'text',text:'a\nb'}]}},
  ]);
  s.c('command',[{timestamp:iso(TIME),type:'event_msg',payload:{type:'item_completed',item:{type:'CommandExecution',command:'git\n  status',exit_code:0}}}]);
  const out=content(await s.w.start());
  for(const kind of ['user','agent']) assert.equal(out.find(e=>e.sessionId==='multiline'&&e.kind===kind)?.text,'a\nb');
  assert.equal(out.find(e=>e.kind==='command')?.text,'git status');
});


test('AC-W26 verbose diagnostic notices use id8 for every session identity', async t => {
  const s=setup(t,{verbose:true},'repo');
  const ids=['tui-session-1234','exec-session-1234','main-session-1234','bridge-session-1234'];
  const files=[s.c(ids[0]),s.c(ids[1],undefined,{origin:'codex_exec'}),s.cl(ids[2]),s.c(ids[3],undefined,{origin:'codex_exec'})];
  s.lease('d123');s.art('d123',{'events.jsonl':JSON.stringify({kind:'thread',threadId:ids[3]})+'\n'});
  await s.w.start();
  for (const file of files) fs.unlinkSync(file);
  const out=await s.w.tick();
  for (const id of ids) assert.ok(notices(out).includes(`session file removed: ${id.slice(0,8)}`));
  assert.doesNotMatch(lines(out,true).join('\n'), /tui#|exec#|main#|qa@d123/);
});

test('busy tracks user and agent activity, ends, and five minutes of inactivity', async t => {
  const s = setup(t), file = s.c('busy',[],{age:0});
  await s.w.start();
  assert.equal(s.w.busy?.(), false);
  for (const type of ['UserMessage','AgentMessage']) {
    s.append(file,[msg('working',TIME,type)]);await s.w.tick();
    assert.equal(s.w.busy?.(),true);
    s.append(file,[{type:'event_msg',payload:{type:'task_complete'}}]);await s.w.tick();
    assert.equal(s.w.busy(),false);
  }
  s.append(file,[msg('working')]);await s.w.tick();
  s.advance(300001);
  assert.equal(s.w.busy(),false);
});
test('Claude subagent handback stops busy after its parent turn has ended', async t => {
  const s = setup(t), id = 'claude-parent';
  const parent = s.cl(id, [cm(id,s.cwd)], {subagents:[{
    agentId:'busy-child', meta:{agentType:'arc-qa'},
    lines:[cm(id,s.cwd), {type:'assistant',message:{content:[
      {type:'tool_use',id:'read',name:'Read',input:{file_path:'/input'}},
    ]}}], mtime:TIME-300000,
  }]});
  const child = path.join(parent.slice(0,-6),'subagents','agent-busy-child.jsonl');
  const initial = content(await s.w.start());
  assert.ok(initial.some(e => e.source === 'subagent' && e.kind === 'tool' && e.tool === 'Read'));
  assert.equal(s.w.busy(),true);
  s.append(parent,[{type:'assistant',message:{content:[],stop_reason:'end_turn'}}]);
  await s.w.tick();
  assert.equal(s.w.busy(),true);
  s.append(child,[
    {type:'assistant',timestamp:iso(TIME),message:{stop_reason:'tool_use',content:[
      {type:'tool_use',id:'handback',name:'SubagentHandback',input:{}},
    ]}},
    {type:'user',timestamp:iso(TIME),message:{content:[
      {type:'tool_result',tool_use_id:'handback',content:'done'},
    ]}},
  ]);
  await s.w.tick();
  assert.equal(s.w.busy(),false);
});
test('Claude Esc interruption stops busy and emits a visible END without verbose', async t => {
  for (const marker of ['[Request interrupted by user]','[Request interrupted by user for tool use]']) {
    const s = setup(t), file = s.cl('claude-busy',[cm('claude-busy',s.cwd,'working')]);
    await s.w.start();
    assert.equal(s.w.busy(),true);
    s.advance(2000);
    const interrupt = cm('claude-busy',s.cwd,'','cli',TIME+2000);
    interrupt.message.content = [{type:'text',text:marker}];
    s.append(file,[interrupt]);
    const out = content(await s.w.tick());
    assert.equal(s.w.busy(),false);
    assert.ok(out.some(e => e.kind === 'turn_end' && e.text === 'interrupted by user'));
    assert.match(lines(out).join('\n'), /END\s+interrupted by user/);
  }
});
test('busy replays history before the verbose filter and follows all rows', async t => {
  const s = setup(t,{tail:0});
  const ended = s.c('ended',[msg('done'),{type:'event_msg',payload:{type:'task_complete'}}],{age:0});
  const active = s.c('active',[{type:'event_msg',payload:{type:'task_started'}}],{age:0});
  await s.w.start();
  assert.equal(s.w.busy?.(),true);
  s.append(active,[{type:'event_msg',payload:{type:'task_complete',error:{message:'failed'}}}]);await s.w.tick();
  assert.equal(s.w.busy(),false);
  s.append(ended,[{type:'event_msg',payload:{type:'task_started'}}]);await s.w.tick();
  assert.equal(s.w.busy(),true);
  fs.unlinkSync(ended);await s.w.tick();
  assert.equal(s.w.busy(),false);
});
test('busy counts held sessions before their events are visible', async t => {
  const s = setup(t);await s.w.start();s.advance(2000);
  s.c('held',[msg('working')],{origin:'codex_exec',age:0});
  assert.deepEqual(content(await s.w.tick()),[]);
  assert.equal(s.w.busy?.(),true);
});
