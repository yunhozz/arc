import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {runPostinstall} from '../../lib/cli/postinstall.mjs';
import {runTui} from '../../lib/tui/app.mjs';
import {makeTerminal} from './helpers/tui-terminal.mjs';
const packageRoot=path.resolve('.');
test('lifecycle ignores missing invocation cwd and relative homes without touching harness',async t=>{
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'arc lifecycle ')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 for(const env of [{npm_lifecycle_event:'postinstall',CODEX_HOME:'relative'},{npm_lifecycle_event:'postinstall',INIT_CWD:'/missing/initial',CODEX_HOME:'custom codex'},{npm_lifecycle_event:'other'}]){
 let text='';assert.equal(await runPostinstall({packageRoot,cwd:root,env,output:{write:s=>text+=s}}),0);assert.equal(text,'Run arc to install or manage the ARC harness.\n');assert.deepEqual(fs.readdirSync(root),[]);
 }
});
for(const event of ['end','close','error','SIGINT','SIGTERM'])test(`TUI ${event} restores raw mode and listeners`,async()=>{
 const streams=makeTerminal({raw:true}),events=['data','end','close','error'];const before=events.map(name=>streams.input.listenerCount(name));
 const pending=runTui({...streams,context:{},services:{collectStatus:async()=>[]}});const checked=event==='error'?assert.rejects(pending,/terminal error/):pending;
 await new Promise(resolve=>setImmediate(resolve));assert.match(streams.text(),/ARC Management/);
 if(event.startsWith('SIG'))streams.signals.emit(event);else streams.input.emit(event,...(event==='error'?[Error('terminal error')]:[]));
 if(event==='error')await checked;else assert.equal(await checked,event.startsWith('SIG')?130:0);
 assert.equal(streams.input.isRaw,true);assert.deepEqual(events.map(name=>streams.input.listenerCount(name)),before);assert.equal(streams.signals.listenerCount('SIGINT'),0);assert.equal(streams.signals.listenerCount('SIGTERM'),0);assert.equal(streams.output.listenerCount('resize'),0);
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
