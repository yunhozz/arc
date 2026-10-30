import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';

const hook=await import('../../lib/runtime/native-hook.mjs').catch(()=>({}));
const diagnostics=await import('../../lib/runtime/native-diagnostics.mjs').catch(()=>({}));
const definitionHash='sha256:'+'a'.repeat(64),runtimeHash='sha256:'+'b'.repeat(64);

test('Codex callback records only operational metadata and returns neutral output',async()=>{
 assert.equal(typeof hook.runNativeHook,'function');
 const records=[];
 const input={hook_event_name:'PreToolUse',session_id:'session-secret',tool_name:'Bash',tool_use_id:'call-secret',tool_input:{command:'prompt-secret'},transcript_path:'/private/transcript-secret',cwd:'/private/workspace'};
 const installation={definitionHash,runtimeHash,platformVersion:'0.111.0'};
 const result=await hook.runNativeHook({platform:'codex',input,installation,storage:{record:async record=>records.push(record)}});
 assert.deepEqual(result,{});
 assert.equal(records.length,1);
 assert.deepEqual({...records[0],observedAt:'timestamp'},{platform:'codex',event:'PreToolUse',callback:true,definitionHash,runtimeHash,platformVersion:'0.111.0',observedAt:'timestamp'});
 assert.ok(Number.isFinite(Date.parse(records[0].observedAt)));
 assert.doesNotMatch(JSON.stringify(records),/secret|workspace|Bash/);
});

test('diagnostic storage failure cannot turn a Codex callback into a policy denial',async()=>{
 const result=await hook.runNativeHook({platform:'codex',input:{hook_event_name:'PreToolUse'},installation:{},storage:{record:async()=>{throw Error('disk unavailable');}}});
 assert.deepEqual(result,{});
 assert.deepEqual(await hook.runNativeHook({platform:'codex',input:{hook_event_name:'PreToolUse'},installation:{}}),{});
});

test('SubagentStart records observation without gate calls or authority mutations',async()=>{
 const state={identities:[{actorRef:'existing'}],assignments:[{id:'pending'}],leases:[{status:'active'}]},before=structuredClone(state),records=[];let calls=0;
 const installation={definitionHash,runtimeHash,platformVersion:'0.111.0',state,evaluate(){calls++;throw Error('gate called');},runCodexGate(){calls++;throw Error('gate called');},recordPlannerAgentObservation(){calls++;throw Error('observer called');}};
 const input={hook_event_name:'SubagentStart',session_id:'parent-secret',agent_id:'child-secret',agent_type:'planner',prompt:'private-prompt',tool_input:{role:'orchestrator'}};
 const result=await hook.runNativeHook({platform:'codex',input,installation,storage:{record:async record=>records.push(record)}});
 assert.deepEqual(result,{});assert.equal(calls,0);assert.deepEqual(state,before);
 assert.equal(records[0].event,'SubagentStart');assert.doesNotMatch(JSON.stringify(records),/secret|planner|orchestrator|private-prompt/);
});

test('PreToolUse leaves policy state unchanged and cannot invoke injected decision functions',async()=>{
 const state={identities:[{actorRef:'existing'}],assignments:[{id:'active'}],leases:[{status:'active'}]},before=structuredClone(state);let calls=0;
 const installation={state,evaluate(){calls++;throw Error('evaluate invoked');},runCodexGate(){calls++;throw Error('gate invoked');}};
 const response=await hook.runNativeHook({platform:'codex',input:{hook_event_name:'PreToolUse',tool_input:{command:'secret'}},installation,storage:{record:async()=>{}}});
 assert.deepEqual(response,{});assert.equal(calls,0);assert.deepEqual(state,before);
});

test('invalid diagnostic metadata and unrelated input never enter the sink',async()=>{
 const records=[],input={hook_event_name:'event-secret',prompt:'private-prompt',transcript:'private-transcript',env:{TOKEN:'private-env'},tool_input:{payload:'private-input'},session_id:'private-session'};
 await hook.runNativeHook({platform:'codex',input,installation:{definitionHash:'private-definition',runtimeHash:'private-runtime',platformVersion:'private-version',actorRef:'private-actor'},storage:{record:async record=>records.push(record)}});
 assert.equal(records.length,1);assert.equal(records[0].event,'unknown');assert.equal(records[0].definitionHash,null);assert.equal(records[0].runtimeHash,null);assert.equal(records[0].platformVersion,null);assert.doesNotMatch(JSON.stringify(records),/private|secret/);
});

