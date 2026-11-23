import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as codex from '../../lib/watch/normalize-codex.mjs';
import {parseCodexMeta, normalizeCodexLine as normalize} from '../../lib/watch/normalize-codex.mjs';
const fixture = name => fs.readFileSync(new URL(`./fixtures/watch/${name}.jsonl`, import.meta.url),'utf8').trim().split('\n').map(JSON.parse);
const event = (type, rest={}) => normalize({type:'event_msg',payload:{type,...rest}});
const item = (type, rest={}) => event('item_completed',{item:{type,...rest}});
const safe = result => assert.doesNotMatch(JSON.stringify(result), /WATCH_MARKER_\w+/);
const H = '/h/.codex';
const cfg = {codexHome:H,userHome:'/h'};
const codexState = () => {
 assert.equal(typeof codex.createCodexState,'function');
 return codex.createCodexState();
};
const readLine = (parsed_cmd=[{type:'read',path:H+'/skills/arc/SKILL.md'}], rest={}) => ({
 type:'event_msg',payload:{type:'item_completed',item:{type:'CommandExecution',command:['cat','SKILL.md'],parsed_cmd,...rest}},
});

test('skill-only read emits SKILL then a skillOnly command', () => {
 const st=codexState();
 assert.deepEqual(normalize(readLine(undefined,{exit_code:0}),st,cfg),[
  {kind:'tool',tool:'read',skill:'arc'}, {kind:'command',text:'cat SKILL.md',exitCode:0,skillOnly:true},
 ]);
 assert.deepEqual(normalize(readLine([{type:'read',path:H+'/skills/other/SKILL.md'}]),st,cfg),[
  {kind:'tool',tool:'read',skill:'other'}, {kind:'command',text:'cat SKILL.md',skillOnly:true},
 ]);
});
test('.system skill name', () => {
 assert.deepEqual(normalize(readLine([{type:'read',path:H+'/skills/.system/openai-docs/SKILL.md'}]),codexState(),cfg),[
  {kind:'tool',tool:'read',skill:'openai-docs'}, {kind:'command',text:'cat SKILL.md',skillOnly:true},
 ]);
});
test('plugin cache skill', () => {
 assert.deepEqual(normalize(readLine([{type:'read',path:H+'/plugins/cache/m/p/v1/s/SKILL.md'}]),codexState(),cfg),[
  {kind:'tool',tool:'read',skill:'p:s',plugin:'p@m'}, {kind:'command',text:'cat SKILL.md',skillOnly:true},
 ]);
 assert.deepEqual(normalize(readLine([{type:'read',path:H+'/plugins/cache/m/SKILL.md'}]),codexState(),cfg),[
  {kind:'tool',tool:'read',skill:'m'}, {kind:'command',text:'cat SKILL.md',skillOnly:true},
 ]);
});
test('repository SKILL.md and search are not skills', () => {
 const st=codexState();
 for (const parsed of [
  [{type:'read',path:'/repo/claude/skill/SKILL.md'}],
  [{type:'search',path:H+'/skills/arc/SKILL.md'}],
  [{type:'read',path:H+'/skills-extra/arc/SKILL.md'}],
  [{type:'read',path:H+'/skills/arc/README.md'}],
  [{type:'read',path:42}], [], undefined,
 ]) assert.deepEqual(normalize(readLine(parsed ?? [],{}),st,cfg),[{kind:'command',text:'cat SKILL.md'}]);
});
test('failed read emits only the command', () => {
 const st=codexState();
 assert.deepEqual(normalize(readLine(undefined,{exit_code:1}),st,cfg),[{kind:'command',text:'cat SKILL.md',exitCode:1}]);
 assert.deepEqual(normalize(readLine(undefined,{exit_code:0}),st,cfg),[
  {kind:'tool',tool:'read',skill:'arc'}, {kind:'command',text:'cat SKILL.md',exitCode:0,skillOnly:true},
 ]);
});
test('mixed read keeps the command', () => {
 assert.deepEqual(normalize(readLine([{type:'read',path:H+'/skills/arc/SKILL.md'},{type:'unknown'}]),codexState(),cfg),[
  {kind:'tool',tool:'read',skill:'arc'}, {kind:'command',text:'cat SKILL.md'},
 ]);
});
test('same skill in one turn is announced once', () => {
 const st=codexState(), row=readLine();
 const first=[{kind:'tool',tool:'read',skill:'arc'},{kind:'command',text:'cat SKILL.md',skillOnly:true}];
 assert.deepEqual(normalize(row,st,cfg),first);
 assert.deepEqual(normalize(row,st,cfg),[{kind:'command',text:'cat SKILL.md',skillOnly:true}]);
 assert.deepEqual(normalize({type:'event_msg',payload:{type:'task_started'}},st,cfg),[{kind:'turn_start'}]);
 assert.deepEqual(normalize(row,st,cfg),first);
 for (let i=0;i<512;i++) normalize(readLine([{type:'read',path:H+`/skills/s${i}/SKILL.md`}]),st,cfg);
 assert.equal(st.announced.size,512);
 assert.deepEqual(normalize(row,st,cfg),first);
});
test('relative path resolves against item.cwd', () => {
 const st=codexState();
 const relative=readLine([{type:'read',path:'SKILL.md'}]);
 assert.deepEqual(normalize(relative,st,cfg),[{kind:'command',text:'cat SKILL.md'}]);
 st.cwd=H+'/skills/fallback';
 assert.deepEqual(normalize(readLine([{type:'read',path:'./SKILL.md'}],{cwd:H+'/skills/arc'}),st,cfg),[
  {kind:'tool',tool:'read',skill:'arc'}, {kind:'command',text:'cat SKILL.md',skillOnly:true},
 ]);
 assert.deepEqual(normalize(relative,st,cfg),[
  {kind:'tool',tool:'read',skill:'fallback'}, {kind:'command',text:'cat SKILL.md',skillOnly:true},
 ]);
 assert.equal(st.cwd,H+'/skills/fallback');
});
test('host_skills roots extend skill roots', () => {
 const st=codexState();
 const world = body => ({type:'world_state',payload:{state:{host_skills:{body}}}});
 assert.deepEqual(normalize(world('r1 = ~/x/skills\n`r2` = `/opt/skills`\nunknown format\nr3 = relative/path'),st,cfg),[]);
 assert.deepEqual(normalize(readLine([{type:'read',path:'/h/x/skills/foo/SKILL.md'},{type:'read',path:'/opt/skills/bar/SKILL.md'}]),st,cfg),[
  {kind:'tool',tool:'read',skill:'foo'}, {kind:'tool',tool:'read',skill:'bar'}, {kind:'command',text:'cat SKILL.md',skillOnly:true},
 ]);
 assert.deepEqual(normalize(world('unknown format'),st,cfg),[]);
 assert.deepEqual(normalize(readLine([{type:'read',path:'/h/x/skills/new/SKILL.md'}]),st,cfg),[{kind:'command',text:'cat SKILL.md'}]);
 const noHome=codexState();
 normalize(world('r1 = ~/x/skills\nr2 = ~'),noHome,{codexHome:H});
 assert.deepEqual(noHome.hostRoots,[]);
 normalize(world(Array.from({length:513},(_,i)=>`r${i} = /roots/${i}`).join('\n')),st,cfg);
 assert.equal(st.hostRoots.length,512);
 assert.deepEqual(normalize(readLine([{type:'read',path:'/roots/511/last/SKILL.md'}]),st,{}),[
  {kind:'tool',tool:'read',skill:'last'}, {kind:'command',text:'cat SKILL.md',skillOnly:true},
 ]);
 assert.deepEqual(normalize(readLine([{type:'read',path:'/roots/512/overflow/SKILL.md'}]),st,{}),[{kind:'command',text:'cat SKILL.md'}]);
});
test('McpToolCall pluginId becomes plugin', () => {
 const row={type:'event_msg',payload:{type:'item_completed',item:{type:'McpToolCall',server:'cua',tool:'repl',pluginId:'unified-computer-use@openai-bundled'}}};
 assert.deepEqual(normalize(row),[{kind:'tool',tool:'cua.repl',plugin:'unified-computer-use@openai-bundled'}]);
 assert.deepEqual(normalize(row,codexState(),cfg),[{kind:'tool',tool:'cua.repl',plugin:'unified-computer-use@openai-bundled'}]);
});
test('single-argument call is unchanged', () => {
 const row=readLine();
 assert.deepEqual(normalize(row),[{kind:'command',text:'cat SKILL.md'}]);
 for (const state of [undefined,null,0,'bad',[]]) assert.deepEqual(normalize(row,state,cfg),[{kind:'command',text:'cat SKILL.md'}]);
});

