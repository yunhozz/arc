import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const run=args=>spawnSync(process.execPath,['bin/arc.mjs',...args],{encoding:'utf8',timeout:3000});
test('only standalone help and version succeed without a terminal',()=>{
 for(const args of [['--help'],['--version']]){const r=run(args);assert.equal(r.status,0,r.stderr);assert.ok(r.stdout.trim());}
 for(const args of [[],['install'],['workflow'],['workflow','status'],['upgrade'],['-h'],['-v'],['--help','--help'],['--version','--version'],['--help','--version'],['--version','--help'],['--help','extra'],['unknown'],['--target','codex'],['--preset','balanced'],['--language','en'],['--check'],['--dry-run'],['--skip-global'],['--max-total-subagents','20'],['--max-concurrent-subagents','2']]){const r=run(args);assert.equal(r.status,2,JSON.stringify(args)+r.stdout+r.stderr);assert.equal(r.stdout,'');}
});
test('help and version work from a package copy without TUI native or installer assets',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'arc-light-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 for(const file of ['bin/arc.mjs','lib/cli/root.mjs','package.json']){fs.mkdirSync(path.dirname(root+'/'+file),{recursive:true});fs.copyFileSync(file,root+'/'+file);}
 for(const arg of ['--help','--version']){const r=spawnSync(process.execPath,[root+'/bin/arc.mjs',arg],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);}
});
test('shell wrapper forwards root status and output',()=>{for(const args of [['--version'],['--bad']]){const direct=run(args),shell=spawnSync('bash',['install.command',...args],{encoding:'utf8'});assert.equal(shell.status,direct.status);assert.equal(shell.stdout,direct.stdout);assert.equal(shell.stderr,direct.stderr);}});
