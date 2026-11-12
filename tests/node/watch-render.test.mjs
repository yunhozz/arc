import test from 'node:test';
import assert from 'node:assert/strict';
import * as renderer from '../../lib/watch/render.mjs';
import {renderHuman, renderJson, kindTag} from '../../lib/watch/render.mjs';
const event = {ts:'2026-11-11T00:01:15.000Z',platform:'codex',label:'tui#e2e8',kind:'command',text:'git status',exitCode:0};
const options = {width:120, color:false, verbose:false};
test('renderHuman has no label column', () => {
  const line = renderHuman(event, options);
  assert.match(line.slice(0,8), /^\d\d:\d\d:\d\d$/);
  assert.equal(line.slice(0,8), new Date(event.ts).toLocaleTimeString('en-GB',{hour12:false}));
  assert.equal(line.slice(9,15), 'codex ');
  assert.ok(!line.includes('tui#e2e8'));
  assert.equal(line.slice(16,24), 'CMD(0)  ');
  assert.equal(line.slice(25), 'git status');
  assert.equal(renderHuman({...event,ts:'invalid',observedAt:event.ts}, options).slice(0,8), line.slice(0,8));
});
test('kind tags follow the spec table', () => {
  for (const [kind, want] of [['command','CMD'],['tool_failed','TOOL!'],['turn_end','END'],['turn_failed','FAIL'],['turn_start','TURN'],['reasoning','THINK'],['file_change','EDIT'],['file_create','CREATE'],['approval','APPROVE'],['other','ITEM'],['settings','SETTINGS'],['notice','NOTICE'],['dispatch','DISPATCH'],['session','SESSION'],['user','USER'],['agent','AGENT'],['spawn','SPAWN'],['error','ERROR'],['tool','TOOL']]) assert.equal(kindTag({kind}),want);
  assert.equal(kindTag({kind:'command',exitCode:2}), 'CMD(2)');
});
test('non-message lines still clip to width', () => {
  const line = renderHuman({...event,label:'tui#e2e8/qa/Aristotle/Plato',text:'x'.repeat(500)}, {...options,width:80});
  assert.ok([...line].length <= 80);
  assert.ok(line.endsWith('…'));
  assert.ok(!line.includes('Plato'));
  assert.ok([...renderHuman(event,{...options,width:40})].length <= 40);
});
test('platform column for notices and unknown dispatch platform', () => {
  assert.equal(renderHuman({source:'watch',kind:'notice'},options).slice(9,15),'watch ');
  assert.equal(renderHuman({kind:'dispatch'},options).slice(9,15),'arc   ');
});
test('dispatch text lists state, route, workflow and raw reasons', () => {
  const input = {kind:'dispatch',state:'failed',route:'bridge',workflowId:'wf-3',reasons:['host_sandbox_blocked','custom_reason_xyz'],hostPlatform:'codex'};
  assert.equal(renderHuman(input,options).slice(25),'failed bridge wf-3 host_sandbox_blocked,custom_reason_xyz');
  assert.equal(renderHuman(input,{...options,verbose:true,width:200}).slice(25),'failed bridge wf-3 host_sandbox_blocked,custom_reason_xyz host=codex');
});
test('color only when requested', () => {
  assert.match(renderHuman(event,{...options,color:true}), /\x1b\[/);
  assert.doesNotMatch(renderHuman(event,options), /\x1b\[/);
});
test('renderJson writes schema v1 without nulls and clips text to 1000 code points', () => {
  const output = renderJson({...event,text:'😀'.repeat(1500),tool:null,model:undefined});
  const parsed = JSON.parse(output);
  assert.equal(parsed.v,1);
  assert.ok(Object.values(parsed).every(value => value !== null && value !== undefined));
  assert.equal([...parsed.text].length,1000);
  assert.equal(parsed.truncated,true);
  assert.ok(!output.endsWith('\n'));
  assert.doesNotMatch(output,/\x1b/);
});
test('both renderers sanitize and mask text, paths and tool targets', () => {
  const input = {...event,text:'\x1b[31mPASSWORD=hunter2',tool:'Read https://user:pw@host/x',paths:['secret=hidden'],stdout:'never show'};
  for (const output of [renderHuman(input,options),renderJson(input)]) {
    assert.doesNotMatch(output,/hunter2|user:pw|hidden|never show|\x1b/);
    assert.match(output,/\*\*\*/);
  }
  const parsed = JSON.parse(renderJson(input));
  assert.equal(parsed.tool,'Read https://***@host/x');
  assert.deepEqual(parsed.paths,['secret=***']);
});
test('renderHuman includes tool names and targets', () => {
  assert.equal(renderHuman({kind:'tool',tool:'Read',text:'lib/cli/root.mjs'},options).slice(25), 'Read lib/cli/root.mjs');
  assert.equal(renderHuman({kind:'tool',text:'lib/cli/root.mjs'},options).slice(25), 'lib/cli/root.mjs');
});
test('renderHuman includes failed tool names without text', () => {
  assert.equal(renderHuman({kind:'tool_failed',tool:'Bash'},options).slice(25), 'Bash');
});
test('renderHuman includes file change paths after optional text', () => {
  const input = {kind:'file_change',paths:['/a/x.mjs','/a/y.mjs']};
  assert.equal(renderHuman(input,options).slice(25), '/a/x.mjs /a/y.mjs');
  assert.equal(renderHuman({...input,text:'updated'},options).slice(25), 'updated /a/x.mjs /a/y.mjs');
});
test('renderHuman sanitizes and masks tool targets and file paths', () => {
  assert.equal(renderHuman({kind:'tool',tool:'WebFetch',text:'https://user:pw@host/x'},options).slice(25), 'WebFetch https://***@host/x');
  assert.equal(renderHuman({kind:'tool_failed',tool:'\x1b[31mBash'},options).slice(25), 'Bash');
  assert.equal(renderHuman({kind:'file_change',text:'updated\nfiles',paths:['https://user:pw@host/x','\x1b[31m/a/y.mjs']},options).slice(25), 'updated files https://***@host/x /a/y.mjs');
});

test('message lines keep full text with hanging indent', () => {
  const long = 'x'.repeat(1500);
  for (const kind of ['user','agent']) for (const color of [false,true]) {
    const out = renderHuman({...event,kind,text:`first\n  second\n\n${long}`}, {...options,width:40,color}).replace(/\x1b\[[0-9;]*m/g,'').split('\n');
    const indent = ' '.repeat(25);
    assert.deepEqual(out.slice(1), [indent + '  second', '', indent + long]);
    assert.ok(out[0].endsWith(` ${kind.toUpperCase().padEnd(8)} first`));
    assert.ok(!out.join('\n').includes('…'));
  }
});
test('empty message renders the prefix only', () => {
  for (const text of ['', ' \n\t\n ']) for (const color of [false,true]) {
    const out = renderHuman({...event,kind:'user',text}, {...options,color}).replace(/\x1b\[[0-9;]*m/g,'');
    assert.equal(out.slice(16), 'USER');
  }
});
test('renderJson keeps full message text with newlines and no truncated', () => {
  const text = 'a\n' + '😀'.repeat(1500);
  for (const kind of ['user','agent']) {
    const parsed = JSON.parse(renderJson({...event,kind,text,truncated:true}));
    assert.equal(parsed.text, text);
    assert.equal('truncated' in parsed, false);
    assert.equal(parsed.label, 'tui#e2e8');
  }
});


test('AGENT tag shows role, subagent label tail or plain AGENT', () => {
  for (const [input, tag] of [
    [{role:'implementer'}, 'AGENT(implementer)'],
    [{source:'subagent',label:'main#7f77/general-purpose'}, 'AGENT(general-purpose)'],
    [{source:'subagent',label:'tui#e2e8/qa/' + 'N'.repeat(25)}, 'AGENT(' + 'N'.repeat(19) + '…)'],
    [{source:'subagent',label:'tui#e2e8/' + '😀'.repeat(21)}, 'AGENT(' + '😀'.repeat(19) + '…)'],
    [{source:'session',label:'tui#e2e8'}, 'AGENT'],
    [{source:'bridge',role:'planner',label:'planner@b9a1'}, 'AGENT(planner)'],
    [{source:'bridge',label:'planner@b9a1'}, 'AGENT'],
    [{source:'subagent',label:'unknown'}, 'AGENT'],
    [{role:'N'.repeat(21)}, 'AGENT(' + 'N'.repeat(19) + '…)'],
  ]) assert.equal(kindTag({kind:'agent',...input}), tag);
  assert.equal(kindTag({kind:'command',role:'qa',exitCode:0}), 'CMD(0)');
});
test('continuation indent follows a long AGENT tag', () => {
  for (const input of [{role:'planner'}, {role:'implementer'}, {source:'subagent',label:'parent/' + 'N'.repeat(25)}]) {
    for (const color of [false,true]) {
      const lines = renderHuman({...event,...input,kind:'agent',text:'a\nb'}, {...options,color}).replace(/\x1b\[[0-9;]*m/g,'').split('\n');
      const tag = input.role ? `AGENT(${input.role})` : 'AGENT(' + 'N'.repeat(19) + '…)';
      assert.ok(lines[0].endsWith(tag + ' a'));
      assert.equal(lines[1], ' '.repeat(17 + [...tag].length) + 'b');
    }
  }
});
test('tag colors follow the table and include the parenthesized part', () => {
  const table = [[{kind:'user'},'1;35','USER'],[{kind:'agent',role:'qa'},'32','AGENT(qa)'],
    [{kind:'command'},'38;5;242','CMD'],[{kind:'command',exitCode:0},'38;5;242','CMD(0)'],
    [{kind:'command',exitCode:1},'31','CMD(1)'],[{kind:'command',exitCode:-1},'31','CMD(-1)'],
    [{kind:'file_change'},'33','EDIT'],[{kind:'file_create'},'38;5;69','CREATE'],[{kind:'tool'},'2','TOOL'],[{kind:'spawn'},'38;5;141','SPAWN'],
    [{kind:'dispatch'},'38;5;137','DISPATCH'],[{kind:'approval'},'1;4','APPROVE'],
    [{kind:'turn_failed'},'31','FAIL'],[{kind:'error'},'31','ERROR'],[{kind:'tool_failed'},'31','TOOL!'],
    ...['session','turn_end','notice','settings','turn_start','reasoning','other'].map(kind => [{kind},'2',kindTag({kind})])];
  for (const [input,code,tag] of table) {
    const line = renderHuman({ts:event.ts,platform:'codex',...input,text:'t'}, {...options,color:true,verbose:true});
    assert.ok(line.includes(`\x1b[${code}m${tag}\x1b[0m`), tag);
    assert.ok(line.includes(`\x1b[${code}m${tag}\x1b[0m${' '.repeat(Math.max(0,8-[...tag].length))} `), tag + ' padding');
    assert.equal(renderer.tagColor(input),code);
    assert.notEqual(code,'36'); assert.notEqual(code,'38;5;208');
  }
});
test('platform colors: codex 36, claude 38;5;208, watch and arc 2', () => {
  assert.deepEqual(renderer.PLATFORM_COLORS,{codex:'36',claude:'38;5;208',other:'2'});
  for (const [input,name,code] of [[{platform:'codex'},'codex','36'],[{platform:'claude'},'claude','38;5;208'],[{source:'watch',platform:'codex'},'watch','2'],[{},'arc','2']]) {
    assert.ok(renderHuman({...input,kind:'notice',text:'t'}, {...options,color:true}).includes(`\x1b[${code}m${name.padEnd(6)}\x1b[0m`));
  }
});
test('body color matches tag color without attributes', () => {
  const table = [[{kind:'user'},'35'],[{kind:'agent',role:'qa'},'32'],
    [{kind:'command'},'38;5;242'],[{kind:'command',exitCode:0},'38;5;242'],
    [{kind:'command',exitCode:1},'31'],[{kind:'command',exitCode:-1},'31'],
    [{kind:'file_change'},'33'],[{kind:'file_create'},'38;5;69'],[{kind:'tool'},'2'],[{kind:'spawn'},'38;5;141'],
    [{kind:'dispatch',state:'t'},'38;5;137'],[{kind:'approval'},''],
    [{kind:'turn_failed'},'31'],[{kind:'error'},'31'],[{kind:'tool_failed'},'31'],
    ...['session','turn_end','notice','settings','turn_start','reasoning','other'].map(kind => [{kind},'2'])];
  for (const [input,body] of table) {
    const line = renderHuman({...event,...input,text:'t'}, {...options,color:true,verbose:true});
    assert.ok(line.endsWith(body ? `\x1b[${body}mt\x1b[0m` : ' t'), input.kind);
    assert.equal(renderer.bodyColor(input),body);
  }
});
test('color off output is byte-identical for every kind', () => {
  const table = [[{kind:'user'},'USER'],[{kind:'agent',role:'qa'},'AGENT(qa)'],
    [{kind:'command'},'CMD'],[{kind:'command',exitCode:0},'CMD(0)'],
    [{kind:'command',exitCode:1},'CMD(1)'],[{kind:'command',exitCode:-1},'CMD(-1)'],
    [{kind:'file_change'},'EDIT'],[{kind:'file_create'},'CREATE'],[{kind:'tool'},'TOOL'],[{kind:'spawn'},'SPAWN'],
    [{kind:'dispatch',state:'t'},'DISPATCH'],[{kind:'approval'},'APPROVE'],
    [{kind:'turn_failed'},'FAIL'],[{kind:'error'},'ERROR'],[{kind:'tool_failed'},'TOOL!'],
    [{kind:'session'},'SESSION'],[{kind:'turn_end'},'END'],[{kind:'notice'},'NOTICE'],
    [{kind:'settings'},'SETTINGS'],[{kind:'turn_start'},'TURN'],[{kind:'reasoning'},'THINK'],[{kind:'other'},'ITEM']];
  for (const [input,tag] of table) {
    const line = renderHuman({platform:'codex',...input,text:'t'}, {...options,verbose:true});
    assert.equal(line, `00:00:00 codex  ${tag.padEnd(8)} t`);
    assert.doesNotMatch(line,/\x1b/);
  }
});
test('message lines are colored per line with uncolored indentation', () => {
  for (const input of [{kind:'command',exitCode:1},{kind:'turn_failed'},{kind:'error'},{kind:'tool_failed'}]) {
    assert.ok(renderHuman({...event,...input,text:'node --test'}, {...options,color:true}).endsWith('\x1b[31mnode --test\x1b[0m'));
  }
  const lines = renderHuman({...event,kind:'agent',role:'implementer',text:'a\n\nb'}, {...options,color:true}).split('\n');
  const prefixLen = [...lines[0].replace(/\x1b\[[0-9;]*m/g,'')].length - 1;
  assert.equal(lines[1],'');
  assert.equal(lines[2],' '.repeat(prefixLen) + '\x1b[32mb\x1b[0m');
  assert.equal(renderHuman(event,{...options,width:10,color:true}),renderHuman(event,{...options,width:10}));
});

test('file creation renders CREATE with text and paths', () => {
  const input = {...event,kind:'file_create',text:'created',paths:['/a/new.mjs']};
  assert.equal(renderHuman(input,options).slice(16), 'CREATE   created /a/new.mjs');
  assert.equal(renderer.tagColor(input), '38;5;69');
  assert.equal(renderer.bodyColor(input), '38;5;69');
});