test('unimplemented Claude provider cannot report native success',async()=>{
 await assert.rejects(hook.runNativeHook({platform:'claude',input:{hook_event_name:'PreToolUse'},installation:{}}),/unavailable/i);
});

for(const entry of ['lib/runtime/native-hook.mjs','codex/skill/runtime/native-hook.mjs','claude/skill/runtime/native-hook.mjs'])test(`importing ${entry} does not read stdin or terminate its caller`,async t=>{
 const url=pathToFileURL(path.resolve(entry)).href,child=spawn(process.execPath,['--input-type=module','-e',`await import(${JSON.stringify(url)}); console.log('imported');`],{stdio:['pipe','pipe','pipe']});
 t.after(()=>{child.stdin.destroy();if(child.exitCode===null)child.kill();});
 let stdout='',stderr='';child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);
 let timer;const result=await Promise.race([new Promise(resolve=>child.on('close',code=>resolve({code}))),new Promise(resolve=>{timer=setTimeout(()=>resolve({timeout:true}),2000);})]);clearTimeout(timer);
 assert.deepEqual(result,{code:0});assert.equal(stdout,'imported\n');assert.equal(stderr,'');
});

test('raw installation definition hash is retained in normalized diagnostic metadata',async()=>{
 const records=[];
 await hook.runNativeHook({platform:'codex',input:{hook_event_name:'PreToolUse'},installation:{definitionHash:'c'.repeat(64),runtimeHash},storage:{record:async record=>records.push(record)}});
 assert.equal(records[0].definitionHash,'sha256:'+'c'.repeat(64));
});

test('diagnostic store writes private JSONL with an explicit metadata allowlist',async t=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'arc-native-store-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 assert.equal(typeof diagnostics.createNativeDiagnosticStorage,'function');
 const storage=diagnostics.createNativeDiagnosticStorage({userHome:root});
 await storage.record({platform:'codex',event:'PreToolUse',callback:true,definitionHash,runtimeHash,platformVersion:'0.111.0',observedAt:'2026-10-30T00:00:00.000Z',tool_input:{command:'secret'},env:{TOKEN:'secret'},prompt:'secret'});
 const dir=path.join(root,'.arc/state/native-diagnostics'),filename=path.join(dir,'codex.jsonl'),bytes=await fs.readFile(filename,'utf8');
 assert.deepEqual(JSON.parse(bytes),{platform:'codex',event:'PreToolUse',callback:true,definitionHash,runtimeHash,platformVersion:'0.111.0',observedAt:'2026-10-30T00:00:00.000Z'});
 assert.doesNotMatch(bytes,/secret/);for(const part of ['.arc','.arc/state','.arc/state/native-diagnostics'])assert.equal((await fs.stat(path.join(root,part))).mode&0o777,0o700);assert.equal((await fs.stat(filename)).mode&0o777,0o600);
});

for(const variant of ['parent','file'])test(`diagnostic store refuses a symlink ${variant} without modifying its target`,async t=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'arc-native-link-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const outside=path.join(root,'outside');await fs.mkdir(outside);
 const sentinel=path.join(outside,'sentinel');await fs.writeFile(sentinel,'original');
 if(variant==='parent')await fs.symlink(outside,path.join(root,'.arc'));
 else{const dir=path.join(root,'.arc/state/native-diagnostics');await fs.mkdir(dir,{recursive:true,mode:0o700});await fs.symlink(sentinel,path.join(dir,'codex.jsonl'));}
 const storage=diagnostics.createNativeDiagnosticStorage({userHome:root});
 await assert.rejects(storage.record({event:'PreToolUse',observedAt:'2026-10-30T00:00:00.000Z'}));
 assert.equal(await fs.readFile(sentinel,'utf8'),'original');
 if(variant==='parent')await assert.rejects(fs.access(path.join(outside,'state')),{code:'ENOENT'});
});

