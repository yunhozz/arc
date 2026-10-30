import test from 'node:test';
import assert from 'node:assert/strict';
const load=()=>import('../../lib/installer/native-hooks.mjs').catch(()=>({}));

test('Claude failure blocking is registered only for supported detected versions',async()=>{
 const {buildNativeHookDefinitions}=await load(); assert.equal(typeof buildNativeHookDefinitions,'function');
 for(const [version,blocking] of [['2.1.294',false],['2.1.295',true],['2.1.314',true],[null,false]]) {
  const d=buildNativeHookDefinitions({platform:'claude',entryPoint:'/arc/gate.mjs',nodePath:'/usr/bin/node',cli:{status:version?'detected':'unknown',version,failureBlocking:blocking}});
  assert.equal(d.group.hooks[0].onFailure,blocking?'block':undefined);
  assert.equal(d.group.hooks[0].command,'/usr/bin/node'); assert.deepEqual(d.group.hooks[0].args,['/arc/gate.mjs']);
 }
});
test('Codex registers only a diagnostic command without activation options',async()=>{
 const {buildNativeHookDefinitions}=await load(); assert.equal(typeof buildNativeHookDefinitions,'function');
 const d=buildNativeHookDefinitions({platform:'codex',entryPoint:'/arc/diagnostic.mjs',nodePath:'/usr/bin/node',cli:{status:'detected',version:'1.0.0'}});
 assert.deepEqual(d.group,{hooks:[{type:'command',command:"'/usr/bin/node' '/arc/diagnostic.mjs'"}]});
});
test('Claude merge and removal preserve user hooks and reject modified ownership',async()=>{
 const {buildNativeHookDefinitions,renderNativeHooks,removeNativeHooks}=await load(); assert.equal(typeof renderNativeHooks,'function');
 const d=buildNativeHookDefinitions({platform:'claude',entryPoint:'/arc/gate.mjs',nodePath:'/usr/bin/node',cli:{status:'detected',version:'2.1.314',failureBlocking:true}});
 const original=Buffer.from(JSON.stringify({theme:'dark',hooks:{PreToolUse:[{matcher:'Bash',hooks:[{type:'command',command:'user'}]}],Stop:[{hooks:[{type:'command',command:'stop'}]}]}}));
 const first=renderNativeHooks({platform:'claude',original,definitions:d});
 const data=JSON.parse(first.content); assert.equal(data.theme,'dark'); assert.equal(data.hooks.PreToolUse[0].hooks[0].command,'user'); assert.equal(data.hooks.Stop[0].hooks[0].command,'stop');
 const again=renderNativeHooks({platform:'claude',original:first.content,definitions:d,previousRecord:first.record}); assert.equal(again.action,'unchanged'); assert.deepEqual(again.content,first.content);
 const removed=removeNativeHooks({platform:'claude',original:first.content,record:first.record}); assert.deepEqual(JSON.parse(removed.content),JSON.parse(original));
 data.hooks.PreToolUse[1].hooks[0].command='changed'; const changed=Buffer.from(JSON.stringify(data));
 const retained=removeNativeHooks({platform:'claude',original:changed,record:first.record}); assert.deepEqual(retained.content,changed); assert.ok(retained.conflicts.length); assert.ok(retained.retainedReferences.length);
});
test('Codex merge preserves unrelated TOML and removes only recorded definition',async()=>{
 const {buildNativeHookDefinitions,renderNativeHooks,removeNativeHooks}=await load(); assert.equal(typeof renderNativeHooks,'function');
 const d=buildNativeHookDefinitions({platform:'codex',entryPoint:'/arc/diagnostic.mjs',nodePath:'/usr/bin/node',cli:{status:'detected',version:'1.0.0'}});
 const original=Buffer.from('model = "example"\n\n[[hooks.PreToolUse]]\nmatcher = "Bash"\n[[hooks.PreToolUse.hooks]]\ntype = "command"\ncommand = "user"\n');
 const first=renderNativeHooks({platform:'codex',original,definitions:d}); assert.ok(first.content.toString().startsWith(original.toString()));
 const again=renderNativeHooks({platform:'codex',original:first.content,definitions:d,previousRecord:first.record}); assert.equal(again.action,'unchanged'); assert.deepEqual(again.content,first.content);
 const removed=removeNativeHooks({platform:'codex',original:first.content,record:first.record}); assert.deepEqual(removed.content,original);
});
test('duplicate definitions, corrupted records and duplicate JSON keys are rejected',async()=>{
 const {buildNativeHookDefinitions,renderNativeHooks,removeNativeHooks}=await load(); assert.equal(typeof renderNativeHooks,'function');
 const d=buildNativeHookDefinitions({platform:'claude',entryPoint:'/arc/gate.mjs',nodePath:'/usr/bin/node',cli:{status:'detected',version:'2.1.314',failureBlocking:true}});
 assert.throws(()=>renderNativeHooks({platform:'claude',original:Buffer.from('{"hooks":{},"hooks":{}}'),definitions:d}));
 const initial=renderNativeHooks({platform:'claude',original:Buffer.from('{}'),definitions:d});
 const obj=JSON.parse(initial.content); obj.hooks.PreToolUse.push(structuredClone(d.group));
 const duplicate=Buffer.from(JSON.stringify(obj)); const result=removeNativeHooks({platform:'claude',original:duplicate,record:initial.record}); assert.deepEqual(result.content,duplicate); assert.ok(result.conflicts.length);
 const bad={...initial.record,hash:'bad'}; const result2=removeNativeHooks({platform:'claude',original:initial.content,record:bad}); assert.deepEqual(result2.content,initial.content); assert.ok(result2.conflicts.length);
});

