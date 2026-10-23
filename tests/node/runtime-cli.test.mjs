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

test('workflow CLI persists task check failure correction and fresh recheck; scope changes invalidate dependent evidence',async t=>{
 const fs=await import('node:fs/promises'),path=await import('node:path');
 const common=spawnSync('git',['rev-parse','--path-format=absolute','--git-common-dir'],{encoding:'utf8'}).stdout.trim();
 const workflow='verification-cli-'+process.pid;t.after(()=>fs.rm(path.join(common,'arc','workflows',workflow),{recursive:true,force:true}));
 const cwd=await fs.realpath(process.cwd()),base=['--cwd',cwd,'--workflow',workflow],actor={id:'operator',role:'orchestrator'};let revision=0;
 const invoke=(command,input,want=0)=>{const r=run([command,...base,...(input?['--input','-']:[])],input?JSON.stringify(input):undefined);assert.equal(r.status,want,r.stdout);return JSON.parse(r.stdout);};
 const mutate=(command,input,want=0)=>{const result=invoke(command,{requestId:'r'+revision,expectedRevision:revision,actor,...input},want);revision=result.revision;return result;};
 invoke('init',{mode:'plan',actor,selection:{messageRef:'target',contentHash:'sha256:'+'a'.repeat(64)}});
 mutate('record',{evidence:{kind:'approval',messageRef:'approved',data:{approvalVersion:1,documentVersion:1}}});
 const descriptor={executable:'/usr/bin/true',args:[],cwd,env:{},outputs:[]};
 const task={id:'T1',paths:[path.join(cwd,'bin/arc.mjs')],criteria:['works'],requiredChecks:[descriptor],dependencies:[],approvalRef:'approved',approvalVersion:1,documentVersion:1,scopeVersion:0,targetVersion:1};
 mutate('record',{evidence:{kind:'acceptance-evidence',messageRef:'task',data:{kind:'task',task}}});
 let status=invoke('status');assert.equal(status.state.tasks.length,1);const fingerprint=status.changeFingerprints.tasks.T1;
 const arguments_={scope:'task',actor:{id:'fresh-qa',role:'qa'},descriptor,changeFingerprint:fingerprint};
 const intentId='r'+revision;mutate('prepare',{operation:'check',taskId:'T1',arguments:arguments_});
 mutate('result',{intentId,result:{status:'failed',messageRef:'check:failed',data:{actor:arguments_.actor,scope:'task',taskId:'T1',descriptor,changeFingerprint:fingerprint,verdict:'unmet'}}},3);
 status=invoke('status',undefined,3);assert.equal(status.state.findings[0].status,'open');assert.equal(status.state.checks[0].status,'failed');
 // Resolution needs an actual assigned Implementer statement, never an arbitrary actor.
 mutate('record',{evidence:{kind:'finding',messageRef:'forged:fix',data:{action:'resolve',id:intentId+':failure',actor:{id:'unassigned',role:'implementer'},changeFingerprint:fingerprint}}},3);
 mutate('record',{evidence:{kind:'scope',messageRef:'expanded',data:{paths:[cwd],affectedTaskIds:['T1']}}});
 status=invoke('status',undefined,3);assert.equal(status.state.tasks[0].status,'held');assert.equal(status.state.checks[0].stale,true);assert.equal(status.state.records.find(r=>r.kind==='approval').scopeVersion,0);
 mutate('prepare',{operation:'check',taskId:'T1',arguments:arguments_},3);
});

test('workflow CLI cannot accept a passing report without exact current task evidence and staged index',async t=>{
 const fs=await import('node:fs/promises'),path=await import('node:path');
 const common=spawnSync('git',['rev-parse','--path-format=absolute','--git-common-dir'],{encoding:'utf8'}).stdout.trim();
 const workflow='acceptance-cli-'+process.pid;t.after(()=>fs.rm(path.join(common,'arc','workflows',workflow),{recursive:true,force:true}));
 const cwd=await fs.realpath(process.cwd()),base=['--cwd',cwd,'--workflow',workflow],actor={id:'operator',role:'orchestrator'};
 let r=run(['init',...base,'--input','-'],JSON.stringify({mode:'plan',actor,selection:{messageRef:'target',contentHash:'sha256:'+'a'.repeat(64)}}));assert.equal(r.status,0,r.stdout);
 r=run(['record',...base,'--input','-'],JSON.stringify({requestId:'report',expectedRevision:0,actor,evidence:{kind:'note',messageRef:'implementer:passed',data:{status:'passed'}}}));assert.equal(r.status,0,r.stdout);
 r=run(['prepare',...base,'--input','-'],JSON.stringify({requestId:'accept',expectedRevision:1,actor,operation:'accept',taskId:'T1',arguments:{messageRef:'accepted',criteria:['works'],checkIds:[],findingIds:[],changeFingerprint:'sha256:'+'a'.repeat(64)}}));assert.equal(r.status,3,r.stdout);
 r=run(['status',...base]);const state=JSON.parse(r.stdout).state;assert.equal(state.acceptances.length,0);assert.equal(state.commits.length,0);assert.equal(state.intents.length,0);
});
test('workflow CLI refuses credential-bearing external approval before persistence',()=>{
 const secret='https://user:private-value@example.com/repo';const r=run(['record','--cwd',process.cwd(),'--workflow','external-secret','--input','-'],JSON.stringify({requestId:'secret',expectedRevision:0,actor:{id:'operator',role:'orchestrator'},evidence:{kind:'external-approval',messageRef:'approval',data:{destination:secret}}}));
 assert.equal(r.status,1);assert.match(JSON.parse(r.stdout).error,/Secret-free/);assert.ok(!r.stdout.includes('private-value'));assert.equal(r.stderr,'');
});
