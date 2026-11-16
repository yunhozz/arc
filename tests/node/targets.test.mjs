import test from 'node:test';import assert from 'node:assert/strict';
const api=await import('../../lib/installer/targets.mjs').catch(()=>({}));
test('Codex resolves default, tilde and relative CODEX_HOME',()=>{assert.equal(typeof api.resolveTarget,'function');assert.equal(api.resolveTarget('codex',{userHome:'/users/test',env:{}}).home,'/users/test/.codex');assert.equal(api.resolveTarget('codex',{userHome:'/users/test',env:{CODEX_HOME:'~/custom'}}).home,'/users/test/custom');assert.equal(api.resolveTarget('codex',{userHome:'/users/test',env:{CODEX_HOME:'relative'},cwd:'/work'}).home,'/work/relative');assert.throws(()=>api.resolveTarget('codex',{userHome:'/users/test',env:{CODEX_HOME:' '}}),{code:'ARC_TARGET_CONFIGURATION'});});
test('Claude accepts only its default equivalent absolute config root',()=>{for(const value of [undefined,'/users/test/.claude','~/.claude'])assert.equal(api.resolveTarget('claude',{userHome:'/users/test',env:value===undefined?{}:{CLAUDE_CONFIG_DIR:value}}).home,'/users/test/.claude');for(const value of ['', 'relative','/elsewhere'])assert.throws(()=>api.resolveTarget('claude',{userHome:'/users/test',env:{CLAUDE_CONFIG_DIR:value}}),{code:'ARC_TARGET_CONFIGURATION'});});
for(const platform of ['codex','claude'])test(`${platform} does not read the other environment setting`,()=>{const forbidden=platform==='codex'?'CLAUDE_CONFIG_DIR':'CODEX_HOME';const env=new Proxy({userHome:'/users/test',env:{}},{get(target,key){if(key===forbidden||key==='HOME')throw Error('Other platform inspected');return target[key];},has(target,key){if(key===forbidden||key==='HOME')throw Error('Other platform inspected');return key in target;}});assert.equal(api.resolveTarget(platform,{userHome:'/users/test',env,cwd:'/work'}).platform,platform);});
test('target carries profile/global/external policy and rejects root or unknown platforms',()=>{const c=api.resolveTarget('codex',{userHome:'/users/test',env:{}}),a=api.resolveTarget('claude',{userHome:'/users/test',env:{}});assert.equal(c.profileNames.length,5);assert.equal(a.payloadPrefix,'claude');assert.ok(Object.isFrozen(a));assert.deepEqual(a.profileNames,['arc-scouter.md','arc-planner.md','arc-implementer.md','arc-qa.md','arc-reviewer.md']);assert.throws(()=>{a.platform='codex';},TypeError);assert.ok(c.globalPaths.includes('/users/test/.codex/config.toml'));assert.deepEqual(a.globalPaths,['/users/test/.claude/CLAUDE.md','/users/test/.claude/settings.json']);assert.equal(c.externalPolicy,undefined);assert.equal(a.externalPolicy,undefined);assert.throws(()=>api.resolveTarget('all',{userHome:'/users/test',env:{}}),{code:'ARC_TARGET_CONFIGURATION'});assert.throws(()=>api.resolveTarget('codex',{userHome:'/users/test',env:{CODEX_HOME:'/'}}),{code:'ARC_TARGET_CONFIGURATION'});});
test('userHome is validated independently of env.HOME and relative Codex uses explicit cwd',()=>{for(const userHome of [undefined,'','relative',42])assert.throws(()=>api.resolveTarget('codex',{userHome,env:{HOME:'/ignored'}}),{code:'ARC_TARGET_CONFIGURATION'});assert.equal(api.resolveTarget('codex',{userHome:'/users/separate',env:{HOME:'/ignored',CODEX_HOME:'custom'},cwd:'/selected-cwd'}).home,'/selected-cwd/custom');assert.throws(()=>api.resolveTarget('codex',{userHome:'/users/separate',env:{CODEX_HOME:'custom'},cwd:'relative'}),{code:'ARC_TARGET_CONFIGURATION'});});
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {openRoot} from '../../lib/safe-fs/index.mjs';
import {loadNative} from '../../lib/safe-fs/native.mjs';
const native=loadNative({artifactDirectory:'build/native'});
import {createTestRegistries} from './fixtures/platforms/zeta.mjs';
import {installTargets} from '../../lib/installer/install.mjs';
import {capturePlanSnapshot} from '../../lib/installer/transaction.mjs';
test('cycle-rule modules do not depend on installer targets or installer platforms',()=>{
 const modules=['lib/models/profiles.mjs','lib/models/codex-catalog.mjs','lib/models/catalog-anthropic.mjs','lib/installer/runtime-config.mjs','lib/installer/global-config.mjs',...fs.readdirSync(new URL('../../lib/platforms/formats/',import.meta.url)).filter(name=>name.endsWith('.mjs')).map(name=>`lib/platforms/formats/${name}`)];
 for(const name of modules){
  const source=fs.readFileSync(new URL(`../../${name}`,import.meta.url),'utf8');
  for(const [,specifier]of source.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"]+)['"]/g)){
   if(!specifier.startsWith('.'))continue;
   const dependency=new URL(specifier,new URL(`../../${name}`,import.meta.url));
   assert.notEqual(dependency.pathname,new URL('../../lib/installer/targets.mjs',import.meta.url).pathname,`${name} imports installer targets`);
   assert.ok(!dependency.pathname.startsWith(new URL('../../lib/platforms/',import.meta.url).pathname),`${name} imports installer platforms`);
  }
 }
});
test('format errors preserve the shared TargetConfigurationError identity and cause',async()=>{
 const location=new URL('../../lib/installer/target-errors.mjs',import.meta.url);
 assert.ok(fs.existsSync(location),'TargetConfigurationError needs an independent leaf module');
 const {TargetConfigurationError}=await import(location);
 assert.equal(api.TargetConfigurationError,TargetConfigurationError);
 const cause=new Error('original'),error=new TargetConfigurationError('invalid target',{cause});
 assert.ok(error instanceof Error);assert.equal(error.name,'TargetConfigurationError');assert.equal(error.code,'ARC_TARGET_CONFIGURATION');assert.equal(error.message,'invalid target');assert.equal(error.cause,cause);
 for(const format of ['toml','markdown']){
  const {renameForRouting}=await import(`../../lib/platforms/formats/${format}.mjs`);
  assert.throws(()=>renameForRouting(Buffer.alloc(0),'arc_scouter','invalid revision'),error=>error instanceof api.TargetConfigurationError&&error.message==='Composite revision cannot be tagged'&&error.code==='ARC_TARGET_CONFIGURATION');
 }
});
test('resolveTargets separates unresolved homes',()=>{
 assert.equal(typeof api.resolveTargets,'function');
 const {targets,unresolved}=api.resolveTargets({userHome:'/users/test',env:{CLAUDE_CONFIG_DIR:'/x'}});
 assert.deepEqual(Object.keys(targets),['codex','gemini']);
 assert.equal(targets.codex.home,'/users/test/.codex');
 assert.equal(unresolved.length,1);assert.equal(unresolved[0].platform,'claude');
 assert.equal(unresolved[0].error.code,'ARC_TARGET_CONFIGURATION');
});
test('resolveTarget uses injected registry',()=>{
 const {platforms}=createTestRegistries();
 const target=api.resolveTarget('zeta',{platforms,userHome:'/users/test',env:{ZETA_HOME:'/custom/zeta'}});
 assert.equal(target.home,'/custom/zeta');assert.equal(target.payloadPrefix,'zeta');
 assert.equal(target.instructionPath,'/custom/zeta/ZETA.md');
 assert.equal(target.runtimeConfigPath,'/custom/zeta/settings.json');
 assert.deepEqual(target.profileNames,['arc-scouter.md','arc-planner.md','arc-implementer.md','arc-qa.md','arc-reviewer.md']);
 assert.deepEqual(target.globalPaths,['/custom/zeta/ZETA.md','/custom/zeta/settings.json']);
 assert.ok(Object.isFrozen(target));assert.ok(Object.isFrozen(target.profileNames));assert.ok(Object.isFrozen(target.globalPaths));
 assert.equal(typeof api.resolveTargets,'function');
 const resolved=api.resolveTargets({platforms,userHome:'/users/test',env:{ZETA_HOME:'/custom/zeta'}});
 assert.deepEqual(Object.keys(resolved.targets),['claude','codex','zeta']);assert.deepEqual(resolved.unresolved,[]);
});
test('install order follows anchorOrder',async t=>{
 const userHome=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'arc-anchor-order-')));
 t.after(()=>fs.rmSync(userHome,{recursive:true,force:true}));
 const {platforms}=createTestRegistries(),safeFs={openRoot:p=>openRoot(p,{native})};
 const plans=['zeta','claude','codex'].map(platform=>{
  const home=path.join(userHome,'.'+platform),plan={target:{platform,home,userHome},skipGlobal:true,generated:{skill:new Map([['SKILL.md',Buffer.from(platform)]]),profiles:new Map()},globalChanges:[],managedPaths:[home+'/skills/arc'],externalPaths:[],snapshot:new Map(),summary:[]};
  capturePlanSnapshot(plan,{safeFs});return plan;
 });
 const executed=[],result=await installTargets(plans,{safeFs,platforms,hooks:{fault({phase,plan}){if(phase==='before-prepare')executed.push(plan.target.platform);}}});
 assert.deepEqual(result.results.map(({platform,status})=>({platform,status})),[{platform:'claude',status:'installed'},{platform:'codex',status:'installed'},{platform:'zeta',status:'installed'}]);
 assert.deepEqual(executed,['claude','codex','zeta']);
 for(const platform of ['codex','claude','zeta'])assert.equal(fs.readFileSync(path.join(userHome,'.'+platform,'skills/arc/SKILL.md'),'utf8'),platform);
});
test('ancestor sibling changes do not invalidate the opened directory identity',t=>{
 const base=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'arc-ancestor-')));t.after(()=>fs.rmSync(base,{recursive:true,force:true}));fs.mkdirSync(base+'/ancestor');fs.mkdirSync(base+'/ancestor/target');let changed=false;
 function wrap(handle){return new Proxy(handle,{get(target,key){if(key==='openDir')return name=>{if(name==='ancestor'&&!changed){changed=true;fs.mkdirSync(base+'/ancestor/sibling');}return wrap(target.openDir(name));};const member=target[key];return typeof member==='function'?member.bind(target):member;}});}
 const result=api.inspectPath({openRoot:p=>wrap(openRoot(p,{native}))},base+'/ancestor/target',{kind:'directory'});assert.equal(result.exists,true);assert.equal(changed,true);
});
test('ancestor replacement and symlink swaps remain rejected',t=>{
 const base=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'arc-ancestor-swap-')));t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
 for(const symlink of [false,true]){fs.mkdirSync(base+'/ancestor');fs.mkdirSync(base+'/ancestor/target');fs.mkdirSync(base+'/outside');let swapped=false;
 function wrap(handle){return new Proxy(handle,{get(target,key){if(key==='openDir')return name=>{if(name==='ancestor'&&!swapped){swapped=true;fs.renameSync(base+'/ancestor',base+'/saved');if(symlink)fs.symlinkSync('outside',base+'/ancestor');else{fs.mkdirSync(base+'/ancestor');fs.mkdirSync(base+'/ancestor/target');}}return wrap(target.openDir(name));};const member=target[key];return typeof member==='function'?member.bind(target):member;}});}
 assert.throws(()=>api.inspectPath({openRoot:p=>wrap(openRoot(p,{native}))},base+'/ancestor/target',{kind:'directory'}),{code:'ARC_TARGET_CONFIGURATION'});fs.rmSync(base+'/ancestor',{recursive:true,force:true});fs.rmSync(base+'/saved',{recursive:true});fs.rmSync(base+'/outside',{recursive:true});}
});
