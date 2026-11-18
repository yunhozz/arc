import test from 'node:test';
import assert from 'node:assert/strict';
import {watchLocationLabel, shimmerText, statusBlockLines} from '../../lib/watch/status-line.mjs';
import {displayWidth} from '../../lib/watch/render.mjs';
import {gradientAt, toAnsi256} from '../../lib/color/palette.mjs';

const strip = text => text.replace(/\x1b\[[0-9;]*m/g,'');
const base = {label:'~/project',busy:false,glyph:'⠋',tick:0,color:false,fancy:false,width:80};

test('watch location identifies session, all directories and home-relative paths', () => {
  for (const [options,expected] of [
    [{mode:'session',session:'abc',dir:'/tmp',home:'/home/u'},'session abc'],
    [{mode:'all',dir:'/tmp',home:'/home/u'},'all directories'],
    [{mode:'cwd',dir:'/home/u/proj',home:'/home/u'},'~/proj'],
    [{mode:'default',dir:'/home/u',home:'/home/u'},'~'],
    [{mode:'default',dir:'/home/user/proj',home:'/home/u'},'/home/user/proj'],
    [{mode:'cwd',dir:'/tmp/proj',home:'/home/u'},'/tmp/proj'],
  ]) assert.equal(watchLocationLabel(options),expected);
});

test('watch location sanitizes control sequences and line breaks after home abbreviation', () => {
  assert.equal(watchLocationLabel({mode:'cwd',dir:'/home/u/project\x1b]0;x\x07\n\rnext',home:'/home/u'}),'~/project next');
});

test('idle status keeps the location and busy status adds working on the next line', () => {
  assert.deepEqual(statusBlockLines(base),['~/project']);
  assert.deepEqual(statusBlockLines({...base,busy:true}),['~/project','⠋ working…']);
});

test('status uses no SGR without color and keeps dumb-terminal working text plain', () => {
  assert.doesNotMatch(statusBlockLines({...base,busy:true}).join('\n'),/\x1b/);
  const lines = statusBlockLines({...base,busy:true,color:true});
  assert.equal(lines[0],'\x1b[2m~/project\x1b[0m');
  assert.equal(lines[1],'⠋ working…');
});

test('status clips each line to width minus one display columns', () => {
  for (const color of [false,true]) for (const width of [1,2,3,10]) {
    const lines = statusBlockLines({...base,label:'한글👨‍👩‍👧‍👦e\u0301/project',busy:true,color,fancy:color,width});
    assert.equal(lines.length,2);
    for (const line of lines) assert.ok(displayWidth(strip(line)) <= width-1);
    if (width===10) {
      assert.equal(strip(lines[0]),'한글👨‍👩‍👧‍👦e\u0301/p');
      assert.equal(strip(lines[1]),'⠋ working');
    }
  }
});

test('fancy status dims only the glyph and colors every working character', () => {
  const line = statusBlockLines({...base,busy:true,color:true,fancy:true})[1];
  assert.ok(line.startsWith('\x1b[2m⠋\x1b[0m '));
  assert.equal(strip(line),'⠋ working…');
  assert.equal((line.match(/\x1b\[38;5;\d+m/g)??[]).length,8);
  assert.ok(line.endsWith('\x1b[0m'));
});

test('shimmer preserves text and changes the per-character palette with the tick', () => {
  const first = shimmerText('working…',0), later = shimmerText('working…',5);
  assert.equal(strip(first),'working…');
  assert.equal(strip(later),'working…');
  assert.notDeepEqual(first.match(/\x1b\[38;5;\d+m/g),later.match(/\x1b\[38;5;\d+m/g));
  assert.equal(shimmerText('w',0),'\x1b[38;5;158mw\x1b[0m');
  assert.equal(shimmerText('w',2),'\x1b[38;5;195mw\x1b[0m');
});

test('watch shimmer repeats every 18 ticks', () => {
  for (let tick = 0; tick <= 40; tick++) {
    assert.equal(shimmerText('working…',tick),shimmerText('working…',tick+18),`working… tick ${tick}`);
    assert.equal(shimmerText('w',tick),shimmerText('w',tick+18),`w tick ${tick}`);
  }
});

test('watch shimmer rests on ticks 0, 12 and 13–17 and lights ticks 1–11', () => {
  const base = shimmerText('working…',15);
  const colors = [...base.matchAll(/\x1b\[38;5;(\d+)m/g)].map(match => Number(match[1]));
  assert.equal(colors.length,8);
  for (let i = 0; i < colors.length; i++) {
    assert.equal(colors[i],toAnsi256(gradientAt(i/7)),`base color ${i}`);
  }
  for (const tick of [0,12,13,14,15,16,17]) {
    assert.equal(shimmerText('working…',tick),base,`rest tick ${tick}`);
  }
  for (let tick = 1; tick <= 11; tick++) {
    assert.notEqual(shimmerText('working…',tick),base,`lit tick ${tick}`);
  }
});
