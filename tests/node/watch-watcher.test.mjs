import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {makeHomes} from './fixtures/watch/homes.mjs';
import {createWatcher} from '../../lib/watch/watcher.mjs';
import {renderHuman} from '../../lib/watch/render.mjs';
import {GIT_ALLOWED} from '../../lib/watch/git.mjs';

const TIME = Date.parse('2026-11-11T12:00:00Z');
const iso = n => new Date(n).toISOString();
const msg = (text, ts = TIME, type = 'UserMessage') => ({timestamp:iso(ts), type:'event_msg', payload:{type:'item_completed', item:{type, content:[{text}]}}});
const meta = (id, cwd, originator='codex-tui', extra={}) => ({timestamp:iso(TIME-300000), type:'session_meta', payload:{id, cwd, originator, cli_version:'1.0', ...extra}});
const cm = (id,cwd,text='hello',entrypoint='cli',ts=TIME) => ({timestamp:iso(ts), type:'user', sessionId:id,cwd,entrypoint,version:'2.0',message:{content:text}});
function setup(t, options={}, kind='dir') {
  const h = makeHomes(t), cwd = path.join(h.root,'repo'), gcd=path.join(h.root,'git');
  fs.mkdirSync(cwd);
  let clock=TIME, roots=[cwd];
  const scope={kind,roots:kind==='all'||kind==='session'?[]:roots,gitCommonDir:kind==='repo'?gcd:null,description:cwd};
  const git=(dir,args)=> {
    assert.ok(GIT_ALLOWED.some(a=>JSON.stringify(a)===JSON.stringify(args)));
    if (args[0]==='worktree') return roots.map(r=>`worktree ${r}\0\0`).join('');
    return args.includes('--show-toplevel')?cwd:gcd;
  };
  const w=createWatcher({options:{platforms:['codex','claude'],session:null,tail:20,verbose:false,...options},homes:{codex:h.codexHome,claude:h.claudeHome},scope,git,now:()=>clock});
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
test('a worktree added after start is in scope after 30 seconds',async t=>{const s=setup(t,{},'repo'),other=path.join(s.h.root,'tree');s.c('tree',undefined,{cwd:other});await s.w.start();s.trees([s.cwd,other]);s.advance(30000);assert.ok(content(await s.w.tick()).some(e=>e.sessionId==='tree'));});
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
test('held bridge lease shows raw reasons; no lease shows nothing',async t=>{const s=setup(t,{},'all');assert.equal(content(await s.w.start()).length,0);s.lease('d123',{state:'failed',reasons:['host_sandbox_blocked','permission_scope_unverified']});s.advance(2000);const out=await s.w.tick(),e=content(out)[0];assert.equal(e.platform,undefined);assert.match(lines([e])[0],/arc\s+qa@d123\s+DISPATCH failed bridge wf-3 host_sandbox_blocked,permission_scope_unverified/);});
test('platform filter removes other-platform sessions and unknown-platform dispatches',async t=>{const s=setup(t,{platforms:['codex']},'all');s.c('codex');s.cl('claude');s.lease('unknown');const out=content(await s.w.start());assert.ok(out.length>0);assert.ok(out.every(e=>e.platform==='codex'));});
test('session filter by thread id, by dispatch id, and waiting for an unknown id',async t=>{for(const session of ['parent','d123','missing']){const s=setup(t,{session},'session');s.c('parent');s.c('child',undefined,{extra:{parent_thread_id:'parent'}});s.c('bridge',undefined,{origin:'codex_exec'});s.lease('d123',{sessionId:'bridge'});s.c('unrelated');const out=await s.w.start(),ids=[...new Set(content(out).map(e=>e.sessionId??e.dispatchId))].sort();assert.deepEqual(ids,session==='parent'?['child','parent']:session==='d123'?['bridge','d123']:[]);if(session==='missing')assert.ok(notices(out).includes('waiting for session missing'));}});
test('more than 64 candidates follows the newest 64 with one notice',async t=>{const s=setup(t,{tail:1000});for(let i=0;i<66;i++)s.c(`id${i}`,[],{age:i*1000+10000});const out=await s.w.start();assert.equal(content(out).length,64);assert.ok(!content(out).some(e=>['id64','id65'].includes(e.sessionId)));assert.equal(notices(out).filter(x=>x==='following the newest 64 sessions; others are skipped').length,1);s.advance(2000);assert.ok(!notices(await s.w.tick()).some(x=>x.includes('newest 64')));});
test('a file idle 30 minutes is detached and reattached when it grows',async t=>{const s=setup(t,{verbose:true}),f=s.c('idle');await s.w.start();s.advance(1800000);assert.ok(notices(await s.w.tick()).includes('detached idle session tui#idle'));s.append(f,[msg('return',TIME+1800000)]);s.advance(2000);assert.ok(content(await s.w.tick()).some(e=>e.text==='return'));});
test('verbose adds reasoning, settings and turn starts',async t=>{for(const verbose of [false,true]){const s=setup(t,{verbose});s.c('one',[{type:'event_msg',payload:{type:'thread_settings_applied',thread_settings:{model:'m'}}},{type:'event_msg',payload:{type:'task_started'}},{type:'event_msg',payload:{type:'item_completed',item:{type:'Reasoning',summary_text:['summary']}}}]);assert.deepEqual(content(await s.w.start()).map(e=>e.kind),verbose?['session','settings','turn_start','reasoning']:['session']);}});
test('transcript text is sanitized before output',async t=>{const s=setup(t,{verbose:true});s.c('one',[msg('\x1b]0;x\x07 sk-abcdefghijklmnopqrst'),{type:'event_msg',payload:{type:'item_completed',item:{type:'McpToolCall',server:'\x1b[31mx',tool:'y'}}},{type:'event_msg',payload:{type:'item_completed',item:{type:'FileChange',changes:{'\x1b[31mpassword=hidden':{}}}}}]);const out=content(await s.w.start());assert.ok(!JSON.stringify(out).includes('\\u001b'));assert.equal(out.find(e=>e.kind==='user').text,'***');assert.equal(out.find(e=>e.kind==='tool').tool,'x.y');assert.deepEqual(out.find(e=>e.kind==='file_change').paths,['password=***']);});
test('no marker string reaches any event in verbose mode',async t=>{const s=setup(t,{verbose:true,tail:1000},'all');const dir=fileURLToPath(new URL('./fixtures/watch/',import.meta.url));for(const name of fs.readdirSync(dir).filter(n=>n.endsWith('.jsonl'))){const rows=fs.readFileSync(path.join(dir,name),'utf8').trim().split('\n').map(JSON.parse);if(name.startsWith('codex')){const m=rows.find(r=>r.type==='session_meta');if(m){m.payload.cwd=s.cwd;m.payload.originator='codex-tui';s.h.writeRollout(['2026','11','11'],`rollout-${name}`,rows,{mtime:TIME-300000});}}else{s.h.writeClaude('project',name,rows.map(r=>({...r,cwd:s.cwd})),{mtime:TIME-300000});}}assert.ok(!JSON.stringify(await s.w.start()).includes('WATCH_MARKER_'));});
test('removed and truncated session files produce verbose notices and keep other streams alive',async t=>{const s=setup(t,{verbose:true}),a=s.c('a'),b=s.c('b');await s.w.start();fs.unlinkSync(a);fs.writeFileSync(b,JSON.stringify(msg('reset'))+'\n');const out=await s.w.tick();assert.ok(notices(out).includes('session file removed: tui#a'));assert.ok(notices(out).includes('session restarted from the beginning: tui#b'));assert.ok(content(out).some(e=>e.text==='reset'));});
test('a failed file read detaches only that file',async t=>{const s=setup(t,{verbose:true}),bad=s.c('bad'),good=s.c('good');await s.w.start();fs.unlinkSync(bad);fs.mkdirSync(bad);s.append(good,[msg('survives')]);const out=await s.w.tick();assert.ok(content(out).some(e=>e.text==='survives'));assert.ok(notices(out).some(text=>text.startsWith('session file unreadable: tui#bad')));assert.deepEqual(await s.w.tick(),[]);});
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
  assert.deepEqual([...new Set(out.map(e => e.sessionId))].sort(), ['claude-child','claude-selected']);
  assert.equal(out.find(e => e.sessionId === 'claude-child').parentId, 'claude-selected');
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
