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
import {WATCH_KINDS} from '../../lib/watch/model.mjs';

const TIME = Date.parse('2026-11-11T12:00:00Z');
const iso = n => new Date(n).toISOString();
const msg = (text, ts = TIME, type = 'UserMessage') => ({timestamp:iso(ts), type:'event_msg', payload:{type:'item_completed', item:{type, content:[{text}]}}});
const meta = (id, cwd, originator='codex-tui', extra={}) => ({timestamp:iso(TIME-300000), type:'session_meta', payload:{id, cwd, originator, cli_version:'1.0', ...extra}});
const cm = (id,cwd,text='hello',entrypoint='cli',ts=TIME) => ({timestamp:iso(ts), type:'user', sessionId:id,cwd,entrypoint,version:'2.0',message:{content:text}});
function setup(t, options={}, kind='dir', dependencies={}) {
  const {excluded=[],root,...watchOptions}=options;
  const h = makeHomes(t), repo = path.join(h.root,'repo'), gcd=path.join(h.root,'git');
  fs.mkdirSync(repo);
  const cwd = fs.realpathSync(repo);
  let clock=TIME, roots=[root?path.join(cwd,root):cwd], shellFiles=[], gitTop=cwd;
  const calls=[], stats=new Map();
  const lstat=async file=>{
    const value=stats.get(file);
    if (value instanceof Error) throw value;
    if (!value) throw Object.assign(Error('missing'),{code:'ENOENT'});
    return {mtimeMs:1,size:1,ino:1,mode:33188,isDirectory:()=>false,...value};
  };
  const scope={kind,roots:kind==='all'||kind==='session'?[]:roots,excludedRoots:excluded.map(dir=>path.join(cwd,dir)),gitCommonDir:kind==='repo'?gcd:null,description:cwd};
  const git=(dir,args)=> {
    assert.ok(GIT_ALLOWED.some(a=>JSON.stringify(a)===JSON.stringify(args)));
    calls.push({dir,args});
    if (args[0]==='ls-files') return shellFiles===null?null:shellFiles.join('\0')+(shellFiles.length?'\0':'');
    if (args[0]==='worktree') return roots.map(r=>`worktree ${r}\0\0`).join('');
    return args.includes('--show-toplevel')?(typeof gitTop==='function'?gitTop(dir):gitTop):gcd;
  };
  const w=createWatcher({options:{platforms:['codex','claude'],session:null,tail:20,verbose:false,...watchOptions},homes:{codex:h.codexHome,claude:h.claudeHome},scope,git,now:()=>clock,dependencies:{lstat,...dependencies}});
  t.after(()=>w.close());
  const c=(id,lines=[msg('hello')],{origin='codex-tui',age=300000,cwd:dir=cwd,extra={},suffix=''}={})=>h.writeRollout(['2026','11','11'],`rollout-${id}.jsonl${suffix}`,[meta(id,dir,origin,extra),...lines],{mtime:clock-age});
  const cl=(id,lines,opts={})=>h.writeClaude(cwd.replace(/[^A-Za-z0-9]/g,'-'),id,lines??[cm(id,cwd)],{mtime:clock-300000,...opts});
  const append=(file,lines)=>{fs.appendFileSync(file,lines.map(x=>JSON.stringify(x)).join('\n')+'\n'); fs.utimesSync(file,new Date(clock),new Date(clock));};
  const lease=(id,extra={})=>h.writeLease({dispatchId:id,role:'arc_qa',state:'running',route:'bridge',workflowId:'wf-3',updatedAt:iso(clock),...extra});
  const art=(id,files)=>h.writeArtifacts(gcd,'wf-3',`dispatches/${id}`,files);
  return {h,cwd,gcd,w,c,cl,append,lease,art,advance:n=>clock+=n,trees:r=>roots=r,calls,stats,files:r=>shellFiles=r,top:r=>gitTop=r};
}
const content = events=>events.filter(e=>e.source!=='watch');
const notices = events=>events.filter(e=>e.source==='watch').map(e=>e.text);
const lines=(events,verbose=false)=>events.map(e=>renderHuman(e,{width:200,color:false,verbose}));

function movingSetup(t,options={}) {
  const s=setup(t,{excluded:['wt'],...options},'repo'), wt=path.join(s.cwd,'wt');
  fs.mkdirSync(wt);s.trees([s.cwd,wt]);
  return {...s,wt};
}
const move=(cwd,ts=TIME)=>({timestamp:iso(ts),type:'turn_context',payload:{cwd}});

const claudeTool = (id,cwd,name,input) => ({timestamp:iso(TIME),type:'assistant',sessionId:id,cwd,
  message:{content:[{type:'tool_use',id:'call-'+name,name,input}]}});
const skillRead = file => ({timestamp:iso(TIME),type:'event_msg',payload:{type:'item_completed',item:{
  type:'CommandExecution',command:'cat SKILL.md',parsed_cmd:[{type:'read',path:file}],exit_code:0}}});

