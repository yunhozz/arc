import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const api=await import('../../lib/release/artifact.mjs').catch(()=>({}));
const source=fileURLToPath(new URL('../../',import.meta.url));
const moduleUrl=new URL('../../lib/release/artifact.mjs',import.meta.url).href;
const npmCli=fs.realpathSync(spawnSync('/bin/sh',['-c','command -v npm'],{encoding:'utf8'}).stdout.trim());
function fixture(t){
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'arc release process ')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const input=root+'/source';fs.mkdirSync(input);const pkg=JSON.parse(fs.readFileSync(source+'/package.json'));
 for(const name of new Set(['README.md','package.json','package-lock.json','MANIFEST.sha256',...pkg.files]))if(fs.existsSync(source+'/'+name))fs.cpSync(source+'/'+name,input+'/'+name,{recursive:true});
 for(const hook of ['preinstall','install','postinstall','prepublish','prepare','prepublishOnly','prepack','postpack','publish','postpublish','preuninstall','uninstall','postuninstall'])delete pkg.scripts[hook];fs.writeFileSync(input+'/package.json',JSON.stringify(pkg,null,2)+'\n');
 const lock=JSON.parse(fs.readFileSync(input+'/package-lock.json'));delete lock.packages[''].hasInstallScript;fs.writeFileSync(input+'/package-lock.json',JSON.stringify(lock,null,2)+'\n');
 assert.equal(spawnSync(process.execPath,[source+'/scripts/update-manifest.mjs','--root',input]).status,0);return{root,input,outDir:root+'/release',before:Object.fromEntries(['package.json','package-lock.json','MANIFEST.sha256','README.md'].map(name=>[name,fs.readFileSync(input+'/'+name).toString('base64')]))};
}
function unchanged(f){assert.deepEqual(Object.fromEntries(['package.json','package-lock.json','MANIFEST.sha256','README.md'].map(name=>[name,fs.readFileSync(f.input+'/'+name).toString('base64')])),f.before);assert.equal(fs.existsSync(f.outDir+'/arc-release.json'),false);}
function ready(){assert.equal(typeof api.buildReleaseArtifact,'function','release artifact API must exist');}
test('pack failure leaves source unchanged and no release-ready receipt',async t=>{
 ready();const f=fixture(t);let stage;
 await assert.rejects(api.buildReleaseArtifact({sourceRoot:f.input,outDir:f.outDir,npmCli,deps:{pack:async({stagingRoot})=>{stage=stagingRoot;throw Error('pack failed');}}}),/pack failed/);
 unchanged(f);assert.equal(fs.existsSync(stage),false);
});
for(const signal of ['SIGINT','SIGKILL'])test(signal+' never changes source or leaves a release-ready receipt',async t=>{
 ready();const f=fixture(t),program="import {buildReleaseArtifact} from "+JSON.stringify(moduleUrl)+"; const ctrl=new AbortController();process.on('SIGINT',()=>ctrl.abort()); await buildReleaseArtifact({sourceRoot:process.argv[1],outDir:process.argv[2],npmCli:process.argv[3],signal:ctrl.signal,deps:{pack:async({stagingRoot,signal})=>{console.log('READY '+stagingRoot);await new Promise((resolve,reject)=>{const keepAlive=setInterval(()=>{},1000);signal.addEventListener('abort',()=>{clearInterval(keepAlive);reject(Error('cancelled'));},{once:true});});}}});";
 const child=spawn(process.execPath,['--input-type=module','-e',program,f.input,f.outDir,npmCli],{stdio:['ignore','pipe','pipe']});let output='',stage;
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('stage timeout')),20000);child.stdout.on('data',chunk=>{output+=chunk;const match=/READY (.+)\n/.exec(output);if(match){clearTimeout(timer);stage=match[1];resolve();}});child.once('error',reject);child.once('exit',code=>{if(!stage){clearTimeout(timer);reject(Error('child exited '+code));}});});
 const closed=new Promise(resolve=>child.once('close',resolve));child.kill(signal);await closed;unchanged(f);
 if(signal==='SIGKILL'){assert.ok(fs.existsSync(stage+'/.arc-release-staging.json'));await assert.rejects(api.buildReleaseArtifact({sourceRoot:f.input,outDir:f.outDir,npmCli}),/occupied|owner|lock|incomplete/i);}
 else assert.equal(fs.existsSync(stage),false);
 const retry=await api.buildReleaseArtifact({sourceRoot:f.input,outDir:f.root+'/fresh-release',npmCli});assert.ok(fs.existsSync(retry.receiptPath));
});
test('concurrent generators cannot overwrite or clean another owner staging',async t=>{
 ready();const f=fixture(t);let release,stagingRoot;
 const first=api.buildReleaseArtifact({sourceRoot:f.input,outDir:f.outDir,npmCli,deps:{pack:async options=>{stagingRoot=options.stagingRoot;await new Promise(resolve=>{release=resolve;});throw Error('stop first');}}});
 while(!release)await new Promise(resolve=>setImmediate(resolve));
 await assert.rejects(api.buildReleaseArtifact({sourceRoot:f.input,outDir:f.outDir,npmCli}),/occupied|owner|lock/i);assert.ok(fs.existsSync(stagingRoot));release();await assert.rejects(first,/stop first/);unchanged(f);
});
test('invalid packed bytes leave no receipt and clean the owned staging',async t=>{
 ready();const f=fixture(t);let stage;
 await assert.rejects(api.buildReleaseArtifact({sourceRoot:f.input,outDir:f.outDir,npmCli,deps:{pack:async({stagingRoot})=>{stage=stagingRoot;return Buffer.from('invalid archive');}}}));
 unchanged(f);assert.equal(fs.existsSync(stage),false);
});
test('release CLI generates and revalidates an artifact from its own source root',t=>{
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'arc release cli ')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const env={PATH:process.env.PATH,HOME:root,npm_config_userconfig:root+'/user.npmrc',npm_config_globalconfig:root+'/global.npmrc',npm_config_cache:root+'/cache',npm_config_offline:'true'};
 const generated=spawnSync(process.execPath,[npmCli,'run','pack:release','--','--out-dir',root+'/release'],{cwd:source,env,encoding:'utf8'});assert.equal(generated.status,0,generated.stderr+'\n'+generated.stdout);
 const version=JSON.parse(fs.readFileSync(source+'/package.json')).version,verified=spawnSync(process.execPath,[source+'/scripts/verify-release.mjs','--out-dir',root+'/release','--name','@yunhozz/arc','--version',version],{env,encoding:'utf8'});
 assert.equal(verified.status,0,verified.stderr);assert.equal(JSON.parse(verified.stdout).verified,true);
});
