import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {openRoot} from '../../lib/safe-fs/index.mjs';import {loadNative} from '../../lib/safe-fs/native.mjs';import {resolveTarget} from '../../lib/installer/targets.mjs';import {buildInstallPlan} from '../../lib/installer/plan.mjs';import {applyTransaction} from '../../lib/installer/transaction.mjs';import {loadModelConfig,serializeModelConfig} from '../../lib/models/index.mjs';import {referenceFixture} from './fixtures/fake-git.mjs';
import {staticPackageFixture,refreshManifest,sourceRoot} from './fixtures/static-references.mjs';import {verifyPayload} from '../../lib/installer/manifest.mjs';
const api=await import('../../lib/installer/upgrade.mjs').catch(()=>({})),stateApi=await import('../../lib/installer/upgrade-state.mjs').catch(()=>({}));const native=loadNative({artifactDirectory:'build/native'}),safeFs={openRoot:p=>openRoot(p,{native})};
function fixture(t){const home=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'arc-upgrade-harness-')));t.after(()=>fs.rmSync(home,{recursive:true,force:true}));return home;}
function payload(){const files=new Map(),modelInputs={};for(const platform of ['codex','claude']){const models=fs.readFileSync(platform+'/skill/models.toml'),profiles=new Map();for(const role of ['scouter','planner','implementer','qa','reviewer']){const name=`arc-${role}.${platform==='codex'?'toml':'md'}`;profiles.set(name,fs.readFileSync(platform+'/agents/'+name));}files.set(platform+'/skill/SKILL.md',Buffer.from('new harness {{ARC_OUTPUT_LANGUAGE_POLICY}}'));files.set(platform+'/skill/references/brainstorming.md',Buffer.from('package pinned'));modelInputs[platform]={models,profiles};}return{files,modelInputs,agentRegistry:JSON.parse(fs.readFileSync(new URL('../../lib/prompts/agent-fragments.json',import.meta.url)))};}
function seed(home,platform,skipGlobal=false){const target=resolveTarget(platform,{userHome:home,env:{},cwd:home});applyTransaction(buildInstallPlan({payload:payload(),target,language:platform==='codex'?'ko':'en',safeFs,skipGlobal,limits:{max_total_subagents:37,max_concurrent_subagents:3}}),{safeFs});const legacy=target.home+'/skills/arc/references/superpowers';fs.mkdirSync(legacy,{recursive:true});fs.writeFileSync(legacy+'/obsolete','legacy nested');const filename=target.home+'/skills/arc/models.toml',config=loadModelConfig(fs.readFileSync(filename),platform);for(const role of Object.values(config.roles))role.model=platform==='codex'?'custom-codex':'custom-claude';fs.writeFileSync(filename,serializeModelConfig(config));const native=platform==='codex'?'[agents]\nmax_concurrent_threads_per_session = 9\n':'{"env":{"CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS":"9"}}\n';fs.writeFileSync(target.runtimeConfigPath,native);return{target,config,native};}
for(const platform of ['codex','claude'])test(`${platform} upgrades same-version harness with all settings and native drift preserved`,async t=>{const home=fixture(t),old=seed(home,platform),state=stateApi.collectInstalledState({safeFs,userHome:home,env:{},cwd:home});assert.equal(typeof api.buildUpgradePlans,'function');const plans=api.buildUpgradePlans({payload:payload(),state,safeFs});assert.deepEqual(loadModelConfig(plans[0].generated.models,platform).roles,old.config.roles);assert.deepEqual(loadModelConfig(plans[0].generated.models,platform),old.config);const {installTargets}=await import('../../lib/installer/install.mjs');const result=await installTargets(plans,{safeFs,acquisition:async()=>({references:referenceFixture()})});assert.equal(result.results[0].status,'installed');assert.equal(fs.readFileSync(old.target.runtimeConfigPath,'utf8'),old.native);assert.deepEqual(loadModelConfig(fs.readFileSync(old.target.home+'/skills/arc/models.toml'),platform),old.config);assert.match(fs.readFileSync(old.target.home+'/skills/arc/SKILL.md','utf8'),/new harness/);assert.equal(plans[0].language,platform==='codex'?'ko':'en');assert.equal(plans[0].limits.max_concurrent_subagents,3);});
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

