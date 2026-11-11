import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {openRoot} from '../../lib/safe-fs/index.mjs';
import {loadNative} from '../../lib/safe-fs/native.mjs';
import {staticPackageFixture,sourceRoot} from './fixtures/static-references.mjs';
import {installFakeCli} from './role-fixtures.mjs';
import * as api from '../../lib/management/operations.mjs';
import {resolveTarget} from '../../lib/installer/targets.mjs';
import {isOwnedStandaloneProfile,readInstallMode,inspectStandaloneProfile} from '../../lib/installer/install-mode.mjs';
const native=loadNative({artifactDirectory:'build/native'}),safeFs={openRoot:p=>openRoot(p,{native})};
const roles=['scouter','planner','implementer','qa','reviewer'];
async function compositeContext(t){
 const userHome=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'arc-mode-')));t.after(()=>fs.rmSync(userHome,{recursive:true,force:true}));
 const context={packageRoot:staticPackageFixture(t),userHome,cwd:userHome,env:{PATH:userHome+'/bin:/usr/bin:/bin'},safeFs};
 for(const platform of ['codex','claude'])await installFakeCli(t,userHome+'/bin',platform);
 return context;
}
const targets=ctx=>Object.fromEntries(['codex','claude'].map(p=>[p,resolveTarget(p,ctx)]));
const agents=(ctx,p)=>fs.readdirSync(ctx.userHome+'/.'+p+'/agents').sort();
async function mixedConfig(revision){
 const {loadStaticModelCatalog}=await import('../../lib/models/static-catalog.mjs');const pairs={};for(const p of ['codex','claude'])pairs[p]=(await loadStaticModelCatalog(p)).catalog.pairs[0];
 return{version:1,revision,roles:Object.fromEntries(roles.map(r=>{const platform=['planner','reviewer'].includes(r)?'claude':'codex';return['arc_'+r,{platform,...pairs[platform]}];}))};
}
async function standalone(ctx){assert.equal((await api.executeOperation(ctx,await api.prepareOperation(ctx,{kind:'install',target:'all',preset:'balanced',language:'en'}))).code,0);}
async function publish(ctx,revision='mode-1',kind='install'){return api.executeOperation(ctx,await api.prepareCompositeOperation(ctx,{kind,config:await mixedConfig(revision)}));}
test('isOwnedStandaloneProfile accepts shipped profiles and rejects renamed or contract-less bytes',()=>{
 for(const [platform,ext] of [['claude','md'],['codex','toml']])for(const role of roles){const bytes=fs.readFileSync(path.join(sourceRoot,platform,'agents',`arc-${role}.${ext}`));assert.equal(isOwnedStandaloneProfile(bytes,platform,'arc_'+role),true);assert.equal(isOwnedStandaloneProfile(Buffer.from(bytes.toString().replace('[ARC role policy: contract begin]','')),platform,'arc_'+role),false);assert.equal(isOwnedStandaloneProfile(bytes,platform,'arc_qa'),role==='qa');}
});
test('readInstallMode reports standalone, composite and unverified',async t=>{
 const ctx=await compositeContext(t);await standalone(ctx);assert.equal(readInstallMode({...ctx,targets:targets(ctx)}).mode,'standalone');assert.equal((await publish(ctx)).code,0);
 assert.deepEqual(readInstallMode({...ctx,targets:targets(ctx)}).homes,{codex:'composite',claude:'composite'});
 const marker=ctx.userHome+'/.codex/arc-role-platform-routing.prepared.json',data=JSON.parse(fs.readFileSync(marker));data.configHash='sha256:'+'0'.repeat(64);fs.writeFileSync(marker,JSON.stringify(data));const state=readInstallMode({...ctx,targets:targets(ctx)});assert.equal(state.mode,'unverified');assert.ok(state.residualPaths.includes(marker));
});
const profileFiles=ctx=>Object.fromEntries(['codex','claude'].flatMap(p=>agents(ctx,p).map(n=>[p+'/'+n,fs.readFileSync(ctx.userHome+'/.'+p+'/agents/'+n).toString('hex')])));
const standaloneNames=p=>roles.map(r=>'arc-'+r+(p==='codex'?'.toml':'.md')).sort();
test('composite install leaves no standalone profiles on either home',async t=>{
 const ctx=await compositeContext(t);await standalone(ctx);const result=await publish(ctx);assert.equal(result.code,0,JSON.stringify(result));
 assert.deepEqual(agents(ctx,'claude'),['arc-routing-planner.md','arc-routing-reviewer.md']);assert.deepEqual(agents(ctx,'codex'),['arc-routing-implementer.toml','arc-routing-qa.toml','arc-routing-scouter.toml']);
});
test('failed composite publication restores standalone profiles byte for byte',async t=>{
 const ctx=await compositeContext(t);await standalone(ctx);const before=profileFiles(ctx);ctx.hooks={fault:e=>{if(e.phase==='before-publish'&&e.path.endsWith('arc-role-platform-routing.json'))throw Error('fault');}};
 const result=await publish(ctx);assert.equal(result.code,1);assert.deepEqual(profileFiles(ctx),before);assert.equal(fs.existsSync(ctx.userHome+'/.codex/arc-role-platform-routing.json'),false);
});
test('unowned standalone profile is kept and reported as residual',async t=>{
 const ctx=await compositeContext(t);await standalone(ctx);const user=ctx.userHome+'/.claude/agents/arc-qa.md',link=ctx.userHome+'/.codex/agents/arc-qa.toml',outside=ctx.userHome+'/mine';fs.writeFileSync(user,'my profile\n');fs.writeFileSync(outside,'outside\n');fs.unlinkSync(link);fs.symlinkSync(outside,link);
 const result=await publish(ctx);assert.equal(result.code,0,JSON.stringify(result));assert.equal(fs.readFileSync(user,'utf8'),'my profile\n');assert.equal(fs.readlinkSync(link),outside);for(const filename of [user,link])assert.ok(result.messages.includes('Residual path: '+filename));
});
test('active bridge lease blocks publication and deactivation without changes',async t=>{
 const {createLease}=await import('../../lib/runtime/role-dispatch-store.mjs');const ctx=await compositeContext(t);await standalone(ctx);const before=profileFiles(ctx),now='2026-11-10T00:00:00.000Z';
 await createLease(ctx.userHome+'/.codex',{version:1,dispatchId:'active-1',workflowId:'wf-1',taskId:'task-1',requestId:'req-1',role:'arc_planner',route:'bridge',hostPlatform:'claude',executionEnvironment:'claude-cli',revision:'rev-0',profileHash:null,argsDigest:null,state:'running',supervisor:null,child:null,sessionId:null,timeoutMinutes:20,claims:null,reasons:[],allowedPaths:[],resultPath:null,segment:0,nativeAgentId:null,createdAt:now,updatedAt:now});
 const result=await publish(ctx);assert.equal(result.code,1);assert.ok(result.messages.includes('Active bridge dispatches: active-1'));assert.deepEqual(profileFiles(ctx),before);
});
test('mixed legacy state is cleaned by one composite publication',async t=>{
 const ctx=await compositeContext(t);await standalone(ctx);const before=profileFiles(ctx);assert.equal((await publish(ctx)).code,0);
 for(const [name,hex]of Object.entries(before)){const [p,file]=name.split('/');fs.writeFileSync(ctx.userHome+'/.'+p+'/agents/'+file,Buffer.from(hex,'hex'));}
 assert.equal((await publish(ctx,'mode-2')).code,0);for(const p of ['codex','claude'])assert.ok(agents(ctx,p).every(n=>n.startsWith('arc-routing-')));
});
import {collectStatus} from '../../lib/management/status.mjs';
import {collectInstalledState} from '../../lib/installer/upgrade-state.mjs';
import {buildUpgradePlans} from '../../lib/installer/upgrade.mjs';
import {installTargets} from '../../lib/installer/install.mjs';
import {verifyPayload} from '../../lib/installer/manifest.mjs';
import {prepareCompositeDeactivation} from '../../lib/installer/role-routing.mjs';
import {renderLanguagePolicy} from '../../lib/installer/language.mjs';
test('status and installed state accept composite homes without standalone profiles',async t=>{
 const ctx=await compositeContext(t);await standalone(ctx);const before=profileFiles(ctx);assert.equal((await publish(ctx)).code,0);
 for(const mixed of [false,true]){if(mixed)for(const [name,hex]of Object.entries(before)){const[p,file]=name.split('/');fs.writeFileSync(ctx.userHome+'/.'+p+'/agents/'+file,Buffer.from(hex,'hex'));}
 assert.deepEqual((await collectStatus(ctx)).map(s=>s.state),['installed','installed']);const state=collectInstalledState(ctx);assert.equal(state.mode,'composite');assert.equal(state.targets.length,2);}
});
test('unverified composite state refuses publish, deactivation and switch',async t=>{
 const ctx=await compositeContext(t);await standalone(ctx);await publish(ctx);const marker=ctx.userHome+'/.codex/arc-role-platform-routing.prepared.json',data=JSON.parse(fs.readFileSync(marker));data.configHash='sha256:'+'0'.repeat(64);fs.writeFileSync(marker,JSON.stringify(data));const before=profileFiles(ctx);
 await assert.rejects(api.prepareCompositeOperation(ctx,{kind:'install',config:await mixedConfig('mode-2')}),{message:'Claude & Codex configuration cannot be verified.'});await assert.rejects(api.prepareOperation(ctx,{kind:'install',target:'codex',preset:'balanced',switchFromComposite:true}),{message:'Claude & Codex configuration cannot be verified.'});assert.throws(()=>prepareCompositeDeactivation({context:ctx,targets:targets(ctx),payload:verifyPayload(ctx)}),{message:'Claude & Codex configuration cannot be verified.'});assert.deepEqual(profileFiles(ctx),before);
});
test('composite upgrade does not recreate standalone profiles',async t=>{
 const ctx=await compositeContext(t);await standalone(ctx);const old=profileFiles(ctx);await publish(ctx);
 for(const mixed of [false,true]){if(mixed)for(const [name,hex]of Object.entries(old)){const[p,file]=name.split('/');fs.writeFileSync(ctx.userHome+'/.'+p+'/agents/'+file,Buffer.from(hex,'hex'));}
 const before=profileFiles(ctx),plans=buildUpgradePlans({payload:verifyPayload(ctx),state:collectInstalledState(ctx),safeFs});assert.ok(plans.every(p=>p.managedPaths.every(n=>!n.includes('/agents/arc-'))));assert.ok((await installTargets(plans,{safeFs})).results.every(r=>r.status==='installed'));assert.deepEqual(profileFiles(ctx),before);}
});
test('composite Change Models renders from the payload and keeps each platform language',async t=>{
 const ctx=await compositeContext(t);await standalone(ctx);assert.equal((await api.executeOperation(ctx,await api.prepareOperation(ctx,{kind:'install',target:'claude',preset:'balanced',language:'ko'}))).code,0);await publish(ctx);
 const result=await publish(ctx,'mode-2','preset');assert.equal(result.code,0,JSON.stringify(result));const text=fs.readFileSync(ctx.userHome+'/.claude/agents/arc-routing-planner.md','utf8');const policy=renderLanguagePolicy(Buffer.from('{{ARC_OUTPUT_LANGUAGE_POLICY}}\n'),'ko').toString().split('\n').filter(line=>line.includes('Korean'));assert.ok(policy.length);for(const line of policy)assert.ok(text.includes(line));
});
async function switched(ctx,kind='install',extra={}){return api.executeOperation(ctx,await api.prepareOperation(ctx,{kind,target:'codex',preset:'balanced',language:'en',removeCli:false,switchFromComposite:true,...extra}));}
function assertStandalone(ctx){assert.equal(readInstallMode({...ctx,targets:targets(ctx)}).mode,'standalone');for(const p of ['codex','claude'])assert.deepEqual(agents(ctx,p),standaloneNames(p));}
test('switch to Codex restores both standalone installs then applies the Codex operation',async t=>{
 const ctx=await compositeContext(t);await standalone(ctx);await publish(ctx);const prepared=await api.prepareOperation(ctx,{kind:'install',target:'codex',preset:'balanced',language:'en',switchFromComposite:true});assert.equal(prepared.kind,'switch');const result=await api.executeOperation(ctx,prepared);assert.equal(result.code,0,JSON.stringify(result));assert.equal(result.messages[0],'Claude & Codex turned off.');assertStandalone(ctx);assert.deepEqual((await collectStatus(ctx)).map(s=>s.state),['installed','installed']);
});
test('failure after deactivation leaves both platforms standalone',async t=>{
 const ctx=await compositeContext(t);await standalone(ctx);await publish(ctx);ctx.hooks={fault:e=>{if(e.phase==='before-publish'&&e.path.endsWith('/.codex/skills/arc'))throw Error('second stage fault');}};const result=await switched(ctx);assert.equal(result.code,1);assert.equal(result.messages[0],'Claude & Codex turned off.');assertStandalone(ctx);assert.deepEqual((await collectStatus(ctx)).map(s=>s.state),['installed','installed']);
});
test('uninstall one platform during composite leaves the other standalone',async t=>{
 for(const platform of ['codex','claude']){const ctx=await compositeContext(t);await standalone(ctx);await publish(ctx);const result=await switched(ctx,'uninstall',{target:platform});assert.equal(result.code,0,JSON.stringify(result));const other=platform==='codex'?'claude':'codex';assert.equal(fs.existsSync(ctx.userHome+'/.'+platform+'/skills/arc'),false);assert.deepEqual(agents(ctx,platform),[]);assert.deepEqual(agents(ctx,other),standaloneNames(other));assert.equal((await collectStatus(ctx)).find(s=>s.platform===other).state,'installed');}
 const ctx=await compositeContext(t);await standalone(ctx);await publish(ctx);const prepared=await api.prepareOperation(ctx,{kind:'uninstall',target:'all',removeCli:false});assert.equal(prepared.kind,'uninstall');assert.equal((await api.executeOperation(ctx,prepared)).code,0);
});
test('single-platform operation is refused while Claude & Codex is active without the switch flag',async t=>{
 const ctx=await compositeContext(t);await standalone(ctx);await publish(ctx);const before=profileFiles(ctx);for(const kind of ['install','preset','uninstall'])for(const target of ['codex','claude'])await assert.rejects(api.prepareOperation(ctx,{kind,target,preset:'balanced',removeCli:false}),{message:'Claude & Codex is active; confirm the switch first'});assert.deepEqual(profileFiles(ctx),before);
});
test('deactivation writes standalone profiles only where skills/arc exists',async t=>{
 const ctx=await compositeContext(t);await standalone(ctx);await publish(ctx);fs.rmSync(ctx.userHome+'/.claude/skills/arc',{recursive:true});const result=await switched(ctx);assert.equal(result.code,0,JSON.stringify(result));assert.deepEqual(agents(ctx,'codex'),standaloneNames('codex'));assert.deepEqual(agents(ctx,'claude'),[]);
});
test('deactivation rolls back all composite files on fault and refuses active bridge leases',async t=>{
 const {createLease}=await import('../../lib/runtime/role-dispatch-store.mjs');const ctx=await compositeContext(t);await standalone(ctx);await publish(ctx);const before=profileFiles(ctx),active=fs.readFileSync(ctx.userHome+'/.codex/arc-role-platform-routing.json');ctx.hooks={fault:e=>{if(e.phase==='before-publish'&&e.path.endsWith('/agents/arc-qa.md'))throw Error('deactivation fault');}};let result=await switched(ctx);assert.equal(result.code,1);assert.deepEqual(profileFiles(ctx),before);assert.deepEqual(fs.readFileSync(ctx.userHome+'/.codex/arc-role-platform-routing.json'),active);delete ctx.hooks;
 const now='2026-11-10T00:00:00.000Z';await createLease(ctx.userHome+'/.codex',{version:1,dispatchId:'active-1',workflowId:'wf-1',taskId:'task-1',requestId:'req-1',role:'arc_planner',route:'bridge',hostPlatform:'claude',executionEnvironment:'claude-cli',revision:'rev-0',profileHash:null,argsDigest:null,state:'running',supervisor:null,child:null,sessionId:null,timeoutMinutes:20,claims:null,reasons:[],allowedPaths:[],resultPath:null,segment:0,nativeAgentId:null,createdAt:now,updatedAt:now});result=await switched(ctx);assert.equal(result.code,1);assert.ok(result.messages.includes('Active bridge dispatches: active-1'));assert.deepEqual(profileFiles(ctx),before);
});
test('deactivation preserves and reports unowned standalone profiles',async t=>{
 const ctx=await compositeContext(t);await standalone(ctx);await publish(ctx);const file=ctx.userHome+'/.claude/agents/arc-qa.md',link=ctx.userHome+'/.codex/agents/arc-qa.toml',outside=ctx.userHome+'/mine';fs.writeFileSync(file,'mine\n');fs.writeFileSync(outside,'outside\n');fs.symlinkSync(outside,link);const result=await switched(ctx);assert.equal(result.code,0,JSON.stringify(result));assert.equal(fs.readFileSync(file,'utf8'),'mine\n');assert.equal(fs.readlinkSync(link),outside);for(const p of [file,link])assert.ok(result.messages.includes('Residual path: '+p));
});
test('fresh composite install removes profiles created by its install stage',async t=>{
 const ctx=await compositeContext(t);const result=await publish(ctx);assert.equal(result.code,0,JSON.stringify(result));for(const p of ['codex','claude'])assert.ok(agents(ctx,p).every(n=>n.startsWith('arc-routing-')));
 const again=await publish(ctx,'mode-2');assert.equal(again.code,0,JSON.stringify(again));for(const p of ['codex','claude'])assert.ok(agents(ctx,p).every(n=>n.startsWith('arc-routing-')));
});
test('composite single uninstall preserves unowned profiles as residuals',async t=>{
 const ctx=await compositeContext(t);await standalone(ctx);await publish(ctx);const filename=ctx.userHome+'/.codex/agents/arc-qa.toml';fs.writeFileSync(filename,'mine\n');const result=await switched(ctx,'uninstall');assert.equal(result.code,0,JSON.stringify(result));assert.equal(fs.readFileSync(filename,'utf8'),'mine\n');assert.ok(result.results[0].residualPaths.includes(filename));
});