// Missing watcher/render integration loses tool identity, leaks skill bodies or duplicates commands.
test('AC-W41 Claude Skill and slash command render as SKILL',async t=>{
  for (const mode of ['default','verbose','json']) {
    const s=setup(t,{verbose:mode==='verbose'}), id='claude-skills';
    const fixture=fs.readFileSync(new URL('./fixtures/watch/claude-slash-command.jsonl',import.meta.url),'utf8')
      .trim().split('\n').map(line=>({...JSON.parse(line),cwd:s.cwd,sessionId:id}));
    s.cl(id,[cm(id,s.cwd),claudeTool(id,s.cwd,'Skill',{skill:'arc',args:'x'}),...fixture]);
    const events=content(await s.w.start()), human=lines(events,mode==='verbose').join('\n');
    assert.equal(human.split('\n').filter(line=>line.endsWith('SKILL    arc')).length,1);
    assert.equal(human.split('\n').filter(line=>line.endsWith('SKILL    find-skills')).length,1);
    const output=mode==='json'?events.map(renderJson).join('\n'):human;
    assert.doesNotMatch(output,/Base directory|# Find Skills|SKILL\.md/);
  }
});

test('AC-W42 Codex skill-only read replaces CMD by default',async t=>{
  for (const verbose of [false,true]) {
    const s=setup(t,{verbose},'all'), file=s.c('codex-skills',[skillRead(path.join(s.h.codexHome,'skills/arc/SKILL.md'))]);
    const first=content(await s.w.start());
    assert.equal(lines(first).filter(line=>line.endsWith('SKILL    arc')).length,1);
    assert.equal(first.filter(e=>e.kind==='command').length,verbose?1:0);
    assert.ok(first.every(e=>!Object.hasOwn(e,'skillOnly')));
    // Relative paths must use the latest inherited cwd, and same-turn reads stay deduplicated.
    s.append(file,[move(path.join(s.h.codexHome,'skills/arc')),skillRead('./SKILL.md')]);
    s.append(file,[move(s.cwd)]);
    const repeated=content(await s.w.tick());
    assert.equal(repeated.filter(e=>e.kind==='tool').length,0);
    assert.equal(repeated.filter(e=>e.kind==='command').length,verbose?1:0);
    s.append(file,[{type:'event_msg',payload:{type:'task_started'}},skillRead(path.join(s.h.codexHome,'skills/arc/SKILL.md'))]);
    const next=content(await s.w.tick());
    assert.equal(next.filter(e=>e.skill==='arc').length,1);
    assert.equal(next.filter(e=>e.kind==='command').length,verbose?1:0);
    assert.ok(next.every(e=>!Object.hasOwn(e,'skillOnly')));
    // Truncation starts a fresh announcement state without needing task_started.
    fs.writeFileSync(file,JSON.stringify(skillRead(path.join(s.h.codexHome,'skills/arc/SKILL.md')))+'\n');
    assert.equal(content(await s.w.tick()).filter(e=>e.skill==='arc').length,1);
  }
});

test('AC-W43 Codex pluginId and Claude plugin MCP render as PLUGIN',async t=>{
  const s=setup(t), item=rest=>({type:'event_msg',payload:{type:'item_completed',item:{type:'McpToolCall',...rest}}});
  s.c('plugins',[item({server:'cua',tool:'repl',pluginId:'unified-computer-use@openai-bundled'}),item({server:'srv',tool:'call'})]);
  s.cl('claude-plugin',[cm('claude-plugin',s.cwd),claudeTool('claude-plugin',s.cwd,'mcp__plugin_p_srv__t',{secret:'MCP_ARGUMENT_HIDDEN'})]);
  const events=content(await s.w.start()), human=lines(events).join('\n');
  assert.match(human,/PLUGIN   unified-computer-use@openai-bundled cua\.repl/);
  assert.match(human,/PLUGIN   p mcp__plugin_p_srv__t/);
  assert.match(human,/TOOL     srv\.call/);
  assert.equal(events.find(e=>e.tool==='mcp__plugin_p_srv__t').plugin,'p');
  assert.doesNotMatch(human+events.map(renderJson).join('\n'),/MCP_ARGUMENT_HIDDEN/);
});

test('AC-W44 SKILL and PLUGIN follow the gate and masking',async t=>{
  const s=movingSetup(t), id='masked-skills';
  const file=s.cl(id,[cm(id,s.cwd),claudeTool(id,s.cwd,'Skill',{skill:'\x1b[31marc',args:'key sk-abcdefghijklmnopqrstu'}),
    claudeTool(id,s.cwd,'mcp__plugin_\x1b[31mp_srv__t',{})]);
  const events=content(await s.w.start()), skill=events.find(e=>e.kind==='tool'&&e.tool==='Skill');
  assert.equal(skill.skill,'arc');
  assert.equal(skill.text,'key ***');
  assert.equal(events.find(e=>e.plugin).plugin,'p');
  const human=lines(events).join('\n');
  assert.doesNotMatch(human,/sk-abcdefghijklmnopqrstu|\\u001b|\x1b|key/);
  assert.match(human,/SKILL    arc$/m);
  for (const output of [events.map(renderJson).join('\n'),JSON.stringify(events)]) {
    assert.doesNotMatch(output,/sk-abcdefghijklmnopqrstu|\\u001b|\x1b/);
    assert.match(output,/key \*\*\*/);
  }
  s.append(file,[claudeTool(id,s.wt,'Skill',{skill:'outside'}),claudeTool(id,s.wt,'mcp__plugin_p_srv__t',{})]);
  assert.equal(content(await s.w.tick()).filter(e=>e.kind==='tool').length,0);
  assert.deepEqual(WATCH_KINDS,['session','settings','turn_start','turn_end','turn_failed','user','agent','reasoning','command','tool','tool_failed','file_change','file_create','file_delete','spawn','approval','dispatch','error','other','notice']);
});

// Without a fresh cwd check, a new worktree leaks until the periodic scope refresh.
test('AC-W39 a nested worktree seen in a line is excluded before the 30-second refresh',async t=>{
  const s=setup(t,{},'repo'), nested=path.join(s.cwd,'nested'), id='new-worktree';
  const file=s.cl(id);await s.w.start();
  s.top(dir=>dir.startsWith(nested)?nested:s.cwd);s.trees([s.cwd,nested]);
  const before=s.calls.length;
  s.append(file,[cm(id,nested,'x')]);s.advance(500);
  assert.deepEqual(await s.w.tick(),[]);
  const calls=s.calls.slice(before), checked=calls.findIndex(c=>c.dir===nested&&c.args===GIT_ALLOWED[0]);
  assert.ok(checked>=0);
  assert.ok(calls.slice(checked+1).some(c=>c.args===GIT_ALLOWED[2]));
});

// Caching an unsuccessful lookup forever loses future lines; retrying immediately hammers Git.
for(const failure of ['null','exception']) {
  test(`AC-W39 failed checks are not cached and retried after 2 seconds (${failure})`,async t=>{
    const s=setup(t,{},'repo'), sub=path.join(s.cwd,'src'), id=`retry-${failure}`;
    const file=s.cl(id);await s.w.start();
    s.top(dir=>{
      if(dir!==sub) return s.cwd;
      if(failure==='exception') throw Error('git timeout');
      return null;
    });
    const checks=()=>s.calls.filter(c=>c.dir===sub&&c.args===GIT_ALLOWED[0]).length;
    s.append(file,[cm(id,sub,'failed')]);
    assert.deepEqual(content(await s.w.tick()),[]);assert.equal(checks(),1);
    s.advance(1000);s.append(file,[cm(id,sub,'too soon')]);
    assert.deepEqual(content(await s.w.tick()),[]);assert.equal(checks(),1);
    s.top(()=>s.cwd);s.advance(2000);
    // A line without cwd inherits the failed cwd and must still trigger a retry.
    s.append(file,[{timestamp:iso(TIME+3000),type:'assistant',message:{content:[{type:'text',text:'recovered'}]}}]);
    const out=content(await s.w.tick());
    assert.equal(checks(),2);assert.deepEqual(out.map(e=>e.kind),['session','agent']);
    assert.equal(out[1].text,'recovered');assert.ok(out.every(e=>e.cwd===sub));
    s.append(file,[cm(id,sub,'after recovery')]);
    assert.deepEqual(content(await s.w.tick()).map(e=>e.text),['after recovery']);
    assert.equal(checks(),2);
  });
}

// Rechecking successful directory lookups adds one Git round trip per line.
test('nested check caches an in-scope subdirectory once',async t=>{
  const s=setup(t,{},'repo'), sub=path.join(s.cwd,'src'), id='cached-subdirectory';
  const file=s.cl(id,[cm(id,sub,'first')]);
  assert.ok(content(await s.w.start()).some(e=>e.text==='first'));
  for(const text of ['second','third']) {
    s.append(file,[cm(id,sub,text)]);
    assert.deepEqual(content(await s.w.tick()).map(e=>e.text),[text]);
  }
  assert.equal(s.calls.filter(c=>c.dir===sub&&c.args===GIT_ALLOWED[0]).length,1);
});

// Checking the selected root (including realpath aliases) adds no scope information.
test('the selected root and its alias are never git-checked',async t=>{
  const s=setup(t,{},'repo'), alias=path.join(s.h.root,'repo-alias');
  fs.symlinkSync(s.cwd,alias,'dir');
  const files=[s.cl('root'),s.cl('alias',[cm('alias',alias)])];
  await s.w.start();const before=s.calls.length;
  for(const [i,cwd] of [s.cwd,alias].entries()) s.append(files[i],[cm(i?'alias':'root',cwd,'visible')]);
  assert.deepEqual(content(await s.w.tick()).map(e=>e.text),['visible','visible']);
  assert.equal(s.calls.slice(before).filter(c=>c.args===GIT_ALLOWED[0]).length,0);
});

test('AC-W05 dir scope never runs the nested check',async t=>{
  const s=setup(t), sub=path.join(s.cwd,'src'), id='directory';
  const file=s.cl(id,[cm(id,sub)]);await s.w.start();
  const before=s.calls.length;
  s.top(()=>{throw Error('dir scope must not verify nested worktrees');});
  s.append(file,[cm(id,sub,'directory line')]);
  assert.deepEqual(content(await s.w.tick()).map(e=>e.text),['directory line']);
  assert.equal(s.calls.length,before);
});

test('AC-W40 GIT_ALLOWED stays four commands',()=>{
  assert.equal(GIT_ALLOWED.length,4);
  assert.deepEqual(GIT_ALLOWED,[
    ['rev-parse','--show-toplevel'],
    ['rev-parse','--path-format=absolute','--git-common-dir'],
    ['worktree','list','--porcelain','-z'],
    ['ls-files','-z','--cached','--others','--exclude-standard'],
  ]);
});

// Ignoring known parents or using the parent's cwd loses scoped children and ancestry labels.
test('AC-W35 subagents are scoped by their own cwd and keep parent labels',async t=>{
  const s=setup(t);
  s.c('parent1234',undefined,{cwd:'/outside'});
  s.c('child',[msg('review',TIME,'AgentMessage')],{extra:{parent_thread_id:'parent1234',depth:1,agent_role:'arc_qa'}});
  s.c('grand',undefined,{extra:{parent_thread_id:'child',depth:2,agent_nickname:'Aristotle'}});
  s.cl('main1234',[cm('main1234','/outside')],{subagents:[{
    agentId:'qa',meta:{agentType:'arc-qa'},lines:[cm('main1234',s.cwd,'Claude child')],
  }]});
  const out=content(await s.w.start());
  assert.ok(!out.some(e=>['parent1234','main1234'].includes(e.sessionId)));
  for(const [id,label,parentId,depth] of [
    ['child','tui#1234/qa','parent1234',1],
    ['grand','tui#1234/qa/Aristotle','child',2],
    ['agent-qa','main#1234/qa','main1234',1],
  ]) {
    const e=out.find(e=>e.sessionId===id);
    assert.ok(e,`${id} must attach using its own cwd`);
    assert.equal(e.label,label);assert.equal(e.parentId,parentId);
    assert.equal(e.depth,depth);assert.equal(e.source,'subagent');
  }
  assert.match(lines(out.filter(e=>e.sessionId==='child'&&e.kind==='agent'))[0],/AGENT\s+QA review/);
});

test('AC-W35 outside children do not output under in-scope parents',async t=>{
  const s=setup(t,{verbose:true});
  s.c('parent');s.c('child',undefined,{cwd:'/outside',extra:{parent_thread_id:'parent'}});
  s.cl('main',undefined,{subagents:[{agentId:'outside',lines:[cm('main','/outside')]}]});
  const initial=await s.w.start();s.advance(2000);
  const out=[...initial,...await s.w.tick()];
  assert.ok(!content(out).some(e=>['child','agent-outside'].includes(e.sessionId)));
  assert.ok(!notices(out).some(text=>text.includes('parent session not found')));
});

// Keeping the top-level mapping hold for a known child misses the three-second attach bound.
test('AC-W21 known-parent children attach within 3 seconds regardless of originator',async t=>{
  const s=setup(t);s.c('parent',undefined,{cwd:'/outside'});await s.w.start();
  s.c('child',undefined,{age:0,origin:'codex_exec',extra:{parent_thread_id:'parent',depth:2}});
  s.advance(2000);
  assert.ok(content(await s.w.tick()).some(e=>e.sessionId==='child'&&e.kind==='session'&&e.depth===2));
});

test('AC-W36 Desktop descendants stay excluded by ancestry',async t=>{
  const s=setup(t,{verbose:true});
  s.c('desktop',undefined,{origin:'Codex Desktop',cwd:'/outside'});
  s.c('child',undefined,{extra:{parent_thread_id:'desktop'}});
  s.c('grand',undefined,{extra:{parent_thread_id:'child'}});
  assert.deepEqual(content(await s.w.start()),[]);s.advance(2000);
  const out=await s.w.tick();assert.deepEqual(content(out),[]);
  assert.ok(!notices(out).some(text=>text.includes('parent session not found')));
});

// A known immediate parent cannot prove that a missing root is not Desktop.
for (const kind of ['repo','dir']) {
  test(`L3 broken ancestor chains are held and dropped (${kind})`,async t=>{
    const s=setup(t,{verbose:true},kind), diagnostic='parent session not found for chain-grand';
    s.c('chain-child',undefined,{cwd:'/outside',extra:{parent_thread_id:'missing-desktop'}});
    s.c('chain-grand',undefined,{extra:{parent_thread_id:'chain-child'}});
    const initial=await s.w.start();
    assert.deepEqual(content(initial),[]);
    assert.ok(!notices(initial).includes(diagnostic));
    s.advance(1999);
    const held=await s.w.tick();
    assert.deepEqual(content(held),[]);
    assert.ok(!notices(held).includes(diagnostic));
    s.advance(1);
    const expired=await s.w.tick();
    assert.deepEqual(content(expired),[]);
    assert.equal(notices(expired).filter(text=>text===diagnostic).length,1);
    s.advance(2000);
    const later=await s.w.tick();
    assert.deepEqual(content(later),[]);
    assert.ok(!notices(later).includes(diagnostic));
  });

  for (const origin of ['Codex Desktop','codex-tui']) {
    test(`L3 ancestors found during the hold decide the chain (${kind}, ${origin})`,async t=>{
      const s=setup(t,{verbose:true},kind);
      s.c('chain-child',undefined,{cwd:'/outside',extra:{parent_thread_id:'root1234',depth:1,agent_role:'arc_qa'}});
      s.c('chain-grand',undefined,{extra:{parent_thread_id:'chain-child',depth:2,agent_nickname:'Aristotle'}});
      const initial=await s.w.start();
      assert.deepEqual(content(initial),[]);
      s.advance(500);
      const held=await s.w.tick();
      assert.deepEqual(content(held),[]);
      s.advance(500);
      s.c('root1234',undefined,{cwd:'/outside',origin,age:0});
      const resolved=await s.w.tick(), events=content(resolved);
      if (origin==='Codex Desktop') assert.deepEqual(events,[]);
      else {
        assert.deepEqual(events.map(e=>e.kind),['session','user']);
        assert.ok(events.every(e=>e.sessionId==='chain-grand'&&e.label==='tui#1234/qa/Aristotle'
          &&e.parentId==='chain-child'&&e.depth===2&&e.source==='subagent'));
      }
      s.advance(2000);
      const later=await s.w.tick();
      assert.deepEqual(later,[]);
      assert.ok(!notices([...initial,...held,...resolved]).some(text=>text.includes('parent session not found')));
    });
  }

  // Finding both parents is insufficient when neither chain reaches a root.
  test(`L3 cyclic ancestor chains are held and dropped (${kind})`,async t=>{
    const s=setup(t,{verbose:true},kind), diagnostic='parent session not found for cycle-child';
    s.c('cycle-a',undefined,{cwd:'/outside',extra:{parent_thread_id:'cycle-b'}});
    s.c('cycle-b',undefined,{cwd:'/outside',extra:{parent_thread_id:'cycle-a'}});
    s.c('cycle-child',undefined,{extra:{parent_thread_id:'cycle-a'}});
    const initial=await s.w.start();
    assert.deepEqual(content(initial),[]);
    assert.ok(!notices(initial).includes(diagnostic));
    s.advance(1999);
    const held=await s.w.tick();
    assert.deepEqual(content(held),[]);
    assert.ok(!notices(held).includes(diagnostic));
    s.advance(1);
    const expired=await s.w.tick();
    assert.deepEqual(content(expired),[]);
    assert.equal(notices(expired).filter(text=>text===diagnostic).length,1);
    s.advance(2000);
    const later=await s.w.tick();
    assert.deepEqual(content(later),[]);
    assert.ok(!notices(later).includes(diagnostic));
  });
}

test('AC-W36 all and session still require a followed parent',async t=>{
  for(const kind of ['all','session']) {
    const s=setup(t,{session:kind==='session'?'selected':null},kind);
    s.c('other',undefined,{age:kind==='all'?18000000:300000});
    s.c('other-child',undefined,{extra:{parent_thread_id:'other'}});
    s.c('selected');s.c('selected-child',undefined,{extra:{parent_thread_id:'selected'}});
    const out=content(await s.w.start());
    assert.deepEqual([...new Set(out.map(e=>e.sessionId))].sort(),['selected','selected-child']);
  }
});

// Known metadata cannot replace a followed parent for the all/session hold deadline.
for(const kind of ['session','all']) {
  test(`AC-W36 ${kind} scope still holds and diagnoses children of known but unfollowed parents`,async t=>{
    const s=setup(t,{session:kind==='session'?'selected':null,verbose:true},kind);
    s.c('selected',undefined,{age:0});
    // In all mode, 64 newer roots keep the known unselected parent out of followed.
    if(kind==='all') for(let i=0;i<63;i++) s.c(`filler-${i}`,undefined,{age:0});
    s.c('unselected');
    s.c('unselected-child',undefined,{age:0,extra:{parent_thread_id:'unselected'}});
    const initial=await s.w.start();
    const diagnostic='parent session not found for unselected-child';
    assert.ok(!content(initial).some(e=>['unselected','unselected-child'].includes(e.sessionId)));
    assert.ok(!notices(initial).includes(diagnostic));
    s.advance(1999);
    const held=await s.w.tick();
    assert.ok(!content(held).some(e=>e.sessionId==='unselected-child'));
    assert.ok(!notices(held).includes(diagnostic));
    s.advance(1);
    const expired=await s.w.tick();
    assert.ok(!content(expired).some(e=>e.sessionId==='unselected-child'));
    assert.equal(notices(expired).filter(text=>text===diagnostic).length,1);
    s.advance(2000);
    const later=await s.w.tick();
    assert.ok(!content(later).some(e=>e.sessionId==='unselected-child'));
    assert.ok(!notices(later).includes(diagnostic));
  });
}

// Head-only eligibility misses moved files; head-only resume inheritance leaks old-cwd messages.
test('AC-W37 worktree watch discovers moved sessions within one discovery',async t=>{
  const s=movingSetup(t,{root:'wt',excluded:[]});
  let clock=TIME;
  const w=createWatcher({options:{tail:20},homes:{codex:s.h.codexHome,claude:s.h.claudeHome},
    scope:{kind:'repo',roots:[s.wt],excludedRoots:[s.cwd]},git:async()=>null,now:()=>clock});
  t.after(()=>w.close());
  const claude=s.cl('moving-claude',[cm('moving-claude',s.cwd,'old Claude')]);
  const codex=s.c('moving-codex',[msg('old Codex')]);
  const padded=s.c('padded',[move(s.wt),msg('x'.repeat(70000)),msg('old padded')]);
  await w.start();
  s.advance(2000);
  s.append(claude,[cm('moving-claude',s.wt,'moved Claude')]);
  s.append(codex,[move(s.wt),msg('moved Codex')]);
  s.append(padded,[msg('no recent cwd')]);
  clock+=2000;
  const out=content(await w.tick());
  for(const id of ['moving-claude','moving-codex']) {
    const events=out.filter(e=>e.sessionId===id);
    assert.deepEqual(events.map(e=>e.kind),['session','user']);
    assert.equal(events[0].cwd,s.wt);assert.ok(events[0].text.includes(`cwd=${s.wt}`));
    assert.match(events[1].text,/^moved /);
  }
  assert.ok(!out.some(e=>e.sessionId==='padded'));
});

test('AC-W17 dormant sessions reattach from the saved offset with the gate',async t=>{
  const s=movingSetup(t,{verbose:true}), file=s.c('dormant',[move(s.cwd),msg('history')],{cwd:'/outside',age:0});
  assert.ok(content(await s.w.start()).some(e=>e.text==='history'));
  for(let i=0;i<30;i++) {s.advance(60000);s.append(file,[move(s.wt),msg('outside')]);await s.w.tick();}
  s.append(file,[msg('still outside'),move(s.cwd),msg('returned')]);s.advance(2000);
  const out=content(await s.w.tick());
  assert.deepEqual(out.map(e=>e.kind),['session','user']);
  assert.equal(out[0].cwd,s.cwd);assert.equal(out[1].text,'returned');
});

test('AC-W17 known is capped',async t=>{
  const s=setup(t,{verbose:true},'dir',{maxKnown:2});
  for(const id of ['a-parent','b-parent','c-parent']) s.c(id,undefined,{cwd:'/outside'});
  await s.w.start();s.c('y-child',undefined,{extra:{parent_thread_id:'c-parent'}});
  s.advance(2000);
  assert.ok(content(await s.w.tick()).some(e=>e.sessionId==='y-child'));
  s.c('z-child',undefined,{extra:{parent_thread_id:'a-parent'}});
  s.advance(2000);assert.deepEqual(content(await s.w.tick()),[]);
  s.advance(2000);const out=await s.w.tick();
  assert.deepEqual(content(out),[]);
  assert.ok(notices(out).includes('parent session not found for z-child'));
});

// Missing line gates leak moved history/appends; missing cwd inheritance leaks later messages.
test('AC-W31 moved Claude session lines stay out of the root watch',async t=>{
  const s=movingSetup(t), id='moved-claude';
  const file=s.cl(id,[cm(id,s.cwd,'before'),cm(id,s.wt,'after-history')]);
  const out=content(await s.w.start());
  assert.deepEqual(out.map(e=>e.kind),['session','user']);
  assert.equal(out[0].cwd,s.cwd);assert.match(out[0].text,new RegExp(`cwd=${s.cwd}$`));
  assert.equal(out[1].text,'before');
  s.append(file,[cm(id,s.wt,'after-live'),{type:'assistant',message:{content:'inherit'}}]);
  assert.deepEqual(content(await s.w.tick()),[]);
});

test('AC-W32 returning to the root shows one SESSION with the new cwd',async t=>{
  const s=movingSetup(t), id='returning', file=s.cl(id,[cm(id,s.cwd),cm(id,s.wt)]);
  await s.w.start();s.append(file,[cm(id,s.cwd,'back')]);
  const out=content(await s.w.tick());
  assert.deepEqual(out.map(e=>e.kind),['session','user']);
  assert.equal(out[0].cwd,s.cwd);assert.ok(out[0].text.includes(`cwd=${s.cwd}`));
  assert.equal(out[1].text,'back');
  s.append(file,[cm(id,s.cwd,'again')]);
  assert.deepEqual(content(await s.w.tick()).map(e=>e.kind),['user']);
});

test('AC-W32 worktree watch hides lines after the session returns to root',async t=>{
  const s=movingSetup(t,{root:'wt',excluded:[]}), id='worktree';
  const file=s.cl(id,[cm(id,s.wt)]);
  assert.ok(content(await s.w.start()).some(e=>e.text==='hello'));
  s.append(file,[cm(id,s.cwd,'root')]);
  assert.deepEqual(content(await s.w.tick()),[]);
});

test('AC-W33 a session moved before start shows only pre-move history',async t=>{
  const s=movingSetup(t,{tail:20}), id='history';
  const file=s.cl(id,[...Array.from({length:5},(_,i)=>cm(id,s.cwd,`before${i}`)),
    ...Array.from({length:30},(_,i)=>cm(id,s.wt,`after${i}`))]);
  const out=content(await s.w.start());
  assert.deepEqual(out.filter(e=>e.kind==='user').map(e=>e.text),['before0','before1','before2','before3','before4']);
  assert.equal(out[0].kind,'session');assert.equal(out[0].cwd,s.cwd);
  s.append(file,[cm(id,s.wt,'live')]);assert.deepEqual(content(await s.w.tick()),[]);
});

test('AC-W34 Codex turn_context and thread_settings_applied move the session',async t=>{
  const s=movingSetup(t), file=s.c('codex-moving',[msg('a')]);
  await s.w.start();s.append(file,[move(s.wt),msg('b')]);
  assert.deepEqual(content(await s.w.tick()),[]);
  s.append(file,[{timestamp:iso(TIME),type:'event_msg',payload:{type:'thread_settings_applied',thread_settings:{cwd:s.cwd}}},msg('c')]);
  const out=content(await s.w.tick());
  assert.equal(out.filter(e=>e.kind==='session').length,1);assert.ok(out.some(e=>e.text==='c'));
  s.append(file,[{type:'event_msg',payload:{type:'item_completed',item:{type:'CommandExecution',cwd:'/elsewhere',command:'pwd'}}},
    {type:'world_state',payload:{cwd:s.wt}},msg('still inside')]);
  const ignored=content(await s.w.tick());
  assert.deepEqual(ignored.map(e=>e.kind),['command','user']);assert.ok(ignored.every(e=>e.cwd===s.cwd));
});

test('AC-W38 out-of-scope roots get no shell state and paths follow the line cwd',async t=>{
  const s=movingSetup(t), file=s.c('roots',[]);
  s.top(dir=>dir.startsWith(s.wt)?s.wt:s.cwd);s.files(['x']);
  await s.w.start();s.append(file,[move(s.wt),msg('outside')]);await s.w.tick();
  assert.equal(s.calls.some(c=>c.dir===s.wt&&c.args===GIT_ALLOWED[3]),false);
  s.append(file,[move(s.cwd),{type:'event_msg',payload:{type:'item_completed',item:{type:'FileChange',changes:{x:{}}}}}]);
  const change=content(await s.w.tick()).find(e=>e.kind==='file_change');assert.equal(change.root,s.cwd);
  const id='claude-rm', sub=path.join(s.cwd,'sub');fs.mkdirSync(sub);
  const claude=s.cl(id,[cm(id,s.cwd)]);s.advance(2000);await s.w.tick();s.advance(2000);await s.w.tick();
  s.append(claude,[cm(id,sub,'subdir'),{type:'assistant',message:{content:[{type:'tool_use',id:'rm',name:'Bash',input:{command:'rm x'}}]}}]);
  await s.w.tick();s.append(claude,[{type:'user',message:{content:[{type:'tool_result',tool_use_id:'rm',content:'done'}]}}]);
  assert.deepEqual(content(await s.w.tick()).find(e=>e.kind==='file_delete')?.paths,[path.join(sub,'x')]);
});

test('AC-W40 leaving scope emits a verbose NOTICE only',async t=>{
  for(const verbose of [false,true]) {
    const s=movingSetup(t,{verbose}), id='notice-session', file=s.cl(id);
    await s.w.start();s.append(file,[cm(id,s.wt,'hidden')]);
    const out=await s.w.tick();assert.deepEqual(content(out),[]);
    assert.deepEqual(notices(out),verbose?[`session notice-s left scope: cwd=${s.wt}`]:[]);
    assert.deepEqual(out.map(e=>JSON.parse(renderJson(e)).kind),verbose?['notice']:[]);
    assert.doesNotMatch(out.map(renderJson).join('\n'),/hidden/);
  }
});

test('AC-W40 busy ignores turns of out-of-scope sessions',async t=>{
  const s=movingSetup(t), file=s.c('spinner',[],{age:0});
  await s.w.start();s.append(file,[move(s.wt),msg('x')]);await s.w.tick();
  assert.equal(s.w.busy(),false);
  s.append(file,[move(s.cwd),msg('back')]);await s.w.tick();assert.equal(s.w.busy(),true);
});

test('AC-W17 out-of-scope lines do not refresh idle time',async t=>{
  const s=movingSetup(t,{verbose:true}), id='idle-outside', file=s.c(id,[],{age:0});
  await s.w.start();
  let out=[];
  for(let i=0;i<30;i++) {s.advance(60000);s.append(file,[move(s.wt),msg('outside')]);out.push(...await s.w.tick());}
  assert.ok(notices(out).includes('detached idle session idle-out'));
  assert.deepEqual(content(out),[]);
});

test('in-out-in within one poll emits one SESSION per entry',async t=>{
  const s=movingSetup(t,{verbose:true}), id='transitions', file=s.cl(id);
  await s.w.start();s.append(file,[cm(id,s.cwd,'one'),cm(id,s.wt,'hidden'),cm(id,s.cwd,'two')]);
  const out=await s.w.tick();
  assert.deepEqual(content(out).map(e=>e.kind),['user','session','user']);
  assert.deepEqual(content(out).filter(e=>e.kind==='user').map(e=>e.text),['one','two']);
  assert.deepEqual(notices(out),[`session transiti left scope: cwd=${s.wt}`]);
});

test('reset restarts cwd inheritance from headCwd',async t=>{
  const s=movingSetup(t), file=s.c('reset',Array.from({length:10},()=>msg('padding')));
  await s.w.start();s.append(file,[move(s.wt),msg('outside')]);
  assert.deepEqual(content(await s.w.tick()),[]);
  fs.writeFileSync(file,JSON.stringify(msg('root after reset'))+'\n');
  const out=content(await s.w.tick());
  assert.deepEqual(out.map(e=>e.text),['root after reset']);assert.equal(out[0].cwd,s.cwd);
});

test('held new sessions release only gated events',async t=>{
  const s=movingSetup(t);await s.w.start();s.advance(2000);
  s.cl('held-moving',[cm('held-moving',s.cwd,'inside'),cm('held-moving',s.wt,'hidden')],{mtime:TIME+2000});
  assert.deepEqual(content(await s.w.tick()),[]);
  s.advance(2000);const out=content(await s.w.tick());
  assert.deepEqual(out.map(e=>e.kind),['session','user']);assert.equal(out[1].text,'inside');
  assert.ok(out.every(e=>e.cwd===s.cwd));assert.ok(out[0].text.includes(`cwd=${s.cwd}`));
});

// Invisible history must not consume the only opportunity to announce attachment.
test('Reviewer M1 invisible Claude history emits one SESSION before the next USER',async t=>{
  const s=setup(t), id='clear-only', sub=path.join(s.cwd,'src');
  await s.w.start();s.advance(2000);
  const file=s.cl(id,[cm(id,s.cwd,'<command-name>/clear</command-name>'),
    cm(id,sub,'<local-command-stdout>Cleared</local-command-stdout>')]);
  const attached=content(await s.w.tick());
  assert.deepEqual(attached.map(e=>e.kind),['session']);
  assert.equal(attached[0].cwd,sub);
  assert.ok(attached[0].text.endsWith(`cwd=${sub}`));
  s.advance(500);s.append(file,[cm(id,sub,'first visible message','cli',TIME+2500)]);
  const next=content(await s.w.tick());
  assert.deepEqual(next.map(e=>e.kind),['user']);
  assert.equal(next[0].text,'first visible message');
  assert.deepEqual([...attached,...next].map(e=>e.kind),['session','user']);
});

// A resolved parent must stop the pending queue from forcing discovery on every tick.
for (const kind of ['repo','dir']) {
  test(`Reviewer L1 out-of-scope children leave pending when their parent is known (${kind})`,async t=>{
    let scans=0;
    const s=setup(t,{verbose:true},kind,{createClaudeDiscovery:args=>{
      const discovery=createClaudeDiscovery(args);
      return {...discovery,scan:async args=>{scans++;return discovery.scan(args);}};
    }});
    s.c('pending-child',undefined,{cwd:'/outside',extra:{parent_thread_id:'late-parent'}});
    const start=await s.w.start();
    assert.deepEqual(content(start),[]);
    assert.deepEqual(notices(start).filter(text=>text!=='live'&&!text.startsWith('arc watch:')),[]);
    assert.equal(scans,1);
    s.advance(500);s.c('late-parent',undefined,{cwd:'/outside'});
    assert.deepEqual(await s.w.tick(),[]);
    assert.equal(scans,2);
    for (let i=0;i<2;i++) {
      s.advance(500);
      assert.deepEqual(await s.w.tick(),[]);
      assert.equal(scans,2,'a known out-of-scope child must not force discovery before 2 seconds');
    }
  });
}

// A recovered cwd must regain its shell identity even though the cwd did not change.
for (const failure of ['null','exception']) {
  test(`Reviewer L2 recovered cwd schedules inferred changes for its session (${failure})`,async t=>{
    const s=setup(t,{},'repo'), id=`shell-recovery-${failure}`, sub=path.join(s.cwd,'src');
    const changed=path.join(sub,'changed.txt');
    s.files(['src/changed.txt']);s.stats.set(changed,{size:1});
    const file=s.cl(id);await s.w.start();
    s.top(dir=>{
      if (dir!==sub) return s.cwd;
      if (failure==='exception') throw Error('git timeout');
      return null;
    });
    s.append(file,[cm(id,sub,'unverified')]);
    assert.deepEqual(content(await s.w.tick()),[]);
    assert.equal(s.calls.filter(c=>c.dir===sub&&c.args===GIT_ALLOWED[0]).length,1);
    s.advance(2000);s.top(()=>s.cwd);s.stats.set(changed,{size:2});
    s.append(file,[cm(id,sub,'recovered','cli',TIME+2000)]);
    const recovered=content(await s.w.tick());
    assert.deepEqual(recovered.map(e=>e.kind),['session','user']);
    assert.equal(s.calls.filter(c=>c.dir===sub&&c.args===GIT_ALLOWED[0]).length,2);
    s.advance(1000);
    const inferred=content(await s.w.tick()).filter(e=>e.inferred);
    assert.deepEqual(inferred.map(e=>({kind:e.kind,sessionId:e.sessionId,cwd:e.cwd,root:e.root,paths:e.paths})),[
      {kind:'file_change',sessionId:id,cwd:sub,root:s.cwd,paths:[changed]},
    ]);
  });
}

// A dispatch without a workflow target cannot bypass a failed nested-cwd check.
for (const failure of ['null','exception']) {
  test(`Reviewer L4 targetless bridge respects nested cwd verification (${failure})`,async t=>{
    const s=setup(t,{},'repo'), id=`targetless-${failure}`, sub=path.join(s.cwd,'nested');
    const file=s.cl(id,[cm(id,s.cwd,'inside','sdk-cli')]);
    s.lease('d123');s.art('d123',{'events.jsonl':JSON.stringify({kind:'init',sessionId:id})+'\n'});
    const start=content(await s.w.start());
    assert.ok(start.some(e=>e.sessionId===id&&e.kind==='user'&&e.source==='bridge'));
    s.top(dir=>{
      if (dir!==sub) return s.cwd;
      if (failure==='exception') throw Error('git timeout');
      return null;
    });
    s.append(file,[cm(id,sub,'outside','sdk-cli'),claudeTool(id,sub,'Skill',{skill:'hidden'})]);
    assert.deepEqual(await s.w.tick(),[]);
    assert.equal(s.calls.filter(c=>c.dir===sub&&c.args===GIT_ALLOWED[0]).length,1);
    s.advance(2000);s.append(file,[cm(id,sub,'still outside','sdk-cli',TIME+2000)]);
    assert.deepEqual(await s.w.tick(),[]);
    assert.equal(s.calls.filter(c=>c.dir===sub&&c.args===GIT_ALLOWED[0]).length,2);
  });
}

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
    const w = createWatcher({options:{tail:20,session:'fallback'},homes:{codex:s.h.codexHome},scope:{kind:'session',roots:[]},
      git:async (dir,args) => {
        if (args!==GIT_ALLOWED[0]) return null;
        if (result instanceof Error) throw result;
        return result;
      },now:()=>TIME});
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
  assert.equal(out[0].text,`arc watch: scope ${s.cwd} · CODEX+CLAUDE · Ctrl-C to stop`);
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
test('a worktree added after start stays outside the scope after 30 seconds',async t=>{
  const s=setup(t,{},'repo'),other=path.join(s.h.root,'tree');
  const file=s.c('tree',undefined,{cwd:other});
  await s.w.start();s.trees([s.cwd,other]);s.advance(30000);
  assert.deepEqual(content(await s.w.tick()),[]);
  s.append(file,[msg('new tree event')]);s.advance(2000);
  assert.deepEqual(content(await s.w.tick()),[]);
});
test('shared dispatch artifacts cannot pull another worktree into history or live output',async t=>{
  const s=setup(t,{},'repo'), other=path.join(s.h.root,'other');
  const local=s.c('local',[msg('local history')]);
  const localClaude=s.cl('local-claude',[cm('local-claude',s.cwd,'local claude history')]);
  const foreign=s.c('foreign',[msg('foreign history')],{cwd:other,origin:'codex_exec'});
  const foreignClaude=s.cl('foreign-claude',[cm('foreign-claude',other,'foreign claude history','sdk-cli')]);
  s.lease('foreign-dispatch');
  s.art('foreign-dispatch',{'events.jsonl':'{"kind":"thread","threadId":"foreign"}\n{"kind":"init","sessionId":"foreign-claude"}\n'});
  const history=content(await s.w.start());
  assert.ok(history.some(e=>e.text==='local history'));
  assert.ok(history.some(e=>e.text==='local claude history'));
  assert.ok(history.every(e=>['local','local-claude'].includes(e.sessionId)));
  s.advance(30000);
  s.append(local,[msg('local live')]);s.append(foreign,[msg('foreign live')]);
  s.append(localClaude,[cm('local-claude',s.cwd,'local claude live')]);
  s.append(foreignClaude,[cm('foreign-claude',other,'foreign claude live')]);
  const live=content(await s.w.tick());
  assert.deepEqual(live.map(e=>e.text).sort(),['local claude live','local live']);
});
test('dispatches without transcripts require a workflow target in the selected worktree',async t=>{
  const s=setup(t,{},'repo');
  for(const [workflowId,target] of [['local',s.cwd],['foreign',path.join(s.h.root,'other')]]) {
    s.h.writeArtifacts(s.gcd,workflowId,'',{'state.json':{target:{realpath:target}}});
    s.h.writeArtifacts(s.gcd,workflowId,`dispatches/${workflowId}`,{'record.json':{state:'running',updatedAt:iso(TIME)}});
  }
  s.art('unknown',{'record.json':{state:'running',updatedAt:iso(TIME)}});
  assert.deepEqual(content(await s.w.start()).map(e=>e.dispatchId),['local']);
});
test('direct codex exec and non-cli Claude entrypoints are included with labels',async t=>{const s=setup(t);s.c('id-1234',undefined,{origin:'codex_exec'});s.cl('id-5678',[cm('id-5678',s.cwd,'hello','sdk-cli')]);const out=content(await s.w.start());assert.ok(out.some(e=>e.label==='exec#1234'));assert.ok(out.some(e=>e.label==='main:sdk-cli#5678'));assert.ok(out.some(e=>e.text===`id-1234 codex_exec 1.0 cwd=${s.cwd}`));});
test('compressed rollouts are skipped with a verbose notice',async t=>{const s=setup(t,{verbose:true});s.c('z',[],{suffix:'.zst'});assert.ok(notices(await s.w.start()).includes('compressed session skipped: rollout-z.jsonl.zst'));});
test('subagent rollouts attach under their parent at depth 1 and 2',async t=>{const s=setup(t);s.c('parent1234');s.c('child',undefined,{cwd:s.cwd,extra:{source:{subagent:{thread_spawn:{parent_thread_id:'parent1234',depth:1,agent_role:'arc_qa'}}}}});s.c('grand',undefined,{extra:{parent_thread_id:'child',depth:2,agent_nickname:'Aristotle'}});const out=content(await s.w.start());for(const [id,label,parentId,depth] of [['child','tui#1234/qa','parent1234',1],['grand','tui#1234/qa/Aristotle','child',2]]){const e=out.find(e=>e.sessionId===id);assert.equal(e.label,label);assert.equal(e.parentId,parentId);assert.equal(e.depth,depth);}});
test('a child found before its parent is held up to 2 seconds',async t=>{const s=setup(t,{verbose:true});s.c('child',undefined,{extra:{parent_thread_id:'parent'}});s.c('orphan',undefined,{extra:{parent_thread_id:'missing'}});assert.equal(content(await s.w.start()).length,0);s.advance(1000);s.c('parent');assert.ok(content(await s.w.tick()).some(e=>e.sessionId==='child'));s.advance(1000);const out=await s.w.tick();assert.ok(notices(out).some(x=>x.includes('orphan')));assert.ok(!content(out).some(e=>e.sessionId==='orphan'));});
test('a codex-tui rollout without parent fields is top-level',async t=>{const s=setup(t);s.c('solo1234');assert.equal(content(await s.w.start())[0].label,'tui#1234');});
test('Claude subagent labels from meta agentType with fallback',async t=>{const s=setup(t);s.cl('parent1234',undefined,{subagents:[{agentId:'qa',meta:{agentType:'arc-qa'},lines:[cm('child-qa',s.cwd)]},{agentId:'fallback',lines:[cm('child-fallback',s.cwd)]}]});const out=content(await s.w.start());assert.ok(out.some(e=>e.label==='main#1234/qa'&&e.parentId==='parent1234'));assert.ok(out.some(e=>e.label==='main#1234/agent'));});
test('Claude native reviewer handback-only transcript renders its role and masks message secrets', async t => {
  const s=setup(t);
  s.cl('parent1234',undefined,{subagents:[{
    agentId:'review',meta:{agentType:'arc-routing-reviewer'},lines:[{
      type:'assistant',timestamp:iso(TIME),message:{role:'assistant',stop_reason:'end_turn',content:[
        {type:'tool_use',id:'handback',name:'SubagentHandback',input:{message:'\x1b[31mreview complete\npassword=hidden'}},
      ]},
    }],
  }]});
  const out=content(await s.w.start()), report=out.find(e=>e.kind==='agent');
  assert.ok(report,'handback must produce an agent message');
  assert.equal(report.sessionId,'agent-review');
  assert.equal(report.label,'main#1234/reviewer');
  assert.equal(report.role,'reviewer');
  assert.equal(report.text,'review complete\npassword=***');
  assert.match(lines([report])[0].slice(25),/^REVIEWER review complete\n +password=\*\*\*$/);
  assert.equal(out.filter(e=>e.sessionId==='agent-review'&&e.kind==='turn_end').length,1);
  assert.ok(!out.some(e=>e.tool==='SubagentHandback'));
});
test('Codex native arc_routing child threads render final agent messages with their roles', async t => {
  const s=setup(t);
  s.c('parent1234');
  for (const role of ['scouter','planner','implementer','qa','reviewer']) {
    s.c(role,[msg(`${role} final report`,TIME,'AgentMessage'),{type:'event_msg',payload:{type:'task_complete'}}],{
      extra:{source:{subagent:{thread_spawn:{parent_thread_id:'parent1234',depth:1,agent_role:`arc_routing_${role}`}}}},
    });
  }
  const out=content(await s.w.start());
  for (const [role,title] of [['scouter','SCOUTER'],['planner','PLANNER'],['implementer','IMPLEMENTER'],['qa','QA'],['reviewer','REVIEWER']]) {
    const report=out.find(e=>e.sessionId===role&&e.kind==='agent');
    assert.ok(report);
    assert.equal(report.label,`tui#1234/${role}`);
    assert.equal(report.role,role);
    assert.equal(lines([report])[0].slice(25),`${title} ${role} final report`);
  }
});
test('codex_exec bridge rollout is labeled role@id4 from the thread event',async t=>{const s=setup(t,{},'repo');s.h.writeArtifacts(s.gcd,'wf-3','',{'state.json':{target:{realpath:s.cwd}}});s.c('bridge',undefined,{origin:'codex_exec',cwd:'/outside'});s.lease('d123');s.art('d123',{'events.jsonl':'{"kind":"thread","threadId":"bridge"}\n'});const out=content(await s.w.start());assert.ok(out.some(e=>e.sessionId==='bridge'&&e.label==='qa@d123'&&e.source==='bridge'&&e.text.endsWith(' dispatch d123 wf-3')));assert.equal(out.find(e=>e.kind==='dispatch').platform,'codex');});
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
  s.h.writeArtifacts(s.gcd,'wf-3','',{'state.json':{target:{realpath:s.cwd}}});
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
  s.h.writeArtifacts(s.gcd,'wf-3','',{'state.json':{target:{realpath:s.cwd}}});
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
      repo:`arc watch: scope ${s.cwd} (1 worktrees) · CODEX · Ctrl-C to stop`,
      dir:`arc watch: scope ${s.cwd} · CODEX · Ctrl-C to stop`,
      all:'arc watch: scope all · CODEX · Ctrl-C to stop',
      session:'arc watch: session abc-1 · CODEX · Ctrl-C to stop',
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

test('Claude files in another worktree stay excluded as parent and child grow', async t => {
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
  assert.deepEqual(content(grown), []);
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


test('live deletion reaches human and JSON output and marks the session busy', async t => {
  const s = setup(t), file = s.c('delete',[],{age:0});
  await s.w.start();
  assert.equal(s.w.busy(),false);
  const deleted = s.cwd + '/docs/' + 'long-name-'.repeat(20) + '.md';
  s.append(file,[{timestamp:iso(TIME),type:'event_msg',payload:{type:'item_completed',item:{
    type:'FileChange',changes:{[deleted]:{type:'delete',content:'WATCH_MARKER_deleted_content'}},
  }}}]);
  const out = content(await s.w.tick());
  assert.equal(out.length,1);
  assert.equal(out[0].kind,'file_delete');
  assert.deepEqual(out[0].paths,[deleted]);
  assert.equal(s.w.busy(),true);
  const human = renderHuman(out[0],{width:40,color:false});
  assert.equal(human.slice(16),'DELETE   repo/docs/' + 'long-name-'.repeat(20) + '.md');
  const json = JSON.parse(renderJson(out[0]));
  assert.equal(json.kind,'file_delete');
  assert.deepEqual(json.paths,[deleted]);
  assert.doesNotMatch(human + JSON.stringify(json),/WATCH_MARKER/);
});


test('Claude successful rm reaches live DELETE output without exposing tool results', async t => {
  const s = setup(t), file = s.cl('claude-delete');
  await s.w.start();
  s.append(file,[{type:'assistant',sessionId:'claude-delete',cwd:s.cwd,message:{content:[
    {type:'tool_use',id:'delete',name:'Bash',input:{command:'rm "docs/old file.md"'}},
  ]}}]);
  assert.deepEqual(content(await s.w.tick()).map(e=>e.kind),['command']);
  s.append(file,[{type:'user',sessionId:'claude-delete',cwd:s.cwd,message:{content:[
    {type:'tool_result',tool_use_id:'delete',is_error:false,content:'WATCH_MARKER_output'},
  ]},toolUseResult:{stdout:'WATCH_MARKER_stdout',stderr:'',interrupted:false}}]);
  const out=content(await s.w.tick());
  assert.equal(out.length,1);
  assert.equal(out[0].platform,'claude');
  assert.equal(out[0].kind,'file_delete');
  assert.equal(renderHuman(out[0],{width:40,color:false}).slice(16),'DELETE   repo/docs/old file.md');
  assert.deepEqual(JSON.parse(renderJson(out[0])).paths,[s.cwd + '/docs/old file.md']);
  assert.doesNotMatch(JSON.stringify(out),/WATCH_MARKER/);
});

const inferred=events=>events.filter(e=>e.inferred);
const scans=s=>s.calls.filter(c=>c.args[0]==='ls-files');
async function shellActivity(s,file,delay=1000) {
  s.append(file,[msg('shell activity')]);
  await s.w.tick();s.advance(delay);
  return s.w.tick();
}

// Scheduling from the final row.gitTop loses an earlier in-scope line's scan.
test('same-poll exit still schedules the in-scope root shell scan',async t=>{
  const s=movingSetup(t), id='same-poll-shell', file=s.cl(id), created=path.join(s.cwd,'new.txt');
  s.top(dir=>dir.startsWith(s.wt)?s.wt:s.cwd);
  await s.w.start();s.advance(1000);
  s.stats.set(created,{});s.files(['new.txt']);
  s.append(file,[cm(id,s.cwd,'trigger'),cm(id,s.wt,'hidden')]);
  const live=await s.w.tick();
  assert.deepEqual(content(live).map(e=>[e.kind,e.text]),[['user','trigger']]);
  s.advance(3000);const scan=await s.w.tick();
  assert.deepEqual(inferred(scan).map(e=>[e.kind,e.paths,e.sessionId,e.cwd,e.root]),
    [['file_create',[created],id,s.cwd,s.cwd]]);
  assert.equal([...live,...scan].some(e=>e.text==='hidden'),false);
  assert.equal(JSON.stringify([...live,...scan]).includes(s.wt),false);
});

// Reading the current row identity at scan time leaks a later out-of-scope cwd.
test('inferred file events keep the in-scope identity after the session leaves scope',async t=>{
  const s=movingSetup(t), id='shell-moving', file=s.cl(id), created=path.join(s.cwd,'new.txt');
  s.top(dir=>dir.startsWith(s.wt)?s.wt:s.cwd);
  const out=await s.w.start();
  s.advance(1000);s.append(file,[cm(id,s.cwd,'trigger')]);out.push(...await s.w.tick());
  s.stats.set(created,{});s.files(['new.txt']);
  s.advance(1000);s.append(file,[cm(id,s.wt,'hidden')]);
  assert.deepEqual(await s.w.tick(),[]);
  s.advance(3000);const scan=await s.w.tick();out.push(...scan);
  assert.deepEqual(inferred(scan).map(e=>[e.kind,e.paths,e.sessionId,e.cwd,e.root]),
    [['file_create',[created],id,s.cwd,s.cwd]]);
  for(const output of [JSON.stringify(out),out.map(renderJson).join('\n'),lines(out).join('\n')]) {
    assert.equal(output.includes(s.wt),false);
  }
});

test('shell baseline and history are silent; delayed scans emit sorted CREATE EDIT DELETE',async t=>{
  const s=setup(t), a=path.join(s.cwd,'a'), z=path.join(s.cwd,'z'), gone=path.join(s.cwd,'gone');
  s.files(['a','gone']);s.stats.set(a,{});s.stats.set(gone,{});
  const file=s.c('shell');await s.w.start();
  assert.equal(scans(s).length,1);
  s.advance(3000);assert.deepEqual(inferred(await s.w.tick()),[]);assert.equal(scans(s).length,1);
  s.stats.set(a,{mtimeMs:2});s.stats.delete(gone);s.stats.set(z,{});s.files(['z','a']);
  s.append(file,[msg('running shell')]);await s.w.tick();s.advance(999);
  assert.deepEqual(inferred(await s.w.tick()),[]);assert.equal(scans(s).length,1);
  s.advance(1);const out=inferred(await s.w.tick());
  assert.deepEqual(out.map(e=>[e.kind,e.paths,e.sessionId]),[
    ['file_create',[z],'shell'],['file_change',[a],'shell'],['file_delete',[gone],'shell'],
  ]);
  assert.ok(out.every(e=>e.inferred===true));
});

test('shell scan suppresses three FileChange claims but reports a silent golden write and later edit',async t=>{
  const s=setup(t), claimed=['a','b','c'], golden=path.join(s.cwd,'golden');
  s.files([...claimed,'golden']);for(const p of [...claimed,'golden'])s.stats.set(path.join(s.cwd,p),{});
  const file=s.c('exec-shell',[],{origin:'codex_exec'});await s.w.start();s.advance(3000);
  for(const p of [...claimed,'golden'])s.stats.set(path.join(s.cwd,p),{mtimeMs:2});
  s.append(file,[{type:'event_msg',payload:{type:'item_completed',item:{type:'FileChange',changes:Object.fromEntries(claimed.map(p=>[p,{}]))}}}]);
  const direct=await s.w.tick();assert.equal(direct.filter(e=>e.kind==='file_change').length,1);
  s.advance(1000);const out=inferred(await s.w.tick());
  assert.deepEqual(out.map(e=>[e.kind,e.paths,e.sessionId]),[['file_change',[golden],'exec-shell']]);
  const a=path.join(s.cwd,'a');
  s.advance(3000);s.stats.set(a,{mtimeMs:3});
  assert.deepEqual(inferred(await shellActivity(s,file)).map(e=>[e.kind,e.paths]),[['file_change',[a]]]);
});

test('shell claims survive unchanged scans until a pending Claude Edit lands',async t=>{
  const s=setup(t), x=path.join(s.cwd,'x');
  s.files(['x']);s.stats.set(x,{});
  const file=s.cl('pending-edit');await s.w.start();s.advance(3000);
  s.append(file,[{type:'assistant',sessionId:'pending-edit',cwd:s.cwd,message:{content:[
    {type:'tool_use',id:'edit-x',name:'Edit',input:{file_path:x,old_string:'before',new_string:'after'}},
  ]}}]);
  assert.deepEqual((await s.w.tick()).filter(e=>e.kind==='file_change').map(e=>e.paths),[[x]]);
  s.advance(1000);assert.deepEqual(content(await s.w.tick()),[]);
  s.stats.set(x,{mtimeMs:2});
  s.append(file,[{type:'user',sessionId:'pending-edit',cwd:s.cwd,message:{content:[
    {type:'tool_result',tool_use_id:'edit-x',content:'Edit applied'},
  ]}}]);
  s.advance(3000);assert.deepEqual(inferred(await s.w.tick()),[]);
  s.advance(1000);assert.deepEqual(inferred(await s.w.tick()),[]);
  assert.equal(scans(s).length,3);
});

test('unobserved shell claims remain valid through two minutes and then expire',async t=>{
  const s=setup(t), x=path.join(s.cwd,'x'), y=path.join(s.cwd,'y');
  s.files(['x','y']);s.stats.set(x,{});s.stats.set(y,{});
  const file=s.cl('expiring-edit');await s.w.start();s.advance(3000);
  s.append(file,[{type:'assistant',sessionId:'expiring-edit',cwd:s.cwd,message:{content:[
    {type:'tool_use',id:'edit-x',name:'Edit',input:{file_path:x,old_string:'before',new_string:'after'}},
    {type:'tool_use',id:'edit-y',name:'Edit',input:{file_path:y,old_string:'before',new_string:'after'}},
  ]}}]);
  assert.equal((await s.w.tick()).filter(e=>e.kind==='file_change').length,2);
  s.advance(1000);assert.deepEqual(content(await s.w.tick()),[]);
  // The next scan starts exactly 120000ms after the claims were recorded.
  s.advance(118000);s.stats.set(x,{mtimeMs:2});
  assert.deepEqual(inferred(await shellActivity(s,file)),[]);
  // Y has remained unchanged until after its unconsumed claim expires.
  s.advance(3000);s.stats.set(y,{mtimeMs:2});
  assert.deepEqual(inferred(await shellActivity(s,file)).map(e=>[e.kind,e.paths]),[['file_change',[y]]]);
});

test('shell scans do not suppress changes claimed only by attachment history',async t=>{
  const s=setup(t), a=path.join(s.cwd,'a');
  s.files(['a']);s.stats.set(a,{});
  const file=s.c('history-edit',[{type:'event_msg',payload:{type:'item_completed',item:{type:'FileChange',changes:{a:{}}}}}]);
  const history=await s.w.start();
  assert.deepEqual(history.filter(e=>e.kind==='file_change').map(e=>e.paths),[['a']]);
  s.advance(3000);s.stats.set(a,{mtimeMs:2});
  assert.deepEqual(inferred(await shellActivity(s,file)).map(e=>[e.kind,e.paths]),[['file_change',[a]]]);
});

test('disabled shell roots neither accumulate claims nor resolve tool-reported paths',async t=>{
  const s=setup(t), file=s.c('off-claims'), directory=path.join(s.cwd,'tool-claims');
  s.files(Array.from({length:20001},(_,i)=>`f${i}`));
  const out=await s.w.start();
  assert.ok(notices(out).some(n=>n.includes('more than 20000 files')));
  let claims=0,realPaths=0;
  const set=Map.prototype.set,realpath=fs.realpathSync;
  t.mock.method(Map.prototype,'set',function(key,value){
    if(typeof key==='string' && key.startsWith(directory+path.sep))claims++;
    return set.call(this,key,value);
  });
  t.mock.method(fs,'realpathSync',function(file,...args){
    if(file===directory)realPaths++;
    return realpath.call(this,file,...args);
  });
  for(const name of ['a','b','c']){
    s.append(file,[{type:'event_msg',payload:{type:'item_completed',item:{type:'FileChange',changes:{[path.join(directory,name)]:{}}}}}]);
    assert.equal((await s.w.tick()).filter(e=>e.kind==='file_change').length,1);
  }
  assert.deepEqual({claims,realPaths},{claims:0,realPaths:0});
});

test('shell scans attribute changes to the most recently active followed session',async t=>{
  const s=setup(t), a=s.c('first'), b=s.c('second');await s.w.start();s.advance(3000);
  s.append(a,[msg('first')]);await s.w.tick();s.advance(100);
  s.stats.set(path.join(s.cwd,'new'),{});s.files(['new']);
  const out=inferred(await shellActivity(s,b));assert.equal(out.length,1);assert.equal(out[0].sessionId,'second');
});

test('shell detection skips non-repositories and caches failed top-level lookup',async t=>{
  const s=setup(t);s.top(null);s.c('one');s.c('two');await s.w.start();
  assert.equal(scans(s).length,0);assert.equal(s.calls.filter(c=>c.args===GIT_ALLOWED[0]).length,1);
});

for(const reason of ['limit','failures'])test(`shell detection disables once without verbose after ${reason}`,async t=>{
  const s=setup(t), file=s.c('off');
  if(reason==='limit')s.files(Array.from({length:20001},(_,i)=>`f${i}`));else s.files(null);
  const out=await s.w.start();
  for(let i=0;i<4;i++){s.advance(3000);out.push(...await shellActivity(s,file));}
  const matching=notices(out).filter(n=>n.startsWith('shell change detection off for '));
  assert.deepEqual(matching,[`shell change detection off for ${s.cwd}: ${reason==='limit'?'more than 20000 files':'git ls-files failed 3 times'}`]);
  assert.equal(scans(s).length,reason==='limit'?1:3);
});

test('continuous transcript activity still scans every three seconds',async t=>{
  const s=setup(t), file=s.c('continuous');await s.w.start();
  // Activity first arrives at 500ms: pendingSince reaches 3000ms at 3500ms.
  // After that scan, the next activity starts a new pending window at 4000ms.
  for(const count of [1,1,1,1,1,1,2,2,2,2,2,2,2,3]){
    s.advance(500);s.append(file,[msg('still running')]);await s.w.tick();
    assert.equal(scans(s).length,count);
  }
});

test('shell scanning rotates three roots with at most two scans per tick',async t=>{
  const s=setup(t,{},'all');s.top(dir=>dir);
  const files=['one','two','three'].map(id=>s.c(id,[],{cwd:path.join(s.cwd,id)}));
  await s.w.start();assert.equal(scans(s).length,3);s.advance(3000);
  for(const file of files)s.append(file,[msg('activity')]);await s.w.tick();s.advance(1000);
  await s.w.tick();assert.equal(scans(s).length,5);
  await s.w.tick();assert.equal(scans(s).length,6);
  assert.equal(new Set(scans(s).slice(3).map(c=>c.dir)).size,3);
});

test('shell scan reports every path in a sorted 500-file change',async t=>{
  const s=setup(t), file=s.c('bulk');await s.w.start();s.advance(3000);
  const names=Array.from({length:500},(_,i)=>`file-${String(i).padStart(3,'0')}`);
  s.files([...names].reverse());for(const name of names)s.stats.set(path.join(s.cwd,name),{});
  const out=inferred(await shellActivity(s,file));
  assert.equal(out.length,1);assert.equal(out[0].kind,'file_create');assert.deepEqual(out[0].paths,names.map(n=>path.join(s.cwd,n)));
});

test('shell lstat preserves inaccessible fingerprints, skips directories and tracks symlink metadata',async t=>{
  const s=setup(t), file=s.c('metadata'), link=path.join(s.cwd,'link'), denied=path.join(s.cwd,'denied');
  s.files(['link','denied','directory']);s.stats.set(link,{mode:41471});s.stats.set(denied,{});
  s.stats.set(path.join(s.cwd,'directory'),{isDirectory:()=>true});await s.w.start();s.advance(3000);
  s.stats.set(denied,Object.assign(Error('denied'),{code:'EACCES'}));s.stats.set(link,{mode:41471,size:2});
  let out=inferred(await shellActivity(s,file));assert.deepEqual(out.map(e=>e.paths),[[link]]);
  s.advance(3000);s.stats.set(denied,{});out=inferred(await shellActivity(s,file));assert.deepEqual(out,[]);
  s.advance(3000);s.stats.set(link,Object.assign(Error('not a directory'),{code:'ENOTDIR'}));
  out=inferred(await shellActivity(s,file));assert.deepEqual(out.map(e=>[e.kind,e.paths]),[['file_delete',[link]]]);
});

test('a successful scan after a failed baseline establishes a silent baseline',async t=>{
  const s=setup(t), file=s.c('retry');s.files(null);await s.w.start();s.advance(3000);
  s.files(['new']);s.stats.set(path.join(s.cwd,'new'),{});
  assert.deepEqual(inferred(await shellActivity(s,file)),[]);assert.equal(scans(s).length,2);
  s.advance(3000);s.stats.set(path.join(s.cwd,'new'),{mode:33261});
  assert.equal(inferred(await shellActivity(s,file))[0].kind,'file_change');
});

test('shell scans respect held events and do not reactivate an ended turn',async t=>{
  const s=setup(t);await s.w.start();s.c('held',[],{origin:'codex_exec',age:0});s.advance(2000);await s.w.tick();
  // A new row is held until TIME+4000; its baseline is already established.
  s.advance(3000);const file=path.join(s.h.codexHome,'sessions','2026','11','11','rollout-held.jsonl');
  s.stats.set(path.join(s.cwd,'new'),{});s.files(['new']);
  s.append(file,[{type:'event_msg',payload:{type:'task_complete'}}]);await s.w.tick();assert.equal(s.w.busy(),false);
  s.advance(1000);assert.equal(inferred(await s.w.tick()).length,1);assert.equal(s.w.busy(),false);
});


for (const aliasTop of [false,true]) test(`shell claims suppress aliases with ${aliasTop?'aliased Git top':'aliased session cwd'}`,async t=>{
  const s=setup(t,{},'dir',{lstat:fsp.lstat}), alias=path.join(s.h.root,'repo-alias');
  fs.symlinkSync(s.cwd,alias,'dir');
  const cwd=aliasTop?s.cwd:alias;
  s.top(aliasTop?alias:s.cwd);
  const a=path.join(s.cwd,'A'), b=path.join(s.cwd,'B'), gone=path.join(s.cwd,'gone');
  for(const file of [a,b,gone]) fs.writeFileSync(file,'initial');
  s.files(['A','B','gone']);
  const transcript=s.c('alias-shell',[],{cwd});
  await s.w.start();s.advance(3000);
  fs.writeFileSync(a,'tool write');fs.writeFileSync(b,'silent shell write');fs.unlinkSync(gone);
  s.append(transcript,[{type:'event_msg',payload:{type:'item_completed',item:{type:'FileChange',changes:{
    A:{},[path.join(alias,'gone')]:{type:'delete'},
  }}}}]);
  await s.w.tick();s.advance(1000);
  assert.deepEqual(inferred(await s.w.tick()).map(e=>[e.kind,e.paths,e.sessionId]),[
    ['file_change',[b],'alias-shell'],
  ]);
});

test('shell claims canonicalize directories without following the claimed symlink itself',async t=>{
  const s=setup(t,{},'dir',{lstat:fsp.lstat}), alias=path.join(s.h.root,'repo-alias');
  fs.symlinkSync(s.cwd,alias,'dir');
  const target=path.join(s.cwd,'target'), link=path.join(s.cwd,'link');
  fs.writeFileSync(target,'initial');fs.symlinkSync('target',link);
  s.files(['target','link']);s.top(s.cwd);
  const transcript=s.c('alias-link',[],{cwd:alias});await s.w.start();s.advance(3000);
  fs.writeFileSync(target,'silent target write');fs.unlinkSync(link);fs.symlinkSync('different-target',link);
  s.append(transcript,[{type:'event_msg',payload:{type:'item_completed',item:{type:'FileChange',changes:{link:{}}}}}]);
  await s.w.tick();s.advance(1000);
  assert.deepEqual(inferred(await s.w.tick()).map(e=>[e.kind,e.paths]),[['file_change',[target]]]);
});
