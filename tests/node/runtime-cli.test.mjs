import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const run=(args,input)=>spawnSync(process.execPath,['bin/arc.mjs','workflow',...args],{input,encoding:'utf8'});
test('workflow CLI emits structured input errors with exit one',()=>{
 for(const [args,input] of [[[],undefined],[['status','--cwd','relative','--workflow','x'],undefined],[['record','--cwd',process.cwd(),'--workflow','x','--input','-'],'{'],[['status','--cwd',process.cwd(),'--workflow','../x'],undefined]]){
  const r=run(args,input);assert.equal(r.status,1);const body=JSON.parse(r.stdout);assert.equal(body.persisted,false);assert.equal(body.decision,'hold');assert.ok(Array.isArray(body.ruleIds));assert.equal(r.stderr,'');
 }
});
test('workflow CLI unsupported no-plan emits hold exit three without document demand',()=>{
 const r=run(['init','--cwd',process.cwd(),'--workflow','unsupported-cli','--input','-'],JSON.stringify({mode:'no-plan',actor:{id:'operator'},selection:{messageRef:'target',contentHash:'sha256:'+'a'.repeat(64)}}));
 assert.equal(r.status,3);const body=JSON.parse(r.stdout);assert.equal(body.decision,'hold');assert.deepEqual(body.requiredEvidence,[]);assert.equal(body.persisted,false);
 for(const key of ['workflowId','taskId','requestId','revision','coverage','nextActions'])assert.ok(Object.hasOwn(body,key));
});

test('workflow CLI initializes records queries and holds unsupported actions with Git metadata unchanged',async t=>{
 const fs=await import('node:fs/promises');const path=await import('node:path');
 const git=args=>{const r=spawnSync('git',args,{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
 const common=git(['rev-parse','--path-format=absolute','--git-common-dir']);const before={head:git(['rev-parse','HEAD']),branch:git(['branch','--show-current']),index:await fs.readFile(path.join(common,'index'))};
 const workflow='cli-test-'+process.pid;const directory=path.join(common,'arc','workflows',workflow);t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const base=['--cwd',process.cwd(),'--workflow',workflow],input={mode:'plan',actor:{id:'operator'},selection:{messageRef:'user:target',contentHash:'sha256:'+'a'.repeat(64)}};
 let r=run(['init',...base,'--input','-'],JSON.stringify(input));assert.equal(r.status,0,r.stdout);assert.equal(JSON.parse(r.stdout).persisted,true);
 r=run(['record',...base,'--input','-'],JSON.stringify({requestId:'record1',expectedRevision:0,actor:{id:'operator'},evidence:{kind:'note',messageRef:'note',data:{value:1}}}));assert.equal(r.status,0,r.stdout);assert.equal(JSON.parse(r.stdout).revision,1);
 r=run(['status',...base]);assert.equal(r.status,0,r.stdout);assert.ok(JSON.parse(r.stdout).state,'status must return stored state');assert.equal(JSON.parse(r.stdout).state.records[0].source,'operator-attested');
 r=run(['prepare',...base,'--input','-'],JSON.stringify({requestId:'unsupported',expectedRevision:1,actor:{id:'operator'},operation:'assign-agent'}));assert.equal(r.status,3,r.stdout);assert.equal(JSON.parse(r.stdout).persisted,true);
 r=run(['result',...base,'--input','-'],JSON.stringify({requestId:'unsupported-result',expectedRevision:2,actor:{id:'operator'},operation:'unsupported'}));assert.equal(r.status,3,r.stdout);
 r=run(['init',...base,'--input','-'],JSON.stringify(input));assert.equal(r.status,1,r.stdout);assert.equal(JSON.parse(r.stdout).persisted,false);
 assert.equal(git(['rev-parse','HEAD']),before.head);assert.equal(git(['branch','--show-current']),before.branch);assert.deepEqual(await fs.readFile(path.join(common,'index')),before.index);
});
