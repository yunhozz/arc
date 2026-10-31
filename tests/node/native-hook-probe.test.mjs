import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const probe=path.resolve('scripts/probe-runtime-hooks.mjs');
function fixture(t,base=os.tmpdir()){
 const root=fs.realpathSync(fs.mkdtempSync(path.join(base,'arc-probe-')));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const home=path.join(root,'home'),codexHome=path.join(home,'.codex'),workspace=path.join(root,'workspace'),bin=path.join(root,'bin');
 for(const directory of [codexHome,workspace,bin])fs.mkdirSync(directory,{recursive:true});
 const cli=path.join(bin,'codex'),marker=path.join(root,'cli-called');
 fs.writeFileSync(cli,`#!/bin/sh\nprintf '%s\\n' "$#" "$*" "$HOME" "$CODEX_HOME" "\${OPENAI_API_KEY-unset}" "\${CODEX_API_KEY-unset}" > '${marker}'\nprintf 'codex-cli 0.166.0\\n'\n`,{mode:0o755});
 return {root,home,codexHome,workspace,cli,marker};
}
function invoke(args,fixture,extra={}){
 return spawnSync(process.execPath,[probe,...args],{encoding:'utf8',env:{PATH:path.dirname(process.execPath),TMPDIR:fs.realpathSync(os.tmpdir()),HOME:fixture.home,CODEX_HOME:fixture.codexHome,OPENAI_API_KEY:'fixture-secret',CODEX_API_KEY:'fixture-secret',...extra}});
}

// Missing CLI and isolation arguments must not fall back to environment or launch the CLI.
test('probe rejects each omitted explicit target even when environment values exist',t=>{
 const f=fixture(t),options={'--scratch-root':f.root,'--cli':f.cli,'--home':f.home,'--codex-home':f.codexHome,'--workspace':f.workspace};
 for(const name of Object.keys(options)){
  const args=Object.entries(options).filter(([key])=>key!==name).flat(),result=invoke(args,f);
  assert.notEqual(result.status,0,name);
  assert.match(result.stderr,/explicit/i,name);
  assert.equal(fs.existsSync(f.marker),false,name);
 }
});

// A valid preflight may ask the selected CLI for its version, never for a session.
test('preflight uses explicit isolated homes and reports host evidence as unverified',t=>{
 const f=fixture(t),result=invoke(['--scratch-root',f.root,'--cli',f.cli,'--home',f.home,'--codex-home',f.codexHome,'--workspace',f.workspace],f);
 assert.equal(result.status,0,result.stderr);
 const report=JSON.parse(result.stdout);
 assert.equal(report.status,'preflight-ready');
 assert.equal(report.hostEvidence,'unverified');
 assert.equal(report.cli.version,'0.166.0');
 assert.deepEqual(report.target,{scratchRoot:f.root,home:f.home,codexHome:f.codexHome,workspace:f.workspace});
 assert.deepEqual(report.host,{registration:'unverified',entrypoint:'unverified',trust:'unverified',callback:'unverified'});
 assert.deepEqual(fs.readFileSync(f.marker,'utf8').trimEnd().split('\n'),['1','--version',f.home,f.codexHome,'unset','unset']);
});

// macOS can have a per-user TMPDIR and a separate system /tmp scratch area.
test('preflight accepts a dedicated system temporary root',t=>{
 const f=fixture(t,fs.realpathSync('/tmp')),result=invoke(['--scratch-root',f.root,'--cli',f.cli,'--home',f.home,'--codex-home',f.codexHome,'--workspace',f.workspace],f);
 assert.equal(result.status,0,result.stderr);
 assert.equal(JSON.parse(result.stdout).hostEvidence,'unverified');
});

// Passing a trust-bypass option must not reach the selected CLI.
test('probe rejects hook trust bypass before invoking the CLI',t=>{
 const f=fixture(t),result=invoke(['--scratch-root',f.root,'--cli',f.cli,'--home',f.home,'--codex-home',f.codexHome,'--workspace',f.workspace,'--dangerously-bypass-hook-trust'],f);
 assert.notEqual(result.status,0);
 assert.equal(fs.existsSync(f.marker),false);
});

// A target outside the selected scratch root must never reach the CLI.
test('probe rejects every isolation target outside its scratch root',t=>{
 const f=fixture(t),outside=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'arc-outside-')));
 t.after(()=>fs.rmSync(outside,{recursive:true,force:true}));
 for(const key of ['--home','--codex-home','--workspace']){
  const options={'--scratch-root':f.root,'--cli':f.cli,'--home':f.home,'--codex-home':f.codexHome,'--workspace':f.workspace};options[key]=outside;
  const result=invoke(Object.entries(options).flat(),f);
  assert.notEqual(result.status,0,key);
  assert.equal(fs.existsSync(f.marker),false,key);
 }
});

// An in-root symlink must not redirect a target to another directory.
test('probe rejects a symlinked workspace before invoking the CLI',t=>{
 const f=fixture(t),outside=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'arc-outside-'))),link=path.join(f.root,'workspace-link');
 t.after(()=>fs.rmSync(outside,{recursive:true,force:true}));fs.symlinkSync(outside,link);
 const result=invoke(['--scratch-root',f.root,'--cli',f.cli,'--home',f.home,'--codex-home',f.codexHome,'--workspace',link],f);
 assert.notEqual(result.status,0);assert.equal(fs.existsSync(f.marker),false);
});

// The shared temporary directory itself is not an isolated probe root.
test('probe rejects the shared temp directory as its scratch root',t=>{
 const f=fixture(t),result=invoke(['--scratch-root',fs.realpathSync(os.tmpdir()),'--cli',f.cli,'--home',f.home,'--codex-home',f.codexHome,'--workspace',f.workspace],f);
 assert.notEqual(result.status,0);
 assert.equal(fs.existsSync(f.marker),false);
});

// A broad TMPDIR must not make arbitrary directories valid scratch roots.
test('probe rejects an unsafe TMPDIR used to widen the scratch boundary',t=>{
 const alternate=fs.realpathSync('/var/tmp'),f=fixture(t,alternate),result=invoke(['--scratch-root',f.root,'--cli',f.cli,'--home',f.home,'--codex-home',f.codexHome,'--workspace',f.workspace],f,{TMPDIR:'/'});
 assert.notEqual(result.status,0);assert.equal(fs.existsSync(f.marker),false);
});

// Other users must not be able to alter an active scratch environment.
test('probe rejects a scratch root accessible to other users',t=>{
 const f=fixture(t);fs.chmodSync(f.root,0o755);
 const result=invoke(['--scratch-root',f.root,'--cli',f.cli,'--home',f.home,'--codex-home',f.codexHome,'--workspace',f.workspace],f);
 assert.notEqual(result.status,0);assert.equal(fs.existsSync(f.marker),false);
});

// A relative CLI would make the selected host depend on the caller's working directory.
test('probe requires an absolute CLI path',t=>{
 const f=fixture(t),result=invoke(['--scratch-root',f.root,'--cli',path.relative(process.cwd(),f.cli),'--home',f.home,'--codex-home',f.codexHome,'--workspace',f.workspace],f);
 assert.notEqual(result.status,0);
 assert.equal(fs.existsSync(f.marker),false);
});
