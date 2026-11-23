import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {compositeContext, mixedConfig, targets} from './fixtures/install-mode.mjs';
import {activePath, legacyComposite} from './fixtures/legacy-composite.mjs';
import {currentInstallState, executeOperation, prepareOperation} from '../../lib/management/operations.mjs';
import {collectStatus} from '../../lib/management/status.mjs';
import {runChild} from '../../lib/management/update.mjs';
import {collectInstalledState} from '../../lib/installer/upgrade-state.mjs';
import {ROLES} from '../../lib/models/config.mjs';
import {DEFAULT_INSTALLER_REGISTRY} from '../../lib/platforms/index.mjs';
import {loadStaticModelCatalog} from '../../lib/models/static-catalog.mjs';
import {loadRoleDefaults, runInstallFlow} from '../../lib/tui/setup.mjs';
import {cooperativeVersions} from '../../lib/runtime/bootstrap.mjs';
import {routingStatus} from '../../lib/runtime/role-routing.mjs';
import {createLease} from '../../lib/runtime/role-dispatch-store.mjs';

const activeName='arc-role-platform-routing.json';
const markerName='arc-role-platform-routing.prepared.json';
const settings={language:'ko',runMode:'full-auto',maxTotalSubagents:23,maxConcurrentSubagents:3};
const settingsFiles=['models.toml','settings.toml','limits.toml'];
const bytes=(home,names)=>names.map(name=>fs.readFileSync(path.join(home,name)));
const configBytes=home=>bytes(home,settingsFiles.map(name=>'skills/arc/'+name));
const json=filename=>JSON.parse(fs.readFileSync(filename));

async function reapplyApi(){
 const api=await import('../../lib/management/reapply.mjs').catch(error=>{
  if(error.code!=='ERR_MODULE_NOT_FOUND'||!error.url?.endsWith('/management/reapply.mjs'))throw error;
  return {};
 });
 assert.equal(typeof api.reapplyConfiguration,'function');
 return api;
}

async function reapply(context){
 return (await reapplyApi()).reapplyConfiguration(context);
}

async function installedComposite(t){
 const context=await compositeContext(t), config=await mixedConfig('before-upgrade');
 const result=await executeOperation(context,await prepareOperation(context,{kind:'install',target:'composite',platforms:config.platforms,config,settings}));
 assert.equal(result.code,0,JSON.stringify(result));
 assert.equal(result.activation,'published');
 const homes=Object.fromEntries(Object.entries(targets(context)).map(([id,target])=>[id,target.home]));
 return {context,config,homes,active:path.join(homes.claude,activeName)};
}

async function upgrade(context,hooks){
 const version=json(path.join(context.packageRoot,'package.json')).version;
 const state=collectInstalledState(context);
 let stdout='',stderr='';
 const code=await runChild({protocol:1,expectedVersion:version,invocationCwd:context.cwd,expectedStateToken:state.stateToken},{
  env:context.env,output:{write:text=>stdout+=text},error:{write:text=>stderr+=text}
 },{
  ...context,inspectNpmContext:async()=>({kind:'global',packageRoot:context.packageRoot}),
  ...(hooks?{reapplyConfiguration:options=>reapply({...options,hooks})}:{}),
 });
 return {code,stdout,stderr};
}

function routingBytes({homes}){
 return Object.entries(homes).flatMap(([id,home])=>bytes(home,[
  ...(id==='claude'?[activeName]:[]),markerName,
  ...fs.readdirSync(path.join(home,'agents')).sort().map(name=>'agents/'+name),
 ]));
}

