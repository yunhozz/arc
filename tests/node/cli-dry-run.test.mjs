import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
const command="",cases=[["--target", "all", "--preset", "balanced", "--language", "en", "--check"], ["--target", "all", "--preset", "balanced", "--language", "en", "--dry-run"]];
for(const args of cases)test('removed public syntax rejects without changing harness: '+[command,...args].join(' '),t=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'arc-removed-'));t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
 fs.mkdirSync(home+'/skills/arc',{recursive:true});fs.writeFileSync(home+'/skills/arc/SKILL.md','retain harness');fs.writeFileSync(home+'/.zshrc','retain shell');
 const before=fs.readdirSync(home,{recursive:true}).sort();
 const result=spawnSync(process.execPath,['bin/arc.mjs',...(command?[command]:[]),...args],{encoding:'utf8',env:{...process.env,HOME:home,CODEX_HOME:home,CLAUDE_CONFIG_DIR:home}});
 assert.equal(result.status,2,result.stdout+result.stderr);assert.equal(result.stdout,'');assert.match(result.stderr,/arc/);assert.deepEqual(fs.readdirSync(home,{recursive:true}).sort(),before);assert.equal(fs.readFileSync(home+'/skills/arc/SKILL.md','utf8'),'retain harness');assert.equal(fs.readFileSync(home+'/.zshrc','utf8'),'retain shell');
});
