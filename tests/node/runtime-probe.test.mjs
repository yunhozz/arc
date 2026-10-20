import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const script = new URL('../../scripts/probe-runtime-hooks.mjs',import.meta.url);
function run(args,input) { return spawnSync(process.execPath,[script.pathname,...args],{input:JSON.stringify(input),encoding:'utf8'}); }
test('hook denies canary and persists only minimal metadata in explicit scratch', t => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'arc-runtime-probe-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const receipt=path.join(dir,'receipt.json');
  for (const platform of ['codex','claude']) {
    const receipt=path.join(dir,platform+'.json');
    const result=run(['hook','--platform',platform,'--session','current','--version','1','--attempt','fresh','--scratch',dir,'--receipt',receipt],{hook_event_name:'PreToolUse',tool_name:'Agent',tool_input:{prompt:'secret',token:'private'}});
    assert.equal(result.status,0,result.stderr);
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision,'deny');
    const saved=fs.readFileSync(receipt,'utf8');assert.equal(saved.includes('secret'),false);assert.equal(saved.includes('private'),false);
    assert.equal(JSON.parse(saved).operation,platform === 'codex' ? 'spawn_agent' : 'Agent');
    const summary=run(['summary','--platform',platform,'--session','current','--version','1','--attempt','fresh','--scratch',dir,'--receipt',receipt]);
    assert.equal(JSON.parse(summary.stdout).verifiedDeny,false);
  }
});
test('hook requires explicit scratch receipt and never writes on unsupported event', () => {
  assert.notEqual(run(['hook','--platform','codex','--session','current'],{}).status,0);
  assert.notEqual(run(['hook','--platform','codex','--session','current','--version','1','--receipt','/nonexistent/receipt'],{hook_event_name:'SubagentStart'}).status,0);
});
test('synthetic Claude fixture remains unverified in summary CLI', t => {
  const fixture=new URL('./fixtures/runtime/claude-hook-events.json',import.meta.url).pathname;
  const result=run(['summary','--platform','claude','--session','current','--version','1','--attempt','fresh','--receipt',fixture]);
  assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).verifiedDeny,false);
});

test('scratch rejects escape, existing files and symlinks without leaving artifacts', t => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'arc-runtime-probe-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const existing=path.join(dir,'existing');fs.writeFileSync(existing,'keep');
  const link=path.join(dir,'link');fs.symlinkSync(existing,link);
  const args=['hook','--platform','codex','--session','current','--version','1','--attempt','fresh','--scratch',dir,'--receipt'];
  for(const target of [existing,link,path.join(dir,'..','escape.json')]) {
    assert.notEqual(run([...args,target],{hook_event_name:'PreToolUse',tool_name:'Agent'}).status,0);
  }
  assert.equal(fs.readFileSync(existing,'utf8'),'keep');
  assert.deepEqual(fs.readdirSync(dir).sort(),['existing','link']);
});
test('legacy absolute receipt cannot overwrite a preexisting file', t => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'arc-runtime-probe-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const receipt=path.join(dir,'keep');fs.writeFileSync(receipt,'keep');
  const result=run(['hook','--platform','codex','--session','current','--version','1','--receipt',receipt],{hook_event_name:'PreToolUse',tool_name:'Agent'});
  assert.notEqual(result.status,0);
  assert.equal(fs.readFileSync(receipt,'utf8'),'keep');
});
test('failed write removes only the exclusively created receipt', async t => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'arc-runtime-probe-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const existing=path.join(dir,'existing');fs.writeFileSync(existing,'keep');
  const receipt=path.join(dir,'new.json');
  const {writeProbeReceipt}=await import(script);
  assert.equal(typeof writeProbeReceipt,'function');
  const failWrite=()=>{throw new Error('injected write failure');};
  assert.throws(()=>writeProbeReceipt(receipt,{event:'PreToolUse'},failWrite),/injected write failure/);
  assert.equal(fs.existsSync(receipt),false);
  assert.throws(()=>writeProbeReceipt(existing,{},failWrite),/EEXIST/);
  assert.equal(fs.readFileSync(existing,'utf8'),'keep');
  assert.deepEqual(fs.readdirSync(dir),['existing']);
});
