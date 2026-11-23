import {referenceFixture} from './fixtures/fake-git.mjs';
import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import os from'node:os';import path from'node:path';import{openRoot}from'../../lib/safe-fs/index.mjs';import{loadNative}from'../../lib/safe-fs/native.mjs';import{capturePlanSnapshot}from'../../lib/installer/transaction.mjs';
const api=await import('../../lib/installer/install.mjs').catch(()=>({}));const native=loadNative({artifactDirectory:'build/native'}),safeFs={openRoot:p=>openRoot(p,{native})};
function plans(t){const userHome=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'arc-all-')));t.after(()=>fs.rmSync(userHome,{recursive:true,force:true}));return['codex','claude'].map(platform=>{const home=userHome+'/.'+platform,plan={target:{platform,home,userHome,profileNames:['arc-implementer.md'],globalPaths:[],externalPolicy:{skills:[],includeShared:false}},skipGlobal:true,generated:{skill:new Map([['SKILL.md',Buffer.from(platform)],['references/brainstorming.md',Buffer.from('package pinned')]]),profiles:new Map([['arc-implementer.md',Buffer.from('profile')]])},globalChanges:[],managedPaths:[home+'/skills/arc',home+'/agents/arc-implementer.md'],externalPaths:[],snapshot:new Map(),summary:[]};capturePlanSnapshot(plan,{safeFs});return plan;});}
test('All preflights every target then installs Claude first without acquisition',async t=>{const input=plans(t),order=[];const result=await api.installTargets(input,{safeFs,acquisition:async()=>assert.fail('must not acquire'),hooks:{fault(event){if(event.phase==='before-prepare')order.push(event.plan.target.platform);}}});assert.deepEqual(order,['claude','codex']);assert.deepEqual(result.results.map(r=>[r.platform,r.status]),[['claude','installed'],['codex','installed']]);});
test('invalid All preflight blocks acquisition and every target write',async t=>{const input=plans(t);input[0].managedPaths=[input[1].managedPaths[0]];let calls=0;const result=await api.installTargets(input,{safeFs,acquisition:async()=>{calls++;}});assert.equal(calls,0);assert.equal(result.results.filter(r=>r.status==='installed').length,0);assert.ok(input.every(plan=>!fs.existsSync(plan.target.home)));});
test('Claude failure leaves Codex not-started',async t=>{const input=plans(t),order=[];const result=await api.installTargets(input,{safeFs,hooks:{fault(event){if(event.phase==='before-prepare'){order.push(event.plan.target.platform);throw Error('first failed');}}}});assert.deepEqual(order,['claude']);assert.deepEqual(result.results.map(r=>r.status),['failed','not-started']);});
test('Codex failure retains successful Claude installation',async t=>{const input=plans(t);const result=await api.installTargets(input,{safeFs,hooks:{fault(event){if(event.phase==='before-prepare'&&event.plan.target.platform==='codex')throw Error('second failed');}}});assert.deepEqual(result.results.map(r=>r.status),['installed','failed']);const claude=input.find(p=>p.target.platform==='claude');assert.equal(fs.readFileSync(claude.target.home+'/skills/arc/SKILL.md','utf8'),'claude');});
import{inspectPath}from'../../lib/installer/targets.mjs';
test('All preserves external literal links and installs the same pinned internal references',async t=>{const input=plans(t),codex=input.find(p=>p.target.platform==='codex'),claude=input.find(p=>p.target.platform==='claude'),source=codex.target.home+'/skills/brainstorming',linked=claude.target.home+'/skills/brainstorming';fs.mkdirSync(source,{recursive:true});fs.writeFileSync(source+'/SKILL.md','old upstream');fs.mkdirSync(path.dirname(linked),{recursive:true});fs.symlinkSync('../../.codex/skills/brainstorming',linked);capturePlanSnapshot(codex,{safeFs});capturePlanSnapshot(claude,{safeFs});let calls=0;const result=await api.installTargets(input,{safeFs,acquisition:async()=>{calls++;assert.fail('must not acquire');}});assert.deepEqual(result.results.map(r=>r.status),['installed','installed']);assert.equal(calls,0);assert.equal(fs.readlinkSync(linked),'../../.codex/skills/brainstorming');assert.equal(fs.readFileSync(source+'/SKILL.md','utf8'),'old upstream');for(const p of [codex,claude])assert.equal(fs.readFileSync(p.target.home+'/skills/arc/references/brainstorming.md','utf8'),'package pinned');});
test('All preflight attributes Claude-only drift to Claude without acquisition',async t=>{const input=plans(t),claude=input.find(p=>p.target.platform==='claude');fs.mkdirSync(claude.target.home+'/skills/arc',{recursive:true});fs.writeFileSync(claude.target.home+'/skills/arc/user','edited');let calls=0;const result=await api.installTargets(input,{safeFs,acquisition:async()=>{calls++;}});assert.equal(calls,0);assert.deepEqual(result.results.map(r=>[r.platform,r.status]),[['claude','failed'],['codex','not-started']]);});
test('All overlap preflight marks both conflicting targets failed',async t=>{const input=plans(t);input[0].externalPaths=[input[1].managedPaths[0]];let calls=0;const result=await api.installTargets(input,{safeFs,acquisition:async()=>{calls++;}});assert.equal(calls,0);assert.deepEqual(result.results.map(r=>r.status),['failed','failed']);});

