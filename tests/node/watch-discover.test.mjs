import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {makeHomes} from './fixtures/watch/homes.mjs';
import {listCodexRollouts, readCodexMeta} from '../../lib/watch/discover-codex.mjs';
import {createClaudeDiscovery, readClaudeHead} from '../../lib/watch/discover-claude.mjs';

const parts = (date, utc = false) => [utc ? date.getUTCFullYear() : date.getFullYear(), String((utc ? date.getUTCMonth() : date.getMonth())+1).padStart(2,'0'), String(utc ? date.getUTCDate() : date.getDate()).padStart(2,'0')];
const daysAgo = (now, days) => { const date = new Date(now); date.setDate(date.getDate()-days); return parts(date); };
test('startup finds recently modified rollouts up to seven days back', async t => {
  const h = makeHomes(t), now = new Date(2026,10,11,12).getTime();
  const recent = h.writeRollout(daysAgo(now,6),'rollout-recent.jsonl',[],{mtime:now-300000});
  const seventh = h.writeRollout(daysAgo(now,7),'rollout-seventh.jsonl',[],{mtime:now});
  h.writeRollout(daysAgo(now,8),'rollout-old-folder.jsonl',[],{mtime:now});
  h.writeRollout(daysAgo(now,0),'rollout-stale.jsonl',[],{mtime:now-2400000});
  const compressed = h.writeRollout(daysAgo(now,0),'rollout-packed.jsonl.zst',[],{mtime:now});
  const before = await h.snapshot(), found = await listCodexRollouts({codexHome:h.codexHome,now,startup:true});
  assert.deepEqual(new Set(found.map(row=>row.file)),new Set([recent,seventh,compressed]));
  assert.equal(found.find(row=>row.file===compressed).compressed,true);
  assert.equal(found.find(row=>row.file===recent).threadId,'recent');
  assert.deepEqual(await h.snapshot(),before);
});
test('listCodexRollouts covers local and UTC dates around midnight', async t => {
  const h = makeHomes(t), now = new Date(2026,10,11,0,0,30).getTime(), folders = new Set();
  for (const utc of [false,true]) for (const back of [0,1]) {
    const date = new Date(now);
    if (utc) date.setUTCDate(date.getUTCDate()-back); else date.setDate(date.getDate()-back);
    folders.add(parts(date,utc).join('/'));
  }
  const files = [...folders].map((folder,i)=>h.writeRollout(folder.split('/'),`rollout-${i}.jsonl`,[],{mtime:0}));
  assert.ok(folders.size <= 3);
  assert.deepEqual(new Set((await listCodexRollouts({codexHome:h.codexHome,now,startup:false})).map(row=>row.file)),new Set(files));
});
test('readCodexMeta reads a long first line', async t => {
  const h = makeHomes(t), file = h.writeRollout(['2026','11','11'],'rollout-long.jsonl',[{type:'session_meta',payload:{id:'long',originator:'codex_exec',cwd:'/repo',base_instructions:'x'.repeat(2*1024*1024)}}]);
  assert.deepEqual(await readCodexMeta(file),{threadId:'long',originator:'codex_exec',cwd:'/repo'});
});
test('claude scan filters by prefix and sees new files', async t => {
  const h = makeHomes(t), now = Date.now(), discovery = createClaudeDiscovery(h);
  const first = h.writeClaude('-repo-one','first',[],{mtime:now});
  h.writeClaude('-other','other',[],{mtime:now});
  h.writeClaude('-repo-one','stale',[],{mtime:now-2400000});
  assert.deepEqual((await discovery.scan({prefixes:['-repo'],now,startup:true})).map(row=>row.file),[first]);
  const second = h.writeClaude('-repo-one','second',[],{mtime:now});
  fs.utimesSync(path.dirname(first),new Date(now+10000),new Date(now+10000));
  assert.deepEqual(new Set((await discovery.scan({prefixes:['-repo'],now,startup:true})).map(row=>row.file)),new Set([first,second]));
  fs.utimesSync(first,new Date(now+20000),new Date(now+20000));
  const before = await h.snapshot();
  const found = await discovery.scan({prefixes:null,now,startup:false});
  assert.equal(found.length,4); assert.equal(found.find(row=>row.file===first).mtimeMs,fs.statSync(first).mtimeMs);
  assert.deepEqual(await h.snapshot(),before);
});
test('claude scan skips inaccessible project directories', {skip:process.getuid?.()===0}, async t => {
  let dir;
  t.after(() => { if (dir) fs.chmodSync(dir,0o700); });
  const h = makeHomes(t), file = h.writeClaude('-denied','sid',[]);
  dir = path.dirname(file);
  fs.chmodSync(dir,0);
  assert.deepEqual(await createClaudeDiscovery(h).scan({prefixes:null,now:Date.now(),startup:false}),[]);
});
test('claude subagents with and without meta', async t => {
  const h = makeHomes(t), file = h.writeClaude('-repo','sid',[],{subagents:[
    {agentId:'good',meta:{agentType:'arc-qa',description:'check'}},
    {agentId:'broken',meta:'{'}, {agentId:'missing'},
  ]});
  const before = await h.snapshot(), found = await createClaudeDiscovery(h).subagents(file);
  assert.equal(found.length,3);
  assert.deepEqual(found.find(row=>row.agentId==='good').meta,{agentType:'arc-qa',description:'check'});
  for (const id of ['broken','missing']) assert.equal(found.find(row=>row.agentId===id).meta,null);
  assert.deepEqual(await h.snapshot(),before);
});
test('readClaudeHead returns null until a cwd line exists', async t => {
  const h = makeHomes(t), file = h.writeClaude('-repo','sid',[{type:'last-prompt'}]);
  assert.equal(await readClaudeHead(file),null);
  fs.appendFileSync(file,JSON.stringify({sessionId:'sid',cwd:'/repo',entrypoint:'sdk-cli',version:'1'})+'\n');
  assert.deepEqual(await readClaudeHead(file),{sessionId:'sid',cwd:'/repo',entrypoint:'sdk-cli',version:'1'});
});
test('missing discovery roots return no candidates without creating directories', async t => {
  const h = makeHomes(t), before = await h.snapshot();
  assert.deepEqual(await listCodexRollouts({codexHome:h.codexHome,now:Date.now(),startup:true}),[]);
  assert.deepEqual(await createClaudeDiscovery(h).scan({prefixes:null,now:Date.now(),startup:false}),[]);
  assert.deepEqual(await h.snapshot(),before);
});
