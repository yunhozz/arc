import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as claude from '../../lib/watch/normalize-claude.mjs';
import {createClaudeState,parseClaudeHead,parseClaudeAgentMeta,normalizeClaudeLine} from '../../lib/watch/normalize-claude.mjs';
import {WATCH_LIMITS} from '../../lib/watch/model.mjs';
const fixture = name => fs.readFileSync(new URL(`./fixtures/watch/${name}.jsonl`,import.meta.url),'utf8').trim().split('\n').map(JSON.parse);
const assistant = (content, state=createClaudeState(), extra={}) => normalizeClaudeLine({type:'assistant',message:{content,...extra}},state);
const user = (content, state=createClaudeState(), extra={}) => normalizeClaudeLine({type:'user',message:{content},...extra},state);
const tool = (name,input={}) => assistant([{type:'tool_use',id:'id',name,input}]);

test('Skill call with args is a skill tool event', () => {
 assert.deepEqual(normalizeClaudeLine({type:'assistant',timestamp:'raw',message:{content:[
  {type:'tool_use',id:'s1',name:'Skill',input:{skill:'arc',args:'x'}},
 ]}},createClaudeState()),[{kind:'tool',tool:'Skill',skill:'arc',text:'x',ts:'raw'}]);
 for (const args of ['',undefined,42]) {
  assert.deepEqual(tool('Skill',{skill:'arc',args}),[{kind:'tool',tool:'Skill',skill:'arc'}]);
 }
});
test('plugin skill keeps the prefix as plugin', () => {
 assert.deepEqual(tool('Skill',{skill:'anthropic-skills:docs'}),
  [{kind:'tool',tool:'Skill',skill:'anthropic-skills:docs',plugin:'anthropic-skills'}]);
 assert.deepEqual(tool('Skill',{skill:':docs'}),[{kind:'tool',tool:'Skill',skill:':docs'}]);
});
test('failed Skill carries skill and plugin', () => {
 for (const [skill,fields] of [['arc',{skill:'arc'}],
  ['anthropic-skills:docs',{skill:'anthropic-skills:docs',plugin:'anthropic-skills'}]]) {
  const state=createClaudeState();
  assistant([{type:'tool_use',id:'s1',name:'Skill',input:{skill,args:'private args'}}],state);
  assert.equal(state.tools.get('s1'),'Skill');
  assert.deepEqual(user([{type:'tool_result',tool_use_id:'s1',is_error:true,content:'private result'}],state),
   [{kind:'tool_failed',tool:'Skill',...fields}]);
 }
 const state=createClaudeState();
 for(let i=0;i<600;i++) assistant([{type:'tool_use',id:`s${i}`,name:'Skill',input:{skill:`skill-${i}`}}],state);
 assert.deepEqual(user([{type:'tool_result',tool_use_id:'s0',is_error:true}],state),[{kind:'tool_failed'}]);
 assert.deepEqual(user([{type:'tool_result',tool_use_id:'s599',is_error:true}],state),
  [{kind:'tool_failed',tool:'Skill',skill:'skill-599'}]);
});
test('Skill without input.skill stays plain', () => {
 for (const input of [{},{skill:null},{skill:42}]) {
  assert.deepEqual(tool('Skill',input),[{kind:'tool',tool:'Skill'}]);
 }
});
test('observed slash command yields one skill event', () => {
 const state=createClaudeState();
 const events=fixture('claude-slash-command').flatMap(line=>normalizeClaudeLine(line,state));
 assert.deepEqual(events.filter(event=>event.kind==='tool'),[
  {kind:'tool',tool:'/find-skills',skill:'find-skills',
   text:'테스트용 호출입니다. 도구를 쓰지 말고 한 문장으로만 답하세요.',ts:'2026-11-15T11:57:34.341Z'},
 ]);
 assert.equal(events.filter(event=>event.kind==='user').length,0);
 assert.doesNotMatch(JSON.stringify(events),/Base directory|# Find Skills|\/home\/u\/\.claude\/skills/);
});
test('builtin slash command without injection is not a skill', () => {
 for (const next of [{type:'user',message:{content:'hello'}},
  {type:'assistant',message:{content:[{type:'text',text:'hello'}]}}]) {
  const state=createClaudeState();
  const events=user('<command-name>/clear</command-name>',state);
  events.push(...normalizeClaudeLine(next,state));
  events.push(...user('Base directory for this skill: /private/path',state,{isMeta:true}));
  assert.equal(events.filter(event=>event.kind==='tool').length,0);
  assert.deepEqual(events,[{kind:next.type==='user' ? 'user' : 'agent',text:'hello'}]);
 }
});
test('slash pending survives attachment lines', () => {
 const state=createClaudeState();
 assert.deepEqual(user([{type:'text',text:'<command-name>/anthropic-skills:docs</command-name>'},
  {type:'text',text:'<command-args>first\nsecond</command-args>'}],state),[]);
 assert.deepEqual(normalizeClaudeLine({type:'attachment',attachment:{type:'file'}},state),[]);
 assert.deepEqual(user([{type:'text',text:'Base directory for this skill: /private/path\n# Secret body'}],state,{isMeta:true}),
  [{kind:'tool',tool:'/anthropic-skills:docs',skill:'anthropic-skills:docs',plugin:'anthropic-skills',text:'first\nsecond'}]);
 assert.deepEqual(user('Base directory for this skill: /private/path',state,{isMeta:true}),[]);
 for (const args of ['', '<command-args> \n </command-args>']) {
  user(`<command-name>/arc</command-name>${args}`,state);
  assert.deepEqual(user('Base directory for this skill: /private/path',state,{isMeta:true}),
   [{kind:'tool',tool:'/arc',skill:'arc'}]);
 }
});
test('plugin MCP tool name yields plugin', () => {
 for (const [name,fields] of [['mcp__plugin_p_srv__t',{plugin:'p'}],
  ['mcp__plugin_p__t',{}],['mcp__srv__t',{}],['mcp__plugin__t',{}],['mcp__plugin_p_srv',{}]]) {
  assert.deepEqual(tool(name,{query:'private input'}),[{kind:'tool',tool:name,...fields}]);
 }
});

test('claudeLineCwd returns string cwd only', () => {
 assert.equal(typeof claude.claudeLineCwd,'function');
 assert.equal(claude.claudeLineCwd({cwd:'/r'}),'/r');
 for (const obj of [{cwd:1},{cwd:''},{},null,[]]) assert.equal(claude.claudeLineCwd(obj),undefined);
});
test('Bash deletion paths use state.cwd when the line has no cwd', () => {
 const state=createClaudeState();
 assert.equal(state.cwd,undefined);
 state.cwd='/r/wt';
 assistant([{type:'tool_use',id:'b1',name:'Bash',input:{command:'rm a.txt'}}],state);
 assert.deepEqual(user([{type:'tool_result',tool_use_id:'b1'}],state),[{kind:'file_delete',paths:['/r/wt/a.txt']}]);
});

for (const marker of ['[Request interrupted by user]','[Request interrupted by user for tool use]']) {
 test(`user interrupt ${marker} ends the turn`, () => {
  assert.deepEqual(user([{type:'text',text:marker}]),[{kind:'turn_end',text:'interrupted by user'}]);
  assert.deepEqual(user([{type:'text',text:` \n${marker}\t`}],undefined,{timestamp:'raw'}),
   [{kind:'turn_end',text:'interrupted by user',ts:'raw'}]);
 });
}
test('ordinary user text and interrupt markers alongside other words stay user events', () => {
 for (const text of ['hello','before [Request interrupted by user]','[Request interrupted by user for tool use] after']) {
  assert.deepEqual(user([{type:'text',text}]),[{kind:'user',text}]);
 }
});
test('user interruption preserves tool failures on the same line', () => {
 const state=createClaudeState();
 assistant([{type:'tool_use',id:'t1',name:'Bash',input:{command:'ls'}}],state);
 assert.deepEqual(user([{type:'tool_result',tool_use_id:'t1',is_error:true},
  {type:'text',text:'[Request interrupted by user]'}],state),
  [{kind:'tool_failed',tool:'Bash'},{kind:'turn_end',text:'interrupted by user'}]);
});

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
test('Edit, MultiEdit and NotebookEdit file changes are marked claimBefore', () => {
 for (const [name,key] of [['Edit','file_path'],['MultiEdit','file_path'],['NotebookEdit','notebook_path']]) {
  assert.deepEqual(tool(name,{[key]:'/r/edit'}),[{kind:'file_change',paths:['/r/edit'],claimBefore:true}],name);
 }
 const state=createClaudeState();
 for (const [type,kind] of [['create','file_create'],['update','file_change']]) {
  assistant([{type:'tool_use',id:'write',name:'Write',input:{file_path:'/r/write'}}],state);
  assert.deepEqual(user([{type:'tool_result',tool_use_id:'write'}],state,{toolUseResult:{type}}),
   [{kind,paths:['/r/write']}]);
 }
 state.cwd='/r';
 assistant([{type:'tool_use',id:'rm',name:'Bash',input:{command:'rm -r dir'}}],state);
 assert.deepEqual(user([{type:'tool_result',tool_use_id:'rm'}],state),[{kind:'file_delete',paths:['/r/dir']}]);
});
test('a failed Edit result carries releasePaths; a successful one does not', () => {
 const state=createClaudeState();
 assistant([
  {type:'tool_use',id:'failed',name:'Edit',input:{file_path:'/r/failed'}},
  {type:'tool_use',id:'success',name:'Edit',input:{file_path:'/r/success'}},
  {type:'tool_use',id:'read',name:'Read',input:{file_path:'/r/read'}},
 ],state);
 const failure=id=>user([{type:'tool_result',tool_use_id:id,is_error:true}],state);
 assert.deepEqual(user([{type:'tool_result',tool_use_id:'success'}],state),[]);
 assert.deepEqual(failure('success'),[{kind:'tool_failed',tool:'Edit'}]);
 assert.deepEqual(failure('read'),[{kind:'tool_failed',tool:'Read'}]);
 assert.deepEqual(failure('failed'),[{kind:'tool_failed',tool:'Edit',releasePaths:['/r/failed']}]);
 assert.deepEqual(failure('failed'),[{kind:'tool_failed',tool:'Edit'}]);
});
test('edit path cache is bounded by toolCacheMax', () => {
 const state=createClaudeState();
 for (let i=0;i<=WATCH_LIMITS.toolCacheMax;i++) {
  assistant([{type:'tool_use',id:`edit-${i}`,name:'Edit',input:{file_path:`/r/${i}`}}],state);
 }
 const failure=i=>user([{type:'tool_result',tool_use_id:`edit-${i}`,is_error:true}],state);
 assert.deepEqual(failure(0),[{kind:'tool_failed'}]);
 assert.deepEqual(failure(1),[{kind:'tool_failed',tool:'Edit',releasePaths:['/r/1']}]);
});
test('assistant blocks map to agent, reasoning, command, edit, spawn, tool', () => {
 assert.deepEqual(assistant([{type:'text',text:'hello'},{type:'thinking',thinking:'plan',signature:'WATCH_MARKER_signature'},{type:'redacted_thinking',data:'WATCH_MARKER_redacted'}]),[{kind:'agent',text:'hello'},{kind:'reasoning',text:'plan'}]);
 assert.deepEqual(assistant([{type:'thinking',thinking:''}]),[]);
 assert.deepEqual(tool('Bash',{command:'a\nb'}),[{kind:'command',text:'a\nb'}]);
 for(const name of ['Edit','MultiEdit','NotebookEdit']) assert.deepEqual(tool(name,{file_path:'/a',notebook_path:'/a',content:'WATCH_MARKER_file'}),[{kind:'file_change',paths:['/a'],claimBefore:true}]);
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
for (const stop_reason of ['tool_use','end_turn']) {
 test(`SubagentHandback ends the turn once with stop_reason ${stop_reason}`, () => {
  assert.deepEqual(normalizeClaudeLine({type:'assistant',timestamp:'raw',message:{stop_reason,
   content:[{type:'tool_use',id:'handback',name:'SubagentHandback',input:{}}]}},createClaudeState()),
   [{kind:'tool',tool:'SubagentHandback',ts:'raw'},{kind:'turn_end',ts:'raw'}]);
 });
}
test('repeated SubagentHandback blocks end the message only once', () => {
 assert.deepEqual(assistant([
  {type:'tool_use',id:'first',name:'SubagentHandback',input:{}},
  {type:'tool_use',id:'second',name:'SubagentHandback',input:{}},
 ],undefined,{stop_reason:'end_turn'}),[
  {kind:'tool',tool:'SubagentHandback'},{kind:'turn_end'},
  {kind:'tool',tool:'SubagentHandback'},
 ]);
});
for (const stop_reason of ['tool_use','end_turn']) {
 test(`SubagentHandback message replaces the tool event with agent text (${stop_reason})`, () => {
  assert.deepEqual(normalizeClaudeLine({type:'assistant',timestamp:'raw',message:{stop_reason,
   content:[{type:'tool_use',id:'handback',name:'SubagentHandback',input:{message:'review complete\nnext step'}}]}},createClaudeState()),
   [{kind:'agent',text:'review complete\nnext step',ts:'raw'},{kind:'turn_end',ts:'raw'}]);
 });
}
test('SubagentHandback missing, empty and non-string messages keep the tool event', () => {
 for (const input of [{},{message:''},{message:null},{message:42},{message:{}},{message:[]}]) {
  assert.deepEqual(tool('SubagentHandback',input),[{kind:'tool',tool:'SubagentHandback'},{kind:'turn_end'}]);
 }
 assert.deepEqual(tool('SubagentHandback',{message:' \n'}),[{kind:'agent',text:' \n'},{kind:'turn_end'}]);
});
test('repeated SubagentHandback messages are all emitted with only one turn end', () => {
 assert.deepEqual(assistant([
  {type:'tool_use',id:'first',name:'SubagentHandback',input:{message:'first report'}},
  {type:'tool_use',id:'second',name:'SubagentHandback',input:{message:'second report'}},
  {type:'tool_use',id:'empty',name:'SubagentHandback',input:{message:''}},
 ],undefined,{stop_reason:'end_turn'}),[
  {kind:'agent',text:'first report'},{kind:'turn_end'},
  {kind:'agent',text:'second report'},{kind:'tool',tool:'SubagentHandback'},
 ]);
});
test('SubagentHandback results stay silent unless they fail', () => {
 const state=createClaudeState();
 assistant([{type:'tool_use',id:'handback',name:'SubagentHandback',input:{}}],state);
 const result={type:'tool_result',tool_use_id:'handback',content:'private output'};
 assert.deepEqual(user([result],state),[]);
 assert.deepEqual(user([{...result,is_error:true}],state),[{kind:'tool_failed',tool:'SubagentHandback'}]);
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


test('R1 M4 bash input and output blocks never expose markers', () => {
 for(const tag of ['bash-input','bash-stdout','bash-stderr']) {
  assert.deepEqual(user(`before<${tag}>WATCH_MARKER_output</${tag.toUpperCase()}>after`),[{kind:'user',text:'beforeafter'}]);
  assert.deepEqual(user(`before<${tag.toUpperCase()}>WATCH_MARKER_output`),[{kind:'user',text:'before'}]);
  assert.deepEqual(user(`<${tag}>WATCH_MARKER_output</${tag}>`),[]);
 }
});


test('AC-W29 compact summary becomes a notice without its private body', () => {
  for (const content of ['private\nsummary', [{type:'text',text:'private\nsummary'}]]) {
    assert.deepEqual(user(content, undefined, {isCompactSummary:true,isVisibleInTranscriptOnly:true}),
      [{kind:'notice',text:'compact summary (15 chars)'}]);
  }
});

test('Write waits for its result to classify creation or update without result text', () => {
  for (const [result,kind,paths] of [
    [{type:'create',filePath:'/new'},'file_create',['/new']],
    [{type:'update',filePath:'/existing'},'file_change',['/existing']],
    [{type:'create'},'file_create',['/input']],
    [{},'file_change',['/input']],
  ]) {
    const state = {modelSeen:false,tools:new Map()};
    assert.deepEqual(assistant([{type:'tool_use',id:'write',name:'Write',input:{file_path:'/input',content:'private'}}],state), []);
    const blocks = [{type:'tool_result',tool_use_id:'write',content:'private output'}];
    assert.deepEqual(user(blocks,state,{toolUseResult:result}), [{kind,paths}]);
    assert.deepEqual(user(blocks,state,{toolUseResult:result}), []);
  }
});
test('failed Write emits only tool_failed and consumes its pending path', () => {
  const state = createClaudeState();
  assistant([{type:'tool_use',id:'write',name:'Write',input:{file_path:'/input'}}],state);
  const block = {type:'tool_result',tool_use_id:'write',is_error:true,content:'private output'};
  assert.deepEqual(user([block],state,{toolUseResult:{type:'create',filePath:'/new'}}), [{kind:'tool_failed',tool:'Write'}]);
  assert.deepEqual(user([{...block,is_error:false}],state,{toolUseResult:{type:'create'}}), []);
});
test('pending Write paths are bounded without changing the tool-name cache', () => {
  const state = createClaudeState();
  for (let i=0;i<600;i++) assistant([{type:'tool_use',id:`w${i}`,name:'Write',input:{file_path:`/p${i}`}}],state);
  assert.deepEqual(user([{type:'tool_result',tool_use_id:'w0'}],state,{toolUseResult:{type:'create'}}), []);
  assert.deepEqual(user([{type:'tool_result',tool_use_id:'w599'}],state,{toolUseResult:{type:'create'}}), [{kind:'file_create',paths:['/p599']}]);
  assert.deepEqual(user([{type:'tool_result',tool_use_id:'w599',is_error:true}],state), [{kind:'tool_failed',tool:'Write'}]);
});

test('literal rm emits DELETE only after a successful matching result', () => {
  for (const command of ['rm /a', '/bin/rm -f -- /a', 'rm --force /a', "rm '/a b' \"/c d\"", 'cd /repo && rm -rf old']) {
    const state=createClaudeState();
    assert.deepEqual(assistant([{type:'tool_use',id:'rm',name:'Bash',input:{command}}],state), [{kind:'command',text:command}]);
    const paths = command.includes('cd ') ? ['/repo/old'] : command.includes('/a b') ? ['/a b','/c d'] : ['/a'];
    const block={type:'tool_result',tool_use_id:'rm',is_error:false,content:'WATCH_MARKER_output'};
    assert.deepEqual(user([block],state,{toolUseResult:{stdout:'WATCH_MARKER_stdout',interrupted:false}}), [{kind:'file_delete',paths}]);
    assert.deepEqual(user([block],state), []);
  }
});
test('rm resolves literal relative paths using the command cwd', () => {
  const state=createClaudeState();
  normalizeClaudeLine({type:'assistant',cwd:'/repo/sub',message:{content:[{type:'tool_use',id:'rm',name:'Bash',input:{command:'rm ../old ./gone'}}]}},state);
  assert.deepEqual(user([{type:'tool_result',tool_use_id:'rm'}],state), [{kind:'file_delete',paths:['/repo/old','/repo/sub/gone']}]);
});
test('failed, interrupted and background rm never emit DELETE', () => {
  for (const mode of ['failed','interrupted','background','auto-background']) {
    const state=createClaudeState();
    assistant([{type:'tool_use',id:'rm',name:'Bash',input:{command:'rm /a',run_in_background:mode==='background'}}],state);
    const block={type:'tool_result',tool_use_id:'rm',is_error:mode==='failed'};
    const out=user([block],state,{toolUseResult:{interrupted:mode==='interrupted',backgroundTaskId:mode==='auto-background' ? 'task' : undefined}});
    assert.deepEqual(out,mode==='failed' ? [{kind:'tool_failed',tool:'Bash'}] : []);
    assert.deepEqual(user([{...block,is_error:false}],state), []);
  }
});
test('ambiguous shell commands remain CMD without inferred deletions', () => {
  for (const command of ['echo rm /a', 'rm $FILE', 'rm "${FILE}"', 'rm *.md', 'rm ~/a', 'rm a; echo done', 'rm a && echo done', 'rm a || true', 'rm a | cat', 'rm > /a', 'rm $(pwd)/a', 'rm `pwd`/a', 'rm -i /a', 'rm --help', 'rm --unknown /a', 'rm', 'cd /repo; rm old', 'rm /a\nrm /b']) {
    const state=createClaudeState();
    assert.deepEqual(assistant([{type:'tool_use',id:'rm',name:'Bash',input:{command}}],state), [{kind:'command',text:command}]);
    assert.deepEqual(user([{type:'tool_result',tool_use_id:'rm'}],state), [] ,command);
  }
});
test('pending deletion cache is bounded and all paths are retained', () => {
  const state=createClaudeState();
  for(let i=0;i<600;i++) assistant([{type:'tool_use',id:`r${i}`,name:'Bash',input:{command:`rm /p${i}`}}],state);
  assert.deepEqual(user([{type:'tool_result',tool_use_id:'r0'}],state), []);
  assert.deepEqual(user([{type:'tool_result',tool_use_id:'r599'}],state), [{kind:'file_delete',paths:['/p599']}]);
  assistant([{type:'tool_use',id:'many',name:'Bash',input:{command:'rm ' + Array.from({length:25},(_,i)=>`/p${i}`).join(' ')}}],state);
  assert.equal(user([{type:'tool_result',tool_use_id:'many'}],state)[0].paths.length,25);
});


test('literal rm preserves quoted and escaped filenames and honors --', () => {
  for (const [command,paths] of [
    ["rm -- '-old'",['-old']],
    ["rm /한글\u00a0파일",['/한글\u00a0파일']],
    [String.raw`rm /a\ b`,['/a b']],
    ["rm '/a*' '/$FILE'",['/a*','/$FILE']],
    [String.raw`rm "/a\$b"`,['/a$b']],
    [String.raw`rm "/a\qb"`,[String.raw`/a\qb`]],
    ["cd -- '/repo with spaces' && rm 'old file'",['/repo with spaces/old file']],
  ]) {
    const state=createClaudeState();
    assistant([{type:'tool_use',id:'rm',name:'Bash',input:{command}}],state);
    assert.deepEqual(user([{type:'tool_result',tool_use_id:'rm'}],state), [{kind:'file_delete',paths}], command);
  }
});
test('unmatched results and incomplete shell syntax cannot report deletions', () => {
  for (const command of ["rm 'unterminated", 'rm "unterminated', 'rm /a &&', '&& rm /a', 'rm /a # comment', 'cd /repo && rm /a && rm /b', 'cd - && rm /a', 'rm /a\\']) {
    const state=createClaudeState();
    assistant([{type:'tool_use',id:'rm',name:'Bash',input:{command}}],state);
    assert.deepEqual(user([{type:'tool_result',tool_use_id:'other'}],state), []);
    assert.deepEqual(user([{type:'tool_result',tool_use_id:'rm'}],state), [], command);
  }
});

test('Claude Edit and Write retain all 25 reported file events', () => {
  const paths=Array.from({length:25},(_,i)=>`/p${i}`);
  const state=createClaudeState();
  for (const name of ['Edit','MultiEdit','NotebookEdit']) {
    const events=assistant(paths.map((file_path,i)=>({type:'tool_use',id:`e${i}`,name,input:{file_path}})),state);
    assert.deepEqual(events.map(e=>e.paths),paths.map(p=>[p]));
  }
  assert.deepEqual(assistant(paths.map((file_path,i)=>({type:'tool_use',id:`w${i}`,name:'Write',input:{file_path}})),state),[]);
  const events=user(paths.map((_,i)=>({type:'tool_result',tool_use_id:`w${i}`})),state,{toolUseResult:{type:'create'}});
  assert.deepEqual(events.map(e=>e.paths),paths.map(p=>[p]));
});