test('composite child refreshes every activation marker and preserves roles and settings',async t=>{
 const fixture=await installedComposite(t);
 const {context,config,homes,active}=fixture;
 const status=()=>routingStatus({context:{...context,hostPlatform:'claude',executionEnvironment:'claude-cli',workflowId:'reapply'}});
 const versions=await cooperativeVersions();
 const before=Object.values(homes).map(configBytes);
 for(const home of Object.values(homes)){
  const file=path.join(home,markerName),marker=json(file);
  marker.runtime.hash='sha256:'+'a'.repeat(64);
  marker.runtime.policyHash='sha256:'+'b'.repeat(64);
  fs.writeFileSync(file,JSON.stringify(marker));
 }
 assert.ok((await status()).reasons.some(reason=>reason.code==='activation_unverified'));
 const result=await upgrade(context);
 assert.equal(result.code,0,result.stderr);
 assert.match(result.stdout,/Configuration re-applied: Mixed routing \(Claude \+ Codex\)\./);
 const after=json(active);
 assert.notEqual(after.revision,config.revision);
 assert.deepEqual(after.roles,config.roles);
 assert.deepEqual(after.platforms,config.platforms);
 for(const home of Object.values(homes)){
  const marker=json(path.join(home,markerName));
  assert.equal(marker.revision,after.revision);
  assert.equal(marker.runtime.hash,versions.runtimeHash);
  assert.equal(marker.runtime.policyHash,versions.policyHash);
 }
 assert.deepEqual(Object.values(homes).map(configBytes),before);
 assert.ok(!(await status()).reasons.some(reason=>reason.code==='activation_unverified'));
});

test('composite child reports retained dispatch history after moving the anchor',async t=>{
 const context=await legacyComposite(t);
 const oldAnchor=activePath(context,'codex');
 const result=await upgrade(context);
 assert.equal(result.code,0,result.stderr);
 assert.equal(fs.existsSync(oldAnchor),false);
 assert.equal(fs.existsSync(activePath(context,'claude')),true);
 assert.ok(result.stdout.split('\n').includes('Dispatch history stays in '+path.join(path.dirname(oldAnchor),'arc-role-dispatch')+'.'),result.stdout);
});

test('reapply snapshot drift holds without partial publish',async t=>{
 const fixture=await installedComposite(t),{context,homes}=fixture;
 const before=routingBytes(fixture),filename=path.join(homes.claude,'skills/arc/settings.toml');
 let changed=false;
 const result=await reapply({...context,hooks:{fault({phase,plan}){
  if(!changed&&phase==='before-prepare'&&plan.target.platform==='claude'){
   changed=true;
   fs.appendFileSync(filename,'\n# concurrent Configure\n');
  }
 }}});
 assert.ok(changed);
 assert.equal(result.status,'held');
 assert.equal(result.code,1);
 assert.match(result.error.message,/changed|drift/i);
 assert.match(fs.readFileSync(filename,'utf8'),/concurrent Configure/);
 assert.deepEqual(routingBytes(fixture),before);
});

test('an active bridge holds composite reapply without publishing',async t=>{
 const fixture=await installedComposite(t),{context,homes}=fixture;
 const now=new Date().toISOString();
 await createLease(homes.claude,{version:1,dispatchId:'active-1',workflowId:'wf-1',taskId:'task-1',requestId:'req-1',role:'arc_planner',route:'bridge',hostPlatform:'claude',executionEnvironment:'claude-cli',revision:'before-upgrade',profileHash:null,argsDigest:null,state:'running',supervisor:null,child:null,sessionId:null,timeoutMinutes:20,claims:null,reasons:[],allowedPaths:[],resultPath:null,segment:0,nativeAgentId:null,createdAt:now,updatedAt:now});
 const before=routingBytes(fixture),result=await upgrade(context);
 assert.equal(result.code,1,result.stderr);
 assert.match(result.stderr,/Configuration was not re-applied\.\nActive bridge dispatches \(1\): active-1\nAfter they finish, run arc → Configure → Apply\./);
 assert.deepEqual(routingBytes(fixture),before);
});

function assertUnknownPublication(result,residual){
 assert.equal(result.code,1,result.stderr);
 assert.ok(result.stderr.startsWith('Configuration re-apply state is unknown.\n'),result.stderr);
 assert.ok(result.stderr.includes('Configuration publication state is unknown; inspect the reported paths before retrying.\n'),result.stderr);
 assert.ok(result.stderr.includes('Residual path: '+residual+'\n'),result.stderr);
 assert.doesNotMatch(result.stderr,/Configuration was not re-applied|Run arc/);
 assert.doesNotMatch(result.stdout,/Configuration re-applied:/);
}

