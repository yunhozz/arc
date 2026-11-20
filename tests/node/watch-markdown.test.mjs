import test from 'node:test';
import assert from 'node:assert/strict';
import {renderMarkdown} from '../../lib/watch/markdown.mjs';
import {renderHuman, displayWidth} from '../../lib/watch/render.mjs';

const sgr = /\x1b\[[0-9;]*m/g;
const plain = line => line.replace(sgr, '');
const event = {ts:'2026-11-11T12:00:00Z', platform:'codex', kind:'agent'};
const render = (text, options) => renderHuman({...event, text}, {width:120, color:true, ...options});
const body = (text, options) => render(text, options).split('\n').map((line, index) =>
  index ? line.slice(25) : line.slice(line.indexOf('AGENT\x1b[0m') + 'AGENT\x1b[0m    '.length));

for (const [name, text, expected, styles] of [
  ['heading', '### 제목', ['제목'], [/\x1b\[32;1;4m제목/]],
  ['nested bullets', '- one\n  * two\n    + three', ['• one', '  • two', '    • three'], []],
  ['numbered', '  12. item', ['  12. item'], []],
  ['bold italic code', '**bold** *italic* `*literal*`', ['bold italic *literal*'],
    [/\x1b\[(?:0;)?32;1mbold/, /\x1b\[(?:0;)?32;3mitalic/, /\x1b\[(?:0;)?32;38;5;180m\*literal\*/]],
  ['bold before a Korean particle', '**굵게**와', ['굵게와'], [/\x1b\[32;1m굵게/]],
  ['italic before a Korean particle', '*기울임*은', ['기울임은'], [/\x1b\[32;3m기울임/]],
  ['fenced code', '```js\n  **literal**\n\n```\nafter', ['    **literal**', '', 'after'], [/\x1b\[32;2m {4}\*\*literal\*\*/]],
  ['quote', '> cited', ['│ cited'], [/\x1b\[32;2m│ cited/]],
  ['rule', '---\n***\n___', Array(3).fill('─'.repeat(40)), []],
  ['link', '[site](https://example.com)', ['site (https://example.com)'], []],
  ['table without delimiter stays raw', '| **x** | *y* | `z` |', ['| **x** | *y* | `z` |'], []],
  ['table without outer pipes or delimiter stays raw', '**x** | *y*', ['**x** | *y*'], []],
]) {
  test(`markdown renders ${name}`, () => {
    const lines = body(text);
    assert.deepEqual(lines.map(plain), expected);
    for (const style of styles) assert.match(lines.join('\n'), style);
  });
}

test('markdown keeps a fenced blank line empty in human output', () => {
  assert.equal(render('```\na\n\nb\n```').split('\n')[1], '');
});

const table = (text, width) => renderMarkdown(text, {width, baseCode:'32'});

test('table aligned with CJK cells, inline styles and row dividers', () => {
  const lines = table('왼쪽 | Center | R\n:--- | :---: | ---:\n**한글** | *가* | `123`\n가 | x | 9', Infinity);
  assert.deepEqual(lines.map(plain), [
    '┌──────┬────────┬─────┐',
    '│ 왼쪽 │ Center │   R │',
    '├──────┼────────┼─────┤',
    '│ 한글 │   가   │ 123 │',
    '├──────┼────────┼─────┤',
    '│ 가   │   x    │   9 │',
    '└──────┴────────┴─────┘',
  ]);
  assert.match(lines[1], /\x1b\[(?:0;)?32;1m왼쪽/);
  assert.match(lines[3], /\x1b\[(?:0;)?32;3m가/);
  assert.match(lines[3], /\x1b\[(?:0;)?32;38;5;180m123/);
  assert.ok(lines.every(line => displayWidth(plain(line)) === 23 && line.endsWith('\x1b[0m')));
});

test('table wraps cells when narrow', () => {
  const lines = table('| Item | Notes |\n| --- | --- |\n| **하나 둘셋** | 가나다라마 |', 19);
  assert.deepEqual(lines.map(plain), [
    '┌────────┬────────┐',
    '│ Item   │ Notes  │',
    '├────────┼────────┤',
    '│ 하나   │ 가나다 │',
    '│ 둘셋   │ 라마   │',
    '└────────┴────────┘',
  ]);
  assert.match(lines[4], /\x1b\[(?:0;)?32;1m둘셋/);
  assert.ok(lines.every(line => displayWidth(plain(line)) === 19 && line.endsWith('\x1b[0m')));
});

test('table falls back to cards and aligns wrapped values', () => {
  const lines = table('| Item | Note |\n| --- | --- |\n| 한글 이름 | **alpha beta** |\n| K | L |', 16);
  assert.deepEqual(lines.map(plain), [
    '▸ Item: 한글', '        이름', '  Note: alpha', '        beta', '', '▸ Item: K', '  Note: L',
  ]);
  assert.ok(lines.every(line => displayWidth(plain(line)) <= 16 && (!line || line.endsWith('\x1b[0m'))));
});

test('table cells keep escaped pipes and inline code', () => {
  const lines = table('| A | B |\n| --- | --- |\n| x\\|y | `p|q` | tail |\n| solo |', 60);
  assert.deepEqual(lines.map(plain), [
    '┌──────┬────────────┐',
    '│ A    │ B          │',
    '├──────┼────────────┤',
    '│ x|y  │ p|q | tail │',
    '├──────┼────────────┤',
    '│ solo │            │',
    '└──────┴────────────┘',
  ]);
  assert.match(lines[3], /\x1b\[(?:0;)?32;38;5;180mp\|q/);
});

test('wrap respects CJK width and resets each line', () => {
  const lines = body('  - **' + '한'.repeat(25) + '**\n```\n' + ' '.repeat(25) + '끝\n```', {width:45, wrap:true});
  assert.deepEqual(lines.map(plain), [
    '  • ' + '한'.repeat(8), '    ' + '한'.repeat(8), '    ' + '한'.repeat(8), '    한',
    ' '.repeat(20), ' '.repeat(9) + '끝',
  ]);
  assert.ok(lines.every(line => line.startsWith('\x1b[') && line.endsWith('\x1b[0m') && displayWidth(plain(line)) <= 20));
  assert.match(lines[1], /\x1b\[0;32;1m한/);
});

test('markdown never emits input-originated escapes', () => {
  const line = body('# **a\x1b[31mb**\x07\x00\x1b]8;;https://example.com\x07')[0];
  assert.equal(plain(line), 'ab');
  assert.doesNotMatch(line, /\x1b\[31m|https:\/\//);
});

test('markdown avoids emphasis false positives and tolerates open fence', () => {
  assert.deepEqual(body('a*b*c a**b**c snake_case * x* *y *\n```\n**literal**').map(plain), [
    'a*b*c a**b**c snake_case * x* *y *', '  **literal**',
  ]);
});

test('markdown preserves the role badge and continuation indent', () => {
  const lines = renderHuman({...event, role:'qa', text:'# 제목\n- 항목'}, {width:60, color:true, wrap:true}).split('\n');
  assert.match(lines[0], /\x1b\[1;38;5;16;48;5;228m QA \x1b\[0m$/);
  assert.deepEqual(lines.slice(1).map(plain), [' '.repeat(25) + '제목', ' '.repeat(25) + '• 항목']);
});

test('markdown keeps empty visual lines free of indentation and SGR', () => {
  const text = '# 제목\n\n- 항목';
  assert.deepEqual(renderMarkdown(text, {width:35, baseCode:'32'}), [
    '\x1b[32;1;4m제목\x1b[0m', '', '\x1b[32m• 항목\x1b[0m',
  ]);
  for (const kind of ['agent', 'prompt']) {
    const lines = renderHuman({...event, kind, text}, {width:60, color:true, wrap:true}).split('\n');
    assert.equal(lines[1], '');
    assert.equal(lines[2], ' '.repeat(25) + (kind === 'agent' ? '\x1b[32m' : '\x1b[35m') + '• 항목\x1b[0m');
  }
});
