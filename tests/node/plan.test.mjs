import{referenceFixture}from'./fixtures/fake-git.mjs';
import {createHash} from 'node:crypto';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import cp from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';
import {openRoot} from '../../lib/safe-fs/index.mjs';import {loadNative} from '../../lib/safe-fs/native.mjs';
const api=await import('../../lib/installer/plan.mjs').catch(()=>({}));const targets=await import('../../lib/installer/targets.mjs').catch(()=>({}));const native=loadNative({artifactDirectory:'build/native'});const safeFs={openRoot:p=>openRoot(p,{native})};
function fixture(t){const home=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'arc-plan-')));t.after(()=>fs.rmSync(home,{recursive:true,force:true}));return home;}
function payload(){const files=new Map(),modelInputs={};for(const platform of ['codex','claude']){const models=fs.readFileSync(new URL(`../../${platform}/skill/models.toml`,import.meta.url));const profiles=new Map();for(const role of ['scouter','planner','implementer','qa','reviewer']){const name=`arc-${role}.${platform==='codex'?'toml':'md'}`;profiles.set(name,fs.readFileSync(new URL(`../../${platform}/agents/${name}`,import.meta.url)));}files.set(`${platform}/skill/SKILL.md`,Buffer.from('ARC payload\n{{ARC_OUTPUT_LANGUAGE_POLICY}}'));files.set(`${platform}/skill/models.toml`,models);modelInputs[platform]={models,profiles};}for(const name of ['role-git-guard.mjs','git-policy.json'])files.set(`claude/skill/hooks/${name}`,fs.readFileSync(new URL(`../../claude/skill/hooks/${name}`,import.meta.url)));return{packageRoot:'/verified-package',files,modelInputs,snapshot:new Map()};}
function plan(home,platform='codex',extra={}){return api.buildInstallPlan({payload:payload(),target:targets.resolveTarget(platform,{userHome:home,env:extra.environment??{},cwd:home}),preset:'balanced',safeFs,...extra});}
test('plan generates buffers and snapshots while optional external skills are absent',t=>{const home=fixture(t);assert.equal(typeof api.buildInstallPlan,'function');const p=plan(home);assert.equal(p.target.platform,'codex');assert.ok(p.generated.profiles instanceof Map);assert.match(p.generated.models.toString(),/version = 1/);assert.equal(p.globalChanges.length,2);assert.equal(p.externalPaths.length,0);assert.ok(p.snapshot instanceof Map);assert.deepEqual(fs.readdirSync(home),[]);});
test('single-target plan never inspects another platform home',t=>{const home=fixture(t);fs.symlinkSync('/outside',`${home}/.claude`);assert.equal(plan(home).target.platform,'codex');fs.unlinkSync(`${home}/.claude`);fs.symlinkSync('/outside',`${home}/.codex`);assert.equal(plan(home,'claude').target.platform,'claude');});
for(const label of ['symlink parent','special profile','global invalid UTF8'])test(`plan rejects ${label} before writes`,t=>{const home=fixture(t);fs.mkdirSync(`${home}/.codex/agents`,{recursive:true});if(label==='symlink parent'){fs.rmSync(`${home}/.codex/agents`,{recursive:true});fs.symlinkSync('/tmp',`${home}/.codex/agents`);}if(label==='special profile')assert.equal(cp.spawnSync('mkfifo',[`${home}/.codex/agents/arc-implementer.toml`]).status,0);if(label==='special external tree'){fs.mkdirSync(`${home}/.codex/skills/brainstorming`,{recursive:true});assert.equal(cp.spawnSync('mkfifo',[`${home}/.codex/skills/brainstorming/pipe`]).status,0);}if(label==='global invalid UTF8')fs.writeFileSync(`${home}/.codex/AGENTS.md`,Buffer.from([255]));assert.throws(()=>plan(home),{code:label==='global invalid UTF8'?'ARC_GLOBAL_CONFIGURATION':'ARC_TARGET_CONFIGURATION'});});
test('skip-global does not read invalid global contents',t=>{const home=fixture(t);fs.mkdirSync(`${home}/.codex`);fs.writeFileSync(`${home}/.codex/AGENTS.md`,Buffer.from([255]));assert.deepEqual(plan(home,'codex',{skipGlobal:true}).globalChanges,[]);});
test('All rejects overlapping homes, external paths and managed destinations',t=>{const home=fixture(t);const codex=plan(home),claude=plan(home,'claude');assert.equal(api.validatePlanSet([codex,claude]),undefined);assert.throws(()=>api.validatePlanSet([codex,{...claude,managedPaths:[codex.managedPaths[0]]}]),{code:'ARC_TARGET_CONFIGURATION'});assert.throws(()=>api.validatePlanSet([codex,{...claude,externalPaths:[codex.managedPaths[0]]}]),{code:'ARC_TARGET_CONFIGURATION'});assert.throws(()=>api.validatePlanSet([codex,{...claude,target:{...claude.target,home:codex.target.home}}]),{code:'ARC_TARGET_CONFIGURATION'});});
test('plan construction performs no writes, temp allocation, locks, child processes or network',t=>{const home=fixture(t),input={payload:payload(),target:targets.resolveTarget('codex',{userHome:home,env:{},cwd:home}),preset:'balanced',safeFs};const originals=[];const reject=()=>{throw Error('Forbidden side effect');};function replace(object,name,replacement=reject){originals.push([object,name,object[name]]);object[name]=replacement;}
function guard(handle){return new Proxy(handle,{get(target,key){if(['mkdir','unlink','rmdir','renameTo','symlink','chmod','setTimes','sync','write','writeAll'].includes(key))return reject;if(key==='openDir')return name=>guard(target.openDir(name));if(key==='openFile')return(name,options)=>{if(options?.create||options?.createExclusive||options?.read===false)reject();return guard(target.openFile(name,options));};const member=target[key];return typeof member==='function'?member.bind(target):member;}});}input.safeFs={openRoot:p=>guard(safeFs.openRoot(p))};
try{for(const name of ['writeFileSync','mkdirSync','mkdtempSync','renameSync','unlinkSync','rmSync','appendFileSync'])replace(fs,name);for(const name of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])replace(cp,name);replace(globalThis,'fetch');syncBuiltinESMExports();assert.equal(api.buildInstallPlan(input).target.platform,'codex');for(const platform of ['codex','claude']){const target=targets.resolveTarget(platform,{userHome:home,env:{}});assert.ok(api.previewLimits({target,safeFs:input.safeFs}).snapshot instanceof Map);assert.ok(api.previewLanguage({target,safeFs:input.safeFs}).snapshot instanceof Map);}}finally{for(const[o,k,v]of originals)o[k]=v;syncBuiltinESMExports();}assert.deepEqual(fs.readdirSync(home),[]);});
test('Claude skill link exception is limited to the same default Codex skill directory',t=>{const home=fixture(t);fs.mkdirSync(`${home}/.claude/skills`,{recursive:true});fs.mkdirSync(`${home}/.codex/skills/brainstorming`,{recursive:true});fs.symlinkSync('../../.codex/skills/brainstorming',`${home}/.claude/skills/brainstorming`);assert.equal(plan(home,'claude').target.platform,'claude');fs.unlinkSync(`${home}/.claude/skills/brainstorming`);fs.symlinkSync('/tmp',`${home}/.claude/skills/brainstorming`);assert.equal(plan(home,'claude').externalPaths.length,0);assert.equal(fs.readlinkSync(`${home}/.claude/skills/brainstorming`),'/tmp');});

