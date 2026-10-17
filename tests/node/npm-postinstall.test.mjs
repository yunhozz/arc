import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
const source=new URL('../../',import.meta.url).pathname;
function fixture(t){const base=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'arc-postinstall-')));t.after(()=>fs.rmSync(base,{recursive:true,force:true}));const root=base+'/package';fs.mkdirSync(root);for(const name of ['lib','scripts','prebuilds','codex','claude'])fs.cpSync(source+name,root+'/'+name,{recursive:true});fs.mkdirSync(base+'/bin');fs.symlinkSync(process.execPath,base+'/bin/node');fs.copyFileSync(source+'tests/node/fixtures/fake-git.mjs',base+'/fake-git.mjs');return{base,root};}
function run(f,mode){fs.writeFileSync(f.base+'/bin/git',`#!/bin/sh\nexec '${process.execPath}' '${f.base}/fake-git.mjs' ${mode} "$@"\n`,{mode:0o755});return spawnSync(process.execPath,[f.root+'/scripts/npm-postinstall.mjs'],{encoding:'utf8',env:{PATH:f.base+'/bin',HOME:f.base,TMPDIR:f.base,SHELL:'/missing-shell',npm_config_global:'false'},timeout:30000});}
test('postinstall rejects upstream refresh failure',t=>{const f=fixture(t),result=run(f,'nonzero');assert.notEqual(result.status,0,result.stderr);});
test('postinstall publishes both references before best-effort completion',t=>{const f=fixture(t),result=run(f,'valid');assert.equal(result.status,0,result.stderr);for(const platform of ['codex','claude']){const p=JSON.parse(fs.readFileSync(f.root+'/'+platform+'/skill/references/superpowers/provenance.json'));assert.equal(p.revision,'a'.repeat(40));}});
test('package postinstall runs after npm removes its lifecycle working directory',t=>{
  const f=fixture(t);
  fs.renameSync(f.root,f.root+' # space');f.root+=' # space';
  const packageJson=JSON.parse(fs.readFileSync(source+'package.json','utf8'));
  fs.writeFileSync(f.root+'/package.json',JSON.stringify(packageJson));
  fs.writeFileSync(f.base+'/bin/git',`#!/bin/sh\nexec '${process.execPath}' '${f.base}/fake-git.mjs' valid "$@"\n`,{mode:0o755});
  const cwd=f.base+'/removed';fs.mkdirSync(cwd);
  const result=spawnSync('/bin/sh',['-c',`/bin/rmdir '${cwd}' && exec ${packageJson.scripts.postinstall}`],{
    cwd,encoding:'utf8',env:{PATH:f.base+'/bin',HOME:f.base,TMPDIR:f.base,SHELL:'/missing-shell',npm_config_global:'false',npm_package_json:f.root+'/package.json'},timeout:30000,
  });
  assert.equal(result.status,0,result.stderr);
  for(const platform of ['codex','claude']){
    const provenance=JSON.parse(fs.readFileSync(f.root+'/'+platform+'/skill/references/superpowers/provenance.json'));
    assert.equal(provenance.revision,'a'.repeat(40));
  }
});
