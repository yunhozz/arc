import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {makeTerminal} from './helpers/tui-terminal.mjs';
import {cellWidth} from '../../lib/tui/render.mjs';

const file = new URL('../../lib/watch/worktree-menu.mjs',import.meta.url);
async function menu() {
  assert.ok(fs.existsSync(file),'worktree menu is missing');
  return import(file.href);
}
const home = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'arc-worktree-menu-'));
after(()=>fs.rmSync(home,{recursive:true,force:true}));
const mainRoot = home+'/work/app', now = 1800000;
const roots = [mainRoot,mainRoot+'/.claude/worktrees/result-brief',home+'/.codex/worktrees/7f3a/app',home+'/work/hotfix'];
const worktrees = [
  {root:roots[0],branch:'main'},
  {root:roots[1],branch:'feat/brief'},
  {root:roots[2],detached:true,head:'1a2b3c456'},
  {root:roots[3],branch:'hotfix',locked:true},
];
const groups = new Map([
  [roots[0],{sessions:1,platforms:new Set(['codex']),lastActivity:now-120000}],
  [roots[1],{sessions:2,platforms:new Set(['codex','claude']),lastActivity:now-240000}],
  [roots[2],{sessions:1,platforms:new Set(['codex']),lastActivity:now-1080000}],
]);
const options = {mainRoot,home,currentRoot:mainRoot,now,width:120,color:true};

test('worktree rows show path, branch, activity and markers', async () => {
  const {worktreeMenuRows} = await menu();
  const {rows} = worktreeMenuRows(worktrees,groups,options);
  assert.match(rows[0],/^~\/work\/app +main +here · ● 2m ago · 1 session · CODEX$/);
  assert.match(rows[1],/^app\/\.claude\/worktrees\/result-brief +feat\/brief +● 4m ago · 2 sessions · CLAUDE, CODEX$/);
  assert.match(rows[2],/detached 1a2b3c4 +18m ago · 1 session · CODEX$/);
  assert.match(rows[3],/locked · no recent activity$/);
});

test('inactive worktrees are listed dimmed', async () => {
  const {worktreeMenuRows} = await menu();
  const colored = worktreeMenuRows(worktrees,groups,options);
  assert.deepEqual(colored.tones,[undefined,undefined,undefined,'dim']);
  assert.match(colored.rows.at(-1),/no recent activity$/);
  const plain = worktreeMenuRows(worktrees,groups,{...options,color:false});
  assert.match(plain.rows.at(-1),/locked · \(no recent activity\)$/);
  assert.doesNotMatch(plain.rows.join('\n'),/\x1b/);
});

test('worktree rows fit the width and keep the last path segments', async () => {
  const {worktreeMenuRows} = await menu();
  const {rows} = worktreeMenuRows(worktrees,groups,{...options,width:40});
  assert.ok(rows.every(row=>[...row].reduce((count,char)=>count+cellWidth(char),0)<=37));
  assert.match(rows[2],/^~\/…\/7f3a\/app /);
});

test('40-column rows keep full final segments before clipping the activity', async () => {
  const {worktreeMenuRows} = await menu();
  const hotfix = home+'/work/app-hotfix', brief = mainRoot+'/.claude/worktrees/brief';
  const list = [worktrees[0],{root:brief,branch:'feat/brief'},{root:hotfix,branch:'hotfix',locked:true}];
  const {rows} = worktreeMenuRows(list,groups,{...options,width:40});
  assert.match(rows[1],/^app\/…\/brief /);
  assert.match(rows[2],/^…\/app-hotfix /);
});

test('80-column rows shorten the path before clipping the activity', async () => {
  const {worktreeMenuRows} = await menu();
  const root = roots[2], branch = 'feature/worktree';
  const activity = new Map([[root,{sessions:1,platforms:new Set(['codex']),lastActivity:now-120000}]]);
  const {rows} = worktreeMenuRows([{root,branch}],activity,{...options,currentRoot:root,width:80});
  assert.match(rows[0],/feature\/worktree +here · ● 2m ago · 1 session · CODEX$/);
});

async function choose({keys=['\r'],...overrides}={}) {
  const {chooseWatchWorktree} = await menu();
  const io = makeTerminal({columns:120,rows:32});
  const frames = [];
  const result = chooseWatchWorktree({...options,worktrees,groups,input:io.input,output:io.output,signals:io.signals,
    env:{},...overrides,createSession:undefined});
  for (const key of keys) {
    frames.push(io.text());
    io.send(key);
    await new Promise(resolve=>setImmediate(resolve));
  }
  return {value:await result,frames};
}

test('locked worktree is listed and selectable', async () => {
  const {value,frames} = await choose({keys:['\x1b[B','\x1b[B','\x1b[B','\r']});
  assert.equal(value,roots[3]);
  assert.match(frames[0],/\x1b\[2m[^\n]*locked · no recent activity/);
  assert.match(frames.at(-1),/\x1b\[2m[^\n]*> [^\n]*locked/);
});

test('default selection is the current worktree and enter returns it', async () => {
  const {value,frames} = await choose({currentRoot:roots[2]});
  assert.equal(value,roots[2]);
  assert.match(frames[0],/> ~\/\.codex\/worktrees\/7f3a\/app/);
});

test('hidden worktrees show a more line', async () => {
  const list = Array.from({length:22},(_,index)=>({root:mainRoot+'/tree-'+index,branch:'topic'}));
  const {frames} = await choose({worktrees:list,currentRoot:list[0].root});
  assert.match(frames[0],/2 more worktrees not shown\. Run arc watch inside a worktree to watch it\./);
});

test('back exits', async () => {
  assert.equal((await choose({keys:['\x1b[A','\r']})).value,null);
});
