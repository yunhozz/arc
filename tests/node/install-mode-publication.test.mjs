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
test('fresh composite install removes profiles created by its install stage',async t=>{
 const ctx=await compositeContext(t);const result=await publish(ctx);assert.equal(result.code,0,JSON.stringify(result));for(const p of ['codex','claude'])assert.ok(agents(ctx,p).every(n=>n.startsWith('arc-routing-')));
 const again=await publish(ctx,'mode-2');assert.equal(again.code,0,JSON.stringify(again));for(const p of ['codex','claude'])assert.ok(agents(ctx,p).every(n=>n.startsWith('arc-routing-')));
});
