import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const fixture=process.env.ARC_TEST_GIT_FIXTURE_REPO,required=process.env.ARC_TEST_REQUIRE_GIT_FIXTURE==='1';
// Orchestrator prepares the committed fixture; specialists only consume it.
test('Git global install and reinstall preserve an executable CLI with inherited global configuration',{skip:!fixture&&!required},t=>{
 assert.ok(fixture,'ARC_TEST_GIT_FIXTURE_REPO is required for the Git consumer acceptance check');
 assert.ok(path.isAbsolute(fixture));const gitRoot=fs.realpathSync(fixture),pkg=JSON.parse(fs.readFileSync(gitRoot+'/package.json'));
 for(const hook of ['preinstall','install','postinstall','prepublish','prepare','prepublishOnly','prepack','postpack','publish','postpublish','preuninstall','uninstall','postuninstall'])assert.equal(pkg.scripts[hook],undefined,hook);
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'arc-git-consumer-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const home=root+'/home',prefix=root+'/prefix',cache=root+'/cache';fs.mkdirSync(home);
 fs.writeFileSync(root+'/user.npmrc','');fs.writeFileSync(root+'/global.npmrc','');fs.writeFileSync(root+'/gitconfig','');
 const env={PATH:process.env.PATH,HOME:home,SHELL:'/bin/zsh',ZDOTDIR:home,npm_config_cache:cache,npm_config_userconfig:root+'/user.npmrc',npm_config_globalconfig:root+'/global.npmrc',npm_config_offline:'true',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:root+'/gitconfig'};
 function command(name,args){const result=spawnSync(name,args,{cwd:root,env,encoding:'utf8',timeout:120000});assert.equal(result.status,0,result.stderr+'\n'+result.stdout);return result.stdout;}
 const install=['install','-g','--allow-git=all','--prefix',prefix,'--no-audit','--no-fund','git+file://'+gitRoot];
 for(let attempt=0;attempt<2;attempt++){
  const installed=spawnSync('npm',install,{cwd:root,env:{...env,npm_config_global:'true'},encoding:'utf8',timeout:120000});
  const executable=prefix+'/bin/arc',packagePath=prefix+'/lib/node_modules/@yunhozz/arc';let packageLink;try{if(fs.lstatSync(packagePath).isSymbolicLink())packageLink=fs.readlinkSync(packagePath);}catch{}
  t.diagnostic(JSON.stringify({attempt,exit:installed.status,executableExists:fs.existsSync(executable),packageExists:fs.existsSync(packagePath),packageLink}));
  assert.doesNotMatch(installed.stdout+installed.stderr,/ENOTDIR|ARC version .* installed!|Select an installation/);
  assert.equal(installed.status,0,installed.stderr);assert.ok(fs.existsSync(executable),'Git installation must preserve its executable after npm cache clone cleanup');
  assert.ok(fs.statSync(fs.realpathSync(executable)).isFile());assert.equal(command(executable,['--version']).trim(),pkg.version);
  const completion=spawnSync(executable,['completion','zsh'],{cwd:root,env,encoding:'utf8'});assert.equal(completion.status,2);assert.match(completion.stderr,/Unsupported arguments/);
  assert.equal(fs.existsSync(home+'/.zshrc'),false);
 }
 assert.equal(fs.existsSync(home+'/.codex'),false);assert.equal(fs.existsSync(home+'/.claude'),false);
});

test('removed install arguments fail without creating harness or shell files',t=>{
 const home=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'arc-completion-preview-')));t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
 for(const args of [['completion','zsh'],['--check'],['--dry-run'],['--target','all']]){
  const result=spawnSync(process.execPath,['bin/arc.mjs',...args],{cwd:path.resolve(import.meta.dirname,'../..'),env:{...process.env,HOME:home,CODEX_HOME:home+'/.codex'},encoding:'utf8',timeout:30000});
  assert.equal(result.status,2,result.stderr);assert.match(result.stderr,/Unsupported arguments/);assert.deepEqual(fs.readdirSync(home),[]);
 }
});
