import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {openRoot} from '../../lib/safe-fs/index.mjs';import {loadNative} from '../../lib/safe-fs/native.mjs';import {referenceFixture} from './fixtures/fake-git.mjs';
const api=await import('../../lib/management/status.mjs').catch(()=>({})),operations=await import('../../lib/management/operations.mjs').catch(()=>({}));const native=loadNative({artifactDirectory:'build/native'}),safeFs={openRoot:p=>openRoot(p,{native})};
test('damaged target diagnostics do not hide another installed target or its settings',async t=>{assert.equal(typeof api.collectStatus,'function');const userHome=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'arc-status-')));t.after(()=>fs.rmSync(userHome,{recursive:true,force:true}));const ctx={packageRoot:process.cwd(),userHome,cwd:userHome,env:{},safeFs,acquisition:async()=>({references:referenceFixture()})};await operations.executeOperation(ctx,await operations.prepareOperation(ctx,{kind:'install',target:'all',language:'ko',maxConcurrentSubagents:2}));fs.unlinkSync(userHome+'/.codex/skills/arc/settings.toml');const statuses=await api.collectStatus(ctx);assert.equal(statuses[1].state,'incomplete');assert.ok(statuses[1].diagnostics.length);assert.equal(statuses[0].state,'installed');assert.equal(statuses[0].settings.language,'ko');assert.equal(statuses[0].settings.limits.max_concurrent_subagents,2);});

test('management status and TUI Status use refreshed Codex authentication without exposing credentials',async t=>{
 const {createRoutingFixture}=await import('./role-fixtures.mjs');
 const {runTui}=await import('../../lib/tui/app.mjs');
 const f=await createRoutingFixture(t),recordPath=path.join(f.base,'auth-requests.jsonl');
 // An installed target exercises Status labels and the configuration gate's shared collector.
 const ctx={packageRoot:process.cwd(),userHome:f.userHome,cwd:f.cwd,env:{},safeFs,acquisition:async()=>({references:referenceFixture()})};
 await operations.executeOperation(ctx,await operations.prepareOperation(ctx,{kind:'uninstall',target:'all',removeCli:false}));
 await operations.executeOperation(ctx,await operations.prepareOperation(ctx,{kind:'install',target:'all',language:'ko',maxConcurrentSubagents:2}));
 for(const [authStatus,label] of [['revoked','Unauthorized'],['chatgpt-ok','Available'],['error','Incomplete']]) {
  await f.cli('codex',{authStatus,appServerRecordPath:recordPath});ctx.env=f.env;
  const statuses=await api.collectStatus(ctx);
  assert.equal(statuses.find(x=>x.platform==='codex').authentication.authStatus,{Unauthorized:'unauthorized',Available:'authenticated',Incomplete:'unknown'}[label]);
  const events=['down','enter','escape','escape'],screens=[],session={viewport:()=>({columns:120,rows:40}),render:s=>{screens.push(s);return{selectionEnabled:true};},discardInput(){},setBusy(){},dispose(){},nextEvent:async()=>({name:events.shift()??'escape'})};
  await runTui({session,context:ctx,services:{collectStatus:async()=>statuses}});
  assert.deepEqual(screens.find(screen=>screen.title==='Status')?.rows.filter(row=>/^Codex +/.test(row)).map(row=>row.replace(/^Codex +/,'')),[label]);
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

test('collectStatus iterates registry in anchor order',async t=>{
 const userHome=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'arc-status-order-')));t.after(()=>fs.rmSync(userHome,{recursive:true,force:true}));
 const statuses=await api.collectStatus({userHome,cwd:userHome,env:{},safeFs});
 assert.deepEqual(statuses.map(status=>status.platform),['claude','codex','gemini']);
});

