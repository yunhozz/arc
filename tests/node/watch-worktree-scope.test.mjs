import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import {Session} from 'node:inspector';
import os from 'node:os';
import path from 'node:path';
import {promisify} from 'node:util';
import * as scope from '../../lib/watch/scope.mjs';
import {createWatcher} from '../../lib/watch/watcher.mjs';
import {makeHomes} from './fixtures/watch/homes.mjs';

const home = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'arc-worktree-scope-'));
after(()=>fs.rmSync(home,{recursive:true,force:true}));
const main = home+'/work/app';
const nested = main+'/.claude/worktrees/a', outside = home+'/.codex/worktrees/7f3a/app';
const now = Date.parse('2026-11-11T12:00:00Z');
const head = '1a2b3c4'+'0'.repeat(33);
const entry = root => ({root,head,branch:'main',detached:false,locked:false,prunable:false,bare:false});
const record = (root,...fields) => ['worktree '+root,...fields,'',''].join('\0');

test('parseWorktreeList reads branch, detached, locked, prunable and bare', () => {
  assert.equal(typeof scope.parseWorktreeList,'function');
  const output = record(main,'HEAD '+head,'branch refs/heads/topic/test')+
    record(nested+'\nline','HEAD '+head,'detached','locked maintenance')+
    record(outside,'HEAD '+head,'branch refs/heads/other','prunable missing')+
    record('/bare','bare');
  assert.deepEqual(scope.parseWorktreeList(output),[
    {...entry(main),root:scope.realPath(main),branch:'topic/test'},
    {...entry(nested),root:scope.realPath(nested+'\nline'),branch:undefined,detached:true,locked:true},
    {...entry(outside),root:scope.realPath(outside),branch:'other',prunable:true},
    {...entry('/bare'),root:scope.realPath('/bare'),head:undefined,branch:undefined,bare:true},
  ]);
  assert.throws(()=>scope.parseWorktreeList('not porcelain'));
});

test('bare, prunable and missing worktrees are skipped', () => {
  assert.equal(typeof scope.selectableWorktrees,'function');
  const locked = {...entry(nested),locked:true};
  const list = [entry(main),locked,{...entry('/bare'),bare:true},{...entry('/pruned'),prunable:true},entry('/missing'),entry('/file')];
  assert.deepEqual(scope.selectableWorktrees(list,{isDirectory(root){
    assert.ok(!['/bare','/pruned'].includes(root));
    if (root==='/missing') throw Object.assign(Error('missing'),{code:'ENOENT'});
    return root!=='/file';
  }}),{worktrees:[entry(main),locked],mainRoot:main});
});

test('bare main leaves no main root', () => {
  assert.equal(typeof scope.selectableWorktrees,'function');
  assert.deepEqual(scope.selectableWorktrees([{...entry(main),bare:true},entry(outside)],{isDirectory:()=>true}),
    {worktrees:[entry(outside)],mainRoot:null});
});

test('worktrees are listed wherever they were created', () => {
  assert.equal(typeof scope.selectableWorktrees,'function');
  const roots = [main,nested,main+'/.gemini/worktrees/b',main+'/.grok/worktrees/c',outside,home+'/work/app-hotfix'];
  const list = roots.map(root=>entry(root));
  const visited = [];
  const result = scope.selectableWorktrees(list,{isDirectory(root){visited.push(root);return true;}});
  assert.deepEqual(result.worktrees,list);
  assert.deepEqual(visited,roots);
});

test('display paths are project-relative inside main and home-abbreviated outside', () => {
  assert.equal(typeof scope.worktreeDisplayPath,'function');
  const options = {mainRoot:main,home};
  assert.equal(scope.worktreeDisplayPath(main,options),'~/work/app');
  assert.equal(scope.worktreeDisplayPath(main+'/.gemini/worktrees/b',options),'app/.gemini/worktrees/b');
  assert.equal(scope.worktreeDisplayPath(outside,options),'~/.codex/worktrees/7f3a/app');
  assert.equal(scope.worktreeDisplayPath(nested,{...options,mainRoot:null}),'~/work/app/.claude/worktrees/a');
  assert.equal(scope.worktreeDisplayPath(home+'/work/app-hotfix',options),'~/work/app-hotfix');
});

test('long paths keep the last segments', () => {
  assert.equal(typeof scope.worktreeDisplayPath,'function');
  assert.equal(scope.worktreeDisplayPath(outside,{mainRoot:main,home,width:20}),'~/…/7f3a/app');
});

test('path clips within the final segment only after whole-segment forms fail', () => {
  const display = (root,width)=>scope.worktreeDisplayPath(root,{mainRoot:main,home,width});
  assert.equal(display(home+'/work/app-hotfix',13),'…/app-hotfix');
  assert.equal(display(main+'/.claude/worktrees/brief',13),'app/…/brief');
  assert.equal(display(home+'/work/extra-long-final-segment',12),'…nal-segment');
});

