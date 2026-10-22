import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const api=await import('../../lib/cli/completion.mjs').catch(()=>({}));
test('root dispatch supports public commands and rejects unknown command',()=>{for(const args of [['--help'],['--version'],['preset','--help'],['uninstall','--help'],['completion','--help']]){const r=spawnSync(process.execPath,['bin/arc.mjs',...args],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);assert.ok(r.stdout.trim());}for(const args of [['install'],['bad'],['--bad'],['completion','fish'],['completion','bash','extra']])assert.equal(spawnSync(process.execPath,['bin/arc.mjs',...args]).status,2);});
test('root help and completion work without native or installer assets',t=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'arc-root-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));for(const dir of ['bin','lib/cli'])fs.mkdirSync(root+'/'+dir,{recursive:true});for(const file of ['bin/arc.mjs','lib/cli/root.mjs','lib/cli/completion.mjs','lib/cli/index.mjs','lib/limits.mjs','package.json'])fs.copyFileSync(file,root+'/'+file);for(const args of [['--help'],['--version'],['completion','zsh'],['completion','bash']]){const r=spawnSync(process.execPath,[root+'/bin/arc.mjs',...args],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);}});
for(const [words,index,want]of [[['arc',''],1,['preset','uninstall','completion','upgrade']],[['arc','--target',''],2,['claude','codex','all']],[['arc','--preset',''],2,['economy','balanced','smart']],[['arc','uninstall','--target',''],3,['claude','codex','all']],[['arc','completion',''],2,['zsh','bash']]])test('bash completion '+words.join(' '),()=>{assert.equal(typeof api.renderCompletion,'function');const script=api.renderCompletion('bash')+`\nCOMP_WORDS=(${words.map(w=>"'"+w+"'").join(' ')}); COMP_CWORD=${index}; _arc; printf '%s\\n' "\${COMPREPLY[@]}"`;const r=spawnSync('bash',['--noprofile','--norc','-c',script],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);assert.deepEqual(r.stdout.trim().split('\n'),want);});
for(const before of [true,false])test('zsh completion registers with compinit '+(before?'before':'after'),()=>{assert.equal(typeof api.renderCompletion,'function');const script=(before?'autoload -Uz compinit; compinit -D;\n':'')+api.renderCompletion('zsh')+(!before?'\nautoload -Uz compinit; compinit -D;':'')+'\nprint -r -- ${_comps[arc]}';const r=spawnSync('zsh',['-f','-c',script],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);assert.equal(r.stdout.trim(),'_arc');});
test('interactive zsh Tab offers root commands using the registered completer',t=>{const home=fs.mkdtempSync(path.join(os.tmpdir(),'arc-tab-'));t.after(()=>fs.rmSync(home,{recursive:true,force:true}));const script=home+'/completion.zsh';fs.writeFileSync(script,api.renderCompletion('zsh'));const driver=`set timeout 10
expect_before timeout {exit 124}
spawn -noecho zsh -f
expect -re {[%#] }
send -- "source {${script}}; PS1=READY\\ \\r"
expect -exact {READY }
send -- "arc \\t\\t"
expect -re {preset[[:space:]]+uninstall}
send -- "\\025exit\\r"
expect eof
set result [wait]
exit [lindex $result 3]`;const r=spawnSync('expect',['-c',driver],{encoding:'utf8',timeout:15000,env:{...process.env,HOME:home,ZDOTDIR:home,TERM:'xterm'}});assert.equal(r.status,0,r.stdout+r.stderr);});

for(const [words,index,want]of [[['arc','--language',''],2,['en','ko']],[['arc','preset',''],2,['economy','balanced','smart']]])test('bash new context '+words.join(' '),()=>{const r=spawnSync('bash',['--noprofile','--norc','-c',api.renderCompletion('bash')+`\nCOMP_WORDS=(${words.map(w=>"'"+w+"'").join(' ')}); COMP_CWORD=${index}; _arc; printf '%s\\n' "\${COMPREPLY[@]}"`],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);assert.deepEqual(r.stdout.trim().split('\n'),want);});

for(const shell of ['bash','zsh'])test(shell+' preset completion excludes unsupported version while root retains it',()=>{
 const complete=words=>{
  const setup=shell==='bash'?`COMP_WORDS=(${words.map(word=>"'"+word+"'").join(' ')}); COMP_CWORD=${words.length-1}; _arc; printf '%s\\n' "\${COMPREPLY[@]}"`:`compadd() { local candidate; for candidate in "\${candidates[@]}"; do [[ $candidate == \${words[CURRENT]}* ]] && print -r -- "$candidate"; done; return 0; }; words=(${words.map(word=>"'"+word+"'").join(' ')}); CURRENT=${words.length}; _arc`;
  const result=spawnSync(shell,[...(shell==='bash'?['--noprofile','--norc']:['-f']),'-c',api.renderCompletion(shell)+'\n'+setup],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);return result.stdout.trim();
 };
 assert.equal(complete(['arc','preset','smart','--v']),'');
 assert.equal(complete(['arc','--v']),'--version');
});
for(const shell of ['bash','zsh'])for(const [words,want]of [
 [['arc',''],['preset','uninstall','completion','upgrade']],
 [['arc','--'],['--target','--preset','--language','--max-total-subagents','--max-concurrent-subagents','--check','--dry-run','--skip-global','--help','--version']],
 [['arc','--max-'],['--max-total-subagents','--max-concurrent-subagents']],
 [['arc','--v'],['--version']],
 [['arc','upgrade','--'],['--help']],
 [['arc','upgrade','--target',''],[]],
 [['arc','uninstall','--language',''],[]],
 [['arc','preset','--preset',''],[]],
 [['arc','completion',''],['zsh','bash']]
])test(shell+' public completion candidates '+words.join(' '),()=>{
 const quote=word=>"'"+word+"'",setup=shell==='bash'?`COMP_WORDS=(${words.map(quote).join(' ')}); COMP_CWORD=${words.length-1}; _arc; printf '%s\\n' "\${COMPREPLY[@]}"`:`compadd() { local candidate; for candidate in "\${candidates[@]}"; do [[ $candidate == \${words[CURRENT]}* ]] && print -r -- "$candidate"; done; return 0; }; words=(${words.map(quote).join(' ')}); CURRENT=${words.length}; _arc`;
 const result=spawnSync(shell,[...(shell==='bash'?['--noprofile','--norc']:['-f']),'-c',api.renderCompletion(shell)+'\n'+setup],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.deepEqual(result.stdout.trim()?result.stdout.trim().split('\n'):[],want);
});