test('auth kind none reports unknown without probe',async t=>{
 const {createTestRegistries}=await import('./fixtures/platforms/zeta.mjs');
 const userHome=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'arc-status-no-auth-')));t.after(()=>fs.rmSync(userHome,{recursive:true,force:true}));
 const bin=path.join(userHome,'bin'),record=path.join(userHome,'zeta-probed');fs.mkdirSync(bin);
 fs.writeFileSync(path.join(bin,'zeta'),'#!/bin/sh\nif [ "$1" = "--version" ]; then printf "zeta 1.0.0\\n"; exit 0; fi\nprintf probed > "'+record+'"\nexit 1\n',{mode:0o755});
 const statuses=await api.collectStatus({userHome,cwd:userHome,env:{PATH:bin},safeFs,...createTestRegistries()});
 const zeta=statuses.find(status=>status.platform==='zeta');
 assert.ok(zeta,'registered zeta must have a status');
 assert.deepEqual(zeta.authentication,{authStatus:'unknown',reason:'auth_unverified'});
 assert.deepEqual(zeta.cliVersion,{version:'1.0.0'});
 assert.equal(fs.existsSync(record),false);
});

test('static catalog resolves via descriptor',async()=>{
 const {createTestRegistries}=await import('./fixtures/platforms/zeta.mjs');
 const {loadStaticModelCatalog}=await import('../../lib/models/static-catalog.mjs');
 const result=await loadStaticModelCatalog('zeta',createTestRegistries());
 assert.equal(result.status,'ready');
 assert.equal(result.catalog.platform,'zeta');
 assert.deepEqual(result.catalog.pairs,[{model:'zeta-model',effort:'high'}]);
});

test('injected zeta status reads standalone and composite through its registry',async t=>{
 const {zetaContext,installAll}=await import('./fixtures/platforms/package-root.mjs');
 const {resolveTargets}=await import('../../lib/installer/targets.mjs');
 const {prepareCompositeFiles,publishCompositeFiles}=await import('../../lib/installer/role-routing.mjs');
 const {buildRoleRoutingConfig,ROUTING_ROLES}=await import('../../lib/runtime/role-routing-config.mjs');
 const {verifyPayload}=await import('../../lib/installer/manifest.mjs');
 const {loadModelConfig}=await import('../../lib/models/index.mjs');
 const {renderStandaloneProfiles}=await import('../../lib/installer/plan.mjs');
 const ctx=await zetaContext(t);await installAll(ctx,['claude','zeta']);
 let status=(await api.collectStatus(ctx)).find(item=>item.platform==='zeta');
 assert.equal(status.state,'installed',status.diagnostics[0]?.stack);assert.equal(status.settings.modelConfig.platform,'zeta');
 const targets=resolveTargets(ctx).targets,payload=verifyPayload(ctx),modelConfigs={},profileInputs={};
 for(const id of ['claude','zeta']){modelConfigs[id]=loadModelConfig(fs.readFileSync(path.join(targets[id].home,'skills/arc/models.toml')),id,ctx);profileInputs[id]=renderStandaloneProfiles({...ctx,payload,target:targets[id],modelConfig:modelConfigs[id],language:'en'});}
 const config=buildRoleRoutingConfig({revision:'status-zeta',platforms:['claude','zeta'],roles:Object.fromEntries(ROUTING_ROLES.map(role=>[role,{platform:'zeta',model:'zeta-model',effort:'high'}]))},ctx);
 await publishCompositeFiles({context:ctx,prepared:prepareCompositeFiles({context:ctx,targets,platforms:['claude','zeta'],anchor:'claude',config,profileInputs,modelConfigs})});
 status=(await api.collectStatus(ctx)).find(item=>item.platform==='zeta');assert.equal(status.state,'installed',status.diagnostics[0]?.stack);
});
test('composite static catalog validation accepts injected zeta and rejects missing pairs',async()=>{
 const {createTestRegistries}=await import('./fixtures/platforms/zeta.mjs');
 const {assertCompositeCatalogRoles}=await import('../../lib/models/static-catalog.mjs');
 const ctx=createTestRegistries(),roles=Object.fromEntries(['arc_scouter','arc_planner','arc_implementer','arc_qa','arc_reviewer'].map(role=>[role,{platform:'zeta',model:'zeta-model',effort:'high'}]));
 const catalogs={zeta:{platform:'zeta',pairs:[{model:'zeta-model',effort:'high'}]}};
 assert.doesNotThrow(()=>assertCompositeCatalogRoles({...ctx,roles,catalogs}));
 assert.throws(()=>assertCompositeCatalogRoles({...ctx,roles:{...roles,arc_qa:{platform:'zeta',model:'other',effort:'high'}},catalogs}),/unavailable for arc_qa/);
});