test('inconsistent CLI data cannot enable unsupported failure blocking',async()=>{
 const {buildNativeHookDefinitions}=await load();
 for(const version of ['2.1.294',null,'2.1.295-beta']) {
  const definition=buildNativeHookDefinitions({platform:'claude',entryPoint:'/arc/gate.mjs',nodePath:'/usr/bin/node',cli:{status:'detected',version,failureBlocking:true}});
  assert.equal(definition.group.hooks[0].onFailure,undefined);
 }
});
test('altered ownership metadata cannot authorize hook removal',async()=>{
 const {buildNativeHookDefinitions,renderNativeHooks,removeNativeHooks}=await load();
 const definition=buildNativeHookDefinitions({platform:'claude',entryPoint:'/arc/gate.mjs',nodePath:'/usr/bin/node',cli:{status:'detected',version:'2.1.314',failureBlocking:true},settingsPath:'/fixture/settings.json'});
 const initial=renderNativeHooks({platform:'claude',original:Buffer.from('{}'),definitions:definition});
 const result=removeNativeHooks({platform:'claude',original:initial.content,record:{...initial.record,settingsPath:'/different/settings.json'}});
 assert.deepEqual(result.content,initial.content); assert.ok(result.conflicts.length);
});

test('unknown CLI status never enables failure blocking despite nominal supported version',async()=>{
 const {buildNativeHookDefinitions}=await load();
 const definition=buildNativeHookDefinitions({platform:'claude',entryPoint:'/arc/gate.mjs',nodePath:'/usr/bin/node',cli:{status:'unknown',version:'2.1.314',failureBlocking:true}});
 assert.equal(definition.group.hooks[0].onFailure,undefined);
});
test('changed settings path or selected CLI metadata conflicts without changing settings',async()=>{
 const {buildNativeHookDefinitions,renderNativeHooks}=await load();
 const base={platform:'claude',entryPoint:'/arc/gate.mjs',nodePath:'/usr/bin/node',settingsPath:'/fixture/settings.json',cli:{status:'detected',executablePath:'/first/claude',realpath:'/first/claude',version:'2.1.314',failureBlocking:true}};
 const initial=renderNativeHooks({platform:'claude',original:Buffer.from('{}'),definitions:buildNativeHookDefinitions(base)});
 for(const change of [{settingsPath:'/other/settings.json'},{cli:{...base.cli,executablePath:'/second/claude',realpath:'/second/claude'}}]) {
  const result=renderNativeHooks({platform:'claude',original:initial.content,definitions:buildNativeHookDefinitions({...base,...change}),previousRecord:initial.record});
  assert.equal(result.action,'conflict'); assert.ok(result.conflicts.length); assert.deepEqual(result.content,initial.content);
 }
});

