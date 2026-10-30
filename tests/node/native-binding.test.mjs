import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import * as portablePath from '../../lib/runtime/path-core.mjs';

const native=await import('../../lib/runtime/policy-core.mjs').catch(()=>({}));
const policy=JSON.parse(fs.readFileSync(new URL('../../lib/policy/role-policy.json',import.meta.url),'utf8'));
const digest='sha256:'+'a'.repeat(64);
function readFixture(){
 const state={schemaVersion:1,workflowId:'workflow',revision:0,versions:{policy:'1',runtime:'1',adapter:'1',policyHash:digest,runtimeHash:digest,adapterHash:digest},target:{realpath:'/workspace',repository:'repo',worktree:'worktree',branch:'main',baseHead:'base',head:'head'},mode:'plan',documents:[],approvals:[{id:'approval',source:'human-confirmation',messageRef:'confirmation',contentHash:digest,scope:{taskId:'T1',target:'/workspace',operations:['read'],paths:['/workspace/file']}}],tasks:[{id:'T1',status:'pending',paths:['/workspace/file'],dependencies:[],baseCommit:'head',criteria:['read'],requiredChecks:[]}],assignments:[{actorRef:'root',taskId:'T1',role:'orchestrator',paths:['/workspace/file'],operations:['read'],approvalRef:'approval'}],identities:[{actorRef:'root',role:'orchestrator',taskId:'T1',observationRef:'event'}],leases:[{actorRef:'root',taskId:'T1',status:'active'}],checks:[],findings:[],acceptances:[],commits:[],audit:[],capabilities:[],requests:[]};
 const request={requestId:'tool-use',platform:'claude',operation:'read',actorRef:'root',taskId:'T1',cwd:'/workspace',toolName:'Read',arguments:{file_path:'/workspace/file'},paths:['/workspace/file'],descriptor:{}};
 const evidence={target:state.target,revision:0,versions:state.versions,resolvedPaths:[{path:'/workspace',realpath:'/workspace'},{path:'/workspace/file',realpath:'/workspace/file'}],provenance:[{id:'event',source:'platform-event',eventRef:'event-ref',actorRef:'root',platform:'claude',verification:{status:'verified',verifierRef:'host',sourceRef:'event-ref'}},{id:'approval',source:'human-confirmation',messageRef:'confirmation',contentHash:digest,verification:{status:'verified',verifierRef:'host',sourceRef:'confirmation'}}]};
 return {state,request,evidence};
}
test('native policy allows a bounded read but rejects a retired lease',()=>{
 assert.equal(typeof native.evaluateNative,'function');
 const {state,request,evidence}=readFixture();
 assert.equal(native.evaluateNative(policy,state,request,evidence).decision,'allow');
 state.leases[0].status='retired';
 assert.equal(native.evaluateNative(policy,state,request,evidence).decision,'deny');
});
test('native policy loads without Node builtins in the Mod import graph',()=>{
 const script=`
  import fs from 'node:fs';
  import vm from 'node:vm';
  import {pathToFileURL} from 'node:url';
  const context=vm.createContext({structuredClone});
  const modules=new Map();
  const load=url=>{
   if(modules.has(url))return modules.get(url);
   const mod=new vm.SourceTextModule(fs.readFileSync(new URL(url),'utf8'),{context,identifier:url});
   modules.set(url,mod);return mod;
  };
  const root=load(pathToFileURL(process.argv[1]).href);
  await root.link((specifier,owner)=>{
   if(!specifier.startsWith('.'))throw Error('Nonportable import: '+specifier);
   return load(new URL(specifier,owner.identifier).href);
  });
  await root.evaluate();
 `;
 const result=spawnSync(process.execPath,['--experimental-vm-modules','--input-type=module','-e',script,new URL('../../lib/runtime/policy-core.mjs',import.meta.url).pathname],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
});
test('portable path checks keep POSIX and Windows absolute roots distinct',()=>{
 assert.equal(typeof portablePath.forTarget,'function');
 const posix=portablePath.forTarget('/workspace');
 assert.equal(posix.isAbsolute('/workspace/file'),true);
 assert.equal(posix.isAbsolute('C:\\workspace\\file'),false);
 assert.equal(posix.normalize('/workspace/../outside'),'/outside');
 assert.equal(posix.relative('/workspace','/workspace-other/file'),'../workspace-other/file');
 const win=portablePath.forTarget('C:\\workspace');
 assert.equal(win.isAbsolute('C:\\workspace\\file'),true);
 assert.equal(win.isAbsolute('workspace\\file'),false);
 assert.equal(win.normalize('C:\\workspace\\..\\outside'),'C:\\outside');
 assert.equal(win.relative('C:\\workspace','c:\\WORKSPACE\\file'),'file');
 assert.equal(win.relative('C:\\workspace','D:\\other'),'D:\\other');
});
