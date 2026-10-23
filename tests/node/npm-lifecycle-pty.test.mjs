import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {createNpmSandbox} from './fixtures/npm-sandbox.mjs';
const source=path.resolve('.'),driver=process.platform==='darwin'?'expect':'script',available=spawnSync('/bin/sh',['-c',`command -v ${driver}`]).status===0;
const required=process.env.ARC_TEST_REQUIRE_PTY==='1';
test('global npm lifecycle on a real PTY installs only CLI and restores terminal',{skip:!available&&!required},async t=>{
 assert.ok(available,`${driver} required for real PTY`);const box=await createNpmSandbox(t);box.addPackage(await box.packReleaseFixture(source));
 for(const extraEnv of [{},{CI:'true'},{npm_config_ignore_scripts:'true'}]){
 const r=await box.runPty(['i','-g','@yunhozz/arc'],[],{extraEnv});assert.equal(r.code,0,r.text);assert.match(r.text,/ARC_TERMINAL_RESTORED/);assert.doesNotMatch(r.text,/ARC Management|Select an installation|ARC version .* installed!/);assert.equal(fs.existsSync(box.prefix+'/bin/arc'),true);
 }
 assert.equal(fs.existsSync(box.home+'/.codex'),false);assert.equal(fs.existsSync(box.home+'/.claude'),false);assert.equal(fs.existsSync(box.home+'/.zshrc'),false);
});
