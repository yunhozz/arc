import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {createNpmSandbox} from './fixtures/npm-sandbox.mjs';
const source=path.resolve('.'),version=JSON.parse(fs.readFileSync('package.json')).version;
const driver=process.platform==='darwin'?'expect':'script',available=spawnSync('/bin/sh',['-c',`command -v ${driver}`]).status===0;
const required=process.env.ARC_TEST_REQUIRE_PTY==='1';
const choices=[{wait:'Select an installation target [Up/Down]:',send:'\x1b[B\r'},{wait:'Select a performance preset [Up/Down]:',send:'\r'},{wait:'Maximum total subagents',send:'23\r'},{wait:'Maximum concurrent subagents',send:'3\r'},{wait:'Select an output language [Up/Down]:',send:'\x1b[B\r'}];
async function fixture(t){assert.ok(available,`${driver} required for real PTY`);const box=await createNpmSandbox(t);box.addPackage(await box.packReleaseFixture(source));return box;}
const skip=!available&&!required;
test('default npm global install opens chooser through captured stdio and restores real terminal', {skip},async t=>{
 const box=await fixture(t);t.diagnostic(`${process.platform}/${process.arch} Node ${process.version}; npm ${spawnSync(process.execPath,[box.npmCli,'--version'],{encoding:'utf8'}).stdout.trim()}; PTY ${driver}`);
 const result=await box.runPty(['i','-g','@yunhozz/arc'],choices,{extraEnv:{CODEX_HOME:'custom codex'}});
 assert.equal(result.code,0,result.text);assert.match(result.text,new RegExp(`ARC version ${version.replaceAll('.','\\.')} installed!`));assert.match(result.text,/ARC_TERMINAL_RESTORED/);assert.doesNotMatch(result.text,/ARC_TERMINAL_CHANGED|zsh completion:|eval .*arc completion/);
 const target=box.cwd+'/custom codex';assert.ok(fs.existsSync(target+'/skills/arc/SKILL.md'));assert.match(fs.readFileSync(target+'/skills/arc/limits.toml','utf8'),/max_total_subagents = 23/);assert.match(fs.readFileSync(target+'/skills/arc/limits.toml','utf8'),/max_concurrent_subagents = 3/);assert.match(fs.readFileSync(target+'/skills/arc/settings.toml','utf8'),/ko/);assert.equal(fs.existsSync(box.home+'/.claude'),false);assert.equal(fs.existsSync(box.home+'/.zshrc'),false);
 const repeat=await box.runPty(['i','-g','@yunhozz/arc'],choices,{extraEnv:{CODEX_HOME:'custom codex'}});assert.equal(repeat.code,0,repeat.text);assert.match(repeat.text,/ARC_TERMINAL_RESTORED/);assert.equal(fs.existsSync(box.home+'/.zshrc'),false);
});
for(const send of ['\x03','\x04'])test(`npm chooser ${send==='\x03'?'Ctrl+C':'EOF'} returns failure and restores terminal`,{skip},async t=>{
 const box=await fixture(t);const result=await box.runPty(['i','-g','@yunhozz/arc'],[{wait:'Select an installation target [Up/Down]:',send}]);assert.notEqual(result.code,0,result.text);assert.match(result.text,/ARC_TERMINAL_RESTORED/);assert.doesNotMatch(result.text,/ARC version .* installed!/);assert.equal(fs.existsSync(box.home+'/.codex'),false);assert.equal(fs.existsSync(box.home+'/.claude'),false);t.diagnostic(`after npm failure CLI exists: ${fs.existsSync(box.prefix+'/bin/arc')}`);
});
test('npm installer preflight failure reports failure and restores terminal',{skip},async t=>{
 const box=await fixture(t);fs.symlinkSync(box.cwd,box.home+'/.codex');const result=await box.runPty(['i','-g','@yunhozz/arc'],choices.slice(0,2));assert.notEqual(result.code,0,result.text);assert.match(result.text,/ARC_TERMINAL_RESTORED/);assert.doesNotMatch(result.text,/ARC version .* installed!/);assert.equal(fs.existsSync(box.cwd+'/skills'),false);t.diagnostic(`after npm failure CLI exists: ${fs.existsSync(box.prefix+'/bin/arc')}`);
});
test('CI and ignore-scripts global installs do not prompt even with a real controlling tty',{skip},async t=>{
 const box=await fixture(t);for(const extraEnv of [{CI:'true'},{npm_config_ignore_scripts:'true'}]){const result=await box.runPty(['i','-g','@yunhozz/arc'],[],{extraEnv});assert.equal(result.code,0,result.text);assert.doesNotMatch(result.text,/Select an installation|ARC version .* installed!/);assert.match(result.text,/ARC_TERMINAL_RESTORED/);}assert.equal(fs.existsSync(box.home+'/.codex'),false);assert.equal(fs.existsSync(box.home+'/.claude'),false);assert.equal(fs.existsSync(box.home+'/.zshrc'),false);
});
test('PTY disconnect while choosing never installs harness',{skip},async t=>{
 const box=await fixture(t);const result=await box.runPty(['i','-g','@yunhozz/arc'],[{wait:'Select an installation target [Up/Down]:',send:''}],{disconnect:true});assert.doesNotMatch(result.text,/ARC version .* installed!/);assert.equal(fs.existsSync(box.home+'/.codex'),false);assert.equal(fs.existsSync(box.home+'/.claude'),false);
});
test('local dependency and npx preparation do not start chooser on a real terminal',{skip},async t=>{
 const box=await fixture(t);
 for(const args of [['i','@yunhozz/arc'],['exec','--yes','--package=@yunhozz/arc','--','arc','--version']]){
  const result=await box.runPty(args,[]);assert.equal(result.code,0,result.text);assert.doesNotMatch(result.text,/Select an installation|ARC version .* installed!/);assert.match(result.text,/ARC_TERMINAL_RESTORED/);
 }
 assert.deepEqual(fs.readdirSync(box.home),[]);
});