test('codexLineCwd reads only session_meta, turn_context and thread_settings_applied', () => {
 assert.equal(typeof codex.codexLineCwd,'function');
 for (const type of ['session_meta','turn_context']) assert.equal(codex.codexLineCwd({type,payload:{cwd:'/r/a'}}),'/r/a');
 assert.equal(codex.codexLineCwd({type:'event_msg',payload:{type:'thread_settings_applied',thread_settings:{cwd:'/r/a'}}}),'/r/a');
 for (const obj of [
  {type:'event_msg',payload:{type:'item_completed',item:{type:'CommandExecution',cwd:'/x'}}},
  {type:'world_state',payload:{state:{environments:{local:{cwd:'/x'}}}}},
  {type:'turn_context',payload:{cwd:''}},
  {type:'session_meta',payload:{cwd:1}},
  {type:'event_msg',payload:{type:'thread_settings_applied',thread_settings:{cwd:''}}},
  {type:'turn_context',payload:null},null,[],{},
 ]) assert.equal(codex.codexLineCwd(obj),undefined);
});

test('session_meta yields meta without instructions', () => {
 const row=fixture('codex-tui')[0], meta=parseCodexMeta(row);
 assert.deepEqual(meta,{threadId:row.payload.id,originator:'codex-tui',cwd:'/tmp/arc-watch-fixture/repo',cliVersion:'0.167.1',timestamp:row.payload.timestamp});
 safe(meta); assert.deepEqual(normalize(row),[{ts:row.timestamp,kind:'session'}]);
});
test('subagent session_meta exposes parent, depth and role', () => {
 const row=fixture('codex-subagent')[0], p=row.payload, meta=parseCodexMeta(row);
 assert.equal(meta.parentId,p.parent_thread_id); assert.equal(meta.depth,1); assert.equal(meta.agentRole,'arc_scouter'); assert.equal(meta.agentNickname,'Helmholtz'); assert.equal(meta.agentPath,p.agent_path);
 assert.equal(parseCodexMeta({...row,payload:{...p,source:{}}}).agentRole,'arc_scouter');
 const nested={...p}; for(const k of ['parent_thread_id','agent_role','agent_nickname','agent_path']) delete nested[k];
 assert.deepEqual(parseCodexMeta({...row,payload:nested}),meta);
 assert.equal(parseCodexMeta({...row,payload:{...p,agent_role:'arc_tester'}}).agentRole,'arc_tester');
});
test('command keeps the script and drops aggregated output', () => {
 assert.deepEqual(item('CommandExecution',{command:['/bin/zsh','-lc','git status'],exit_code:1,aggregated_output:'WATCH_MARKER_aggregated_output'}),[{kind:'command',text:'git status',exitCode:1}]);
 assert.deepEqual(item('CommandExecution',{command:['ls','-la']}),[{kind:'command',text:'ls -la'}]);
});
test('file change paths from object and array shapes, never diffs', () => {
 for(const type of ['FileChange','PatchApply']) {
 const result=item(type,{changes:{'/a/x.mjs':{type:'update',unified_diff:'WATCH_MARKER_unified_diff',move_path:'/a/y.mjs'}},stdout:'WATCH_MARKER_stdout',stderr:'WATCH_MARKER_stderr'});
 assert.deepEqual(result,[{kind:'file_change',paths:['/a/x.mjs','/a/y.mjs']}]); safe(result);
 }
 assert.deepEqual(item('FileChange',{changes:[{path:'/b'},{file:'/c'},{path:'/b'}]}),[{kind:'file_change',paths:['/b','/c']}]);
 assert.equal(item('FileChange',{changes:Object.fromEntries(Array.from({length:25},(_,i)=>[`/p${i}`,{}]))})[0].paths.length,25);
});
test('reasoning uses summary text only', () => {
 assert.deepEqual(item('Reasoning',{summary_text:[]}),[]);
 assert.deepEqual(item('Reasoning',{summary_text:['plan'],encrypted_content:'WATCH_MARKER_encrypted_content'}),[{kind:'reasoning',text:'plan'}]);
});
test('turn events', () => {
 assert.deepEqual(event('task_started'),[{kind:'turn_start'}]); assert.deepEqual(event('task_complete'),[{kind:'turn_end'}]);
 assert.deepEqual(event('task_complete',{error:{message:'boom'}}),[{kind:'turn_failed',text:'boom'}]);
 assert.deepEqual(event('turn_aborted',{reason:'interrupted'}),[{kind:'turn_end',text:'aborted: interrupted'}]);
});
test('settings, user, agent, approval, error rows', () => {
 assert.deepEqual(event('thread_settings_applied',{thread_settings:{model:'m',reasoning_effort:'high',approval_policy:'never'}}),[{kind:'settings',model:'m',effort:'high',approval:'never'}]);
 for(const [type,kind] of [['UserMessage','user'],['AgentMessage','agent']]) assert.deepEqual(item(type,{content:[{text:'a'},{text:'b'}]}),[{kind,text:'ab'}]);
 assert.deepEqual(event('exec_approval_request',{command:['ls','-la']}),[{kind:'approval',text:'ls -la'}]);
 assert.deepEqual(event('apply_patch_approval_request',{changes:[{path:'/a'}]}),[{kind:'approval',paths:['/a']}]);
 assert.deepEqual(event('error',{message:'boom'}),[{kind:'error',text:'boom'}]);
});
test('spawn calls from function and custom tool calls', () => {
 for(const type of ['function_call','custom_tool_call']) for(const [args,text] of [[{agent_type:'arc_tester',task_name:'check',message:'WATCH_MARKER_spawn_message'},'arc_tester: check'],[{agent_type:'arc_tester'},'arc_tester'],[{},''],['broken','']]) {
 assert.deepEqual(normalize({type:'response_item',payload:{type,namespace:'collaboration',name:'spawn_agent',arguments:typeof args==='string'?args:JSON.stringify(args)}}),[{kind:'spawn',tool:'spawn_agent',text}]);
 }
});
test('mcp, web search and unknown items', () => {
 assert.deepEqual(item('McpToolCall',{server:'srv',tool:'call',arguments:'WATCH_MARKER_tool_input',result:'WATCH_MARKER_mcp_result'}),[{kind:'tool',tool:'srv.call'}]);
 assert.deepEqual(item('Extension',{kind:'web.search',query:'query',results:'WATCH_MARKER_results',action:'WATCH_MARKER_action'}),[{kind:'tool',tool:'web.search',text:'query'}]);
 assert.deepEqual(item('Extension',{kind:'clock.sleep'}),[{kind:'other',text:'Extension:clock.sleep'}]);
 for(const type of ['SubAgentActivity','CollabAgentToolCall','ContextCompaction','Foo']) assert.deepEqual(item(type),[{kind:'other',text:type}]);
});
test('ignored lines produce nothing', () => {
 for(const type of ['message','agent_message','reasoning','function_call_output','custom_tool_call_output','additional_tools']) assert.deepEqual(normalize({type:'response_item',payload:{type,content:'WATCH_MARKER_developer'}}),[]);
 for(const type of ['turn_context','world_state','token_usage_record','inter_agent_communication_metadata']) assert.deepEqual(normalize({type}),[]);
 assert.deepEqual(event('token_count'),[]);
});
test('fixture sequence', () => {
 assert.deepEqual(fixture('codex-tui').flatMap(normalize).map(e=>e.kind),['session','turn_start','settings','user','agent','command','command','command','command','command','command','command','agent','turn_end']);
});
test('all fixture markers stay private', () => {
 for(const name of ['codex-tui','codex-exec','codex-subagent','codex-desktop-shapes']) for(const row of fixture(name)) { safe(normalize(row)); safe(parseCodexMeta(row)); }
});
test('bad input never throws and timestamps remain raw', () => {
 for(const value of [null,undefined,'bad',[],{}, {type:'event_msg',payload:null},{type:'event_msg',payload:{type:'item_completed',item:null}}]) { assert.deepEqual(normalize(value),[]); assert.equal(parseCodexMeta(value),null); }
 assert.deepEqual(normalize({timestamp:'raw',type:'event_msg',payload:{type:'error',message:'a\nb'}}),[{ts:'raw',kind:'error',text:'a\nb'}]);
});