for(const platform of ['codex','claude'])test(platform+' offline upgrade preserves active role settings',t=>{
 const home=fixture(t),old=seed(home,platform),filename=old.target.home+'/skills/arc/models.toml',config=loadModelConfig(fs.readFileSync(filename),platform),field=platform==='codex'?'model_reasoning_effort':'effort';
 config.roles=Object.fromEntries(['arc_scouter','arc_planner','arc_implementer','arc_qa','arc_reviewer'].map(role=>[role,{model:'fixture-model',[field]:'high'}]));fs.writeFileSync(filename,serializeModelConfig(config));
 const state=stateApi.collectInstalledState({safeFs,userHome:home,env:{},cwd:home}),fetchBefore=globalThis.fetch;globalThis.fetch=async()=>assert.fail('offline upgrade fetched catalog');
 try{const plans=api.buildUpgradePlans({payload:payload(),state,safeFs});assert.deepEqual(loadModelConfig(plans[0].generated.models,platform),config);for(const bytes of plans[0].generated.profiles.values())assert.match(bytes.toString(),/fixture-model/);}finally{globalThis.fetch=fetchBefore;}
});
for(const platform of ['codex','claude'])test(`${platform} upgrade profiles contain expanded shared instructions`,t=>{const home=fixture(t);seed(home,platform);const state=stateApi.collectInstalledState({safeFs,userHome:home,env:{},cwd:home});const plans=api.buildUpgradePlans({payload:payload(),state,safeFs});for(const bytes of plans[0].generated.profiles.values())assert.doesNotMatch(bytes.toString(),/ARC_AGENT_FRAGMENT/);});

for(const missing of [false,true])test(missing?'upgrade keeps legacy active values that are missing from the catalog':'upgrade keeps the installed v1 balanced values',async t=>{
 const home=fixture(t),target=resolveTarget('codex',{userHome:home,env:{}});seed(home,'codex');
 let text=fs.readFileSync(new URL('../fixtures/models-codex-v1.toml',import.meta.url),'utf8');if(missing)text=text.replaceAll('gpt-6.1-sol','legacy-unlisted');
 fs.writeFileSync(target.home+'/skills/arc/models.toml',text);
 const plans=api.buildUpgradePlans({payload:payload(),state:stateApi.collectInstalledState({safeFs,userHome:home,env:{},cwd:home}),safeFs});
 assert.match(plans[0].generated.models.toString(),/^version = 3$/m);assert.equal(loadModelConfig(plans[0].generated.models,'codex').roles.arc_planner.model,missing?'legacy-unlisted':'gpt-6.1-sol');
 assert.match(plans[0].generated.profiles.get('arc-planner.toml').toString(),new RegExp('^model = "'+(missing?'legacy-unlisted':'gpt-6.1-sol')+'"$','m'));
 const {installTargets}=await import('../../lib/installer/install.mjs');assert.equal((await installTargets(plans,{safeFs})).results[0].status,'installed');assert.match(fs.readFileSync(target.home+'/skills/arc/models.toml','utf8'),/^version = 3$/m);
});

