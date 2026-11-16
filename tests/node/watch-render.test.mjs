import test from 'node:test';
import assert from 'node:assert/strict';
import * as renderer from '../../lib/watch/render.mjs';
import {renderHuman, renderJson, kindTag} from '../../lib/watch/render.mjs';
const event = {ts:'2026-11-11T00:01:15.000Z',platform:'codex',label:'tui#e2e8',kind:'command',text:'git status',exitCode:0};
const options = {width:120, color:false, verbose:false};
test('SKILL and PLUGIN tags, bodies and colors', () => {
  const rows = [
    [{kind:'tool',tool:'Skill',skill:'arc',text:'x'}, 'SKILL    arc', '38;5;110'],
    [{kind:'tool',tool:'cua_repl.js',plugin:'unified-computer-use@openai-bundled'}, 'PLUGIN   unified-computer-use@openai-bundled cua_repl.js', '38;5;175'],
    [{kind:'tool_failed',tool:'Skill',skill:'arc'}, 'TOOL!    Skill arc', '31'],
    [{kind:'tool_failed',tool:'srv.t',plugin:'p'}, 'TOOL!    srv.t p', '31'],
    [{kind:'tool',tool:'Skill',skill:'a:b',plugin:'a'}, 'SKILL    a:b', '38;5;110'],
  ];
  for (const [input,want,code] of rows) for (const color of [false,true]) {
    const out = renderHuman({...event,...input,text:input.text}, {...options,color});
    assert.equal(out.replace(/\x1b\[[0-9;]*m/g,'').slice(16),want);
    if (color) {
      assert.ok(out.includes(`\x1b[${code}m${want.split(' ')[0]}\x1b[0m`));
      assert.ok(out.endsWith(`\x1b[${code}m${want.slice(9)}\x1b[0m`));
    } else assert.doesNotMatch(out,/\x1b/);
  }
});
test('renderJson includes skill and plugin', () => {
  assert.deepEqual(JSON.parse(renderJson({kind:'tool',tool:'Skill',skill:'a:b',plugin:'a'})),
    {v:1,kind:'tool',tool:'Skill',skill:'a:b',plugin:'a'});
  assert.deepEqual(JSON.parse(renderJson({kind:'tool_failed',tool:'Skill',skill:'\x1b[31marc',plugin:'token=hidden'})),
    {v:1,kind:'tool_failed',tool:'Skill',skill:'arc',plugin:'token=***'});
});
test('displayPath shortens only absolute paths inside the root', () => {
  assert.equal(typeof renderer.displayPath, 'function');
  for (const [file, root, want] of [
    ['/repo/arc/docs/x.md','/repo/arc','arc/docs/x.md'],
    ['/repo/arc','/repo/arc','arc'],
    ['/private/tmp/x','/repo/arc','/private/tmp/x'],
    ['/repo/arc-other/x','/repo/arc','/repo/arc-other/x'],
    ['docs/x.md','/repo/arc','docs/x.md'],
    ['/repo/arc/x','repo/arc','/repo/arc/x'],
    ['/repo/arc/x',undefined,'/repo/arc/x'],
  ]) assert.equal(renderer.displayPath(file,root),want);
});
test('CREATE, EDIT and DELETE keep all paths and colors even below prefix width', () => {
  const file = '/repo/arc/docs/' + 'long-name-'.repeat(20) + '.md';
  for (const kind of ['file_create','file_change','file_delete']) for (const width of [40,10]) {
    for (const color of [false,true]) {
      const out = renderHuman({...event,kind,text:'updated',root:'/repo/arc',paths:[file,'/private/tmp/outside.md']}, {...options,width,color});
      const plain = out.replace(/\x1b\[[0-9;]*m/g,'');
      assert.equal(plain.slice(25), 'updated\n' + ' '.repeat(25) + 'arc/docs/' + 'long-name-'.repeat(20) + '.md\n' + ' '.repeat(25) + '/private/tmp/outside.md');
      assert.ok(!plain.includes('…'));
      assert.equal(plain.split('\n').length,3);
      if (color) assert.match(out,/\x1b\[/);
    }
  }
});
test('renderHuman has no label column', () => {
  const line = renderHuman(event, options);
  assert.match(line.slice(0,8), /^\d\d:\d\d:\d\d$/);
  assert.equal(line.slice(0,8), new Date(event.ts).toLocaleTimeString('en-GB',{hour12:false}));
  assert.equal(line.slice(9,15), 'CODEX ');
  assert.ok(!line.includes('tui#e2e8'));
  assert.equal(line.slice(16,24), 'CMD     ');
  assert.equal(line.slice(25), 'git status');
  assert.equal(renderHuman({...event,ts:'invalid',observedAt:event.ts}, options).slice(0,8), line.slice(0,8));
});
test('kind tags follow the spec table', () => {
  for (const [kind, want] of [['command','CMD'],['tool_failed','TOOL!'],['turn_end','END'],['turn_failed','FAIL'],['turn_start','TURN'],['reasoning','THINK'],['file_change','EDIT'],['file_create','CREATE'],['file_delete','DELETE'],['approval','APPROVE'],['other','ITEM'],['settings','SETTINGS'],['notice','NOTICE'],['dispatch','DISPATCH'],['session','SESSION'],['user','USER'],['agent','AGENT'],['spawn','SPAWN'],['error','ERROR'],['tool','TOOL']]) assert.equal(kindTag({kind}),want);
  assert.equal(kindTag({kind:'command',exitCode:2}), 'CMD');
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
  assert.equal(renderHuman(input,options).slice(25), '/a/x.mjs\n' + ' '.repeat(25) + '/a/y.mjs');
  assert.equal(renderHuman({...input,text:'updated'},options).slice(25), 'updated\n' + ' '.repeat(25) + '/a/x.mjs\n' + ' '.repeat(25) + '/a/y.mjs');
});
test('renderHuman sanitizes and masks tool targets and file paths', () => {
  assert.equal(renderHuman({kind:'tool',tool:'WebFetch',text:'https://user:pw@host/x'},options).slice(25), 'WebFetch https://***@host/x');
  assert.equal(renderHuman({kind:'tool_failed',tool:'\x1b[31mBash'},options).slice(25), 'Bash');
  assert.equal(renderHuman({kind:'file_change',text:'updated\nfiles',paths:['https://user:pw@host/x','\x1b[31m/a/y.mjs']},options).slice(25), 'updated files\n' + ' '.repeat(25) + 'https://***@host/x\n' + ' '.repeat(25) + '/a/y.mjs');
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


test('agent tags stay AGENT regardless of roles or label tails', () => {
  for (const input of [
    {role:'implementer'},
    {source:'subagent',label:'main#7f77/general-purpose'},
    {source:'subagent',label:'tui#e2e8/qa/' + 'N'.repeat(25)},
    {source:'subagent',label:'tui#e2e8/' + '😀'.repeat(21)},
    {source:'session',label:'tui#e2e8'},
    {source:'bridge',role:'planner',label:'planner@b9a1'},
    {source:'bridge',label:'planner@b9a1'},
    {source:'subagent',label:'unknown'},
    {role:'N'.repeat(21)},
  ]) assert.equal(kindTag({kind:'agent',...input}), 'AGENT');
  assert.equal(kindTag({kind:'command',role:'qa',exitCode:0}), 'CMD');
});
const arcRoles = [['scouter','Scouter'],['planner','Planner'],['implementer','Implementer'],
  ['qa','QA'],['reviewer','Reviewer'],['orchestrator','Orchestrator']];
test('ARC agent roles prefix only the first body line with a background badge', () => {
  for (const [role,name] of arcRoles) for (const color of [false,true]) {
    const out = renderHuman({...event,kind:'agent',role,text:'a\n\nb'}, {...options,color});
    assert.deepEqual(strip(out).split('\n').map(line => line ? line.slice(25) : ''), [`${name} a`,'','b']);
    assert.equal(strip(out).slice(16,25), 'AGENT    ');
    if (color) {
      assert.match(out,new RegExp(`\\x1b\\[1;38;5;\\d+;48;5;\\d+m${name}\\x1b\\[0m`));
      assert.ok(out.endsWith(`${name}\x1b[0m\x1b[32m a\x1b[0m\n\n` + ' '.repeat(25) + '\x1b[32mb\x1b[0m'));
      assert.equal((out.match(/48;5;/g) ?? []).length,1);
    } else assert.doesNotMatch(out,/\x1b/);
  }
});
test('non-ARC agents and non-agent events never gain a role prefix', () => {
  for (const input of [
    {kind:'agent',source:'subagent',label:'main/general-purpose'},
    {kind:'agent',source:'session',label:'main'},
    {kind:'agent',source:'bridge',label:'planner@b9a1'},
    {kind:'agent',role:'general-purpose'}, {kind:'agent',role:'😀'},
    {kind:'agent',role:'toString'}, {kind:'agent',role:'__proto__'},
    {kind:'user',role:'qa'}, {kind:'command',role:'qa'},
  ]) for (const color of [false,true]) {
    assert.equal(strip(renderHuman({...event,...input,text:'a\nb'}, {...options,color})).slice(25),
      input.kind === 'command' ? 'a b' : 'a\n' + ' '.repeat(25) + 'b');
  }
});
test('empty ARC agent messages render only the AGENT tag', () => {
  for (const [role] of arcRoles) for (const text of [undefined,'',' \n\t\n ']) for (const color of [false,true]) {
    const out = renderHuman({...event,kind:'agent',role,text}, {...options,color});
    assert.equal(strip(out).slice(16), 'AGENT');
    assert.doesNotMatch(out,/\x1b\[1m/);
  }
});
test('ARC agent role prefixes leave JSON role and message fields unchanged', () => {
  for (const [role] of arcRoles) {
    assert.deepEqual(JSON.parse(renderJson({kind:'agent',role,text:'first\nsecond'})),
      {v:1,kind:'agent',role,text:'first\nsecond'});
  }
});
test('tag colors follow the table and include the parenthesized part', () => {
  const table = [[{kind:'user'},'1;35','USER'],[{kind:'agent',role:'qa'},'32','AGENT'],
    [{kind:'command'},'38;5;242','CMD'],[{kind:'command',exitCode:0},'38;5;242','CMD'],
    [{kind:'command',exitCode:1},'38;5;242','CMD'],[{kind:'command',exitCode:-1},'38;5;242','CMD'],
    [{kind:'file_change'},'33','EDIT'],[{kind:'file_create'},'38;5;69','CREATE'],[{kind:'file_delete'},'31','DELETE'],[{kind:'tool'},'2','TOOL'],[{kind:'spawn'},'38;5;141','SPAWN'],
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
  for (const [input,name,code] of [[{platform:'codex'},'CODEX','36'],[{platform:'claude'},'CLAUDE','38;5;208'],[{source:'watch',platform:'codex'},'watch','2'],[{},'arc','2']]) {
    assert.ok(renderHuman({...input,kind:'notice',text:'t'}, {...options,color:true}).includes(`\x1b[${code}m${name.padEnd(6)}\x1b[0m`));
  }
});
test('body color matches tag color without attributes', () => {
  const table = [[{kind:'user'},'35'],[{kind:'agent'},'32'],
    [{kind:'command'},'38;5;242'],[{kind:'command',exitCode:0},'38;5;242'],
    [{kind:'command',exitCode:1},'38;5;242'],[{kind:'command',exitCode:-1},'38;5;242'],
    [{kind:'file_change'},'33'],[{kind:'file_create'},'38;5;69'],[{kind:'file_delete'},'31'],[{kind:'tool'},'2'],[{kind:'spawn'},'38;5;141'],
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
  const table = [[{kind:'user'},'USER'],[{kind:'agent',role:'qa'},'AGENT'],
    [{kind:'command'},'CMD'],[{kind:'command',exitCode:0},'CMD'],
    [{kind:'command',exitCode:1},'CMD'],[{kind:'command',exitCode:-1},'CMD'],
    [{kind:'file_change'},'EDIT'],[{kind:'file_create'},'CREATE'],[{kind:'file_delete'},'DELETE'],[{kind:'tool'},'TOOL'],[{kind:'spawn'},'SPAWN'],
    [{kind:'dispatch',state:'t'},'DISPATCH'],[{kind:'approval'},'APPROVE'],
    [{kind:'turn_failed'},'FAIL'],[{kind:'error'},'ERROR'],[{kind:'tool_failed'},'TOOL!'],
    [{kind:'session'},'SESSION'],[{kind:'turn_end'},'END'],[{kind:'notice'},'NOTICE'],
    [{kind:'settings'},'SETTINGS'],[{kind:'turn_start'},'TURN'],[{kind:'reasoning'},'THINK'],[{kind:'other'},'ITEM']];
  for (const [input,tag] of table) {
    const line = renderHuman({platform:'codex',...input,text:'t'}, {...options,verbose:true});
    assert.equal(line, `00:00:00 CODEX  ${tag.padEnd(8)} ${input.kind === 'agent' ? 'QA ' : ''}t`);
    assert.doesNotMatch(line,/\x1b/);
  }
});
test('message lines are colored per line with uncolored indentation', () => {
  assert.ok(renderHuman({...event,kind:'command',exitCode:1,text:'node --test'}, {...options,color:true}).endsWith('\x1b[38;5;242mnode --test\x1b[0m'));
  for (const input of [{kind:'turn_failed'},{kind:'error'},{kind:'tool_failed'}]) {
    assert.ok(renderHuman({...event,...input,text:'node --test'}, {...options,color:true}).endsWith('\x1b[31mnode --test\x1b[0m'));
  }
  const lines = renderHuman({...event,kind:'agent',role:'implementer',text:'a\n\nb'}, {...options,color:true}).split('\n');
  const prefixLen = 25;
  assert.equal(lines[1],'');
  assert.equal(lines[2],' '.repeat(prefixLen) + '\x1b[32mb\x1b[0m');
  assert.equal(renderHuman(event,{...options,width:10,color:true}),renderHuman(event,{...options,width:10}));
});

test('file creation renders CREATE with text and paths', () => {
  const input = {...event,kind:'file_create',text:'created',paths:['/a/new.mjs']};
  assert.equal(renderHuman(input,options).slice(16), 'CREATE   created\n' + ' '.repeat(25) + '/a/new.mjs');
  assert.equal(renderer.tagColor(input), '38;5;69');
  assert.equal(renderer.bodyColor(input), '38;5;69');
});


test('file deletion renders DELETE and preserves paths in JSON', () => {
  const input = {...event,kind:'file_delete',text:'deleted',paths:['/a/gone.mjs']};
  assert.equal(renderHuman(input,options).slice(16), 'DELETE   deleted\n' + ' '.repeat(25) + '/a/gone.mjs');
  assert.deepEqual(JSON.parse(renderJson(input)).paths, input.paths);
  assert.equal(JSON.parse(renderJson(input)).kind, 'file_delete');
});

const strip = value => value.replace(/\x1b\[[0-9;]*m/g,'');
test('EDIT lists each path in input order with separately colored bodies', () => {
  const paths = ['/a/third','/a/first','/a/second'];
  const plain = renderHuman({...event,kind:'file_change',text:undefined,paths},options);
  assert.equal(plain.slice(25), '/a/third\n' + ' '.repeat(25) + '/a/first\n' + ' '.repeat(25) + '/a/second');
  const colored = renderHuman({...event,kind:'file_change',text:undefined,paths},{...options,color:true});
  assert.equal(strip(colored),plain);
  assert.ok(colored.endsWith('\x1b[33m/a/third\x1b[0m\n' + ' '.repeat(25) + '\x1b[33m/a/first\x1b[0m\n' + ' '.repeat(25) + '\x1b[33m/a/second\x1b[0m'));
});
test('empty file bodies preserve prefix spacing and ignore empty entries', () => {
  for (const kind of ['file_change','file_create','file_delete']) for (const color of [false,true]) {
    assert.equal(strip(renderHuman({...event,kind,text:'',paths:[]},{...options,color})).slice(16),kindTag({kind}).padEnd(8) + ' ');
    assert.equal(strip(renderHuman({...event,kind,text:' \n ',paths:['',' /a\nfile ']},{...options,color})).slice(25),'/a file');
  }
});
test('displayWidth counts graphemes using terminal display columns', () => {
  assert.equal(typeof renderer.displayWidth,'function');
  for (const [text,width] of [['abc',3],['한글',4],['😀',2],['👨‍👩‍👧',2],['e\u0301',1],['é',1],['❤️',2],['\u0301\u200b\u200d\ufe0f',0],['Ａ',2],['𠀀',2]]) {
    assert.equal(renderer.displayWidth(text),width,text);
  }
});
test('wrapLine prefers the last fitting space and otherwise preserves graphemes', () => {
  assert.equal(typeof renderer.wrapLine,'function');
  for (const [text,avail,want] of [
    ['one two three',8,['one two','three']],
    ['abcdefghij',4,['abcd','efgh','ij']],
    ['한글이모지',4,['한글','이모','지']],
    ['👨‍👩‍👧😀e\u0301',3,['👨‍👩‍👧','😀e\u0301']],
    ['  one two three',9,['  one two','three']],
    ['exact',5,['exact']],['',5,['']],
  ]) assert.deepEqual(renderer.wrapLine(text,avail),want);
});
test('displayWidth counts default emoji presentation as two columns', () => {
  for (const text of ['✅','❌','⚡','⭐','🚀','🛑','🟠','🩰']) {
    assert.equal(renderer.displayWidth(text),2,text);
  }
});
test('wrapLine does not emit indentation-only pieces before a long token', () => {
  for (const [text,avail,want] of [
    ['  abcdefghij',6,['  abcd','efghij']],
    ['        abcdefghij',4,['abcd','efgh','ij']],
  ]) {
    const lines=renderer.wrapLine(text,avail);
    assert.deepEqual(lines,want);
    assert.ok(lines.every(line=>line.trim().length>0));
  }
});
test('messages and file paths wrap to display width with uncolored continuation indentation', () => {
  assert.equal(typeof renderer.displayWidth,'function');
  for (const kind of ['user','agent','file_change','file_create','file_delete']) for (const color of [false,true]) {
    const text = '한글 😀 👨‍👩‍👧 e\u0301 '.repeat(20).trim();
    const input = {...event,kind,text,...(kind.startsWith('file_') ? {paths:['/repo/' + '한😀'.repeat(30)]} : {})};
    const out = renderHuman(input,{...options,width:60,wrap:true,color});
    const lines = strip(out).split('\n');
    assert.ok(lines.length > 2);
    assert.ok(lines.every(line => renderer.displayWidth(line) <= 60));
    assert.ok(lines.slice(1).every(line => line.startsWith(' '.repeat(25)) && line[25] !== ' '));
    if (color) assert.ok(out.split('\n').slice(1).every(line => line.startsWith(' '.repeat(25) + '\x1b[')));
    const body = lines.map((line,i)=>line.slice(25)).join('').replaceAll(' ','');
    assert.equal(body, (text + (input.paths?.[0] ?? '')).replaceAll(' ',''));
  }
});
test('wrapping is opt-in and disabled when available body width is below 20', () => {
  const input = {...event,kind:'user',text:'한글'.repeat(50)};
  for (const settings of [{width:60},{width:60,wrap:false},{width:40,wrap:true}]) {
    assert.equal(renderHuman(input,{...options,...settings}).slice(25),input.text);
  }
  assert.equal(renderHuman(input,{...options,width:45,wrap:true}).split('\n').length,10);
});
test('explicit message newlines and blank lines survive soft wrapping', () => {
  const out = renderHuman({...event,kind:'user',text:'x'.repeat(40) + '\n\n  short\n' + 'y'.repeat(36)}, {...options,width:60,wrap:true}).split('\n');
  assert.deepEqual(out.map(line => line ? line.slice(25) : ''),['x'.repeat(35),'xxxxx','','  short','y'.repeat(35),'y']);
});
test('ARC role prefixes count toward wrap width without repeating on continuations', () => {
  for (const [role,name] of arcRoles) for (const color of [false,true]) {
    const out = renderHuman({...event,kind:'agent',role,text:'x'.repeat(30) + '\n' + 'y'.repeat(40)},
      {...options,width:60,wrap:true,color});
    const lines = strip(out).split('\n');
    const firstBodyLines = role === 'qa' ? ['QA ' + 'x'.repeat(30)] : [name,'x'.repeat(30)];
    assert.deepEqual(lines.map(line => line.slice(25)),[...firstBodyLines,'y'.repeat(35),'yyyyy']);
    assert.ok(lines.every(line => renderer.displayWidth(line) <= 60));
    assert.ok(lines.slice(1).every(line => line.startsWith(' '.repeat(25))));
    if (color) assert.match(out,new RegExp(`\\x1b\\[1;38;5;\\d+;48;5;\\d+m${name}\\x1b\\[0m`));
  }
});
test('wrapping leaves clipped one-line events byte-identical', () => {
  for (const kind of ['command','tool','dispatch']) for (const color of [false,true]) for (const width of [10,60]) {
    const input = {...event,kind,text:'x'.repeat(100),tool:'Read',state:'running',route:'bridge',workflowId:'w'.repeat(100)};
    const out = renderHuman(input,{...options,width,color,wrap:true});
    assert.equal(out,renderHuman(input,{...options,width,color,wrap:false}));
    if (kind==='command' && !color && width===60) assert.equal(out,new Date(event.ts).toLocaleTimeString('en-GB',{hour12:false}) + ' CODEX  CMD      ' + 'x'.repeat(34) + '…');
  }
});
test('human and JSON file events preserve all 25 reported paths', () => {
  const paths = Array.from({length:25},(_,i)=>`/p${i}`);
  const input = {...event,kind:'file_change',text:undefined,paths};
  const json = JSON.parse(renderJson(input));
  assert.equal(json.v,1);
  assert.deepEqual(json.paths,paths);
  assert.deepEqual(renderHuman(input,options).split('\n').map(line=>line.slice(25)),paths);
});

test('JSON retains inferred file provenance without changing human output', () => {
  const input={...event,kind:'file_change',paths:['/repo/golden'],text:undefined};
  assert.equal(JSON.parse(renderJson({...input,inferred:true})).inferred,true);
  assert.equal('inferred' in JSON.parse(renderJson(input)),false);
  assert.equal(renderHuman({...input,inferred:true},options),renderHuman(input,options));
});
