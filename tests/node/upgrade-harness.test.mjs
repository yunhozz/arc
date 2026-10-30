import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {openRoot} from '../../lib/safe-fs/index.mjs';import {loadNative} from '../../lib/safe-fs/native.mjs';import {resolveTarget} from '../../lib/installer/targets.mjs';import {buildInstallPlan} from '../../lib/installer/plan.mjs';import {applyTransaction} from '../../lib/installer/transaction.mjs';import {loadModelConfig,serializeModelConfig} from '../../lib/models/index.mjs';import {referenceFixture} from './fixtures/fake-git.mjs';
import {staticPackageFixture,refreshManifest,sourceRoot} from './fixtures/static-references.mjs';import {verifyPayload} from '../../lib/installer/manifest.mjs';
const api=await import('../../lib/installer/upgrade.mjs').catch(()=>({})),stateApi=await import('../../lib/installer/upgrade-state.mjs').catch(()=>({}));const native=loadNative({artifactDirectory:'build/native'}),safeFs={openRoot:p=>openRoot(p,{native})};
function fixture(t){const home=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'arc-upgrade-harness-')));t.after(()=>fs.rmSync(home,{recursive:true,force:true}));return home;}
function payload(){const files=new Map(),modelInputs={};for(const platform of ['codex','claude']){const models=fs.readFileSync(platform+'/skill/models.toml'),profiles=new Map();for(const role of ['scouter','planner','implementer','qa','reviewer']){const name=`arc-${role}.${platform==='codex'?'toml':'md'}`;profiles.set(name,fs.readFileSync(platform+'/agents/'+name));}files.set(platform+'/skill/SKILL.md',Buffer.from('new harness {{ARC_OUTPUT_LANGUAGE_POLICY}}'));files.set(platform+'/skill/references/brainstorming.md',Buffer.from('package pinned'));modelInputs[platform]={models,profiles};}return{files,modelInputs};}
function seed(home,platform,skipGlobal=false){const target=resolveTarget(platform,{userHome:home,env:{},cwd:home});applyTransaction(buildInstallPlan({payload:payload(),target,preset:platform==='codex'?'smart':'economy',language:platform==='codex'?'ko':'en',safeFs,skipGlobal,limits:{max_total_subagents:37,max_concurrent_subagents:3}}),{safeFs});const legacy=target.home+'/skills/arc/references/superpowers';fs.mkdirSync(legacy,{recursive:true});fs.writeFileSync(legacy+'/obsolete','legacy nested');const filename=target.home+'/skills/arc/models.toml',config=loadModelConfig(fs.readFileSync(filename),platform);for(const role of Object.values(config.roles))for(const preset of Object.values(role))preset.model=platform==='codex'?'custom-codex':'custom-claude';fs.writeFileSync(filename,serializeModelConfig(config));const native=platform==='codex'?'[agents]\nmax_concurrent_threads_per_session = 9\n':'{"env":{"CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS":"9"}}\n';fs.writeFileSync(target.runtimeConfigPath,native);return{target,config,native};}
for(const platform of ['codex','claude'])test(`${platform} upgrades same-version harness with all settings and native drift preserved`,async t=>{const home=fixture(t),old=seed(home,platform),state=stateApi.collectInstalledState({safeFs,userHome:home,env:{},cwd:home});assert.equal(typeof api.buildUpgradePlans,'function');const plans=api.buildUpgradePlans({payload:payload(),state,safeFs});assert.equal(plans[0].preset,old.config.preset);assert.deepEqual(loadModelConfig(plans[0].generated.models,platform),old.config);const {installTargets}=await import('../../lib/installer/install.mjs');const result=await installTargets(plans,{safeFs,acquisition:async()=>({references:referenceFixture()})});assert.equal(result.results[0].status,'installed');assert.equal(fs.readFileSync(old.target.runtimeConfigPath,'utf8'),old.native);assert.deepEqual(loadModelConfig(fs.readFileSync(old.target.home+'/skills/arc/models.toml'),platform),old.config);assert.match(fs.readFileSync(old.target.home+'/skills/arc/SKILL.md','utf8'),/new harness/);assert.equal(plans[0].language,platform==='codex'?'ko':'en');assert.equal(plans[0].limits.max_concurrent_subagents,3);});
test('absent global blocks stay absent and external skill sentinel survives',async t=>{const home=fixture(t),old=seed(home,'codex',true);fs.writeFileSync(old.target.instructionPath,'user instructions\n');fs.writeFileSync(home+'/.zshrc','user shell\n');fs.mkdirSync(old.target.home+'/skills/user-skill');fs.writeFileSync(old.target.home+'/skills/user-skill/sentinel','keep');const state=stateApi.collectInstalledState({safeFs,userHome:home,env:{},cwd:home}),plans=api.buildUpgradePlans({payload:payload(),state,safeFs});assert.deepEqual(plans[0].globalChanges,[]);const {installTargets}=await import('../../lib/installer/install.mjs');await installTargets(plans,{safeFs,acquisition:async()=>({references:referenceFixture()})});assert.equal(fs.readFileSync(old.target.instructionPath,'utf8'),'user instructions\n');assert.equal(fs.readFileSync(home+'/.zshrc','utf8'),'user shell\n');assert.equal(fs.readFileSync(old.target.home+'/skills/user-skill/sentinel','utf8'),'keep');});
test('shared completion has one owner and instruction user text survives',t=>{const home=fixture(t);for(const platform of ['codex','claude']){const {target}=seed(home,platform);fs.appendFileSync(target.instructionPath,'\nuser tail\n');}fs.writeFileSync(home+'/.zshrc','# user shell\n# >>> arc completion >>>\nold\n# <<< arc completion <<<\n# user tail\n');const plans=api.buildUpgradePlans({payload:payload(),state:stateApi.collectInstalledState({safeFs,userHome:home,env:{},cwd:home}),safeFs});assert.equal(plans.filter(p=>p.managedPaths.includes(home+'/.zshrc')).length,1);for(const plan of plans){assert.match(plan.globalChanges.find(x=>x.path===plan.target.instructionPath).content.toString(),/user tail/);}assert.equal(plans[0].globalChanges.find(x=>x.path===home+'/.zshrc').content.toString(),'# user shell\n# user tail\n');assert.equal(plans[1].snapshot.has(home+'/.zshrc'),false);});
test('changed snapshot fails planning before payload writes',t=>{const home=fixture(t),old=seed(home,'codex'),state=stateApi.collectInstalledState({safeFs,userHome:home,env:{},cwd:home});fs.appendFileSync(old.target.home+'/skills/arc/models.toml','\n# changed\n');assert.throws(()=>api.buildUpgradePlans({payload:payload(),state,safeFs}),{code:'ARC_INSTALL_DRIFT'});assert.match(fs.readFileSync(old.target.home+'/skills/arc/models.toml','utf8'),/# changed/);});
test('second target preparation failure reports first installed and second unchanged',async t=>{const home=fixture(t);seed(home,'codex');const old=seed(home,'claude'),before=fs.readFileSync(old.target.home+'/skills/arc/models.toml');const state=stateApi.collectInstalledState({safeFs,userHome:home,env:{},cwd:home}),plans=api.buildUpgradePlans({payload:payload(),state,safeFs});const {installTargets}=await import('../../lib/installer/install.mjs');const result=await installTargets(plans,{safeFs,hooks:{fault(event){if(event.phase==='before-prepare'&&event.plan.target.platform==='claude')throw Error('second preparation failed');}}});assert.deepEqual(result.results.map(x=>x.status),['installed','failed']);assert.deepEqual(fs.readFileSync(old.target.home+'/skills/arc/models.toml'),before);});
test('second target publish failure restores prior bytes while first target stays upgraded',async t=>{
 const home=fixture(t),first=seed(home,'codex'),second=seed(home,'claude');
 function snapshot(directory){const entries=new Map();function visit(relative){const filename=path.join(directory,relative),stat=fs.lstatSync(filename);if(stat.isDirectory()){entries.set(relative,null);for(const name of fs.readdirSync(filename).sort())visit(path.join(relative,name));}else if(stat.isSymbolicLink())entries.set(relative,{link:fs.readlinkSync(filename)});else entries.set(relative,fs.readFileSync(filename));}visit('');return entries;}
 const before=snapshot(second.target.home),updated=payload();
 for(const platform of ['codex','claude'])updated.files.set(platform+'/skill/SKILL.md',Buffer.from('upgraded '+platform+' harness {{ARC_OUTPUT_LANGUAGE_POLICY}}'));
 const state=stateApi.collectInstalledState({safeFs,userHome:home,env:{},cwd:home}),plans=api.buildUpgradePlans({payload:updated,state,safeFs});
 const {installTargets}=await import('../../lib/installer/install.mjs'),failure=Error('injected second target publish failure'),rolledBack=[];let injected=false;
 const result=await installTargets(plans,{safeFs,acquisition:async()=>({references:referenceFixture()}),hooks:{fault(event){
  if(event.plan.target.platform!=='claude')return;
  if(event.phase==='after-publish'&&event.path===second.target.home+'/skills/arc'){
   assert.match(fs.readFileSync(event.path+'/SKILL.md','utf8'),/upgraded claude harness/);injected=true;throw failure;
  }
  if(event.phase==='after-rollback')rolledBack.push(event.path);
 }}});
 assert.equal(injected,true);assert.deepEqual(result.results.map(x=>x.status),['installed','failed']);
 assert.equal(result.results[1].rollback,'restored');assert.equal(result.results[1].error.cause,failure);assert.deepEqual(result.results[1].residualPaths,[]);
 assert.ok(rolledBack.includes(second.target.home+'/skills/arc'));assert.deepEqual(snapshot(second.target.home),before);
 assert.match(fs.readFileSync(first.target.home+'/skills/arc/SKILL.md','utf8'),/upgraded codex harness/);
});
test('upgrade wrapper verifies invoked static payload and reports actual package version',async t=>{const home=fixture(t),packageRoot=staticPackageFixture(t);seed(home,'codex');const state=stateApi.collectInstalledState({safeFs,userHome:home,env:{},cwd:home});assert.equal(typeof api.upgradeInstalledTargets,'function');const result=await api.upgradeInstalledTargets({packageRoot,state,safeFs,acquisition:async()=>assert.fail('automatic acquisition must not run')});assert.equal(result.version,JSON.parse(fs.readFileSync(packageRoot+'/package.json','utf8')).version);assert.equal(result.results[0].status,'installed');assert.equal(fs.existsSync(home+'/.codex/skills/arc/references/superpowers'),false);});
test('unrecorded prior harness version stays absent while upgrade reports the invoked package version',async t=>{
 const home=fixture(t),old=seed(home,'codex'),arc=path.join(old.target.home,'skills/arc');
 const settings=new Map(['settings.toml','models.toml','limits.toml'].map(name=>[name,fs.readFileSync(path.join(arc,name))]));
 const assertUnrecorded=state=>{
  assert.deepEqual(Object.keys(state).filter(key=>/version/i.test(key)),[]);
  for(const target of state.targets)assert.deepEqual(Object.keys(target).filter(key=>/version/i.test(key)),[]);
 };
 const state=stateApi.collectInstalledState({safeFs,userHome:home,env:{},cwd:home});assertUnrecorded(state);
 const input=payload(),plans=api.buildUpgradePlans({payload:input,state,safeFs});
 const expectedFiles=[...input.files.keys()].filter(name=>name.startsWith('codex/skill/')).map(name=>name.slice('codex/skill/'.length));
 assert.deepEqual([...plans[0].generated.skill.keys()].sort(),[...new Set([...expectedFiles,...settings.keys()])].sort());
 const result=await api.upgradeInstalledTargets({packageRoot:staticPackageFixture(t),state,safeFs,acquisition:async()=>assert.fail('automatic acquisition must not run')});
 assert.equal(result.results[0].status,'installed');
 assert.equal(result.version,JSON.parse(fs.readFileSync('package.json','utf8')).version);
 assert.deepEqual(Object.keys(result).filter(key=>/version/i.test(key)),['version']);
 for(const item of result.results)assert.deepEqual(Object.keys(item).filter(key=>/version/i.test(key)),[]);
 for(const [name,bytes]of settings)assert.deepEqual(fs.readFileSync(path.join(arc,name)),bytes);
 const packagedRoots=fs.readFileSync('MANIFEST.sha256','utf8').split('\n').map(line=>/^[a-f0-9]{64}  codex\/skill\/(.+)$/.exec(line)?.[1]).filter(Boolean).map(name=>name.split('/')[0]);
 assert.deepEqual(fs.readdirSync(arc).sort(),[...new Set([...packagedRoots,...settings.keys()])].sort());
 assertUnrecorded(stateApi.collectInstalledState({safeFs,userHome:home,env:{},cwd:home}));
});

test('static upgrade never opens an acquisition workspace and leaves package unchanged',async t=>{
 const home=fixture(t),old=seed(home,'codex'),filename=old.target.home+'/skills/arc/models.toml',before=fs.readFileSync(filename),state=stateApi.collectInstalledState({safeFs,userHome:home,env:{},cwd:home});let work;
 const rejectingFs={openRoot:filename=>{if(path.basename(filename).startsWith('arc-acquire-')){work=filename;throw Error('Cannot open private workspace');}return safeFs.openRoot(filename);}};
 t.after(()=>{if(work)fs.rmSync(work,{recursive:true,force:true});});
 const packageRoot=staticPackageFixture(t),manifest=fs.readFileSync(packageRoot+'/MANIFEST.sha256'),result=await api.upgradeInstalledTargets({packageRoot,state,safeFs:rejectingFs});
 assert.equal(result.results[0].status,'installed');assert.deepEqual(fs.readFileSync(filename),before);assert.equal(work,undefined);assert.deepEqual(fs.readFileSync(packageRoot+'/MANIFEST.sha256'),manifest);
});
test('source auto upgrade excludes a regular worktree-local wrapper from verified files and installed trees',async t=>{const home=fixture(t),packageRoot=staticPackageFixture(t),wrapper='scripts/update-superpowers-local.sh';seed(home,'codex');fs.writeFileSync(packageRoot+'/.git','gitdir: /unfollowed/worktree/metadata\n');fs.writeFileSync(packageRoot+'/'+wrapper,'#!/bin/sh\nexit 99\n');refreshManifest(packageRoot);const bytes=fs.readFileSync(packageRoot+'/'+wrapper),state=stateApi.collectInstalledState({safeFs,userHome:home,env:{},cwd:home}),payload=verifyPayload({packageRoot,safeFs}),result=await api.upgradeInstalledTargets({packageRoot,state,safeFs,acquisition:async()=>assert.fail('automatic acquisition must not run')});assert.equal(result.results[0].status,'installed');assert.equal(payload.files.has(wrapper),false);assert.equal(fs.existsSync(home+'/.codex/skills/arc/'+wrapper),false);assert.deepEqual(fs.readFileSync(home+'/.codex/skills/arc/references/brainstorming.md'),payload.files.get('codex/skill/references/brainstorming.md'));assert.deepEqual(fs.readFileSync(packageRoot+'/'+wrapper),bytes);});

for(const platform of ['codex','claude'])test(`${platform} canonical profile publication failure restores profiles and settings`,t=>{
 const home=fixture(t),old=seed(home,platform),current=old.target.home+'/agents/arc-implementer.'+(platform==='codex'?'toml':'md'),models=old.target.home+'/skills/arc/models.toml';
 const profileBytes=fs.readFileSync(current),modelBytes=fs.readFileSync(models);
 const state=stateApi.collectInstalledState({safeFs,userHome:home,env:{},cwd:home}),plan=api.buildUpgradePlans({payload:payload(),state,safeFs})[0];
 assert.throws(()=>applyTransaction(plan,{safeFs,acquired:{references:referenceFixture()},hooks:{fault(event){if(event.phase==='after-publish'&&event.path===current)throw Error('injected publication failure');}}}),error=>error.rollback==='restored');
 assert.deepEqual(fs.readFileSync(current),profileBytes);assert.deepEqual(fs.readFileSync(models),modelBytes);
});

const currentWrapper=sourceRoot+'/scripts/update-superpowers-local.sh';
test('source auto upgrade excludes the current worktree local wrapper',{skip:process.env.ARC_REQUIRE_LOCAL_UPDATER!=='1'&&!fs.existsSync(currentWrapper)?'worktree-local updater is not provided in this clone':false},async t=>{
 assert.ok(fs.existsSync(currentWrapper),'required local updater is missing');
 assert.ok(fs.lstatSync(currentWrapper).isFile());
 const home=fixture(t);seed(home,'codex');
 const input={packageRoot:sourceRoot,safeFs},wrapper=fs.readFileSync(currentWrapper),manifest=fs.readFileSync(sourceRoot+'/MANIFEST.sha256'),payload=verifyPayload(input);
 assert.equal(payload.files.has('scripts/update-superpowers-local.sh'),false);
 const state=stateApi.collectInstalledState({safeFs,userHome:home,env:{},cwd:home});
 const result=await api.upgradeInstalledTargets({...input,state});
 assert.equal(result.results[0].status,'installed');
 const installed=home+'/.codex/skills/arc';
 assert.deepEqual(fs.readFileSync(installed+'/references/brainstorming.md'),payload.files.get('codex/skill/references/brainstorming.md'));
 assert.equal(fs.existsSync(installed+'/scripts/update-superpowers-local.sh'),false);
 assert.equal(fs.existsSync(installed+'/references/superpowers'),false);
 assert.deepEqual(fs.readFileSync(currentWrapper),wrapper);assert.deepEqual(fs.readFileSync(sourceRoot+'/MANIFEST.sha256'),manifest);
 assert.deepEqual(verifyPayload(input).files,payload.files);
});

for(const platform of ['codex','claude'])for(const active of [false,true])test(platform+' offline upgrade preserves '+(active?'active':'inactive')+' Custom settings',t=>{
 const home=fixture(t),old=seed(home,platform),filename=old.target.home+'/skills/arc/models.toml',config=loadModelConfig(fs.readFileSync(filename),platform),field=platform==='codex'?'model_reasoning_effort':'effort';
 config.custom=Object.fromEntries(['arc_scouter','arc_planner','arc_implementer','arc_qa','arc_reviewer'].map(role=>[role,{model:'fixture-model',[field]:'high'}]));if(active)config.preset='custom';fs.writeFileSync(filename,serializeModelConfig(config));
 const state=stateApi.collectInstalledState({safeFs,userHome:home,env:{},cwd:home}),fetchBefore=globalThis.fetch;globalThis.fetch=async()=>assert.fail('offline upgrade fetched catalog');
 try{const plans=api.buildUpgradePlans({payload:payload(),state,safeFs});assert.deepEqual(loadModelConfig(plans[0].generated.models,platform),config);if(active)for(const bytes of plans[0].generated.profiles.values())assert.match(bytes.toString(),/fixture-model/);}finally{globalThis.fetch=fetchBefore;}
});
test('upgrade plans Codex diagnostic registration using the freshly detected CLI',t=>{
 const home=fixture(t);seed(home,'codex',true);const input=payload();input.files.set('codex/skill/runtime/native-hook.mjs',fs.readFileSync('codex/skill/runtime/native-hook.mjs'));
 const state=stateApi.collectInstalledState({safeFs,userHome:home,env:{},cwd:home}),cli={status:'detected',executablePath:'/fixture/codex',realpath:'/fixture/codex',version:'0.111.0',failureBlocking:false};
 const plan=api.buildUpgradePlans({payload:input,state,safeFs,nativeCli:cli,nodePath:'/fixture/node'})[0];
 assert.equal(plan.nativeHooks.record.cli.version,'0.111.0');assert.match(plan.globalChanges.find(c=>c.path===plan.target.runtimeConfigPath).content.toString(),/\[\[hooks\.PreToolUse\]\]/);
});
test('upgrade execution detects Codex from the provided PATH and installs its hook',async t=>{
 const home=fixture(t);seed(home,'codex',true);const bin=path.join(home,'bin');fs.mkdirSync(bin);fs.writeFileSync(path.join(bin,'codex'),'#!/bin/sh\nprintf "codex-cli 0.111.0\\n"\n',{mode:0o755});
 const state=stateApi.collectInstalledState({safeFs,userHome:home,env:{PATH:bin},cwd:home});
 const result=await api.upgradeInstalledTargets({packageRoot:staticPackageFixture(t),state,safeFs,env:{PATH:bin},cwd:home});
 assert.equal(result.results[0].status,'installed');const record=JSON.parse(fs.readFileSync(path.join(home,'.codex/skills/arc/native-hooks.json')));assert.equal(record.cli.executablePath,path.join(bin,'codex'));assert.equal(record.cli.version,'0.111.0');
});
