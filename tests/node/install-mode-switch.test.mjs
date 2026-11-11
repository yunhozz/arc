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

test('switch to Codex restores both standalone installs then applies the Codex operation',async t=>{
 const ctx=await compositeContext(t);await standalone(ctx);await publish(ctx);const prepared=await api.prepareOperation(ctx,{kind:'install',target:'codex',language:'en',switchFromComposite:true});assert.equal(prepared.kind,'switch');const result=await api.executeOperation(ctx,prepared);assert.equal(result.code,0,JSON.stringify(result));assert.equal(result.messages[0],'Claude & Codex turned off.');assertStandalone(ctx);assert.deepEqual((await collectStatus(ctx)).map(s=>s.state),['installed','installed']);
});
test('failure after deactivation leaves both platforms standalone',async t=>{
 const ctx=await compositeContext(t);await standalone(ctx);await publish(ctx);ctx.hooks={fault:e=>{if(e.phase==='before-publish'&&e.path.endsWith('/.codex/skills/arc'))throw Error('second stage fault');}};const result=await switched(ctx);assert.equal(result.code,1);assert.equal(result.messages[0],'Claude & Codex turned off.');assertStandalone(ctx);assert.deepEqual((await collectStatus(ctx)).map(s=>s.state),['installed','installed']);
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
