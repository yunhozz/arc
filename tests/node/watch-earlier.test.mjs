import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {makeHomes} from './fixtures/watch/homes.mjs';
import {followWatch, parseWatchArgs} from '../../lib/watch/index.mjs';
import {createWatcher} from '../../lib/watch/watcher.mjs';
import {WATCH_LIMITS as L} from '../../lib/watch/model.mjs';
import {displayWidth} from '../../lib/watch/text-width.mjs';

const TIME = Date.parse('2026-11-11T12:00:00Z');
const iso = ms => new Date(ms).toISOString();
const msg = (text, ms) => ({timestamp:iso(ms),type:'event_msg',
  payload:{type:'item_completed',item:{type:'UserMessage',content:[{text}]}}});
const history = (first, last) => Array.from({length:last-first+1}, (_, i) => {
  const n = first+i;
  return msg('event-'+n,TIME-10000+n);
});
const eventNumbers = output => [...output.matchAll(/event-(\d+)\b/g)].map(match => Number(match[1]));
const range = (first, last) => Array.from({length:last-first+1}, (_, i) => first+i);
const platform = 'codex';

function setup(t) {
  const h = makeHomes(t), cwd = fs.realpathSync(h.root);
  const git = () => null;
  const write = (id, lines, {dir=cwd,age=300000} = {}) =>
    h.writeRollout(['2026','11','11'], `rollout-${id}.jsonl`, [
      {timestamp:iso(TIME-20000),type:'session_meta',payload:{id,cwd:dir,originator:'codex-tui'}}, ...lines,
    ], {mtime:TIME-age});
  function watcher(options) {
    const w = createWatcher({options:{platforms:[platform],earlier:true,...options},
      homes:{codex:h.codexHome},scope:{kind:'dir',roots:[cwd],excludedRoots:[]},git,now:()=>TIME});
    t.after(() => w.close());
    return w;
  }
  async function follow(args, {tty=true,columns=120,color=false} = {}) {
    const input = Object.assign(new EventEmitter(), {isTTY:tty,setRawMode(){},resume(){},pause(){}});
    const output = Object.assign(new EventEmitter(), {isTTY:tty,columns,text:'',
      write(chunk){this.text += chunk;return true;}});
    let ready, tick, clock = TIME;
    const started = new Promise(resolve => ready = resolve);
    const controller = new AbortController();
    t.after(() => controller.abort());
    const done = followWatch(parseWatchArgs(args).options, {input,output,cwd,git,platforms:[platform],
      error:{write(chunk){throw Error(chunk);}},userHome:h.userHome,process:new EventEmitter(),
      env:color?{}:{NO_COLOR:'1'},signal:controller.signal,now:()=>clock,
      setInterval(fn){tick=fn;ready();return 1;},clearInterval(){}});
    await Promise.race([started,done.then(code => {throw Error(`watch exited before live: ${code}`);})]);
    return {output,key:byte=>input.emit('data',Buffer.from([byte])),
      step(){clock+=L.filePollMs;return tick();},
      async stop(){controller.abort();assert.equal(await done,0);}};
  }
  return {h,cwd,write,watcher,follow};
}

function earlier(w, count) {
  assert.equal(typeof w.earlier,'function','watcher exposes startup history pages');
  return w.earlier(count);
}

test('earlier pages come from events hidden by the tail slice', async t => {
  const s = setup(t), w = s.watcher({tail:10});
  s.write('tail',history(2,50));
  assert.deepEqual((await w.start()).filter(e=>e.kind==='user').map(e=>e.text),range(41,50).map(n=>'event-'+n));
  const first = earlier(w,20), second = earlier(w,20);
  assert.deepEqual(first.events.map(e=>e.text),range(21,40).map(n=>'event-'+n));
  assert.equal(first.remaining,20);
  assert.equal(second.events[0].kind,'session');
  assert.deepEqual(second.events.slice(1).map(e=>e.text),range(2,20).map(n=>'event-'+n));
  assert.equal(second.remaining,0);
  assert.deepEqual(earlier(w,20),{events:[],remaining:0});
});

test('page size is always 20', async t => {
  for (const tail of [5,50,0]) {
    const s = setup(t);
    s.write('fixed',history(1,100));
    const live = await s.follow(['--tail',String(tail)]);
    live.output.text='';
    live.key(0x08);
    assert.equal(eventNumbers(live.output.text).length,20,`tail ${tail}`);
    await live.stop();
  }
  assert.equal(L.earlierPage,20);
});

test('tail 0 keeps all startup events in the backlog', async t => {
  const s = setup(t), w = s.watcher({tail:0,verbose:true});
  s.write('zero',history(1,25));
  assert.ok((await w.start()).every(e=>e.source==='watch'));
  const page = earlier(w,20);
  assert.deepEqual(page.events.map(e=>e.text),range(6,25).map(n=>'event-'+n));
  assert.equal(page.remaining,6);
});

test('sessions outside the history window are included', async t => {
  const s = setup(t), w = s.watcher({tail:20});
  s.write('old',history(1,2),{age:700000});
  s.write('new',history(3,3));
  s.write('outside',history(4,4),{dir:path.dirname(s.cwd),age:700000});
  assert.deepEqual((await w.start()).filter(e=>e.kind==='user').map(e=>e.text),['event-3']);
  const page = earlier(w,20);
  assert.ok(page.events.every(e=>e.sessionId==='old'));
  assert.deepEqual(page.events.filter(e=>e.kind==='user').map(e=>e.text),['event-1','event-2']);
});

