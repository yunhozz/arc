import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const load = () => import('../../lib/installer/native-cli.mjs').catch(() => ({}));
test('detects the first executable on PATH and its resolved target', async t => {
 const root=mkdtempSync(join(tmpdir(),'arc-cli-')); t.after(()=>rmSync(root,{recursive:true,force:true}));
 const first=join(root,'first'),second=join(root,'second'); mkdirSync(first); mkdirSync(second);
 const target=join(root,'claude-target'); writeFileSync(target,'#!/bin/sh\n', {mode:0o755});
 symlinkSync(target,join(first,'claude')); writeFileSync(join(second,'claude'),'#!/bin/sh\n',{mode:0o755});
 const {detectNativeCli}=await load(); assert.equal(typeof detectNativeCli,'function');
 const result=await detectNativeCli({platform:'claude',env:{PATH:`${first}:${second}`},cwd:root,runVersion:()=> '2.1.314 (Claude Code)'});
 assert.deepEqual(result,{status:'detected',executablePath:join(first,'claude'),realpath:realpathSync(target),version:'2.1.314',failureBlocking:true});
});
test('unknown and boundary versions do not invent failure blocking support', async t => {
 const root=mkdtempSync(join(tmpdir(),'arc-cli-')); t.after(()=>rmSync(root,{recursive:true,force:true}));
 writeFileSync(join(root,'claude'),'#!/bin/sh\n',{mode:0o755});
 const {detectNativeCli}=await load(); assert.equal(typeof detectNativeCli,'function');
 for(const [output,version,blocking,status] of [['2.1.294 (Claude Code)','2.1.294',false,'detected'],['2.1.295 (Claude Code)','2.1.295',true,'detected'],['2.1.266 (Claude Code)','2.1.266',false,'detected'],['2.1.295 or 2.1.314',null,false,'unknown'],['',null,false,'unknown']]) {
  const result=await detectNativeCli({platform:'claude',env:{PATH:root},cwd:root,runVersion:()=>output});
  assert.equal(result.version,version); assert.equal(result.failureBlocking,blocking); assert.equal(result.status,status);
 }
 const missing=await detectNativeCli({platform:'claude',env:{PATH:''},cwd:root,runVersion:()=>{throw Error('must not run');}});
 assert.deepEqual(missing,{status:'unknown',executablePath:null,realpath:null,version:null,failureBlocking:false});
});

test('Codex selects the first PATH executable and reads its actual version',async t=>{
 const root=mkdtempSync(join(tmpdir(),'arc-codex-')); t.after(()=>rmSync(root,{recursive:true,force:true}));
 const first=join(root,'first'),second=join(root,'second'); mkdirSync(first); mkdirSync(second);
 writeFileSync(join(first,'codex'),'#!/bin/sh\nprintf "codex-cli 0.111.0\\n"\n',{mode:0o755});
 writeFileSync(join(second,'codex'),'#!/bin/sh\nprintf "codex-cli 0.222.0\\n"\n',{mode:0o755});
 const {detectNativeCli}=await load();
 const result=await detectNativeCli({platform:'codex',env:{PATH:`${first}:${second}`},cwd:root});
 assert.deepEqual(result,{status:'detected',executablePath:join(first,'codex'),realpath:realpathSync(join(first,'codex')),version:'0.111.0',failureBlocking:false});
});