test('diagnostic store caps total bytes without partial JSONL records',async t=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'arc-native-bound-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const storage=diagnostics.createNativeDiagnosticStorage({userHome:root,maxBytes:256}),outcomes=[];
 for(let i=0;i<5;i++)try{await storage.record({event:'PreToolUse',observedAt:'2026-10-30T00:00:00.000Z'});outcomes.push('written');}catch{outcomes.push('rejected');}
 const bytes=await fs.readFile(path.join(root,'.arc/state/native-diagnostics/codex.jsonl'),'utf8');
 assert.ok(outcomes.includes('rejected'));assert.ok(Buffer.byteLength(bytes)<=256);for(const line of bytes.trimEnd().split('\n'))assert.equal(JSON.parse(line).event,'PreToolUse');
});

test('concurrent diagnostic writes stay within the bound and keep complete records',async t=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'arc-native-concurrent-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const storage=diagnostics.createNativeDiagnosticStorage({userHome:root,maxBytes:512});
 const outcomes=await Promise.allSettled(Array.from({length:16},()=>storage.record({event:'PreToolUse',observedAt:'2026-10-30T00:00:00.000Z'})));
 const bytes=await fs.readFile(path.join(root,'.arc/state/native-diagnostics/codex.jsonl'),'utf8');
 assert.ok(outcomes.some(result=>result.status==='fulfilled'));assert.ok(Buffer.byteLength(bytes)<=512);for(const line of bytes.trimEnd().split('\n'))assert.equal(JSON.parse(line).event,'PreToolUse');
});

test('installed Codex entrypoint consumes one payload and durably records only diagnostics',async t=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),"arc native '$-")));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const arc=path.join(root,'.codex/skills/arc'),runtime=path.join(arc,'runtime');await fs.mkdir(runtime,{recursive:true});
 for(const name of ['native-hook.mjs','native-diagnostics.mjs'])await fs.copyFile(path.join('codex/skill/runtime',name),path.join(runtime,name));
 const entry=path.join(runtime,'native-hook.mjs'),settings=path.join(root,'.codex/config.toml');
 await fs.writeFile(path.join(arc,'native-hooks.json'),JSON.stringify({platform:'codex',mode:'diagnostic',entryPoint:entry,hash:'a'.repeat(64),cli:{version:'0.111.0'}}));await fs.writeFile(settings,'user setting');
 const input=JSON.stringify({hook_event_name:'PreToolUse',session_id:'private-session',tool_name:'Bash',tool_input:{command:'private-command'},transcript_path:'private-transcript',cwd:'private-cwd'});
 const result=spawnSync(process.execPath,[entry],{input,encoding:'utf8',env:{HOME:root,PATH:process.env.PATH??''},timeout:5000});
 assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,'');assert.equal(result.stderr,'');assert.equal(await fs.readFile(settings,'utf8'),'user setting');
 const bytes=await fs.readFile(path.join(root,'.arc/state/native-diagnostics/codex.jsonl'),'utf8'),record=JSON.parse(bytes);
 assert.equal(record.event,'PreToolUse');assert.equal(record.definitionHash,'sha256:'+'a'.repeat(64));assert.equal(record.platformVersion,'0.111.0');assert.doesNotMatch(bytes,/private|Bash/);
});

