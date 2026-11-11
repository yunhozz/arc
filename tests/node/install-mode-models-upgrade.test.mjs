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
import {collectStatus} from '../../lib/management/status.mjs';
import {collectInstalledState} from '../../lib/installer/upgrade-state.mjs';
import {buildUpgradePlans} from '../../lib/installer/upgrade.mjs';
import {installTargets} from '../../lib/installer/install.mjs';
import {verifyPayload} from '../../lib/installer/manifest.mjs';
import {prepareCompositeDeactivation} from '../../lib/installer/role-routing.mjs';
import {renderLanguagePolicy} from '../../lib/installer/language.mjs';
import {safeFs,roles,compositeContext,targets,agents,mixedConfig,standalone,publish,profileFiles,standaloneNames,switched,assertStandalone} from './fixtures/install-mode.mjs';

test('composite upgrade does not recreate standalone profiles',async t=>{
 const ctx=await compositeContext(t);await standalone(ctx);const old=profileFiles(ctx);await publish(ctx);
 for(const mixed of [false,true]){if(mixed)for(const [name,hex]of Object.entries(old)){const[p,file]=name.split('/');fs.writeFileSync(ctx.userHome+'/.'+p+'/agents/'+file,Buffer.from(hex,'hex'));}
 const before=profileFiles(ctx),plans=buildUpgradePlans({payload:verifyPayload(ctx),state:collectInstalledState(ctx),safeFs});assert.ok(plans.every(p=>p.managedPaths.every(n=>!n.includes('/agents/arc-'))));assert.ok((await installTargets(plans,{safeFs})).results.every(r=>r.status==='installed'));assert.deepEqual(profileFiles(ctx),before);}
});
test('composite Change Models renders from the payload and keeps each platform language',async t=>{
 const ctx=await compositeContext(t);await standalone(ctx);assert.equal((await api.executeOperation(ctx,await api.prepareOperation(ctx,{kind:'install',target:'claude',language:'ko'}))).code,0);await publish(ctx);
 const result=await publish(ctx,'mode-2','preset');assert.equal(result.code,0,JSON.stringify(result));const text=fs.readFileSync(ctx.userHome+'/.claude/agents/arc-routing-planner.md','utf8');const policy=renderLanguagePolicy(Buffer.from('{{ARC_OUTPUT_LANGUAGE_POLICY}}\n'),'ko').toString().split('\n').filter(line=>line.includes('Korean'));assert.ok(policy.length);for(const line of policy)assert.ok(text.includes(line));
});
test('all roles on one platform publish',async t=>{
 for(const platform of ['codex','claude']){
  const ctx=await compositeContext(t),{loadStaticModelCatalog}=await import('../../lib/models/static-catalog.mjs'),pair=(await loadStaticModelCatalog(platform)).catalog.pairs[0];
  const config={version:1,revision:'one-platform',roles:Object.fromEntries(roles.map(r=>['arc_'+r,{platform,...pair}]))};
  const result=await api.executeOperation(ctx,await api.prepareCompositeOperation(ctx,{kind:'install',config}));assert.equal(result.code,0,JSON.stringify(result));
  assert.deepEqual(agents(ctx,platform==='codex'?'claude':'codex'),[]);assert.equal(agents(ctx,platform).length,5);
 }
});
test('composite Install Settings are applied equally to both install plans',async t=>{
 const ctx=await compositeContext(t),settings={language:'ko',maxTotalSubagents:7,maxConcurrentSubagents:3,skipGlobal:true,concurrentSelected:true};
 const prepared=await api.prepareCompositeOperation(ctx,{kind:'install',config:await mixedConfig('settings'),settings});
 for(const plan of prepared.plans){assert.equal(plan.language,'ko');assert.equal(plan.skipGlobal,true);assert.deepEqual(plan.limits,{version:1,max_total_subagents:7,max_concurrent_subagents:3});assert.equal(plan.concurrentExplicit,true);assert.deepEqual(plan.globalChanges,[]);}
 assert.equal((await api.executeOperation(ctx,prepared)).code,0);
});
test('composite Change Models migrates legacy model files to v3 atomically',async t=>{
 const ctx=await compositeContext(t);await standalone(ctx);await publish(ctx);
 for(const platform of ['codex','claude'])fs.writeFileSync(ctx.userHome+'/.'+platform+'/skills/arc/models.toml',fs.readFileSync(new URL(`../fixtures/models-${platform}-v1.toml`,import.meta.url)));
 const prepared=await api.prepareCompositeOperation(ctx,{kind:'preset',config:await mixedConfig('legacy-change')});
 const result=await api.executeOperation(ctx,prepared);assert.equal(result.code,0);
 for(const platform of ['codex','claude'])assert.match(fs.readFileSync(ctx.userHome+'/.'+platform+'/skills/arc/models.toml','utf8'),/^version = 3$/m);
});