test('startup dispatch updates skipped by the history window are pageable', async t => {
  const s = setup(t);
  s.write('mapped',[]);
  s.h.writeMarker(platform,s.h.codexHome);
  s.h.writeLease({dispatchId:'old',sessionId:'mapped',state:'running',updatedAt:iso(TIME-700000)});
  // Scoped artifacts tie dispatch updates to this worktree.
  const gcd = path.join(s.cwd,'.git');
  s.h.writeArtifacts(gcd,'wf','dispatches/old',{'events.jsonl':'{"kind":"thread","threadId":"mapped"}\n'});
  const scoped = createWatcher({options:{platforms:[platform],earlier:true,tail:20},
    homes:{codex:s.h.codexHome},scope:{kind:'repo',roots:[s.cwd],excludedRoots:[],gitCommonDir:gcd},
    git:()=>null,now:()=>TIME});
  t.after(()=>scoped.close());
  assert.ok((await scoped.start()).every(e=>e.source!=='dispatch'));
  assert.deepEqual(earlier(scoped,20).events.filter(e=>e.source==='dispatch').map(e=>e.dispatchId),['old']);
});

test('backlog keeps the newest earlierMax events', async t => {
  const s = setup(t), w = s.watcher({tail:0});
  s.write('middle',history(701,1400));
  s.write('last',history(1401,2100));
  s.write('first',history(1,700));
  await w.start();
  const page = earlier(w,2001);
  assert.deepEqual(page.events.map(e=>e.text),range(101,2100).map(n=>'event-'+n));
  assert.equal(page.remaining,0);
  assert.equal(L.earlierMax,2000);
});

test('earlier is empty when disabled', async t => {
  const s = setup(t), w = s.watcher({earlier:false,tail:0});
  s.write('disabled',history(1,21));
  await w.start();
  assert.deepEqual(earlier(w,20),{events:[],remaining:0});
});

test('ctrl-h prints one page between separators without interleaving', async t => {
  const s = setup(t), file = s.write('order',history(1,50),{age:1000});
  const live = await s.follow(['--tail','10']);
  fs.appendFileSync(file,JSON.stringify(msg('new live event',TIME))+'\n');
  live.output.text='';
  const tick = live.step();
  live.key(0x08);
  const page = live.output.text;
  assert.match(page,/^\r\x1b\[2K\x1b\[1A\x1b\[2K── earlier 20 events · 21 more ──\n/);
  assert.deepEqual(eventNumbers(page),range(21,40));
  assert.ok(page.includes('── back to live ──\n'+s.cwd+'\n'),page);
  assert.match(page,/working…$/);
  await tick;
  assert.ok(live.output.text.indexOf('new live event') > live.output.text.indexOf('back to live'));
  await live.stop();
});

test('backspace 0x7f does not page', async t => {
  const s = setup(t);
  s.write('backspace',history(1,25));
  const live = await s.follow(['--tail','0']);
  live.output.text='';
  live.key(0x7f);
  assert.equal(live.output.text,'');
  live.key(0x08);
  assert.deepEqual(eventNumbers(live.output.text),range(6,25));
  await live.stop();
});

test('ctrl-h is inert without keys', async t => {
  for (const [args,tty] of [[['--json'],true],[[],false]]) {
    const s = setup(t);
    s.write('inactive',history(1,25));
    const live = await s.follow([...args,'--tail','0'],{tty});
    live.output.text='';
    live.key(0x08);
    assert.equal(live.output.text,'');
    await live.stop();
  }
});

test('earlier separators are clipped to width', async t => {
  const s = setup(t);
  s.write('narrow',history(1,2));
  const live = await s.follow(['--tail','0'],{columns:30,color:true});
  live.output.text='';
  live.key(0x08);
  const separators = live.output.text.match(/\x1b\[2m── [^\x1b\n]+\x1b\[0m/g) ?? [];
  assert.equal(separators.length,2);
  assert.deepEqual(separators.map(line=>displayWidth(line.replace(/\x1b\[[0-9;]*m/g,''))),[29,18]);
  await live.stop();
});

test('ctrl-l keeps the earlier position', async t => {
  const s = setup(t);
  s.write('clear',history(1,25));
  const live = await s.follow(['--tail','0']);
  live.output.text='';
  live.key(0x08);
  assert.deepEqual(eventNumbers(live.output.text),range(6,25));
  live.output.text='';
  live.key(0x0c);
  assert.match(live.output.text,/^\x1b\[H\x1b\[2J\x1b\[3J/);
  live.output.text='';
  live.key(0x08);
  assert.match(live.output.text,/── earlier 6 events · start of loaded history ──/);
  assert.deepEqual(eventNumbers(live.output.text),range(1,5));
  assert.match(live.output.text,/── back to live ──/);
  live.output.text='';
  live.key(0x08);
  assert.deepEqual(live.output.text.split('\n').filter(line=>line.includes('──'))
    .map(line=>line.replace(/[\r\x1b][^─]*/g,'')),['── no earlier events in loaded history ──']);
  await live.stop();
});