test('worktree paths use the same identity across a home symlink and its target', t => {
  const h = makeHomes(t);
  const canonicalHome = fs.realpathSync(h.userHome), alias = path.join(h.root,'alias');
  fs.symlinkSync(canonicalHome,alias,'dir');
  const root = path.join(canonicalHome,'work','app');
  const child = path.join(root,'worktrees','feature');
  const aliasedRoot = path.join(alias,'work','app');
  const aliasedChild = path.join(aliasedRoot,'worktrees','feature');
  assert.equal(scope.realPath(aliasedChild),child);
  assert.equal(scope.worktreeDisplayPath(root,{mainRoot:aliasedRoot,home:alias}),'~/work/app');
  assert.equal(scope.worktreeDisplayPath(child,{mainRoot:aliasedRoot,home:alias}),'app/worktrees/feature');
  const worktrees = [entry(root),{...entry(aliasedChild),branch:'feature'}];
  const groups = scope.groupActivity(worktrees,[{platform:'codex',cwd:path.join(child,'src'),mtimeMs:now}],{now});
  assert.equal(groups.get(aliasedChild)?.sessions,1);
  assert.equal(groups.has(root),false);
  assert.equal(scope.orderWorktrees(worktrees,groups,{currentRoot:child,mainRoot:root,home:alias}).shown[0].root,aliasedChild);
  const selected = scope.scopeForWorktree({kind:'repo'},worktrees,child,{home:alias});
  assert.deepEqual(selected.roots,[child]);
  assert.deepEqual(selected.excludedRoots,[root]);
  assert.equal(selected.branch,'feature');
  assert.equal(selected.display,'~/work/app/worktrees/feature');
});

test('scopeForWorktree selects one worktree and excludes the others', () => {
  assert.equal(typeof scope.scopeForWorktree,'function');
  const list = [entry(main),entry(nested),{...entry(outside),branch:undefined,detached:true}];
  const original = {kind:'repo',roots:[main],gitCommonDir:main+'/.git'};
  const selected = scope.scopeForWorktree(original,list,main,{home});
  assert.deepEqual(selected,{...original,excludedRoots:[nested,outside],branch:'main',display:'~/work/app',description:'Worktree '+main});
  assert.equal(scope.inScope(selected,nested+'/src'),false);
  assert.equal(scope.inScope(selected,main+'/lib'),true);
  const local = scope.scopeForWorktree(original,list,nested,{home});
  assert.equal(scope.inScope(local,nested+'/src'),true);
  assert.equal(scope.inScope(local,main+'/lib'),false);
  const other = scope.scopeForWorktree(original,list,outside,{home});
  assert.equal(other.display,'~/.codex/worktrees/7f3a/app');
  assert.equal(other.branch,'detached 1a2b3c4');
  assert.equal(scope.inScope(other,outside+'/src'),true);
  assert.equal(scope.inScope(other,main+'/lib'),false);
});

test('refresh keeps the chosen worktree', async () => {
  assert.equal(typeof scope.scopeForWorktree,'function');
  const selected = scope.scopeForWorktree({kind:'repo',roots:[main]},[entry(main),entry(outside)],outside,{home});
  const refreshed = await scope.refreshScope(selected,async()=>record(main)+record(outside)+record(nested));
  assert.deepEqual(refreshed.roots,[outside]);
  assert.deepEqual(refreshed.excludedRoots,[scope.realPath(main),scope.realPath(nested)]);
  assert.equal(refreshed.display,'~/.codex/worktrees/7f3a/app');
});

test('probe activity belongs to the deepest worktree', () => {
  assert.equal(typeof scope.groupActivity,'function');
  const groups = scope.groupActivity([entry(main),entry(nested),entry(outside)],[
    {platform:'codex',cwd:nested+'/src',mtimeMs:now-120000,main:true},
    {platform:'claude',cwd:nested,mtimeMs:now-240000,main:true},
    {platform:'claude',cwd:main+'/lib',mtimeMs:now-1800000,main:true},
    {platform:'codex',cwd:outside,mtimeMs:now-1800001,main:true},
  ],{now});
  assert.equal(groups.get(nested).lastActivity,now-120000);
  assert.equal(groups.get(nested).sessions,2);
  assert.deepEqual([...groups.get(nested).platforms].sort(),['claude','codex']);
  assert.equal(groups.get(main).sessions,1);
  assert.equal(groups.has(outside),false);
});

function probeFixture(t) {
  const h = makeHomes(t);
  const root = scope.realPath(h.root);
  const roots = [root+'/main',root+'/main/nested',root+'/outside'];
  for (const dir of roots) fs.mkdirSync(dir,{recursive:true});
  const files = roots.map((cwd,index)=>h.writeRollout(['2026','11','11'],'rollout-'+index+'.jsonl',[
    {type:'session_meta',payload:{id:'thread-'+index,cwd,originator:'codex-tui'}},
    {type:'event_msg',payload:{type:'user_message',message:'x'.repeat(300000)}},
  ],{mtime:now}));
  const calls = [];
  const watcher = probe => createWatcher({
    options:{probe,tail:0,platforms:['codex']},homes:{codex:h.codexHome},
    scope:{kind:'repo',roots,excludedRoots:[],gitCommonDir:roots[0]+'/.git'},
    git:async (dir,args)=>{calls.push(args);return args[0]==='ls-files'?'':dir;},now:()=>now,
  });
  return {h,files,roots,calls,watcher};
}

