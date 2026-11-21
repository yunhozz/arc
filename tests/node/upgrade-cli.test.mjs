import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {runNpxUpgrade} from '../../lib/npm/upgrade.mjs';
const update=await import('../../lib/management/update.mjs');
const {runChild}=await import('../../lib/cli/upgrade.mjs');
// Service-level upgrade regressions remain after removing the public CLI parser.
async function executePreparedUpdate(streams,deps){
 try{const result=await update.executeUpdate(deps,await update.prepareUpdate(deps));for(const message of result.messages??[])streams.output.write(message);if(result.stdout)streams.output.write(result.stdout);if(result.stderr)streams.error.write(result.stderr);if(result.error)update.failure(result.error,streams.error);else if(result.version)update.report(result,streams.output,streams.error);if(result.code!==0)streams.error.write('Retry from Status or Configure.');return result.code;}catch(error){return update.failure(error,streams.error);}
}
const api={runChild};
test('incomplete harness update directs the user to Configure',()=>{
 let stderr='';
 assert.equal(update.report({version:'1.2.3',results:[{platform:'codex',status:'failed'}]},{write(){}},{write:text=>{stderr+=text;}}),1);
 assert.equal(stderr,'Harness update did not complete. Run arc again and choose Configure to retry the harness update.\n');
});
function io(){let out='',err='';return{output:{write:s=>{out+=s;}},error:{write:s=>{err+=s;}},text:()=>out+err};}
function dependencies(kind='global'){const events=[],context={kind,prefix:'/prefix',packageRoot:'/package'},state={targets:[{target:{platform:'codex'},snapshot:new Map()}],stateToken:'a'.repeat(64)};return{events,context,state,safeFs:{},userHome:'/home',packageRoot:process.cwd(),inspectNpmContext:async()=>context,collectInstalledState:()=>state,resolveLatest:async()=>{events.push('latest');return{name:'@yunhozz/arc',version:'1.2.3'};},upgradeGlobal:async({expectedVersion})=>{assert.equal(expectedVersion,'1.2.3');events.push('package');return{packageStatus:'updated',version:'1.2.3'};},runUpgradeChild:async({request})=>{events.push('child');assert.equal(request.expectedVersion,'1.2.3');assert.equal(request.expectedStateToken,state.stateToken);return{code:0,stdout:'new child harness\n',stderr:''};},runNpxUpgrade:async({expectedVersion,expectedStateToken})=>{events.push('npx');assert.equal(expectedVersion,'1.2.3');assert.equal(expectedStateToken,state.stateToken);let stdout='',stderr='';const code=update.report({version:expectedVersion,results:[{platform:'codex',status:'installed',rollback:'not-needed',residualPaths:[]}],interrupted:false},{write:s=>stdout+=s},{write:s=>stderr+=s});return{code,stdout,stderr,signal:null};},upgradeInstalledTargets:async()=>{events.push('harness');return{version:'0.1.5',results:[{platform:'codex',status:'installed',rollback:'not-needed',residualPaths:[]}],interrupted:false};}};}
test('removed upgrade public command rejects even help without loading installer',t=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'arc-upgrade-removed-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));for(const file of ['bin/arc.mjs','lib/cli/root.mjs','package.json']){fs.mkdirSync(path.dirname(root+'/'+file),{recursive:true});fs.copyFileSync(file,root+'/'+file);}for(const args of [['upgrade'],['upgrade','--help']]){const result=spawnSync(process.execPath,[root+'/bin/arc.mjs',...args],{encoding:'utf8'});assert.equal(result.status,2,result.stderr);assert.equal(result.stdout,'');}});
test('global upgrade replaces package before a fresh child and never applies old harness',async()=>{const output=io(),deps=dependencies();assert.equal(await executePreparedUpdate(output,deps),0,output.text());assert.deepEqual(deps.events,['latest','package','child']);assert.match(output.text(),/CLI.*1\.2\.3/);assert.match(output.text(),/new child harness/);});
test('npx resolves latest during preparation then executes the pinned payload without global replacement',async()=>{const output=io(),deps=dependencies('npx');assert.equal(await executePreparedUpdate(output,deps),0,output.text());assert.deepEqual(deps.events,['latest','npx']);assert.match(output.text(),/1\.2\.3/);});
test('unsupported missing and damaged installations stop before package writes',async()=>{for(const variant of ['unsupported','missing','damaged']){const output=io(),deps=dependencies();if(variant==='unsupported')deps.context.kind='unsupported';if(variant==='missing')deps.state.targets=[];if(variant==='damaged')deps.collectInstalledState=()=>{throw Object.assign(Error('broken settings'),{code:'ARC_TARGET_CONFIGURATION'});};assert.equal(await executePreparedUpdate(output,deps),2,output.text());assert.deepEqual(deps.events,variant==='missing'?['latest']:[]);assert.equal(deps.events.some(event=>['package','child','npx'].includes(event)),false);}});
test('package failure never starts child and child failure preserves package success report',async()=>{for(const where of ['package','child']){const output=io(),deps=dependencies();if(where==='package')deps.upgradeGlobal=async()=>({packageStatus:'failed',error:Error('replacement failed')});else deps.runUpgradeChild=async()=>({code:1,stdout:'codex: failed\n',stderr:'harness failed\n'});assert.equal(await executePreparedUpdate(output,deps),1,output.text());assert.doesNotMatch(output.text(),/ARC.*upgraded!/);if(where==='package')assert.deepEqual(deps.events,['latest']);else assert.match(output.text(),/CLI.*1\.2\.3/);assert.match(output.text(),/retry|Retry/);}});
test('private child rejects invalid protocol version identity and changed state before harness writes',async()=>{assert.equal(typeof api.runChild,'function');for(const variant of ['protocol','version','state','identity']){const deps=dependencies();deps.context.packageRoot=process.cwd();const request={protocol:1,expectedVersion:JSON.parse(fs.readFileSync('package.json')).version,invocationCwd:process.cwd(),expectedStateToken:'a'.repeat(64)};if(variant==='protocol')request.protocol=2;if(variant==='version')request.expectedVersion='99.0.0';if(variant==='state')request.expectedStateToken='b'.repeat(64);if(variant==='identity')deps.context.kind='npx';const output=io();assert.notEqual(await api.runChild(request,output,deps),0,output.text());assert.deepEqual(deps.events,[]);}});
test('private child classifies malformed invocation paths as input errors',async()=>{for(const invocationCwd of [null,7,{},'relative']){const output=io(),deps=dependencies();assert.equal(await api.runChild({protocol:1,expectedVersion:JSON.parse(fs.readFileSync('package.json')).version,invocationCwd,expectedStateToken:'a'.repeat(64)},output,deps),2,output.text());assert.deepEqual(deps.events,[]);}});
test('successful harness update reports the version and target without completion setup guidance',async()=>{const output=io();assert.equal(await executePreparedUpdate(output,dependencies('npx')),0);assert.match(output.text(),/ARC harness updated to 1\.2\.3\./);assert.match(output.text(),/Codex: harness updated/);assert.doesNotMatch(output.text(),/Previous.*version/);assert.doesNotMatch(output.text(),/rollback/i);assert.doesNotMatch(output.text(),/completion|eval |new.*shell.*session/i);});
test('registry failure and harness cancellation never become a successful upgrade',async()=>{const output=io(),deps=dependencies();deps.resolveLatest=async()=>{throw Error('registry unavailable');};assert.equal(await executePreparedUpdate(output,deps),2);assert.deepEqual(deps.events,[]);const cancelled=dependencies('npx');cancelled.runNpxUpgrade=async()=>({code:130,signal:null,stdout:'codex: interrupted\n',stderr:''});assert.equal(await executePreparedUpdate(io(),cancelled),130);});
test('global harness cancellation forwards child target and recovery output with exit 130',async()=>{const output=io(),deps=dependencies();deps.runUpgradeChild=async()=>({code:130,signal:null,stdout:'codex: installed; rollback: not-needed\nclaude: interrupted; rollback: restored\n',stderr:'Residual path: /recovery/claude-stage\n'});assert.equal(await executePreparedUpdate(output,deps),130);assert.match(output.text(),/codex: installed; rollback: not-needed/);assert.match(output.text(),/claude: interrupted; rollback: restored/);assert.match(output.text(),/Residual path: \/recovery\/claude-stage/);});

function childFixture() {
 const deps=dependencies(),streams=io();
 deps.context.packageRoot=deps.packageRoot;
 const request={protocol:1,expectedVersion:JSON.parse(fs.readFileSync('package.json')).version,invocationCwd:process.cwd(),expectedStateToken:deps.state.stateToken};
 const reapplyWith=result=>{deps.reapplyConfiguration=async()=>{deps.events.push('reapply');return result;};};
 reapplyWith({status:'skipped'});
 return {deps,streams,reapplyWith,run:()=>runChild(request,streams,deps)};
}

test('child reapplies configuration only after harness success',async()=>{
 const fixture=childFixture();
 fixture.reapplyWith({status:'applied',mode:'composite',platforms:['codex','claude'],code:0,residualPaths:['/recovery/arc']});
 assert.equal(await fixture.run(),0);
 assert.deepEqual(fixture.deps.events,['harness','reapply']);
 assert.match(fixture.streams.text(),/ARC harness updated to 0\.1\.5\.\nConfiguration re-applied: Mixed routing \(Claude \+ Codex\)\.\nResidual path: \/recovery\/arc\n/);
});

test('child skips reapply when nothing is installed and keeps output unchanged',async()=>{
 const fixture=childFixture();
 assert.equal(await fixture.run(),0);
 assert.equal(fixture.streams.text(),'Codex: harness updated\nARC harness updated to 0.1.5.\n');
 assert.deepEqual(fixture.deps.events,['harness','reapply']);
});

test('child never reapplies after harness failure or interrupt',async()=>{
 for(const [code,status,abort] of [[1,'failed',false],[130,'interrupted',false],[130,'installed',true]]){
  const fixture=childFixture();
  fixture.deps.upgradeInstalledTargets=async()=>{
   fixture.deps.events.push('harness');
   if(abort)process.emit('SIGINT');
   return {version:'0.1.5',results:[{platform:'codex',status}],interrupted:status==='interrupted'};
  };
  assert.equal(await fixture.run(),code);
  assert.deepEqual(fixture.deps.events,['harness']);
 }
});

test('child gives Configure Apply guidance on stderr when interrupted after harness success',async()=>{
 const fixture=childFixture();
 const upgradeHarness=fixture.deps.upgradeInstalledTargets;
 let stderr='';
 fixture.streams.error.write=text=>{stderr+=text;};
 fixture.deps.upgradeInstalledTargets=async()=>{
  const result=await upgradeHarness();
  process.emit('SIGINT');
  return result;
 };
 assert.equal(await fixture.run(),130);
 assert.deepEqual(fixture.deps.events,['harness']);
 assert.equal(stderr,'Configuration was not re-applied.\nRun arc → Configure → Apply to re-apply the configuration.\n');
});

test('child reports held reapply with active dispatches and exits 1',async()=>{
 const fixture=childFixture();
 fixture.reapplyWith({status:'held',mode:'composite',code:1,activeDispatches:['bridge-1','bridge-2'],error:Error('active dispatch'),residualPaths:[]});
 assert.equal(await fixture.run(),1);
 assert.match(fixture.streams.text(),/Configuration was not re-applied\.\nActive bridge dispatches \(2\): bridge-1, bridge-2\nAfter they finish, run arc → Configure → Apply\.\n/);
});

test('child reports partial standalone reapply and exits 1',async()=>{
 const fixture=childFixture();
 fixture.reapplyWith({status:'held',mode:'standalone',code:1,applied:['codex'],error:Error('Model catalog unavailable for Claude'),residualPaths:[]});
 assert.equal(await fixture.run(),1);
 assert.match(fixture.streams.text(),/Configuration was re-applied only for: Codex\.\nConfiguration was not re-applied\.\nError: Model catalog unavailable for Claude\nRun arc → Configure → Apply to re-apply the configuration\.\n/);
});

test('child reports other reapply errors with exit 1 and interrupt with 130',async()=>{
 for(const code of [1,130]){
  const fixture=childFixture();
  fixture.deps.reapplyConfiguration=async()=>{if(code===130)process.emit('SIGINT');throw Error('reapply failed');};
  assert.equal(await fixture.run(),code);
  assert.match(fixture.streams.text(),/Configuration was not re-applied\.\nError: reapply failed\n/);
 }
});

test('npx bootstrap uses the pinned package reapply export or falls back to its harness reporter',async t=>{
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'arc-npx-bootstrap-')));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const env={...process.env,PATH:path.join(root,'bin')};
 fs.mkdirSync(path.join(root,'bin'));
 fs.mkdirSync(path.join(root,'lib','management'),{recursive:true});
 fs.writeFileSync(path.join(root,'bin','arc.mjs'),'');
 fs.symlinkSync('arc.mjs',path.join(root,'bin','arc'));
 fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'@yunhozz/arc',version:'1.2.3'}));
 const stateToken='a'.repeat(64);
 const exports=`
  export function runtime(){return {
   inspectNpmContext:({packageRoot})=>({kind:'npx',packageRoot}),
   collectInstalledState:()=>({targets:[{}],stateToken:'${stateToken}'}),
   upgradeInstalledTargets:()=>({text:'harness only'})
  };}
  export function report(result,output){output.write(result.text);return 0;}
 `;
 for(const withReapply of [false,true]){
  fs.writeFileSync(path.join(root,'lib','management','update.mjs'),exports+(withReapply
   ?"export async function upgradeAndReapply({api,root,state,output,signal,env,cwd,userHome}){if(root!==cwd||!state.targets.length||signal.aborted||!env.PATH||!userHome)throw Error('invalid upgrade context');output.write((await api.upgradeInstalledTargets()).text+' then reapply');return 1;}"
   :''));
  const result=await runNpxUpgrade({context:{kind:'npx',npmCli:'/fixture/npm'},expectedVersion:'1.2.3',expectedStateToken:stateToken,env,cwd:root,runNpm:async(_npm,args)=>{
   const [node,...bootstrap]=args.slice(args.indexOf('--')+1);
   return spawnSync(node,bootstrap,{cwd:root,env,encoding:'utf8'});
  }});
  assert.equal(result.stdout,withReapply?'harness only then reapply':'harness only',result.stderr);
  assert.equal(result.status,withReapply?1:0);
 }
});
