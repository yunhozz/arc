import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
test('removed uninstall rejects on a real terminal without changing terminal mode',{skip:process.platform!=='darwin'||spawnSync('which',['expect']).status!==0},()=>{
 const command=`before=$(stty -g); "${process.execPath}" bin/arc.mjs uninstall --dry-run; result=$?; after=$(stty -g); test "$before" = "$after" && echo RESTORED; echo CODE=$result`;
 const script=`set timeout 5\nspawn -noecho /bin/sh -c {${command}}\nexpect eof\nset result [wait]\nexit [lindex $result 3]`;
 const r=spawnSync('expect',['-c',script],{encoding:'utf8',timeout:8000});assert.equal(r.status,0,r.stdout+r.stderr);assert.match(r.stdout,/CODE=2/);assert.match(r.stdout,/RESTORED/);assert.doesNotMatch(r.stdout,/ARC Management/);
});
