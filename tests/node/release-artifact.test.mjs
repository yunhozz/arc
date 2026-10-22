import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const api=await import('../../lib/release/artifact.mjs').catch(()=>({}));
const source=fileURLToPath(new URL('../../',import.meta.url));
const npmCli=fs.realpathSync(spawnSync('/bin/sh',['-c','command -v npm'],{encoding:'utf8'}).stdout.trim());
const hooks=['preinstall','install','postinstall','prepublish','prepare','prepublishOnly','prepack','postpack','publish','postpublish','preuninstall','uninstall','postuninstall'];
function temp(t){const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'arc release test ')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}
function copy(t){
 const root=temp(t),input=root+'/source';fs.mkdirSync(input);
 const pkg=JSON.parse(fs.readFileSync(source+'/package.json'));
 for(const name of new Set(['README.md','package.json','package-lock.json','MANIFEST.sha256',...pkg.files])){const from=source+'/'+name;if(fs.existsSync(from))fs.cpSync(from,input+'/'+name,{recursive:true});}
 const next=JSON.parse(fs.readFileSync(input+'/package.json'));for(const hook of hooks)delete next.scripts[hook];fs.writeFileSync(input+'/package.json',JSON.stringify(next,null,2)+'\n');
 const lock=JSON.parse(fs.readFileSync(input+'/package-lock.json'));delete lock.packages[''].hasInstallScript;fs.writeFileSync(input+'/package-lock.json',JSON.stringify(lock,null,2)+'\n');
 const updated=spawnSync(process.execPath,[source+'/scripts/update-manifest.mjs','--root',input],{encoding:'utf8'});assert.equal(updated.status,0,updated.stderr);
 return{root,input,outDir:root+'/release',version:next.version};
}
function bytes(input){return Object.fromEntries(['package.json','package-lock.json','MANIFEST.sha256','README.md'].map(name=>[name,fs.readFileSync(input+'/'+name).toString('base64')]));}
function extract(tarball,destination){fs.mkdirSync(destination);const result=spawnSync('tar',['-xf',tarball,'--strip-components=1','-C',destination],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);return JSON.parse(fs.readFileSync(destination+'/package.json'));}
function ready(){assert.equal(typeof api.buildReleaseArtifact,'function','release artifact API must exist');}
test('source remains lifecycle-free',()=>{
 const pkg=JSON.parse(fs.readFileSync(source+'/package.json')),lock=JSON.parse(fs.readFileSync(source+'/package-lock.json'));
 for(const hook of hooks)assert.equal(pkg.scripts[hook],undefined,hook);assert.equal(lock.packages[''].hasInstallScript,undefined);
});
test('artifact contains only approved install hook and leaves source bytes unchanged',async t=>{
 ready();const f=copy(t),before=bytes(f.input);let stageLock;
 const result=await api.buildReleaseArtifact({sourceRoot:f.input,outDir:f.outDir,npmCli,deps:{onStaged({stagingRoot}){stageLock=JSON.parse(fs.readFileSync(stagingRoot+'/package-lock.json'));}}});
 assert.deepEqual(bytes(f.input),before);assert.equal(stageLock.packages[''].hasInstallScript,true);
 const pkg=extract(result.tarballPath,f.root+'/unpacked');assert.equal(pkg.scripts.postinstall,'node scripts/postinstall.mjs');
 for(const hook of hooks.filter(name=>name!=='postinstall'))assert.equal(pkg.scripts[hook],undefined,hook);
 assert.equal(fs.existsSync(f.root+'/unpacked/package-lock.json'),false);
 const check=spawnSync(process.execPath,[f.root+'/unpacked/scripts/update-manifest.mjs','--root',f.root+'/unpacked','--check'],{encoding:'utf8'});assert.equal(check.status,0,check.stderr);
 const receipt=await api.verifyReleaseArtifact({outDir:f.outDir,expectedName:'@yunhozz/arc',expectedVersion:f.version});
 assert.equal(receipt.schema,1);assert.equal(receipt.verified,true);assert.match(receipt.sha512,/^[0-9a-f]{128}$/);assert.match(receipt.sourceSnapshot,/^[0-9a-f]{64}$/);
 assert.equal(receipt.sha512,createHash('sha512').update(fs.readFileSync(result.tarballPath)).digest('hex'));
 t.diagnostic('artifact sha512 '+receipt.sha512);
});
test('receipt does not authorize tampered tarball, identity or path',async t=>{
 ready();const f=copy(t);await api.buildReleaseArtifact({sourceRoot:f.input,outDir:f.outDir,npmCli});
 const receiptPath=f.outDir+'/arc-release.json',original=fs.readFileSync(receiptPath),receipt=JSON.parse(original);
 for(const change of [{name:'other'},{version:'99.0.0'},{tarballPath:f.root+'/other.tgz'},{verified:false},{sourceSnapshot:'not-a-digest'}]){
  fs.writeFileSync(receiptPath,JSON.stringify({...receipt,...change}));
  await assert.rejects(api.verifyReleaseArtifact({outDir:f.outDir,expectedName:'@yunhozz/arc',expectedVersion:f.version}));
 }
 fs.writeFileSync(receiptPath,original);fs.appendFileSync(receipt.tarballPath,'changed');
 await assert.rejects(api.verifyReleaseArtifact({outDir:f.outDir,expectedName:'@yunhozz/arc',expectedVersion:f.version}),/digest|checksum/i);
});
test('pack normalization mismatch fails verification even with matching receipt digest',async t=>{
 ready();const f=copy(t);await api.buildReleaseArtifact({sourceRoot:f.input,outDir:f.outDir,npmCli});const receiptPath=f.outDir+'/arc-release.json',receipt=JSON.parse(fs.readFileSync(receiptPath));
 const changed=extract(receipt.tarballPath,f.root+'/unpacked');changed.description='tampered package bytes';fs.writeFileSync(f.root+'/unpacked/package.json',JSON.stringify(changed,null,2)+'\n');
 const repack=spawnSync(process.execPath,[npmCli,'pack','--ignore-scripts','--offline','--json','--pack-destination',f.root],{cwd:f.root+'/unpacked',encoding:'utf8',env:{PATH:process.env.PATH,HOME:f.root,npm_config_userconfig:f.root+'/user.npmrc',npm_config_globalconfig:f.root+'/global.npmrc',npm_config_cache:f.root+'/cache'}});assert.equal(repack.status,0,repack.stderr);
 const records=JSON.parse(repack.stdout),record=Array.isArray(records)?records[0]:records['@yunhozz/arc'];
 fs.copyFileSync(f.root+'/'+record.filename,receipt.tarballPath);receipt.sha512=createHash('sha512').update(fs.readFileSync(receipt.tarballPath)).digest('hex');fs.writeFileSync(receiptPath,JSON.stringify(receipt));
 await assert.rejects(api.verifyReleaseArtifact({outDir:f.outDir,expectedName:'@yunhozz/arc',expectedVersion:f.version}),/manifest|hash|Payload/i);
});
test('source changes during build reject output without receipt',async t=>{
 ready();const f=copy(t);
 await assert.rejects(api.buildReleaseArtifact({sourceRoot:f.input,outDir:f.outDir,npmCli,deps:{onStaged(){fs.appendFileSync(f.input+'/README.md','changed');}}}),/source|snapshot/i);
 assert.equal(fs.existsSync(f.outDir+'/arc-release.json'),false);
});
test('rejects unsafe and occupied outputs without deleting another owner files',async t=>{
 ready();const f=copy(t);
 for(const outDir of ['relative',f.input+'/release',f.input])await assert.rejects(api.buildReleaseArtifact({sourceRoot:f.input,outDir,npmCli}));
 fs.symlinkSync(f.input,f.root+'/linked');await assert.rejects(api.buildReleaseArtifact({sourceRoot:f.input,outDir:f.root+'/linked/release',npmCli}));
 fs.mkdirSync(f.outDir);fs.writeFileSync(f.outDir+'/arc-release.tgz','sentinel');
 await assert.rejects(api.buildReleaseArtifact({sourceRoot:f.input,outDir:f.outDir,npmCli}));assert.equal(fs.readFileSync(f.outDir+'/arc-release.tgz','utf8'),'sentinel');
});
test('equivalent lock metadata key order does not prevent a valid release',async t=>{
 ready();const f=copy(t),file=f.input+'/package-lock.json',lock=JSON.parse(fs.readFileSync(file));lock.packages[''].devDependencies=Object.fromEntries(Object.entries(lock.packages[''].devDependencies).reverse());fs.writeFileSync(file,JSON.stringify(lock,null,2)+'\n');
 const result=await api.buildReleaseArtifact({sourceRoot:f.input,outDir:f.outDir,npmCli});assert.ok(fs.existsSync(result.receiptPath));
});
test('an output still owned by a generator is not consumable',async t=>{
 ready();const f=copy(t);await api.buildReleaseArtifact({sourceRoot:f.input,outDir:f.outDir,npmCli});fs.writeFileSync(f.outDir+'/.arc-release.lock','another owner');
 await assert.rejects(api.verifyReleaseArtifact({outDir:f.outDir,expectedName:'@yunhozz/arc',expectedVersion:f.version}),/owner|lock|incomplete/i);
 assert.equal(fs.readFileSync(f.outDir+'/.arc-release.lock','utf8'),'another owner');
});
test('actual npm pack command audit contains no install or publish invocation',async t=>{
 ready();const f=copy(t),audit=f.root+'/audit.jsonl',wrapper=f.root+'/npm-wrapper.mjs';
 fs.writeFileSync(wrapper,"import fs from 'node:fs';fs.appendFileSync("+JSON.stringify(audit)+",JSON.stringify(process.argv.slice(2))+'\\n');process.argv[1]="+JSON.stringify(npmCli)+";await import("+JSON.stringify(new URL('file://'+npmCli).href)+");\n");
 await api.buildReleaseArtifact({sourceRoot:f.input,outDir:f.outDir,npmCli:wrapper});
 const commands=fs.readFileSync(audit,'utf8').trim().split('\n').map(line=>JSON.parse(line));assert.equal(commands.length,1);assert.equal(commands[0][0],'pack');assert.ok(commands[0].includes('--ignore-scripts'));assert.ok(commands[0].includes('--offline'));assert.ok(!commands.flat().some(arg=>['install','i','publish'].includes(arg)));
});
for(const filename of ['package.json','package-lock.json'])test('rejects '+filename+' symlink before parsing external private bytes',async t=>{
 ready();const f=copy(t),outside=f.root+'/private-sentinel';fs.writeFileSync(outside,'PRIVATE_EXTERNAL_SENTINEL_NOT_JSON');fs.unlinkSync(f.input+'/'+filename);fs.symlinkSync(outside,f.input+'/'+filename);
 await assert.rejects(api.buildReleaseArtifact({sourceRoot:f.input,outDir:f.outDir,npmCli}),error=>{assert.doesNotMatch(error.message,/PRIVATE_EXTERNAL|SENTINEL_NOT_JSON/);assert.match(error.message,/regular|unsafe|symlink/i);return true;});
 assert.equal(fs.readFileSync(outside,'utf8'),'PRIVATE_EXTERNAL_SENTINEL_NOT_JSON');assert.equal(fs.existsSync(f.outDir+'/arc-release.json'),false);
});
