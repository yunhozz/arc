import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {openRoot} from '../../lib/safe-fs/index.mjs';import {loadNative} from '../../lib/safe-fs/native.mjs';import {referenceFixture} from './fixtures/fake-git.mjs';
const api=await import('../../lib/management/status.mjs').catch(()=>({})),operations=await import('../../lib/management/operations.mjs').catch(()=>({}));const native=loadNative({artifactDirectory:'build/native'}),safeFs={openRoot:p=>openRoot(p,{native})};
test('damaged target diagnostics do not hide another installed target or its settings',async t=>{assert.equal(typeof api.collectStatus,'function');const userHome=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'arc-status-')));t.after(()=>fs.rmSync(userHome,{recursive:true,force:true}));const ctx={packageRoot:process.cwd(),userHome,cwd:userHome,env:{},safeFs,acquisition:async()=>({references:referenceFixture()})};await operations.executeOperation(ctx,await operations.prepareOperation(ctx,{kind:'install',target:'all',language:'ko',maxConcurrentSubagents:2}));fs.unlinkSync(userHome+'/.codex/skills/arc/settings.toml');const statuses=await api.collectStatus(ctx);assert.equal(statuses[0].state,'incomplete');assert.ok(statuses[0].diagnostics.length);assert.equal(statuses[1].state,'installed');assert.equal(statuses[1].settings.language,'ko');assert.equal(statuses[1].settings.limits.max_concurrent_subagents,2);});

test('management status and TUI home use refreshed Codex authentication without exposing credentials',async t=>{
 const {createRoutingFixture}=await import('./role-fixtures.mjs');
 const {runTui}=await import('../../lib/tui/app.mjs');
 const f=await createRoutingFixture(t),recordPath=path.join(f.base,'auth-requests.jsonl');
 // An installed target exercises home labels and the configuration gate's shared collector.
 const ctx={packageRoot:process.cwd(),userHome:f.userHome,cwd:f.cwd,env:{},safeFs,acquisition:async()=>({references:referenceFixture()})};
 await operations.executeOperation(ctx,await operations.prepareOperation(ctx,{kind:'uninstall',target:'all',removeCli:false}));
 await operations.executeOperation(ctx,await operations.prepareOperation(ctx,{kind:'install',target:'all',language:'ko',maxConcurrentSubagents:2}));
 for(const [authStatus,label] of [['revoked','Unauthorized'],['chatgpt-ok','Available'],['error','Incomplete']]) {
  await f.cli('codex',{authStatus,appServerRecordPath:recordPath});ctx.env=f.env;
  const statuses=await api.collectStatus(ctx);
  assert.equal(statuses.find(x=>x.platform==='codex').authentication.authStatus,{Unauthorized:'unauthorized',Available:'authenticated',Incomplete:'unknown'}[label]);
  const screens=[],session={viewport:()=>({columns:120,rows:40}),render:s=>{screens.push(s);return{selectionEnabled:true};},discardInput(){},setBusy(){},dispose(){},nextEvent:async()=>({name:'escape'})};
  await runTui({session,context:ctx,services:{collectStatus:async()=>statuses}});
  assert.ok(screens[0].rows[0].includes('Codex: '+label));
  assert.doesNotMatch(JSON.stringify({statuses,screens}),/fixture-token-SECRET|refresh token/);
 }
 const records=fs.readFileSync(recordPath,'utf8').trim().split('\n').map(JSON.parse);
 assert.equal(records.filter(x=>x.method==='getAuthStatus').length,3);
});

test('management status refreshes by default and supports a local Codex recheck',async t=>{
 const {createRoutingFixture}=await import('./role-fixtures.mjs');
 const f=await createRoutingFixture(t),recordPath=path.join(f.base,'status-auth.jsonl');
 await f.cli('codex',{appServerRecordPath:recordPath});
 const ctx={userHome:f.userHome,cwd:f.cwd,env:f.env,safeFs};
 for(const options of [undefined,{codexCheck:'local'}]) {
  const statuses=await api.collectStatus(ctx,options);
  assert.equal(statuses.find(x=>x.platform==='codex').authentication.authStatus,'authenticated');
 }
 const requests=fs.readFileSync(recordPath,'utf8').trim().split('\n').map(JSON.parse).filter(x=>x.method==='getAuthStatus');
 assert.deepEqual(requests.map(x=>x.params),[{includeToken:true,refreshToken:true}]);
 const records=fs.readFileSync(recordPath,'utf8').trim().split('\n').map(JSON.parse);
 assert.deepEqual(records.filter(x=>x.event).map(x=>x.event),['start','login-status']);
});

for(const platform of ['codex','claude'])for(const kind of ['file','symlink','owned'])test(`${platform} ${kind} profile alone reports ${kind==='owned'?'incomplete':'absent with residual'}`,async t=>{
 const userHome=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'arc-status-orphan-')));t.after(()=>fs.rmSync(userHome,{recursive:true,force:true}));const ext=platform==='codex'?'toml':'md',filename=userHome+'/.'+platform+'/agents/arc-qa.'+ext;fs.mkdirSync(path.dirname(filename),{recursive:true});
 if(kind==='file')fs.writeFileSync(filename,'user profile');else if(kind==='symlink')fs.symlinkSync(userHome+'/missing-user-target',filename);else fs.copyFileSync(platform+'/agents/arc-qa.'+ext,filename);
 const status=(await api.collectStatus({userHome,cwd:userHome,env:{},safeFs})).find(item=>item.platform===platform);assert.equal(status.state,kind==='owned'?'incomplete':'absent');
 if(kind!=='owned'){assert.deepEqual(status.residualPaths,[filename]);assert.deepEqual(status.diagnostics,[]);}else assert.match(status.diagnostics[0].message,/Incomplete ARC installation/);
});