test('file changes split added paths before updates and moves', () => {
  for (const type of ['FileChange','PatchApply']) {
    assert.deepEqual(item(type,{changes:{'/n':{type:'add'},'/u':{type:'update',move_path:'/m'}}}), [
      {kind:'file_create',paths:['/n']},{kind:'file_change',paths:['/u','/m']},
    ]);
    assert.deepEqual(item(type,{changes:{'/n':{type:'add'}}}), [{kind:'file_create',paths:['/n']}]);
    assert.deepEqual(item(type,{changes:{'/n':{add:{content:'private'}}}}), [{kind:'file_create',paths:['/n']}]);
    assert.deepEqual(item(type,{changes:[{path:'/n',type:'add'},{file:'/n2',kind:{type:'add'}},{path:'/u',type:'delete'}]}), [
      {kind:'file_create',paths:['/n','/n2']},{kind:'file_delete',paths:['/u']},
    ]);
    assert.deepEqual(item(type,{changes:{}}), [{kind:'file_change',paths:[]}]);
  }
  assert.deepEqual(event('apply_patch_approval_request',{changes:{'/n':{type:'add'}}}), [{kind:'approval',paths:['/n']}]);
});


test('file changes separate deletions from creates, updates and moves', () => {
  for (const type of ['FileChange','PatchApply']) {
    for (const change of [{type:'delete'}, {kind:{type:'delete'}}, {delete:{content:'WATCH_MARKER_deleted_content'}}]) {
      const result = item(type,{changes:{'/gone':change}});
      assert.deepEqual(result,[{kind:'file_delete',paths:['/gone']}]);
      safe(result);
    }
    assert.deepEqual(item(type,{changes:[
      {path:'/new',type:'add'}, {path:'/updated',type:'update',move_path:'/moved'},
      {path:'/gone',type:'delete'}, {file:'/gone2',kind:{type:'delete'}}, {path:'/gone',type:'delete'},
    ]}), [
      {kind:'file_create',paths:['/new']}, {kind:'file_change',paths:['/updated','/moved']},
      {kind:'file_delete',paths:['/gone','/gone2']},
    ]);
    const changes = Object.fromEntries(Array.from({length:25}, (_,i) => [`/gone${i}`,{type:'delete'}]));
    assert.equal(item(type,{changes})[0].paths.length,25);
  }
});

test('patch approvals and each file-change group preserve 25 unique paths', () => {
  const paths = Array.from({length:25},(_,i)=>`/p${i}`);
  assert.deepEqual(event('apply_patch_approval_request',{changes:paths.map(path=>({path}))})[0].paths,paths);
  for (const type of ['add','update','delete']) {
    assert.deepEqual(item('FileChange',{changes:[...paths.map(path=>({path,type})),{path:'/p0',type}]})[0].paths,paths);
  }
});
