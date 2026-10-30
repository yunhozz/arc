import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const api=await import('../../lib/npm/upgrade.mjs').catch(()=>({}));
const context={kind:'global',npmCli:'/verified/npm-cli.js',prefix:'/prefix with spaces'};
test('latest is resolved once and rejects foreign or unsafe versions',async()=>{
 assert.equal(typeof api.resolveLatest,'function');let calls=0;
 const runNpm=async(cli,args)=>{calls++;assert.equal(cli,context.npmCli);assert.deepEqual(args,['view','@yunhozz/arc@latest','--json']);return{code:0,signal:null,stdout:JSON.stringify({name:'@yunhozz/arc',version:'1.2.3'})};};
 assert.deepEqual(await api.resolveLatest({context,runNpm}),{name:'@yunhozz/arc',version:'1.2.3'});assert.equal(calls,1);
 for(const metadata of [{name:'other',version:'1.2.3'},{name:'@yunhozz/arc',version:'1.2.3;touch bad'},[],null])await assert.rejects(api.resolveLatest({context,runNpm:async()=>({code:0,stdout:JSON.stringify(metadata)})}));
 await assert.rejects(api.resolveLatest({context,runNpm:async()=>({code:1,stderr:'secret'})}),/Cannot resolve/);
});
test('global replacement pins version and prefix and suppresses only internal lifecycle',async()=>{
 assert.equal(typeof api.upgradeGlobal,'function');const env={npm_config_registry:'http://127.0.0.1:1'},controller=new AbortController();
 const result=await api.upgradeGlobal({context,expectedVersion:'1.2.3',env,cwd:'/caller',signal:controller.signal,runNpm:async(cli,args,options)=>{assert.deepEqual(args,['install','--global','@yunhozz/arc@1.2.3','--prefix','/prefix with spaces','--ignore-scripts']);assert.equal(options.env,env);assert.equal(options.cwd,'/caller');assert.equal(options.signal,controller.signal);return{code:0,signal:null};}});
 assert.equal(result.packageStatus,'updated');assert.equal(result.version,'1.2.3');
 const failed=await api.upgradeGlobal({context,expectedVersion:'1.2.3',runNpm:async()=>({code:1,stderr:'registry credential'})});assert.equal(failed.packageStatus,'failed');assert.doesNotMatch(failed.error.message,/credential/);
 await assert.rejects(api.upgradeGlobal({context,expectedVersion:'latest',runNpm:async()=>{throw Error('must not run');}}),/version/);
});
test('private child receives JSON through stdin and reports failures and cancellation',async t=>{
 assert.equal(typeof api.runUpgradeChild,'function');const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'arc child ')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const entry=root+'/child.mjs';fs.writeFileSync(entry,"let text='';for await(const chunk of process.stdin)text+=chunk;const request=JSON.parse(text);process.stdout.write(request.expectedVersion);process.stderr.write('child detail');process.exitCode=request.protocol===1?0:7;");
 let result=await api.runUpgradeChild({entryPath:entry,request:{protocol:1,expectedVersion:'1.2.3'},cwd:root,env:process.env});assert.equal(result.code,0);assert.equal(result.stdout,'1.2.3');assert.equal(result.stderr,'child detail');
 result=await api.runUpgradeChild({entryPath:entry,request:{protocol:0,expectedVersion:'1.2.3'},cwd:root,env:process.env});assert.equal(result.code,7);
 const controller=new AbortController();controller.abort();await assert.rejects(api.runUpgradeChild({entryPath:entry,request:{},cwd:root,env:process.env,signal:controller.signal}),{code:'ARC_CANCELLED'});
});
test('parent cancellation preserves completed target and final rollback residual output',async t=>{
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'arc child cancellation ')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const entry=root+'/child.mjs',ready=root+'/ready';
 fs.writeFileSync(entry,"import fs from 'node:fs';const timer=setInterval(()=>{},1000);process.on('SIGTERM',()=>{process.stdout.write('claude: interrupted; rollback: restored\\n');process.stderr.write('Residual path: /recovery/claude-stage\\n');clearInterval(timer);process.exitCode=130;});process.stdout.write('codex: installed; rollback: not-needed\\n');fs.writeFileSync("+JSON.stringify(ready)+",'ready');");
 const controller=new AbortController(),watcher=fs.watch(root,()=>{if(fs.existsSync(ready))controller.abort();}),timer=setTimeout(()=>controller.abort(),5000);let result;
 try{result=await api.runUpgradeChild({entryPath:entry,request:{},cwd:root,env:process.env,signal:controller.signal});}finally{clearTimeout(timer);watcher.close();}
 assert.equal(result.code,130);assert.equal(result.stdout,'codex: installed; rollback: not-needed\nclaude: interrupted; rollback: restored\n');assert.equal(result.stderr,'Residual path: /recovery/claude-stage\n');
});
test('npx upgrade detects native CLI using caller PATH rather than npm exec PATH',async t=>{
 const {spawnSync}=await import('node:child_process');const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'arc-npx-env-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.mkdirSync(root+'/bin',{recursive:true});fs.mkdirSync(root+'/lib/management',{recursive:true});fs.writeFileSync(root+'/bin/arc.mjs','');fs.symlinkSync(root+'/bin/arc.mjs',root+'/bin/arc');fs.writeFileSync(root+'/package.json',JSON.stringify({name:'@yunhozz/arc',version:'1.2.3'}));
 fs.writeFileSync(root+'/lib/management/update.mjs',`export async function runtime(){return {safeFs:{},inspectNpmContext:async()=>({kind:'npx',packageRoot:${JSON.stringify(root)}}),collectInstalledState:()=>({stateToken:'${'a'.repeat(64)}',targets:[{}]}),upgradeInstalledTargets:async({env,cwd})=>({env,cwd})}};export function report(result,out){out.write(JSON.stringify(result));return 0}`);
 const callerPath='/fixture/caller',callerCwd=root;
 const result=await api.runNpxUpgrade({context:{kind:'npx',npmCli:'/fixture/npm'},expectedVersion:'1.2.3',expectedStateToken:'a'.repeat(64),env:{PATH:callerPath},cwd:callerCwd,runNpm:async(_cli,args)=>{const run=spawnSync(process.execPath,['--input-type=module','-e',args.at(-1)],{cwd:root,env:{PATH:root+'/bin'}});return{code:run.status,stdout:run.stdout.toString(),stderr:run.stderr.toString()};}});
 assert.equal(result.code,0,result.stderr);const received=JSON.parse(result.stdout);assert.equal(received.env.PATH,callerPath);assert.equal(received.cwd,callerCwd);
});