async function installedFixture(t,platform='codex'){
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'arc-native-entry-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const arc=path.join(root,'.codex/skills/arc'),runtime=path.join(arc,'runtime');await fs.mkdir(runtime,{recursive:true});
 for(const name of ['native-hook.mjs','native-diagnostics.mjs'])await fs.copyFile(path.join('lib/runtime',name),path.join(runtime,name));
 const entry=path.join(runtime,'native-hook.mjs');await fs.writeFile(path.join(arc,'native-hooks.json'),JSON.stringify({platform,mode:platform==='codex'?'diagnostic':'gate',entryPoint:entry,hash:'b'.repeat(64),cli:{version:'0.111.0'}}));
 return {root,entry,run:input=>spawnSync(process.execPath,[entry],{input,encoding:'utf8',env:{HOME:root,PATH:process.env.PATH??''},timeout:5000})};
}
test('installed Codex entrypoint ignores malformed or oversized input without output',async t=>{
 const f=await installedFixture(t);
 for(const input of ['{broken','{} {}',' '.repeat(1024*1024+1)]){const result=f.run(input);assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,'');assert.equal(result.stderr,'');}
 await assert.rejects(fs.access(path.join(f.root,'.arc/state/native-diagnostics/codex.jsonl')),{code:'ENOENT'});
});
test('unsafe diagnostic storage never changes the Codex neutral response',async t=>{
 const f=await installedFixture(t),outside=path.join(f.root,'outside');await fs.mkdir(outside);const sentinel=path.join(outside,'sentinel');await fs.writeFile(sentinel,'original');await fs.symlink(outside,path.join(f.root,'.arc'));
 const result=f.run(JSON.stringify({hook_event_name:'PreToolUse',tool_input:{command:'secret'}}));assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,'');assert.equal(result.stderr,'');assert.equal(await fs.readFile(sentinel,'utf8'),'original');await assert.rejects(fs.access(path.join(outside,'state')),{code:'ENOENT'});
});
test('installed entrypoint cannot represent a Claude provider as available',async t=>{
 const f=await installedFixture(t,'claude'),result=f.run(JSON.stringify({hook_event_name:'PreToolUse'}));assert.notEqual(result.status,0);assert.equal(result.stdout,'');await assert.rejects(fs.access(path.join(f.root,'.arc')),{code:'ENOENT'});
});
for(const variant of ['fifo','hardlink','lock-symlink'])test(`diagnostic store rejects ${variant} without altering another file`,async t=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'arc-native-unsafe-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const dir=path.join(root,'.arc/state/native-diagnostics');await fs.mkdir(dir,{recursive:true,mode:0o700});const sentinel=path.join(root,'sentinel');await fs.writeFile(sentinel,'original',{mode:0o600});
 const filename=path.join(dir,variant==='lock-symlink'?'codex.lock':'codex.jsonl');
 if(variant==='fifo'){const made=spawnSync('/usr/bin/mkfifo',[filename],{encoding:'utf8'});assert.equal(made.status,0,made.stderr);}else if(variant==='hardlink')await fs.link(sentinel,filename);else await fs.symlink(sentinel,filename);
 const storage=diagnostics.createNativeDiagnosticStorage({userHome:root});await assert.rejects(storage.record({event:'PreToolUse',observedAt:'2026-10-30T00:00:00.000Z'}));assert.equal(await fs.readFile(sentinel,'utf8'),'original');
 if(variant!=='lock-symlink')await assert.rejects(fs.access(path.join(dir,'codex.lock')),{code:'ENOENT'});else assert.equal(await fs.readlink(filename),sentinel);
});

test('diagnostic metadata rejects unbounded versions and noncanonical timestamps',async t=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'arc-native-metadata-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const storage=diagnostics.createNativeDiagnosticStorage({userHome:root});
 await storage.record({event:'PreToolUse',platformVersion:'1'.repeat(128)+'.2.3',observedAt:'2026-10-30T00:00:00.000Z'});
 const file=path.join(root,'.arc/state/native-diagnostics/codex.jsonl');assert.equal(JSON.parse(await fs.readFile(file,'utf8')).platformVersion,null);
 await assert.rejects(storage.record({event:'PreToolUse',observedAt:'2026-02-30T00:00:00.000Z'}));
});

test('concurrent installed callbacks serialize complete diagnostic records',async t=>{
 const f=await installedFixture(t);
 const runs=Array.from({length:8},()=>new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[f.entry],{env:{HOME:f.root,PATH:process.env.PATH??''},stdio:['pipe','pipe','pipe']});let stdout='',stderr='';
  child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);child.on('error',reject);child.on('close',code=>resolve({code,stdout,stderr}));child.stdin.end(JSON.stringify({hook_event_name:'PreToolUse',tool_input:{command:'secret'}}));
 }));
 for(const result of await Promise.all(runs))assert.deepEqual(result,{code:0,stdout:'',stderr:''});
 const dir=path.join(f.root,'.arc/state/native-diagnostics'),bytes=await fs.readFile(path.join(dir,'codex.jsonl'),'utf8'),lines=bytes.trimEnd().split('\n');
 assert.equal(lines.length,8);for(const line of lines)assert.equal(JSON.parse(line).event,'PreToolUse');assert.doesNotMatch(bytes,/secret/);await assert.rejects(fs.access(path.join(dir,'codex.lock')),{code:'ENOENT'});
});