test('failed All preflight preserves stale stages on otherwise valid target',async t=>{const input=plans(t),codex=input.find(p=>p.target.platform==='codex'),claude=input.find(p=>p.target.platform==='claude');const stage=codex.target.home+'/skills/.arc-stage-stale';fs.mkdirSync(stage,{recursive:true});fs.writeFileSync(stage+'/unknown','keep');capturePlanSnapshot(codex,{safeFs});fs.mkdirSync(claude.target.home+'/skills/arc',{recursive:true});let calls=0;const result=await api.installTargets(input,{safeFs,acquisition:async()=>{calls++;}});assert.equal(calls,0);assert.equal(result.results.some(item=>item.status==='installed'),false);assert.equal(fs.readFileSync(stage+'/unknown','utf8'),'keep');assert.equal(fs.existsSync(codex.target.home+'/backups'),false);});

test('Claude cleanup failure retains installation and leaves Codex not-started',async t=>{const input=plans(t);let rollback=false;const result=await api.installTargets(input,{safeFs,acquisition:async()=>({references:referenceFixture(),skills:new Map()}),hooks:{fault(event){if(event.phase==='before-rollback')rollback=true;if(event.phase==='after-publish'){const parent=path.dirname(event.path),stage=fs.readdirSync(parent).find(n=>n.startsWith('.arc-stage-'));fs.writeFileSync(parent+'/'+stage+'/external','keep');}}}});assert.deepEqual(result.results.map(r=>r.status),['installed','not-started']);assert.equal(result.results[0].error.code,'ARC_INSTALL_CLEANUP');assert.ok(result.results[0].residualPaths.length);assert.equal(rollback,false);assert.equal(fs.existsSync(input.find(p=>p.target.platform==='codex').target.home),false);});

function fourPlatformPlans(t) {
 const userHome=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'arc-all-')));
 t.after(()=>fs.rmSync(userHome,{recursive:true,force:true}));
 return ['claude','codex','gemini','grok'].map(platform=>{
  const home=path.join(userHome,'.'+platform);
  const profile=`arc-implementer.${platform==='codex'?'toml':'md'}`;
  const plan={
   target:{platform,home,userHome,profileNames:[profile],globalPaths:[],externalPolicy:{skills:[],includeShared:false}},
   skipGlobal:true,
   generated:{
    skill:new Map([['SKILL.md',Buffer.from(platform)],['references/brainstorming.md',Buffer.from('package pinned')]]),
    profiles:new Map([[profile,Buffer.from('profile')]]),
   },
   globalChanges:[],
   managedPaths:[path.join(home,'skills/arc'),path.join(home,'agents',profile)],
   externalPaths:[],
   summary:[],
  };
  capturePlanSnapshot(plan,{safeFs});
  return plan;
 });
}

test('All installs four targets in registry order',async t=>{
 const input=fourPlatformPlans(t).reverse();
 const order=new Set();
 for(const plan of input){
  const snapshot=plan.snapshot;
  // Record the first snapshot check for each target before preparation starts.
  Object.defineProperty(plan,'snapshot',{get(){order.add('preflight:'+plan.target.platform);return snapshot;}});
 }
 const {results}=await api.installTargets(input,{safeFs,hooks:{fault(event){
  if(event.phase==='before-prepare')order.add('install:'+event.plan.target.platform);
 }}});
 assert.deepEqual([...order],[
  'preflight:claude','preflight:codex','preflight:gemini','preflight:grok',
  'install:claude','install:codex','install:gemini','install:grok',
 ]);
 assert.deepEqual(results.map(({platform,status})=>[platform,status]),[
  ['claude','installed'],['codex','installed'],['gemini','installed'],['grok','installed'],
 ]);
});

test('All stops at a third-target failure, keeps earlier installs and leaves the fourth not-started',async t=>{
 const input=fourPlatformPlans(t);
 const {results}=await api.installTargets(input,{safeFs,hooks:{fault(event){
  if(event.phase==='before-prepare'&&event.plan.target.platform==='gemini')throw Error('third target failed');
 }}});
 assert.deepEqual(results.map(({platform,status})=>[platform,status]),[
  ['claude','installed'],['codex','installed'],['gemini','failed'],['grok','not-started'],
 ]);
 const [claude,codex,gemini,grok]=input;
 assert.equal(fs.readFileSync(path.join(claude.target.home,'skills/arc/SKILL.md'),'utf8'),'claude');
 assert.equal(fs.readFileSync(path.join(codex.target.home,'skills/arc/SKILL.md'),'utf8'),'codex');
 assert.equal(fs.existsSync(gemini.target.home),false);
 assert.equal(fs.existsSync(grok.target.home),false);
});
