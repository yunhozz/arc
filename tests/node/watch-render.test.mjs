import test from 'node:test';
import assert from 'node:assert/strict';
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
  for (const [kind, want] of [['command','CMD'],['tool_failed','TOOL!'],['turn_end','END'],['turn_failed','FAIL'],['turn_start','TURN'],['reasoning','THINK'],['file_change','EDIT'],['approval','APPROVE'],['other','ITEM'],['settings','SETTINGS'],['notice','NOTICE'],['dispatch','DISPATCH'],['session','SESSION'],['user','USER'],['agent','AGENT'],['spawn','SPAWN'],['error','ERROR'],['tool','TOOL']]) assert.equal(kindTag({kind}),want);
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
