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

test('isOwnedStandaloneProfile accepts shipped profiles and rejects renamed or contract-less bytes',()=>{
 for(const [platform,ext] of [['claude','md'],['codex','toml']])for(const role of roles){const bytes=fs.readFileSync(path.join(sourceRoot,platform,'agents',`arc-${role}.${ext}`));assert.equal(isOwnedStandaloneProfile(bytes,platform,'arc_'+role),true);assert.equal(isOwnedStandaloneProfile(Buffer.from(bytes.toString().replace('[ARC role policy: contract begin]','')),platform,'arc_'+role),false);assert.equal(isOwnedStandaloneProfile(bytes,platform,'arc_qa'),role==='qa');}
});
test('readInstallMode reports standalone, composite and unverified',async t=>{
 const ctx=await compositeContext(t);await standalone(ctx);assert.equal(readInstallMode({...ctx,targets:targets(ctx)}).mode,'standalone');assert.equal((await publish(ctx)).code,0);
 assert.deepEqual(readInstallMode({...ctx,targets:targets(ctx)}).homes,{codex:'composite',claude:'composite'});
 const marker=ctx.userHome+'/.codex/arc-role-platform-routing.prepared.json',data=JSON.parse(fs.readFileSync(marker));data.configHash='sha256:'+'0'.repeat(64);fs.writeFileSync(marker,JSON.stringify(data));const state=readInstallMode({...ctx,targets:targets(ctx)});assert.equal(state.mode,'unverified');assert.ok(state.residualPaths.includes(marker));
});
test('status and installed state accept composite homes without standalone profiles',async t=>{
 const ctx=await compositeContext(t);await standalone(ctx);const before=profileFiles(ctx);assert.equal((await publish(ctx)).code,0);
 for(const mixed of [false,true]){if(mixed)for(const [name,hex]of Object.entries(before)){const[p,file]=name.split('/');fs.writeFileSync(ctx.userHome+'/.'+p+'/agents/'+file,Buffer.from(hex,'hex'));}
 assert.deepEqual((await collectStatus(ctx)).map(s=>s.state),['installed','installed']);const state=collectInstalledState(ctx);assert.equal(state.mode,'composite');assert.equal(state.targets.length,2);}
});
test('unverified composite state refuses publish, deactivation and switch',async t=>{
 const ctx=await compositeContext(t);await standalone(ctx);await publish(ctx);const marker=ctx.userHome+'/.codex/arc-role-platform-routing.prepared.json',data=JSON.parse(fs.readFileSync(marker));data.configHash='sha256:'+'0'.repeat(64);fs.writeFileSync(marker,JSON.stringify(data));const before=profileFiles(ctx);
 await assert.rejects(api.prepareCompositeOperation(ctx,{kind:'install',config:await mixedConfig('mode-2')}),{message:'Claude & Codex configuration cannot be verified.'});await assert.rejects(api.prepareOperation(ctx,{kind:'install',target:'codex',switchFromComposite:true}),{message:'Claude & Codex configuration cannot be verified.'});assert.throws(()=>prepareCompositeDeactivation({context:ctx,targets:targets(ctx),payload:verifyPayload(ctx)}),{message:'Claude & Codex configuration cannot be verified.'});assert.deepEqual(profileFiles(ctx),before);
});
test('single-platform operation is refused while Claude & Codex is active without the switch flag',async t=>{
 const ctx=await compositeContext(t);await standalone(ctx);await publish(ctx);const before=profileFiles(ctx);for(const kind of ['install','preset','uninstall'])for(const target of ['codex','claude'])await assert.rejects(api.prepareOperation(ctx,{kind,target,removeCli:false}),{message:'Claude & Codex is active; confirm the switch first'});assert.deepEqual(profileFiles(ctx),before);
});
