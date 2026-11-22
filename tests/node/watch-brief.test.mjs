import test from 'node:test';
import assert from 'node:assert/strict';
import {briefLines, renderBrief} from '../../lib/watch/brief.mjs';
import {displayWidth} from '../../lib/watch/text-width.mjs';

const brief = {scope:'~/work/app', branch:'feat/x', platforms:['claude','codex']};
const options = {version:'0.5.0', keys:['Ctrl-C stop','Ctrl-H earlier','Ctrl-L clear']};
const strip = line => line.replace(/\x1b\[[0-9;]*m/g,'');

test('brief lines follow the approved order and wording', () => {
  const lines = briefLines(brief, options);
  assert.deepEqual(lines, ['arc watch 0.5.0','**Scope** ~/work/app (feat/x)',
    '**Platforms** CLAUDE · CODEX','**Keys** Ctrl-C stop · Ctrl-H earlier · Ctrl-L clear']);
  assert.doesNotMatch(lines.join('\n'), /worktrees|Routing|Sessions|History/);
  assert.equal(briefLines({...brief,branch:undefined}, options)[1], '**Scope** ~/work/app');
  assert.equal(briefLines(brief, {...options,keys:['Ctrl-C stop']})[3], '**Keys** Ctrl-C stop');
});

test('brief box never exceeds width and falls back when narrow', () => {
  const wideBrief = {...brief,scope:`~/${'긴경로'.repeat(30)}`};
  for (const width of [80,40,30,24,23,1]) {
    const lines = renderBrief(wideBrief, {...options,width,color:true}).map(strip);
    assert.ok(lines.every(line => displayWidth(line) <= width - 1), `width ${width}`);
    if (width >= 24) {
      assert.match(lines[0], /^┌/);
      assert.equal(displayWidth(lines[0]), width - 1);
      assert.match(lines[2], /^│ Scope {6}~\//);
      assert.match(lines[3], /^│ {12}[긴경로]/);
    } else {
      assert.ok(lines.every(line => !line.includes('┌')));
      if (width === 23) {
        assert.match(lines[1], /^Scope ~\/[긴경로]+$/);
        assert.match(lines[2], /^[긴경로]+/);
        assert.ok(lines.some(line => /^Platforms CLAUDE/.test(line)));
        assert.ok(lines.some(line => /^Keys Ctrl-C stop/.test(line)));
      }
    }
  }
});

test('brief box without color has no ANSI', () => {
  const plain = renderBrief(brief, {...options,width:80,color:false});
  const colored = renderBrief(brief, {...options,width:80,color:true});
  assert.equal(plain.length, 6);
  assert.match(plain[0], /^┌/);
  assert.equal(displayWidth(plain[0]), displayWidth('Platforms  ') + displayWidth(options.keys.join(' · ')) + 4);
  assert.doesNotMatch(plain.join('\n'), /\x1b/);
  assert.match(colored[0], /\x1b\[[0-9;]+m┌/);
  assert.match(colored[2], /\x1b\[[0-9;]*\b1mScope/);
  assert.deepEqual(colored.map(strip), plain);
});