test('hook commands preserve whitespace and shell-special path characters',async t=>{
 const {mkdtempSync,mkdirSync,writeFileSync,rmSync}=await import('node:fs');
 const {tmpdir}=await import('node:os'); const {join}=await import('node:path'); const {spawnSync}=await import('node:child_process');
 const root=mkdtempSync(join(tmpdir(),'arc hook-')); t.after(()=>rmSync(root,{recursive:true,force:true}));
 const dir=join(root,"space ' $; folder"); mkdirSync(dir);
 const nodePath=join(dir,"node '$;"),entryPoint=join(dir,"entry '$; .mjs");
 writeFileSync(nodePath,'#!/bin/sh\nprintf "%s" "$1"\n',{mode:0o755});
 const {buildNativeHookDefinitions}=await load();
 const claude=buildNativeHookDefinitions({platform:'claude',entryPoint,nodePath,cli:{status:'unknown'}});
 assert.equal(claude.group.hooks[0].command,nodePath); assert.deepEqual(claude.group.hooks[0].args,[entryPoint]);
 const codex=buildNativeHookDefinitions({platform:'codex',entryPoint,nodePath,cli:{status:'unknown'}});
 const run=spawnSync('/bin/sh',['-c',codex.group.hooks[0].command],{encoding:'utf8'});
 assert.equal(run.status,0); assert.equal(run.stdout,entryPoint); assert.equal(run.stderr,'');
});
test('Codex owned metadata refresh preserves config bytes and records selected CLI identity',async()=>{
 const {buildNativeHookDefinitions,renderNativeHooks}=await load();const base={platform:'codex',entryPoint:'/arc/diag.mjs',nodePath:'/node',settingsPath:'/fixture/config.toml',cli:{status:'detected',executablePath:'/old/codex',realpath:'/old/real',version:'1.0.0'}};
 const initial=renderNativeHooks({platform:'codex',original:Buffer.from('model="x"\n'),definitions:buildNativeHookDefinitions(base)});
 const cli={...base.cli,executablePath:'/new/codex',realpath:'/new/real',version:'1.1.0'},definitions=buildNativeHookDefinitions({...base,cli});
 const result=renderNativeHooks({platform:'codex',original:initial.content,definitions,previousRecord:initial.record});assert.equal(result.action,'updated');assert.deepEqual(result.content,initial.content);assert.deepEqual(result.record.cli,cli);assert.notEqual(result.record.hash,initial.record.hash);
 const again=renderNativeHooks({platform:'codex',original:result.content,definitions,previousRecord:result.record});assert.equal(again.action,'unchanged');assert.deepEqual(again.content,result.content);
});
test('Codex replaces exact owned command in place, preserving user hooks before and after',async()=>{
 const {buildNativeHookDefinitions,renderNativeHooks}=await load();const base={platform:'codex',entryPoint:'/arc/old.mjs',nodePath:'/node',settingsPath:'/fixture/config.toml',cli:{status:'detected',version:'1.0.0'}};
 const userBefore='[[hooks.PreToolUse]]\nmatcher="Before"\nhooks=[{type="command",command="before"}]\n';const initial=renderNativeHooks({platform:'codex',original:Buffer.from(userBefore),definitions:buildNativeHookDefinitions(base)});
 const userAfter='\n[[hooks.PreToolUse]]\nmatcher="After"\nhooks=[{type="command",command="after"}]\n';const before=Buffer.concat([initial.content,Buffer.from(userAfter)]);
 const result=renderNativeHooks({platform:'codex',original:before,definitions:buildNativeHookDefinitions({...base,entryPoint:'/arc/new.mjs',nodePath:'/new node'}),previousRecord:initial.record});
 assert.equal(result.action,'updated');const text=result.content.toString();assert.ok(text.startsWith(userBefore));assert.ok(text.endsWith(userAfter));assert.ok(text.indexOf('before')<text.indexOf('/arc/new.mjs'));assert.ok(text.indexOf('/arc/new.mjs')<text.indexOf('after'));assert.doesNotMatch(text,/\/arc\/old.mjs/);
});
test('Codex refresh rejects moved or edited owned blocks and ambiguous references',async()=>{
 const {buildNativeHookDefinitions,renderNativeHooks}=await load();const base={platform:'codex',entryPoint:'/arc/diag.mjs',nodePath:'/node',settingsPath:'/fixture/config.toml',cli:{status:'detected',version:'1.0.0'}};const d=buildNativeHookDefinitions(base);
 const initial=renderNativeHooks({platform:'codex',original:Buffer.from('model="x"\n'),definitions:d});const next=buildNativeHookDefinitions({...base,cli:{...base.cli,version:'1.1.0'}});
 for(const input of [Buffer.from('[[hooks.PreToolUse]]\nmatcher="Other"\nhooks=[{type="command",command="user"}]\n'+initial.content.toString()),Buffer.from(initial.content.toString().replace('/node','/edited')),Buffer.concat([initial.content,Buffer.from(initial.record.block)])]) {
  const result=renderNativeHooks({platform:'codex',original:input,definitions:next,previousRecord:initial.record});assert.equal(result.action,'conflict');assert.deepEqual(result.content,input);
 }
});
test('Codex removal preserves hooks appended after the owned block',async()=>{
 const {buildNativeHookDefinitions,renderNativeHooks,removeNativeHooks}=await load(),d=buildNativeHookDefinitions({platform:'codex',entryPoint:'/arc/diag.mjs',nodePath:'/node',settingsPath:'/fixture/config.toml',cli:{status:'detected',version:'1.0.0'}});
 const prefix='model="x"\n',suffix='\n[[hooks.Stop]]\nhooks=[{type="command",command="user"}]\n',initial=renderNativeHooks({platform:'codex',original:Buffer.from(prefix),definitions:d}),result=removeNativeHooks({platform:'codex',original:Buffer.concat([initial.content,Buffer.from(suffix)]),record:initial.record});
 assert.equal(result.removed,true);assert.equal(result.content.toString(),prefix+suffix);
});

test('Codex refresh allows unrelated settings inserted before the same owned hook index',async()=>{
 const {buildNativeHookDefinitions,renderNativeHooks}=await load();const base={platform:'codex',entryPoint:'/arc/diag.mjs',nodePath:'/node',settingsPath:'/fixture/config.toml',cli:{status:'detected',version:'1.0.0'}};
 const initial=renderNativeHooks({platform:'codex',original:Buffer.from('model="x"\n'),definitions:buildNativeHookDefinitions(base)});const shifted=Buffer.from('# user setting\n'+initial.content.toString());
 const result=renderNativeHooks({platform:'codex',original:shifted,definitions:buildNativeHookDefinitions({...base,cli:{...base.cli,version:'1.1.0'}}),previousRecord:initial.record});assert.equal(result.action,'updated');assert.deepEqual(result.content,shifted);
});