test('plan ignores existing external special files and shared symlinks',t=>{const home=fixture(t);fs.mkdirSync(home+'/.codex/skills/brainstorming',{recursive:true});assert.equal(cp.spawnSync('mkfifo',[home+'/.codex/skills/brainstorming/pipe']).status,0);fs.mkdirSync(home+'/.agents/skills',{recursive:true});fs.symlinkSync('/unavailable',home+'/.agents/skills/brainstorming');const result=plan(home);assert.deepEqual(result.externalPaths,[]);assert.equal([...result.snapshot.keys()].some(p=>p.includes('/brainstorming')),false);});

test('limits policy defaults, reinstall preservation, native drift and explicit override',t=>{
 const home=fixture(t);const first=plan(home);assert.match(first.generated.skill.get('limits.toml').toString(),/max_total_subagents = 100\nmax_concurrent_subagents = 5/);
 assert.match(first.globalChanges.find(c=>c.path.endsWith('config.toml')).content.toString(),/max_concurrent_threads_per_session = 5/);
 fs.mkdirSync(`${home}/.codex/skills/arc`,{recursive:true});fs.writeFileSync(`${home}/.codex/skills/arc/limits.toml`,'version = 1\nmax_total_subagents = 37\nmax_concurrent_subagents = 3\n');
 fs.writeFileSync(`${home}/.codex/config.toml`,'[agents]\nmax_concurrent_threads_per_session = 9\n');
 assert.throws(()=>plan(home),/drift/i);
 const explicit=plan(home,'codex',{limits:{version:1,max_total_subagents:37,max_concurrent_subagents:3},concurrentExplicit:true});
 assert.match(explicit.generated.skill.get('limits.toml').toString(),/max_total_subagents = 37/);
 assert.match(explicit.globalChanges.find(c=>c.path.endsWith('config.toml')).content.toString(),/max_concurrent_threads_per_session = 3/);
 const skipped=plan(home,'codex',{skipGlobal:true});assert.match(skipped.generated.skill.get('limits.toml').toString(),/max_concurrent_subagents = 3/);
});
test('Claude settings concurrency is a string and preserves unrelated data',t=>{
 const home=fixture(t);fs.mkdirSync(`${home}/.claude`);fs.writeFileSync(`${home}/.claude/settings.json`,JSON.stringify({env:{KEEP:'yes'},permissions:{allow:[]}}));
 const result=plan(home,'claude');const settings=JSON.parse(result.globalChanges.find(c=>c.path.endsWith('settings.json')).content);
 assert.deepEqual(settings,{env:{KEEP:'yes',CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS:'5'},permissions:{allow:[]}});
});
test('preview evidence detects changed or newly appearing limits and unsafe replacements',t=>{
 const home=fixture(t),target=targets.resolveTarget('codex',{userHome:home,env:{}});
 const preview=api.previewLimits({target,safeFs});fs.mkdirSync(`${home}/.codex/skills/arc`,{recursive:true});fs.writeFileSync(`${home}/.codex/skills/arc/limits.toml`,'version = 1\nmax_total_subagents = 4\nmax_concurrent_subagents = 2\n');
 assert.throws(()=>plan(home,'codex',{limitsPreview:preview}),{code:'ARC_INSTALL_DRIFT'});
 const existing=api.previewLimits({target,safeFs});fs.writeFileSync(`${home}/.codex/skills/arc/limits.toml`,'version = 1\nmax_total_subagents = 6\nmax_concurrent_subagents = 2\n');assert.throws(()=>plan(home,'codex',{limitsPreview:existing}),{code:'ARC_INSTALL_DRIFT'});
 fs.unlinkSync(`${home}/.codex/skills/arc/limits.toml`);fs.symlinkSync('/outside',`${home}/.codex/skills/arc/limits.toml`);assert.throws(()=>api.previewLimits({target,safeFs}),{code:'ARC_TARGET_CONFIGURATION'});
});
test('all targets retain different existing limits and partial overrides remain independent',t=>{
 const home=fixture(t);for(const[platform,total,concurrent]of[['codex',20,2],['claude',30,3]]){fs.mkdirSync(`${home}/.${platform}/skills/arc`,{recursive:true});fs.writeFileSync(`${home}/.${platform}/skills/arc/limits.toml`,`version = 1\nmax_total_subagents = ${total}\nmax_concurrent_subagents = ${concurrent}\n`);const p=plan(home,platform,{limits:{max_total_subagents:40}});assert.equal(p.limits.max_total_subagents,40);assert.equal(p.limits.max_concurrent_subagents,concurrent);}
});
test('corrupt policy stops even explicit reinstall and skip-global never opens native symlinks',t=>{
 const home=fixture(t);fs.mkdirSync(`${home}/.claude/skills/arc`,{recursive:true});fs.writeFileSync(`${home}/.claude/skills/arc/limits.toml`,'version = 9');assert.throws(()=>plan(home,'claude',{limits:{max_total_subagents:9,max_concurrent_subagents:9}}),/Invalid ARC limits/);
 fs.unlinkSync(`${home}/.claude/skills/arc/limits.toml`);fs.symlinkSync('/outside',`${home}/.claude/settings.json`);assert.equal(plan(home,'claude',{skipGlobal:true}).globalChanges.length,0);
});
for(const platform of ['codex','claude'])for(const phase of ['before-publish','after-publish'])test(`${platform} policy and native configuration rollback at ${phase}`,async t=>{
 const home=fixture(t),root=`${home}/.${platform}`,nativePath=`${root}/${platform==='codex'?'config.toml':'settings.json'}`;fs.mkdirSync(`${root}/skills/arc`,{recursive:true});
 const old='version = 1\nmax_total_subagents = 40\nmax_concurrent_subagents = 4\n';fs.writeFileSync(`${root}/skills/arc/limits.toml`,old);const nativeBytes=platform==='codex'?'[agents]\nmax_concurrent_threads_per_session = 4\n':'{"env":{"CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS":"4"}}\n';fs.writeFileSync(nativePath,nativeBytes);
 const p=plan(home,platform,{limits:{max_total_subagents:50,max_concurrent_subagents:5},concurrentExplicit:true});p.externalPaths=[];
 const{applyTransaction}=await import('../../lib/installer/transaction.mjs');assert.throws(()=>applyTransaction(p,{safeFs,acquired:{skills:new Map()},hooks:{fault(event){if(event.phase===phase&&event.path===nativePath)throw Error('native publication failure');}}}));
 assert.equal(fs.readFileSync(nativePath,'utf8'),nativeBytes);assert.equal(fs.readFileSync(`${root}/skills/arc/limits.toml`,'utf8'),old);
});
test('concurrency above total keeps configured values and explains effective fresh-session capacity',t=>{
 const result=plan(fixture(t),'codex',{limits:{max_total_subagents:2,max_concurrent_subagents:9},concurrentExplicit:true});
 assert.equal(result.limits.max_total_subagents,2);assert.equal(result.limits.max_concurrent_subagents,9);
 assert.match(result.generated.skill.get('limits.toml').toString(),/max_total_subagents = 2\nmax_concurrent_subagents = 9/);
 assert.match(result.globalChanges.find(change=>change.path.endsWith('config.toml')).content.toString(),/max_concurrent_threads_per_session = 9/);
 assert.ok(result.summary.some(note=>/effective concurrency.*at most 2.*fresh ARC session.*lower.*cumulative use.*native capacity/i.test(note)),result.summary.join('\n'));
});
for(const platform of ['codex','claude'])for(const language of ['en','ko'])test(`${platform} generates selected ${language} settings and policies together`,t=>{
 const result=plan(fixture(t),platform,{language});assert.equal(result.generated.skill.get('settings.toml')?.toString(),`version = 1\nlanguage = "${language}"\n`);
 for(const bytes of [result.generated.skill.get('SKILL.md'),...result.generated.profiles.values(),result.globalChanges.find(change=>change.path.endsWith(platform==='codex'?'AGENTS.md':'CLAUDE.md')).content]){assert.match(bytes.toString(),new RegExp(language==='en'?'English':'Korean'));assert.doesNotMatch(bytes.toString(),/\{\{ARC_OUTPUT_LANGUAGE_POLICY\}\}/);}
});
test('language preview rejects changed settings before planning writes',t=>{
 const home=fixture(t),target=targets.resolveTarget('codex',{userHome:home,env:{}});assert.equal(typeof api.previewLanguage,'function');const preview=api.previewLanguage({target,safeFs});fs.mkdirSync(`${home}/.codex/skills/arc`,{recursive:true});fs.writeFileSync(`${home}/.codex/skills/arc/settings.toml`,'version = 1\nlanguage = "ko"\n');assert.throws(()=>plan(home,'codex',{language:'en',languagePreview:preview}),{code:'ARC_INSTALL_DRIFT'});
});
for(const platform of ['codex','claude'])test(`${platform} language settings and generated prompts roll back together`,async t=>{
 const home=fixture(t),target=targets.resolveTarget(platform,{userHome:home,env:{}}),root=target.home;const{applyTransaction}=await import('../../lib/installer/transaction.mjs');
 applyTransaction(plan(home,platform,{language:'ko'}),{safeFs,acquired:{skills:new Map(),references:referenceFixture()}});
 const paths=[`${root}/skills/arc/settings.toml`,`${root}/skills/arc/SKILL.md`,...target.profileNames.map(name=>`${root}/agents/${name}`),target.instructionPath];const old=paths.map(filename=>fs.readFileSync(filename));
 const next=plan(home,platform,{language:'en'});assert.throws(()=>applyTransaction(next,{safeFs,acquired:{skills:new Map(),references:referenceFixture()},hooks:{fault(event){if(event.phase==='after-publish'&&event.path===target.instructionPath)throw Error('language publication failure');}}}),/language publication failure/);
 for(const[ i,filename]of paths.entries())assert.deepEqual(fs.readFileSync(filename),old[i],filename);
});
test('invalid existing language blocks explicit reinstall and skip-global still generates local policies',t=>{
 const home=fixture(t),root=home+'/.claude';fs.mkdirSync(root+'/skills/arc',{recursive:true});fs.writeFileSync(root+'/skills/arc/settings.toml','version = 1\nlanguage = "fr"\n');assert.throws(()=>plan(home,'claude',{language:'ko',skipGlobal:true}),/Invalid ARC language settings/);
 fs.writeFileSync(root+'/skills/arc/settings.toml','version = 1\nlanguage = "en"\n');const next=plan(home,'claude',{language:'ko',skipGlobal:true});assert.deepEqual(next.globalChanges,[]);assert.match(next.generated.skill.get('SKILL.md').toString(),/Korean/);for(const bytes of next.generated.profiles.values())assert.match(bytes.toString(),/Korean/);
});
for(const platform of ['codex','claude'])test(`install plan preserves ${platform} notice in the skill and defers the global contract`,t=>{
 const home=fixture(t),input=payload();input.files.set(`${platform}/skill/SKILL.md`,fs.readFileSync(new URL(`../../${platform}/skill/SKILL.md`,import.meta.url)));
 const result=api.buildInstallPlan({payload:input,target:targets.resolveTarget(platform,{userHome:home,env:{},cwd:home}),preset:'balanced',safeFs});
 const change=result.globalChanges.find(c=>c.path===result.target.instructionPath);
 assert.ok(change);assert.doesNotMatch(change.content.toString(),/\[platform\.|\[ARC role policy:/);
 const skill=result.generated.skill.get('SKILL.md').toString();
 const contract=skill.split('[ARC role policy: contract begin]')[1].split('[ARC role policy: contract end]')[0];
 assert.ok(contract.includes(`[platform.${platform}]`));
 assert.ok(!contract.includes(`[platform.${platform==='codex'?'claude':'codex'}]`));
});
import {validateClaudeHookCommand} from '../../lib/policy/claude-hook.mjs';
test('Claude plan installs each hook against the final skill path and no global hook',t=>{
 const home=fixture(t),result=plan(home,'claude');
 for(const bytes of result.generated.profiles.values()) {
  const command=JSON.parse(/^          command: (.+)$/m.exec(bytes.toString())[1]);validateClaudeHookCommand(command);
  const encoded=/"([A-Za-z0-9+/]+=*)"$/.exec(command)[1];const url=Buffer.from(encoded,'base64').toString();
  assert.ok(url.includes('/.claude/skills/arc/hooks/role-git-guard.mjs'),url);assert.ok(!url.includes('__ARC_INSTALLED_SKILL__'));
 }
 assert.ok(!result.globalChanges.some(x=>x.content.toString().includes('PreToolUse')));
});
test('Claude plan rejects missing or stale Git guard policy before writing',t=>{
 const home=fixture(t),input=payload();input.files.delete('claude/skill/hooks/git-policy.json');
 assert.throws(()=>api.buildInstallPlan({payload:input,target:targets.resolveTarget('claude',{userHome:home,env:{}}),preset:'balanced',safeFs}),/Git guard/);
 assert.deepEqual(fs.readdirSync(home),[]);
});
import {spawnSync} from 'node:child_process';
test('Claude installed hook survives model update and is removed with managed assets only',async t=>{
 const home=fixture(t),first=plan(home,'claude');const {applyTransaction}=await import('../../lib/installer/transaction.mjs');
 const {buildUninstallPlan,uninstallTargets}=await import('../../lib/installer/uninstall.mjs');
 fs.mkdirSync(`${home}/.claude/agents`,{recursive:true});fs.writeFileSync(`${home}/.claude/agents/user-agent.md`,'preserve');
 // Refresh the initial snapshot after preparing an unrelated user file.
 const initial=plan(home,'claude');applyTransaction(initial,{safeFs,acquired:{references:referenceFixture()}});
 const run=command=>{const profile=fs.readFileSync(`${home}/.claude/agents/arc-implementer.md`,'utf8');const hook=JSON.parse(/^          command: (.+)$/m.exec(profile)[1]);return spawnSync(hook,{shell:true,cwd:os.tmpdir(),input:JSON.stringify({hook_event_name:'PreToolUse',tool_name:'Bash',tool_input:{command}}),encoding:'utf8'});};
 for(const [command,decision]of [['git status --short',undefined],['git push','deny']]){const result=run(command);assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).hookSpecificOutput?.permissionDecision,decision);}
 const next=plan(home,'claude',{preset:'smart'});applyTransaction(next,{safeFs,acquired:{references:referenceFixture()}});
 assert.equal(JSON.parse(run('git commit -m never-executed').stdout).hookSpecificOutput.permissionDecision,'deny');
 const drift=plan(home,'claude');fs.appendFileSync(`${home}/.claude/agents/arc-implementer.md`,'\nuser edit');assert.throws(()=>applyTransaction(drift,{safeFs,acquired:{references:referenceFixture()}}));
 assert.ok(fs.readFileSync(`${home}/.claude/agents/arc-implementer.md`,'utf8').endsWith('user edit'));
 const result=await uninstallTargets([buildUninstallPlan({target:first.target,safeFs})],{safeFs});assert.equal(result.results[0].status,'uninstalled');
 assert.equal(fs.existsSync(`${home}/.claude/skills/arc/hooks`),false);assert.equal(fs.readFileSync(`${home}/.claude/agents/user-agent.md`,'utf8'),'preserve');
});
for(const platform of ['codex','claude'])test(`${platform} installs instruction references into a custom spaced home and preserves globals on reinstall`,async t=>{
 // Claude keeps its supported default directory under the spaced temporary HOME; only Codex supports a custom agent home.
 const home=fixture(t),custom=platform==='codex'?home+'/custom agent home':home+'/.claude',environment=platform==='codex'?{CODEX_HOME:custom}:{};
 const input=payload();
 const core=fs.readFileSync(new URL(`../../${platform}/skill/SKILL.md`,import.meta.url),'utf8');const names=['SKILL.md',...[...core.matchAll(/\]\((references\/[^)#]+)(?:#[^)]+)?\)/g)].map(match=>match[1])];
 for(const name of new Set(names))input.files.set(`${platform}/skill/${name}`,fs.readFileSync(new URL(`../../${platform}/skill/${name}`,import.meta.url)));
 const target=targets.resolveTarget(platform,{userHome:home,env:environment,cwd:home});
 const make=extra=>api.buildInstallPlan({payload:input,target,preset:'balanced',language:'ko',safeFs,...extra});
 const {applyTransaction}=await import('../../lib/installer/transaction.mjs');
 const globals=target.instructionPath;fs.mkdirSync(path.dirname(globals),{recursive:true});fs.writeFileSync(globals,'사용자 지침\r\n');
 applyTransaction(make({}),{safeFs,acquired:{skills:new Map(),references:referenceFixture()}});
 const installed=fs.readFileSync(custom+'/skills/arc/SKILL.md','utf8');assert.match(installed,/Use Korean by default/);
 for(const match of installed.matchAll(/\]\((references\/[^)#]+)(?:#[^)]+)?\)/g))assert.ok(fs.existsSync(custom+'/skills/arc/'+match[1]),match[1]);
 assert.match(fs.readFileSync(custom+'/skills/arc/references/coordination.md','utf8'),/\[role.implementer-implementation\]/);
 assert.ok(fs.readFileSync(globals,'utf8').startsWith('사용자 지침\r\n'));
 const before=fs.readFileSync(globals);applyTransaction(make({}),{safeFs,acquired:{skills:new Map(),references:referenceFixture()}});assert.deepEqual(fs.readFileSync(globals),before);
 applyTransaction(make({skipGlobal:true}),{safeFs,acquired:{skills:new Map(),references:referenceFixture()}});assert.deepEqual(fs.readFileSync(globals),before);
});

test('supplied complete model config renders custom models without resetting other presets',async t=>{
 const {loadModelConfig}=await import('../../lib/models/index.mjs');const config=loadModelConfig(payload().modelInputs.codex.models,'codex');config.preset='smart';config.roles.arc_implementer.smart.model='custom-model';config.roles.arc_qa.economy.model='preserve-other-preset';
 const result=plan(fixture(t),'codex',{modelConfig:config,preset:'smart'});assert.deepEqual(loadModelConfig(result.generated.models,'codex'),config);assert.match(result.generated.profiles.get('arc-implementer.toml').toString(),/custom-model/);
 assert.throws(()=>plan(fixture(t),'claude',{modelConfig:config}),/platform/i);
});

test('fresh installation observes legacy path absence and refuses to duplicate a legacy role',t=>{
 const home=fixture(t),legacy=home+'/.codex/agents/arc-coder.toml';
 const p=plan(home);assert.ok(p.snapshot.has(legacy));
 fs.mkdirSync(path.dirname(legacy),{recursive:true});fs.writeFileSync(legacy,'legacy user profile');
 assert.throws(()=>plan(home),/legacy.*upgrade/i);assert.equal(fs.readFileSync(legacy,'utf8'),'legacy user profile');
});

test('legacy role appearing during staging aborts installation before profile publication',async t=>{
 const {applyTransaction}=await import('../../lib/installer/transaction.mjs');
 const home=fixture(t),p=plan(home),legacy=home+'/.codex/agents/arc-coder.toml';
 assert.throws(()=>applyTransaction(p,{safeFs,acquired:{references:referenceFixture()},hooks:{fault(event){if(event.phase==='after-stage'&&event.path.endsWith('/arc-implementer.toml')&&!fs.existsSync(legacy))fs.writeFileSync(legacy,'unexpected role');}}}),error=>error.code==='ARC_INSTALL_DRIFT');
 assert.equal(fs.existsSync(home+'/.codex/agents/arc-implementer.toml'),false);assert.equal(fs.readFileSync(legacy,'utf8'),'unexpected role');
});

// Capture public output bytes and iteration order; normalize only the temporary
// HOME and its encoded hook URL so the baseline is independent of the fixture.
const renderingBaseline={
 'codex:en:false':'1692570dd3496c2e95524a8d574aee9205c315770baf2304ba8e3cce336467e8',
 'codex:en:true':'0634b2daf65d049e9097712c7b051999c51a141173c8a9c493aca8aa9abef1ff',
 'codex:ko:false':'22d0313c41cc2c1039ae24c8dfb2ceb6473a71ae2dd32dd80a9757ca24cb91ed',
 'codex:ko:true':'2f57f7ae78cfa92cfd89e8ff4bf9dc9f3361aabc43a22fd00bce7ccc70060447',
 'claude:en:false':'153219374f8138403deb017722238bc537b888e1f3655d7b77b13af76fdcb9e9',
 'claude:en:true':'181a8bb2fffa456f8d2054acdd885889e8502e11c482cea980c8d7e94b5a32e9',
 'claude:ko:false':'4683f83b4efb210439b335c61352eb88e5a5b304c5c18b32064c4d7fd5d2e794',
 'claude:ko:true':'9248f835a117492bba15097f0dc9c830426693a7c4149193b5ad1b5fc8a4b745',
};
for(const platform of ['codex','claude'])for(const language of ['en','ko'])for(const skipGlobal of [false,true])test(`${platform} ${language} skipGlobal=${skipGlobal} preserves public rendering baseline`,t=>{
 const home=fixture(t),target=targets.resolveTarget(platform,{userHome:home,env:{}});
 const limitsPreview=api.previewLimits({target,safeFs}),languagePreview=api.previewLanguage({target,safeFs});
 const result=plan(home,platform,{language,skipGlobal,limitsPreview,languagePreview,limits:{max_total_subagents:2,max_concurrent_subagents:9},concurrentExplicit:true});
 const normalize=value=>value.replaceAll(home,'<HOME>').replace(/^          command: (.+)$/gm,(line,json)=>{
  const command=JSON.parse(json),encoded=/"([A-Za-z0-9+/]+=*)"$/.exec(command)[1];
  const url=Buffer.from(encoded,'base64').toString().replaceAll(home,'<HOME>');
  return '          command: '+JSON.stringify(command.replace(encoded,Buffer.from(url).toString('base64')));
 });
 const buffers=entries=>[...entries].map(([name,bytes])=>{assert.ok(Buffer.isBuffer(bytes),name);return[name,normalize(bytes.toString())];});
 const observed={models:normalize(result.generated.models.toString()),profiles:buffers(result.generated.profiles),skill:buffers(result.generated.skill),
  globalChanges:result.globalChanges.map(({path,original,content,action})=>({path:normalize(path),original,content:normalize(content.toString()),action})),
  summary:result.summary.map(normalize),snapshot:[...result.snapshot].map(([name,metadata])=>[normalize(name),metadata]),
  managedPaths:result.managedPaths.map(normalize),externalPaths:result.externalPaths};
 const key=`${platform}:${language}:${skipGlobal}`,digest=createHash('sha256').update(JSON.stringify(observed)).digest('hex');
 assert.equal(digest,renderingBaseline[key]);
 assert.deepEqual(fs.readdirSync(home),[]);
});
test('public planning errors retain validation precedence for multiple invalid inputs',t=>{
 const home=fixture(t),target=targets.resolveTarget('claude',{userHome:home,env:{}}),input=payload();
 const invoke=extra=>api.buildInstallPlan({payload:input,target,preset:'balanced',safeFs,...extra});
 const message=extra=>{try{invoke(extra);assert.fail('Expected planning rejection');}catch(error){return{code:error.code,message:error.message};}};
 const invalidLanguage=message({language:'fr'});input.modelInputs.claude=undefined;
 assert.deepEqual(message({language:'fr',limits:{max_total_subagents:0}}),invalidLanguage);
 fs.mkdirSync(target.home+'/skills/arc',{recursive:true});
 fs.writeFileSync(target.home+'/skills/arc/settings.toml','version = 9');
 fs.writeFileSync(target.home+'/skills/arc/limits.toml','version = 9');
 assert.match(message({}).message,/^Invalid ARC language settings:/);
 fs.writeFileSync(target.home+'/skills/arc/settings.toml','version = 1\nlanguage = "en"\n');
 assert.match(message({}).message,/^Invalid ARC limits:/);
 fs.unlinkSync(target.home+'/skills/arc/limits.toml');
 assert.deepEqual(message({}),{code:'ARC_TARGET_CONFIGURATION',message:'Selected payload platform is unavailable'});
 input.modelInputs=payload().modelInputs;input.files.delete('claude/skill/hooks/git-policy.json');
 fs.symlinkSync('/outside',target.instructionPath);
 assert.deepEqual(message({}),{code:'ARC_TARGET_CONFIGURATION',message:'Invalid Claude Git guard: Missing hook assets'});
});
