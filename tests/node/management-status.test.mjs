import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {openRoot} from '../../lib/safe-fs/index.mjs';import {loadNative} from '../../lib/safe-fs/native.mjs';import {referenceFixture} from './fixtures/fake-git.mjs';
const api=await import('../../lib/management/status.mjs').catch(()=>({})),operations=await import('../../lib/management/operations.mjs').catch(()=>({}));const native=loadNative({artifactDirectory:'build/native'}),safeFs={openRoot:p=>openRoot(p,{native})};
test('damaged target diagnostics do not hide another installed target or its settings',async t=>{assert.equal(typeof api.collectStatus,'function');const userHome=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'arc-status-')));t.after(()=>fs.rmSync(userHome,{recursive:true,force:true}));const ctx={packageRoot:process.cwd(),userHome,cwd:userHome,env:{},safeFs,acquisition:async()=>({references:referenceFixture()})};await operations.executeOperation(ctx,await operations.prepareOperation(ctx,{kind:'install',target:'all',preset:'economy',language:'ko',maxConcurrentSubagents:2}));fs.unlinkSync(userHome+'/.codex/skills/arc/settings.toml');const statuses=await api.collectStatus(ctx);assert.equal(statuses[0].state,'incomplete');assert.ok(statuses[0].diagnostics.length);assert.equal(statuses[1].state,'installed');assert.equal(statuses[1].settings.language,'ko');assert.equal(statuses[1].settings.limits.max_concurrent_subagents,2);});
test('Codex install detects the selected fixture CLI and plans a diagnostic registration',async t=>{
 const userHome=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'arc-native-operation-')));t.after(()=>fs.rmSync(userHome,{recursive:true,force:true}));
 const bin=path.join(userHome,'bin');fs.mkdirSync(bin);fs.writeFileSync(path.join(bin,'codex'),'#!/bin/sh\nprintf "codex-cli 0.111.0\\n"\n',{mode:0o755});
 const ctx={packageRoot:process.cwd(),userHome,cwd:userHome,env:{PATH:bin},safeFs};
 const prepared=await operations.prepareOperation(ctx,{kind:'install',target:'codex',preset:'economy',language:'en'});
 assert.equal(prepared.plans[0].nativeHooks.record.cli.version,'0.111.0');assert.equal(prepared.plans[0].nativeHooks.record.cli.executablePath,path.join(bin,'codex'));
});
test('Codex status separates registered diagnostic hook from host trust and callback evidence',async t=>{
 const userHome=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'arc-native-status-')));t.after(()=>fs.rmSync(userHome,{recursive:true,force:true}));
 const bin=path.join(userHome,'bin');fs.mkdirSync(bin);fs.writeFileSync(path.join(bin,'codex'),'#!/bin/sh\nprintf "codex-cli 0.111.0\\n"\n',{mode:0o755});
 const ctx={packageRoot:process.cwd(),userHome,cwd:userHome,env:{PATH:bin},safeFs};
 const prepared=await operations.prepareOperation(ctx,{kind:'install',target:'codex',preset:'economy',language:'en'});const result=await operations.executeOperation(ctx,prepared);assert.equal(result.code,0);
 const [codex,claude]=await api.collectStatus(ctx);
 assert.deepEqual(codex.nativeHooks,{registration:'registered',entrypoint:'connected',trust:'unknown',callbackObserved:'unknown',mode:'diagnostic-only'});
 assert.notEqual(claude.nativeHooks?.registration,'registered');
});
test('diagnostic status records valid callbacks but treats corrupt or unsafe stores as unknown',async t=>{
 const home=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'arc-observed-')));t.after(()=>fs.rmSync(home,{recursive:true,force:true}));const bin=path.join(home,'bin');fs.mkdirSync(bin);fs.writeFileSync(path.join(bin,'codex'),'#!/bin/sh\nprintf "codex-cli 0.111.0\\n"\n',{mode:0o755});
 const ctx={packageRoot:process.cwd(),userHome:home,cwd:home,env:{PATH:bin},safeFs};assert.equal((await operations.executeOperation(ctx,await operations.prepareOperation(ctx,{kind:'install',target:'codex',preset:'economy',language:'en'}))).code,0);
 const owner=JSON.parse(fs.readFileSync(path.join(home,'.codex/skills/arc/native-hooks.json'))),dir=path.join(home,'.arc/state/native-diagnostics');for(const name of ['.arc','.arc/state','.arc/state/native-diagnostics'])fs.mkdirSync(path.join(home,name),{mode:0o700});const file=path.join(dir,'codex.jsonl');
 const record={platform:'codex',event:'PreToolUse',callback:true,definitionHash:'sha256:'+owner.hash,runtimeHash:'sha256:'+owner.runtimeHash,platformVersion:owner.cli.version,observedAt:'2026-10-30T00:00:00.000Z'};
 fs.writeFileSync(file,JSON.stringify(record)+'\n',{mode:0o600});assert.equal((await api.collectStatus(ctx))[0].nativeHooks.callbackObserved,'recorded');
 fs.writeFileSync(file,'{invalid\n');assert.equal((await api.collectStatus(ctx))[0].nativeHooks.callbackObserved,'unknown');
 fs.writeFileSync(file,JSON.stringify(record)+'\n');fs.chmodSync(file,0o644);assert.equal((await api.collectStatus(ctx))[0].nativeHooks.callbackObserved,'unknown');
 fs.chmodSync(file,0o600);fs.linkSync(file,path.join(home,'other-link'));assert.equal((await api.collectStatus(ctx))[0].nativeHooks.callbackObserved,'unknown');
});
