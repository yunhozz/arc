import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
const available=process.platform==='darwin'&&spawnSync('which',['expect']).status===0;
for(const [key,code]of [['\x03',130],['\x04',0],['\x1b',0]])test('bare arc opens English TUI and restores PTY after '+JSON.stringify(key),{skip:!available},t=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'arc-root-pty-'));t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
 const command=`stty rows 40 cols 120; before=$(stty -g); "${process.execPath}" bin/arc.mjs; result=$?; after=$(stty -g); test "$before" = "$after" && echo RESTORED; echo CODE=$result`;
 const script=`set timeout 10\nspawn -noecho /bin/sh -c {${command}}\nexpect -exact {Esc: exit}\nsend -- "${key==='\x03'?'\\003':key==='\x04'?'\\004':'\\033'}"\nexpect eof\nset result [wait]\nexit [lindex $result 3]`;
 const r=spawnSync('expect',['-c',script],{encoding:'utf8',timeout:15000,env:{...process.env,HOME:home,CODEX_HOME:home+'/.codex',CLAUDE_CONFIG_DIR:home+'/.claude',TERM:'xterm'}});
 assert.equal(r.status,0,r.stdout+r.stderr);assert.match(r.stdout,/RESTORED/);assert.match(r.stdout,new RegExp('CODE='+code));assert.deepEqual(fs.readdirSync(home),[]);
});
