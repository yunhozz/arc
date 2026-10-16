import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const api=await import('../../lib/cli/completion.mjs').catch(()=>({}));
test('root dispatch supports public commands and rejects unknown command',()=>{for(const args of [[],['--help'],['--version'],['install','--help'],['uninstall','--help'],['completion','--help']]){const r=spawnSync(process.execPath,['bin/arc.mjs',...args],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);assert.ok(r.stdout.trim());}for(const args of [['bad'],['--bad'],['completion','fish'],['completion','bash','extra']])assert.equal(spawnSync(process.execPath,['bin/arc.mjs',...args]).status,2);});
test('root help and completion work without native or installer assets',t=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'arc-root-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));for(const dir of ['bin','lib/cli'])fs.mkdirSync(root+'/'+dir,{recursive:true});for(const file of ['bin/arc.mjs','lib/cli/root.mjs','lib/cli/completion.mjs','package.json'])fs.copyFileSync(file,root+'/'+file);for(const args of [[],['--version'],['completion','zsh'],['completion','bash']]){const r=spawnSync(process.execPath,[root+'/bin/arc.mjs',...args],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);}});
for(const [words,index,want]of [[['arc',''],1,['install','uninstall','completion']],[['arc','install','--target',''],3,['claude','codex','all']],[['arc','install','--preset',''],3,['economy','balanced','smart']],[['arc','uninstall','--target',''],3,['claude','codex','all']],[['arc','completion',''],2,['zsh','bash']]])test('bash completion '+words.join(' '),()=>{assert.equal(typeof api.renderCompletion,'function');const script=api.renderCompletion('bash')+`\nCOMP_WORDS=(${words.map(w=>"'"+w+"'").join(' ')}); COMP_CWORD=${index}; _arc; printf '%s\\n' "\${COMPREPLY[@]}"`;const r=spawnSync('bash',['--noprofile','--norc','-c',script],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);assert.deepEqual(r.stdout.trim().split('\n'),want);});
for(const before of [true,false])test('zsh completion registers with compinit '+(before?'before':'after'),()=>{assert.equal(typeof api.renderCompletion,'function');const script=(before?'autoload -Uz compinit; compinit -D;\n':'')+api.renderCompletion('zsh')+(!before?'\nautoload -Uz compinit; compinit -D;':'')+'\nprint -r -- ${_comps[arc]}';const r=spawnSync('zsh',['-f','-c',script],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);assert.equal(r.stdout.trim(),'_arc');});
test('interactive zsh Tab offers root commands using the registered completer',t=>{const home=fs.mkdtempSync(path.join(os.tmpdir(),'arc-tab-'));t.after(()=>fs.rmSync(home,{recursive:true,force:true}));const script=home+'/completion.zsh';fs.writeFileSync(script,api.renderCompletion('zsh'));const driver=`set timeout 10
expect_before timeout {exit 124}
spawn -noecho zsh -f
expect -re {[%#] }
send -- "source {${script}}; PS1=READY\\ \\r"
expect -exact {READY }
send -- "arc \\t\\t"
expect -re {completion[[:space:]]+install[[:space:]]+uninstall}
send -- "\\025exit\\r"
expect eof
set result [wait]
exit [lindex $result 3]`;const r=spawnSync('expect',['-c',driver],{encoding:'utf8',timeout:15000,env:{...process.env,HOME:home,ZDOTDIR:home,TERM:'xterm'}});assert.equal(r.status,0,r.stdout+r.stderr);});