test('probe reports activity without reading history', async t => {
  const {files,watcher} = probeFixture(t);
  const positions = [], open = fsp.open;
  t.mock.method(fsp,'open',async (file,...args)=>{
    const handle = await open(file,...args);
    if (!files.includes(file)) return handle;
    const read = handle.read.bind(handle);
    handle.read = (buffer,offset,length,position)=>{
      if (length===262144 && position>0) positions.push(position);
      return read(buffer,offset,length,position);
    };
    return handle;
  });
  const probe = watcher(true);
  t.after(()=>probe.close());
  assert.deepEqual(await probe.start(),[]);
  assert.equal(probe.listActivity().length,3);
  assert.deepEqual(await probe.tick(),[]);
  assert.deepEqual(positions,[]);
});

test('probe finds sessions in every worktree root', async t => {
  const {h,roots} = probeFixture(t);
  for (const [index,cwd] of roots.entries()) {
    const id = 'claude-'+index;
    h.writeClaude(cwd.replace(/[^A-Za-z0-9]/g,'-'),id,[
      {type:'user',cwd,sessionId:id,message:{content:'probe activity'}},
    ],{mtime:now});
  }
  const git = t.mock.fn(async ()=>null);
  const probe = createWatcher({
    options:{probe:true,tail:0,platforms:['claude','codex']},homes:{claude:h.claudeHome,codex:h.codexHome},
    scope:{kind:'repo',roots,excludedRoots:[],gitCommonDir:roots[0]+'/.git'},git,now:()=>now,
  });
  t.after(()=>probe.close());
  const profiler = new Session();
  profiler.connect();
  const post = promisify(profiler.post.bind(profiler));
  try {
    await post('Profiler.enable');
    await post('Profiler.startPreciseCoverage',{callCount:true,detailed:true});
    assert.deepEqual(await probe.start(),[]);
    assert.deepEqual(await probe.tick(),[]);
    const {result} = await post('Profiler.takePreciseCoverage');
    for (const [file,names] of [['tail',['readTail']],['watcher',['emit','scanRoot','scanShell','ensureShellRoot']]]) {
      const script = result.find(entry=>entry.url.endsWith('/lib/watch/'+file+'.mjs'));
      assert.ok(script,'missing coverage for '+file);
      for (const name of names) {
        const calls = script.functions.filter(fn=>fn.functionName===name).reduce((total,fn)=>total+fn.ranges[0].count,0);
        assert.equal(calls,0,name);
      }
    }
  } finally {
    await post('Profiler.stopPreciseCoverage');
    profiler.disconnect();
  }
  const activity = probe.listActivity();
  for (const platform of ['claude','codex']) {
    assert.deepEqual(activity.filter(row=>row.platform===platform).map(row=>row.cwd).sort(),roots.toSorted());
  }
  assert.ok(activity.every(row=>row.main && row.mtimeMs===now));
  assert.equal(git.mock.callCount(),0);
});

test('ordinary watcher with several roots only attaches to the first worktree', async t => {
  const {roots,watcher} = probeFixture(t);
  const ordinary = watcher(false);
  t.after(()=>ordinary.close());
  await ordinary.start();
  assert.equal(typeof ordinary.listActivity,'function');
  assert.deepEqual(ordinary.listActivity().map(row=>row.cwd),[roots[0]]);
});

test('order is current, active by recency, then inactive by display path', () => {
  assert.equal(typeof scope.orderWorktrees,'function');
  const a = main+'/a', z = main+'/z';
  const groups = new Map([[outside,{lastActivity:now-1}],[nested,{lastActivity:now-2}]]);
  const {shown,hidden} = scope.orderWorktrees([z,nested,a,outside,main].map(root=>entry(root)),groups,
    {currentRoot:main,mainRoot:main,home});
  assert.deepEqual(shown.map(row=>row.root),[main,outside,nested,a,z]);
  assert.equal(hidden,0);
});

test('more than 20 worktrees keeps the current one and reports hidden count', () => {
  assert.equal(typeof scope.orderWorktrees,'function');
  const worktrees = Array.from({length:22},(_,index)=>entry(main+'/tree-'+index));
  const currentRoot = worktrees.at(-1).root;
  const {shown,hidden} = scope.orderWorktrees(worktrees,new Map(),{currentRoot,mainRoot:main,home});
  assert.equal(shown.length,20);
  assert.equal(shown[0].root,currentRoot);
  assert.equal(hidden,2);
});
