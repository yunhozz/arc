import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {openRoot} from '../../lib/safe-fs/index.mjs';import {loadNative} from '../../lib/safe-fs/native.mjs';import {prepareOperation,executeOperation} from '../../lib/management/operations.mjs';
const native=loadNative({artifactDirectory:'build/native'}),safeFs={openRoot:p=>openRoot(p,{native})};
function fixture(t){const home=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'arc lifecycle ')));t.after(()=>fs.rmSync(home,{recursive:true,force:true}));const bin=path.join(home,'bin');fs.mkdirSync(bin);fs.writeFileSync(path.join(bin,'codex'),'#!/bin/sh\nprintf "codex-cli 0.111.0\\n"\n',{mode:0o755});return {packageRoot:process.cwd(),userHome:home,cwd:home,env:{PATH:bin},safeFs};}
test('Codex install and uninstall preserve user hooks and remove owned runtime after settings',async t=>{
 const ctx=fixture(t),config=path.join(ctx.userHome,'.codex/config.toml');fs.mkdirSync(path.dirname(config));const user='[[hooks.PreToolUse]]\nmatcher = "Bash"\n[[hooks.PreToolUse.hooks]]\ntype = "command"\ncommand = "user"\n';fs.writeFileSync(config,user);
 const installed=await executeOperation(ctx,await prepareOperation(ctx,{kind:'install',target:'codex',preset:'economy',language:'en'}));assert.equal(installed.code,0);const arc=path.join(ctx.userHome,'.codex/skills/arc');assert.ok(fs.existsSync(arc+'/native-hooks.json'));
 let settingsRemovedFirst=false;ctx.hooks={fault(event){if(event.phase==='before-publish'&&event.path===arc){settingsRemovedFirst=!fs.readFileSync(config,'utf8').includes('native-hook.mjs');}}};
 const result=await executeOperation(ctx,await prepareOperation(ctx,{kind:'uninstall',target:'codex',removeCli:false}));assert.equal(result.code,0);assert.equal(settingsRemovedFirst,true);assert.equal(fs.existsSync(arc),false);assert.match(fs.readFileSync(config,'utf8'),/command = "user"/);assert.doesNotMatch(fs.readFileSync(config,'utf8'),/native-hook.mjs/);
});
test('Codex uninstall preserves an unrelated user hook with an integer timeout',async t=>{
 const ctx=fixture(t);assert.equal((await executeOperation(ctx,await prepareOperation(ctx,{kind:'install',target:'codex',preset:'economy',language:'en'}))).code,0);
 const arc=path.join(ctx.userHome,'.codex/skills/arc'),config=path.join(ctx.userHome,'.codex/config.toml');
 const user='\n[[hooks.PreToolUse]]\nmatcher = "ArcPreservationFixtureNeverRun"\n[[hooks.PreToolUse.hooks]]\ntype = "command"\ncommand = "/usr/bin/true"\ntimeout = 1\n';fs.appendFileSync(config,user);
 const result=await executeOperation(ctx,await prepareOperation(ctx,{kind:'uninstall',target:'codex',removeCli:false}));
 assert.equal(result.code,0,result.results[0].retainedReasons.join('; '));assert.equal(fs.existsSync(arc),false);
 const after=fs.readFileSync(config,'utf8');assert.ok(after.includes(user));assert.doesNotMatch(after,/native-hook\.mjs/);
});
test('uninstall retains ARC assets when another user hook references the diagnostic entrypoint',async t=>{
 const ctx=fixture(t),prepared=await prepareOperation(ctx,{kind:'install',target:'codex',preset:'economy',language:'en'});assert.equal((await executeOperation(ctx,prepared)).code,0);
 const arc=path.join(ctx.userHome,'.codex/skills/arc'),config=path.join(ctx.userHome,'.codex/config.toml'),entry=path.join(arc,'runtime/native-hook.mjs');
 fs.appendFileSync(config,`\n[[hooks.Stop]]\n[[hooks.Stop.hooks]]\ntype = "command"\ncommand = ${JSON.stringify(entry)}\n`);
 const result=await executeOperation(ctx,await prepareOperation(ctx,{kind:'uninstall',target:'codex',removeCli:false}));
 assert.notEqual(result.code,0);assert.ok(fs.existsSync(arc));assert.ok(result.results[0].retainedReferences.includes(entry));assert.match(fs.readFileSync(config,'utf8'),/\[\[hooks.Stop\]\]/);
});
test('installed Codex diagnostic entrypoint records a fixture callback for status without enforcing',async t=>{
 const {spawnSync}=await import('node:child_process');const {collectStatus}=await import('../../lib/management/status.mjs');const ctx=fixture(t);
 assert.equal((await executeOperation(ctx,await prepareOperation(ctx,{kind:'install',target:'codex',preset:'economy',language:'en'}))).code,0);
 const entry=path.join(ctx.userHome,'.codex/skills/arc/runtime/native-hook.mjs');const child=spawnSync(process.execPath,[entry],{input:JSON.stringify({hook_event_name:'PreToolUse'}),encoding:'utf8',env:{HOME:ctx.userHome,PATH:ctx.env.PATH}});
 assert.equal(child.status,0,child.stderr);assert.equal(child.stdout,'');const status=(await collectStatus(ctx))[0].nativeHooks;assert.equal(status.callbackObserved,'recorded');assert.equal(status.trust,'unknown');assert.equal(status.mode,'diagnostic-only');
});
test('failure during native hook removal restores settings and keeps diagnostic assets',async t=>{
 const ctx=fixture(t);assert.equal((await executeOperation(ctx,await prepareOperation(ctx,{kind:'install',target:'codex',preset:'economy',language:'en'}))).code,0);
 const arc=path.join(ctx.userHome,'.codex/skills/arc'),config=path.join(ctx.userHome,'.codex/config.toml'),before=fs.readFileSync(config),owner=fs.readFileSync(path.join(arc,'native-hooks.json'));
 ctx.hooks={fault(event){if(event.phase==='after-publish'&&event.path===config)throw Error('injected cleanup failure');}};
 const result=await executeOperation(ctx,await prepareOperation(ctx,{kind:'uninstall',target:'codex',removeCli:false}));assert.notEqual(result.code,0);assert.deepEqual(fs.readFileSync(config),before);assert.deepEqual(fs.readFileSync(path.join(arc,'native-hooks.json')),owner);
});
test('reinstall refreshes CLI version and invalidates earlier callback evidence',async t=>{
 const {spawnSync}=await import('node:child_process');const {collectStatus}=await import('../../lib/management/status.mjs');const ctx=fixture(t),install=async()=>executeOperation(ctx,await prepareOperation(ctx,{kind:'install',target:'codex',preset:'economy',language:'en'}));assert.equal((await install()).code,0);
 const entry=path.join(ctx.userHome,'.codex/skills/arc/runtime/native-hook.mjs'),invoke=()=>spawnSync(process.execPath,[entry],{input:JSON.stringify({hook_event_name:'PreToolUse'}),encoding:'utf8',env:{HOME:ctx.userHome,PATH:ctx.env.PATH}});assert.equal(invoke().status,0);assert.equal((await collectStatus(ctx))[0].nativeHooks.callbackObserved,'recorded');
 fs.writeFileSync(path.join(ctx.env.PATH,'codex'),'#!/bin/sh\nprintf "codex-cli 0.112.0\\n"\n',{mode:0o755});assert.equal((await install()).code,0);const status=(await collectStatus(ctx))[0].nativeHooks;assert.equal(status.callbackObserved,'unknown');assert.equal(status.trust,'unknown');assert.equal(invoke().status,0);assert.equal((await collectStatus(ctx))[0].nativeHooks.callbackObserved,'recorded');
});