const qaRoles=['arc_scouter','arc_planner','arc_implementer','arc_qa','arc_reviewer'];
const qaExpectedPairs=JSON.parse(fs.readFileSync(new URL('../fixtures/qa-legacy-model-values.json',import.meta.url)));
// E1: literal, independently recorded active values must survive real publication.
for(const platform of ['codex','claude'])for(const version of [1,2])for(const active of ['economy','balanced','smart','custom']){
 if(version===1&&active==='custom')continue; // Existing v1 rejects custom; authority clarification pending.
 test(`QA E1 ${platform} v${version} ${active} upgrade preserves all active models and efforts`,async t=>{
  const home=fixture(t),field=platform==='codex'?'model_reasoning_effort':'effort',old=seed(home,platform),modelPath=old.target.home+'/skills/arc/models.toml';
  const expected=Object.fromEntries(qaRoles.map((role,index)=>[role,{model:qaExpectedPairs[platform][active][index][0],[field]:qaExpectedPairs[platform][active][index][1]}]));
  let legacy=fs.readFileSync(new URL(`../fixtures/models-${platform}-v1.toml`,import.meta.url),'utf8').replace('version = 1',`version = ${version}`).replace('preset = "balanced"',`preset = "${active}"`);
  if(active==='custom')legacy+=qaRoles.map(role=>`\n[custom.${role}]\nmodel = "${expected[role].model}"\n${field} = "${expected[role][field]}"\n`).join('');
  fs.writeFileSync(modelPath,legacy);
  // Render the old active values into the old profiles before collecting state.
  const {renderProfiles}=await import('../../lib/models/index.mjs');
  const inputs=new Map(old.target.profileNames.map(name=>[name,fs.readFileSync(old.target.home+'/agents/'+name)]));
  for(const [name,bytes]of renderProfiles(inputs,{platform,roles:expected}))fs.writeFileSync(old.target.home+'/agents/'+name,bytes);
  const before=new Map(qaRoles.map(role=>{
   const file=old.target.home+'/agents/'+role.replace('_','-')+(platform==='codex'?'.toml':'.md'),text=fs.readFileSync(file,'utf8');
   const values=platform==='codex'?(parseToml(text)):Object.fromEntries([...text.matchAll(/^(model|effort): (.+)$/gm)].map(m=>[m[1],m[2]]));
   assert.deepEqual({model:values.model,[field]:values[field]},expected[role]);return [role,expected[role]];
  }));
  const state=stateApi.collectInstalledState({safeFs,userHome:home,env:{},cwd:home}),plans=api.buildUpgradePlans({payload:payload(),state,safeFs});
  const {installTargets}=await import('../../lib/installer/install.mjs');assert.equal((await installTargets(plans,{safeFs})).results[0].status,'installed');
  const upgraded=fs.readFileSync(modelPath,'utf8');assert.match(upgraded,/^version = 3$/m);assert.doesNotMatch(upgraded,/preset\s*=/);assert.deepEqual(loadModelConfig(upgraded,platform).roles,expected);
  for(const role of qaRoles){
   const text=fs.readFileSync(old.target.home+'/agents/'+role.replace('_','-')+(platform==='codex'?'.toml':'.md'),'utf8'),values=platform==='codex'?parseToml(text):Object.fromEntries([...text.matchAll(/^(model|effort): (.+)$/gm)].map(m=>[m[1],m[2]]));
   assert.deepEqual({model:values.model,[field]:values[field]},before.get(role));
  }
 });
}
import {parseToml} from '../../lib/models/config.mjs';

for(const skipped of ['codex','claude'])test(`upgrade output reports ${skipped} skipped-platform residual from collected state`,async t=>{
 const {report}=await import('../../lib/management/update.mjs'),home=fixture(t),installed=skipped==='codex'?'claude':'codex';seed(home,installed);
 const ext=skipped==='codex'?'toml':'md',filename=path.join(home,'.'+skipped,'agents','arc-qa.'+ext);fs.mkdirSync(path.dirname(filename),{recursive:true});fs.writeFileSync(filename,'user profile');
 const state=stateApi.collectInstalledState({safeFs,userHome:home,env:{},cwd:home});assert.deepEqual(state.residualPaths,[filename]);
 const result=await api.upgradeInstalledTargets({packageRoot:staticPackageFixture(t),state,safeFs});let stdout='',stderr='';const code=report(result,{write:s=>stdout+=s},{write:s=>stderr+=s});
 assert.equal(code,0,stderr);assert.equal(stdout.split('\n').filter(line=>line==='Residual path: '+filename).length,1);assert.match(stdout,new RegExp(installed+': installed'));assert.equal(fs.readFileSync(filename,'utf8'),'user profile');assert.equal(fs.existsSync(path.join(home,'.'+skipped,'skills/arc')),false);
});
