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
 fs.writeFileSync(entry,"setInterval(()=>{},1000)");const controller=new AbortController(),pending=api.runUpgradeChild({entryPath:entry,request:{},cwd:root,env:process.env,signal:controller.signal});setTimeout(()=>controller.abort(),50);await assert.rejects(pending,{code:'ARC_CANCELLED'});
});
