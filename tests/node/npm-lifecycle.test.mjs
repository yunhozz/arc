import test from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {selectChoices,selectLimits} from '../../lib/cli/choices.mjs';
const api=await import('../../lib/cli/postinstall.mjs').catch(()=>({}));
const packageRoot=path.resolve('.');
function io(){const input=new PassThrough(),output=new PassThrough();input.isTTY=output.isTTY=true;input.setRawMode=value=>{input.isRaw=value;};return{input,output,error:output};}
test('postinstall only starts a verified global postinstall and always disposes the terminal',async()=>{
 assert.equal(typeof api.runPostinstall,'function');let text='';const output={write:value=>{text+=value;}};
 for(const kind of ['unsupported','npx','global']){let called=0,disposed=0;const status=await api.runPostinstall({packageRoot,env:{npm_lifecycle_event:'postinstall'},cwd:packageRoot,output,deps:{inspectNpmContext:async()=>({kind}),openInstallerTerminal:()=>({kind:'interactive',io:io(),dispose(){disposed++;}}),runCli:async(args,options)=>{called++;assert.deepEqual(args,[]);assert.equal(options.cwd,packageRoot);return 130;}}});assert.equal(status,kind==='global'?130:0);assert.equal(called,kind==='global'?1:0);assert.equal(disposed,kind==='global'?1:0);}
 assert.match(text,/arc/);
});
test('missing original cwd with relative CODEX_HOME fails before invoking installer',async()=>{
 let called=false,text='';const status=await api.runPostinstall({packageRoot,env:{npm_lifecycle_event:'postinstall',CODEX_HOME:'relative'},cwd:packageRoot,error:{write:s=>{text+=s;}},deps:{inspectNpmContext:async()=>({kind:'global'}),openInstallerTerminal:()=>({kind:'interactive',io:{...io(),error:{write:s=>{text+=s;}}},dispose(){}}),runCli:async()=>{called=true;}}});assert.equal(status,1);assert.equal(called,false);assert.match(text,/INIT_CWD/);
});
test('postinstall resolves invocation cwd and reports errors after selection as failures',async t=>{
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'arc invocation ')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));let disposed=0,text='';
 const result=await api.runPostinstall({packageRoot,cwd:packageRoot,env:{npm_lifecycle_event:'postinstall',INIT_CWD:root,CODEX_HOME:'custom codex'},error:{write:s=>{text+=s;}},deps:{inspectNpmContext:async()=>({kind:'global'}),openInstallerTerminal:()=>({kind:'interactive',io:{...io(),error:{write:s=>{text+=s;}}},dispose(){disposed++;}}),runCli:async(args,options)=>{assert.equal(options.cwd,root);throw Error('installer failed');}}});assert.equal(result,1);assert.equal(disposed,1);assert.match(text,/installer failed/);
});
for(const select of [selectChoices,(options,streams)=>selectLimits(options,[],streams)])for(const event of ['end','close','error','SIGINT','SIGTERM'])test(`${select===selectChoices?'menu':'limits'} ${event} restores raw mode and listeners`,async()=>{
 const streams=io();streams.input.isRaw=true;const events=['data','end','close','error'];const before=events.map(name=>streams.input.listenerCount(name));const signals=['SIGINT','SIGTERM'].map(name=>process.listenerCount(name));const pending=select({},streams);await new Promise(resolve=>setImmediate(resolve));
 if(event.startsWith('SIG'))process.emit(event);else streams.input.emit(event,...(event==='error'?[Error('terminal error')]:[]));
 await assert.rejects(pending);assert.equal(streams.input.isRaw,true);assert.deepEqual(events.map(name=>streams.input.listenerCount(name)),before);assert.deepEqual(['SIGINT','SIGTERM'].map(name=>process.listenerCount(name)),signals);
});

test('real npm no-terminal global, local and npx preparation keep harness homes untouched',async t=>{
 const {createNpmSandbox}=await import('./fixtures/npm-sandbox.mjs');
 const box=await createNpmSandbox(t);box.addPackage(await box.packReleaseFixture(packageRoot));
 for(const args of [['i','-g','@yunhozz/arc'],['i','@yunhozz/arc'],['exec','--yes','--package=@yunhozz/arc','--','arc','--version']]){
  const result=await box.runNpm(args);assert.equal(result.code,0,result.stderr+'\n'+result.stdout);assert.doesNotMatch(result.stdout+result.stderr,/Select an installation|ARC version .* installed!/);assert.equal(fs.existsSync(box.home+'/.codex'),false);assert.equal(fs.existsSync(box.home+'/.claude'),false);assert.equal(fs.existsSync(box.home+'/.zshrc'),false);
 }
 assert.equal(fs.existsSync(box.prefix+'/bin/arc'),true);assert.ok(box.registryAudit.some(item=>item.path.includes('tarballs')));
});
test('local dependency consumer records the generated artifact install-script metadata',async t=>{
 const {createNpmSandbox}=await import('./fixtures/npm-sandbox.mjs');const box=await createNpmSandbox(t);box.addPackage(await box.packReleaseFixture(packageRoot));
 const installed=await box.runNpm(['i','@yunhozz/arc']);assert.equal(installed.code,0,installed.stderr);
 const lock=JSON.parse(fs.readFileSync(box.cwd+'/package-lock.json'));assert.equal(lock.packages['node_modules/@yunhozz/arc'].hasInstallScript,true);
 const pkg=JSON.parse(fs.readFileSync(box.cwd+'/node_modules/@yunhozz/arc/package.json'));assert.equal(pkg.scripts.postinstall,'node scripts/postinstall.mjs');
 assert.equal(fs.existsSync(box.home+'/.codex'),false);
});