test('composite child reports unknown publication when the published routing lock cannot be released',async t=>{
 const {context,config,homes,active}=await installedComposite(t);
 const lock=path.join(homes.claude,'arc-role-platform-routing.lock');
 const result=await upgrade(context,{fault({phase,path:filename}){
  if(phase==='after-publish'&&filename===active)fs.writeFileSync(lock,JSON.stringify({...json(lock),operationId:'changed-after-publish'}));
 }});
 const revision=json(active).revision;
 assert.notEqual(revision,config.revision);
 for(const home of Object.values(homes))assert.equal(json(path.join(home,markerName)).revision,revision);
 assert.equal(json(lock).operationId,'changed-after-publish');
 assertUnknownPublication(result,lock);
});

test('composite child reports a completed reapply when interrupted after publication',async t=>{
 const {context,config,homes,active}=await installedComposite(t);
 const result=await upgrade(context,{fault({phase,path:filename}){
  if(phase==='after-publish'&&filename===active)process.emit('SIGINT');
 }});
 const revision=json(active).revision;
 assert.notEqual(revision,config.revision);
 for(const home of Object.values(homes))assert.equal(json(path.join(home,markerName)).revision,revision);
 assert.equal(fs.existsSync(path.join(homes.claude,'arc-role-platform-routing.lock')),false);
 assert.equal(result.code,130);
 assert.match(result.stdout,/Configuration re-applied: Mixed routing \(Claude \+ Codex\)\.\n/);
 assert.equal(result.stderr,'Interrupted after the configuration was re-applied.\n');
});

test('composite child reports no reapply when interrupted before publication',async t=>{
 const fixture=await installedComposite(t);
 const before=routingBytes(fixture);
 const result=await upgrade(fixture.context,{fault({phase,plan}){
  if(phase==='before-prepare'&&plan.config)process.emit('SIGINT');
 }});
 assert.deepEqual(routingBytes(fixture),before);
 assert.equal(result.code,130);
 assert.match(result.stderr,/^Configuration was not re-applied\.\n/);
 assert.doesNotMatch(result.stdout,/Configuration re-applied:/);
});

async function installStandalone(context,ids){
 for(const [index,target] of ids.entries()){
  const {catalog}=await loadStaticModelCatalog(target);
  const {model,effort}=catalog.pairs[0],field=DEFAULT_INSTALLER_REGISTRY.getPlatform(target).runtime.models.effortField;
  const roles=Object.fromEntries(ROLES.map(role=>[role,{model,[field]:effort}]));
  const result=await executeOperation(context,await prepareOperation(context,{kind:'install',target,roles,verifiedCatalog:catalog,...settings,...(index?{language:'en',runMode:'supervised',maxTotalSubagents:37,maxConcurrentSubagents:2}:{})}));
  assert.equal(result.code,0,JSON.stringify(result));
 }
}

test('standalone child reports the applied platforms when interrupted before the rest',async t=>{
 const context=await compositeContext(t);
 await installStandalone(context,['claude','codex']);
 const prepared=[];
 let interrupted=false;
 const result=await upgrade(context,{fault({phase,plan}){
  if(phase==='before-prepare')prepared.push(plan.target.platform);
  if(phase==='after-cleanup-item'&&plan.target.platform==='claude'&&!interrupted){
   interrupted=true;
   process.emit('SIGINT');
  }
 }});
 assert.ok(interrupted);
 assert.deepEqual(prepared,['claude']);
 assert.equal(result.code,130);
 assert.equal(result.stderr,'Configuration was re-applied only for: Claude.\nInterrupted before the remaining platforms were re-applied.\nRun arc → Configure → Apply to re-apply the configuration.\n');
 assert.doesNotMatch(result.stdout,/Configuration re-applied:/);
});

test('standalone child reports unknown publication when rollback cannot restore a published target',async t=>{
 const context=await compositeContext(t);
 await installStandalone(context,['claude']);
 const skill=path.join(targets(context).claude.home,'skills/arc');
 let published=false,rollbackFailed=false;
 const result=await upgrade(context,{fault({phase,path:filename}){
  if(filename!==skill)return;
  if(phase==='after-publish'){
   published=true;
   throw Error('fixture failure after publication');
  }
  if(phase==='before-rollback'){
   rollbackFailed=true;
   throw Error('fixture failure during rollback');
  }
 }});
 assert.ok(published&&rollbackFailed);
 assertUnknownPublication(result,skill);
});

