import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseCodexMeta, normalizeCodexLine as normalize} from '../../lib/watch/normalize-codex.mjs';
const fixture = name => fs.readFileSync(new URL(`./fixtures/watch/${name}.jsonl`, import.meta.url),'utf8').trim().split('\n').map(JSON.parse);
const event = (type, rest={}) => normalize({type:'event_msg',payload:{type,...rest}});
const item = (type, rest={}) => event('item_completed',{item:{type,...rest}});
const safe = result => assert.doesNotMatch(JSON.stringify(result), /WATCH_MARKER_\w+/);

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
 assert.equal(parseCodexMeta({...row,payload:{...p,agent_role:'arc_qa'}}).agentRole,'arc_qa');
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
 assert.equal(item('FileChange',{changes:Object.fromEntries(Array.from({length:25},(_,i)=>[`/p${i}`,{}]))})[0].paths.length,20);
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
 for(const type of ['function_call','custom_tool_call']) for(const [args,text] of [[{agent_type:'arc_qa',task_name:'check',message:'WATCH_MARKER_spawn_message'},'arc_qa: check'],[{agent_type:'arc_qa'},'arc_qa'],[{},''],['broken','']]) {
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
