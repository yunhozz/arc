import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createClaudeState,parseClaudeHead,parseClaudeAgentMeta,normalizeClaudeLine} from '../../lib/watch/normalize-claude.mjs';
const fixture = name => fs.readFileSync(new URL(`./fixtures/watch/${name}.jsonl`,import.meta.url),'utf8').trim().split('\n').map(JSON.parse);
const assistant = (content, state=createClaudeState(), extra={}) => normalizeClaudeLine({type:'assistant',message:{content,...extra}},state);
const user = (content, state=createClaudeState(), extra={}) => normalizeClaudeLine({type:'user',message:{content},...extra},state);
const tool = (name,input={}) => assistant([{type:'tool_use',id:'id',name,input}]);

test('head finds the first line with cwd', () => {
 const head=fixture('claude-main').map(parseClaudeHead).find(Boolean);
 assert.deepEqual(head,{sessionId:'00000052-0000-7000-8000-000000000052',cwd:'/tmp/arc-watch-fixture/repo',entrypoint:'cli',version:'2.1.322'});
 assert.equal(parseClaudeHead({sessionId:'s'}),null);
 assert.equal(fixture('claude-bridge').map(parseClaudeHead).find(Boolean).entrypoint,'sdk-cli');
});
test('user text drops meta, tool results and reminder blocks', () => {
 assert.deepEqual(user('hello'),[{kind:'user',text:'hello'}]);
 assert.deepEqual(user('<system-reminder>WATCH_MARKER_reminder</system-reminder>hello'),[{kind:'user',text:'hello'}]);
 assert.deepEqual(user('<system-reminder>WATCH_MARKER_reminder</system-reminder>'),[]);
 assert.deepEqual(user('WATCH_MARKER_meta',undefined,{isMeta:true}),[]);
 assert.deepEqual(user('WATCH_MARKER_tool_output',undefined,{toolUseResult:{}}),[]);
 for(const tag of ['command-name','command-args','local-command-stdout','local-command-stderr','task-notification']) assert.deepEqual(user([{type:'text',text:`<${tag}>WATCH_MARKER_block</${tag}>hello`}]),[{kind:'user',text:'hello'}]);
});
test('unterminated private blocks drop the remaining text', () => {
 const result=user('hello <system-reminder>WATCH_MARKER_reminder');
 assert.deepEqual(result,[{kind:'user',text:'hello '}]);
 assert.doesNotMatch(JSON.stringify(result),/WATCH_MARKER_/);
});
test('unterminated reminder alone produces nothing', () => {
 assert.deepEqual(user('<system-reminder>WATCH_MARKER_reminder'),[]);
});
test('unterminated task notification produces nothing', () => {
 assert.deepEqual(user('<task-notification>WATCH_MARKER_task'),[]);
});
test('unterminated command blocks drop the remaining text', () => {
 for(const tag of ['command-name','command-args','local-command-stdout','local-command-stderr']) {
  assert.deepEqual(user(`before <${tag}>WATCH_MARKER_command`),[{kind:'user',text:'before '}]);
 }
});
test('uppercase unterminated private tags drop the remaining text', () => {
 const result=user('before<TASK-NOTIFICATION>WATCH_MARKER_secret');
 assert.doesNotMatch(JSON.stringify(result),/WATCH_MARKER_/);
 assert.deepEqual(result,[{kind:'user',text:'before'}]);
});
test('private block closing tags match regardless of case', () => {
 assert.deepEqual(user('<System-Reminder>x</SYSTEM-REMINDER>after'),[{kind:'user',text:'after'}]);
});
test('tool failures carry only the tool name', () => {
 const state=createClaudeState(); assistant([{type:'tool_use',id:'t1',name:'Bash',input:{command:'ls'}}],state);
 const result={type:'tool_result',tool_use_id:'t1',is_error:true,content:'WATCH_MARKER_tool_output'};
 assert.deepEqual(user([result],state),[{kind:'tool_failed',tool:'Bash'}]);
 assert.deepEqual(user([{...result,is_error:false}],state),[]);
 for(let i=0;i<600;i++) assistant([{type:'tool_use',id:`t${i}`,name:'Read',input:{}}],state);
 assert.deepEqual(user([result],state),[{kind:'tool_failed'}]);
});
test('assistant blocks map to agent, reasoning, command, edit, spawn, tool', () => {
 assert.deepEqual(assistant([{type:'text',text:'hello'},{type:'thinking',thinking:'plan',signature:'WATCH_MARKER_signature'},{type:'redacted_thinking',data:'WATCH_MARKER_redacted'}]),[{kind:'agent',text:'hello'},{kind:'reasoning',text:'plan'}]);
 assert.deepEqual(assistant([{type:'thinking',thinking:''}]),[]);
 assert.deepEqual(tool('Bash',{command:'a\nb'}),[{kind:'command',text:'a\nb'}]);
 for(const name of ['Edit','MultiEdit','Write','NotebookEdit']) assert.deepEqual(tool(name,{file_path:'/a',notebook_path:'/a',content:'WATCH_MARKER_file'}),[{kind:'file_change',paths:['/a']}]);
 for(const name of ['Agent','Task']) assert.deepEqual(tool(name,{subagent_type:'arc-routing-planner',description:'Native planner routing demo',prompt:'WATCH_MARKER_prompt'}),[{kind:'spawn',text:'arc-routing-planner: Native planner routing demo'}]);
 for(const [name,key] of [['Read','file_path'],['Grep','pattern'],['Glob','path'],['WebFetch','url'],['WebSearch','query']]) assert.deepEqual(tool(name,{[key]:'target'}),[{kind:'tool',tool:name,text:'target'}]);
 for(const name of ['mcp__srv__tool','Unknown']) assert.deepEqual(tool(name,{query:'WATCH_MARKER_input'}),[{kind:'tool',tool:name}]);
});
test('first model becomes settings once', () => {
 const state=createClaudeState(); assert.deepEqual(assistant([],state,{model:'model-a'}),[{kind:'settings',model:'model-a'}]);
 assert.deepEqual(assistant([],state,{model:'model-b'}),[]);
 assert.deepEqual(assistant([] ,createClaudeState(),{model:'model-c'}),[{kind:'settings',model:'model-c'}]);
});
test('end_turn and system errors per spike findings', () => {
 assert.deepEqual(assistant([],undefined,{stop_reason:'end_turn'}),[{kind:'turn_end'}]);
 for(const subtype of ['error','api_error','other']) assert.deepEqual(normalizeClaudeLine({type:'system',subtype,message:'WATCH_MARKER_error'},createClaudeState()),[]);
});
test('housekeeping types produce nothing', () => {
 for(const type of ['last-prompt','mode','permission-mode','session-owner','attachment','file-history-snapshot','cost-state','summary','queue-operation','atis-latch','custom-title','agent-name','relocated','environment','api-request-shape','api-request']) assert.deepEqual(normalizeClaudeLine({type,message:{role:'assistant',content:'WATCH_MARKER_private'}},createClaudeState()),[]);
});
test('api-request-blob lines are dropped even though they carry message.role', () => {
 const rows=fixture('claude-bridge').filter(r=>r.type==='api-request-blob'); assert.equal(rows.length,2);
 assert.deepEqual(rows.map(r=>r.message.role),['user','system']); for(const row of rows) assert.deepEqual(normalizeClaudeLine(row,createClaudeState()),[]);
});
test('agent meta parsing tolerates bad input', () => {
 const meta=JSON.parse(fs.readFileSync(new URL('./fixtures/watch/claude-subagent.meta.json',import.meta.url),'utf8'));
 assert.deepEqual(parseClaudeAgentMeta(meta),{agentType:'arc-routing-planner',description:'Native planner routing demo'});
 for(const input of ['not json',null,[],{},42]) assert.equal(parseClaudeAgentMeta(input),null);
});
test('all fixture markers stay private', () => {
 for(const name of ['claude-main','claude-bridge','claude-subagent']) {
 const state=createClaudeState(); for(const row of fixture(name)) assert.doesNotMatch(JSON.stringify([normalizeClaudeLine(row,state),parseClaudeHead(row)]),/WATCH_MARKER_\w+/);
 }
});
test('bad input never throws and timestamps remain raw', () => {
 for(const input of [null,undefined,'bad',[],{}, {type:'assistant',message:null}]) { assert.deepEqual(normalizeClaudeLine(input,createClaudeState()),[]); assert.equal(parseClaudeHead(input),null); }
 assert.deepEqual(normalizeClaudeLine({type:'user',timestamp:'raw',message:{content:'a\nb'}},createClaudeState()),[{ts:'raw',kind:'user',text:'a\nb'}]);
});