test('standalone child stops before the next platform when publication is unknown',async t=>{
 const context=await compositeContext(t);
 await installStandalone(context,['claude','codex']);
 const skill=path.join(targets(context).claude.home,'skills/arc');
 const attempted=[];
 const result=await upgrade(context,{fault({phase,path:filename,plan}){
  if(phase==='before-prepare')attempted.push(plan.target.platform);
  if(filename===skill&&(phase==='after-publish'||phase==='before-rollback'))throw Error('fixture failure at '+phase);
 }});
 assertUnknownPublication(result,skill);
 assert.deepEqual(attempted,['claude']);
});

for(const ids of [['claude'],['claude','codex'],['claude','codex','gemini','grok']])test('standalone child preserves settings for '+ids.join(', '),async t=>{
 const context=await compositeContext(t);
 await installStandalone(context,ids);
 const homes=ids.map(id=>context.userHome+'/.'+id);
 const before=homes.map(configBytes);
 const result=await upgrade(context);
 assert.equal(result.code,0,result.stderr);
 assert.ok(result.stdout.includes('Configuration re-applied: '+ids.map(id=>id[0].toUpperCase()+id.slice(1)).join(', ')+'.\n'));
 assert.deepEqual(homes.map(configBytes),before);
});

test('standalone reapply requests match unchanged Configure Apply',async t=>{
 const context=await compositeContext(t),ids=['claude','codex'];
 await installStandalone(context,ids);
 const statuses=await collectStatus(context),installState=currentInstallState(context);
 const {buildReapplyRequest}=await reapplyApi();
 for(const id of ids){
  const field=DEFAULT_INSTALLER_REGISTRY.getPlatform(id).runtime.models.effortField;
  const expected=await runInstallFlow({
   ui:{menu:async()=>10},statuses,draft:{hosts:[id],roles:Object.fromEntries(Object.entries(loadRoleDefaults({context,statuses,target:id})).map(([role,value])=>[role,{platform:id,model:value.model,effort:value[field]}]))},
   installState,loadRoleDefaults:target=>loadRoleDefaults({context,statuses,target}),
   loadCatalog:loadStaticModelCatalog,prepare:request=>request,
  });
  const request=await buildReapplyRequest({context,statuses,installState,target:id});
  assert.deepEqual(request,expected);
 }
 const applied=[];
 const result=await reapply({...context,hooks:{fault({phase,plan}){if(phase==='before-prepare')applied.push(plan.target.platform);}}});
 assert.equal(result.code,0,result.error?.message);
 assert.deepEqual(applied,ids);
});

test('standalone catalog failure preserves that home and records the successful Apply',async t=>{
 const context=await compositeContext(t);
 await installStandalone(context,['claude','codex']);
 const homes=targets(context),failed=homes.codex.home,applied=homes.claude.home;
 const tracked=['skills/arc/SKILL.md',...settingsFiles.map(name=>'skills/arc/'+name),'config.toml',...fs.readdirSync(path.join(failed,'agents')).map(name=>'agents/'+name)];
 const appliedSkill=path.join(applied,'skills/arc/SKILL.md');
 fs.appendFileSync(appliedSkill,'\n# stale fixture\n');
 const before=bytes(failed,tracked);
 const result=await reapply({...context,loadCatalog:id=>id==='codex'?{status:'unavailable'}:loadStaticModelCatalog(id)});
 assert.equal(result.status,'held');
 assert.equal(result.code,1);
 assert.deepEqual(result.applied,['claude']);
 assert.match(result.error.message,/Model catalog unavailable for Codex/);
 assert.doesNotMatch(fs.readFileSync(appliedSkill,'utf8'),/stale fixture/);
 assert.deepEqual(bytes(failed,tracked),before);
});

test('reapply skips an empty HOME',async t=>{
 const context=await compositeContext(t);
 assert.deepEqual(await reapply({...context,loadCatalog:()=>assert.fail('empty HOME should not load catalogs')}),{status:'skipped'});
});
