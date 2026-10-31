import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import {spawnSync} from 'node:child_process';
import {openRoot} from '../../lib/safe-fs/index.mjs'; import {loadNative} from '../../lib/safe-fs/native.mjs';
import {flattenFixtureReferences,referencePaths} from './fixtures/static-references.mjs';import {createHash} from 'node:crypto';
const api=await import('../../lib/installer/manifest.mjs').catch(()=>({}));
const native=loadNative({artifactDirectory:'build/native'}); const safeFs={openRoot:p=>openRoot(p,{native})};
const source=new URL('../../',import.meta.url).pathname;
function fixture(t){const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'arc-payload-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const localUpdater=path.join(source,'scripts/update-superpowers-local.sh');for(const name of ['README.md','install.command','package.json','package-lock.json','bin','lib','scripts','vendor','codex','claude'])fs.cpSync(path.join(source,name),path.join(root,name),{recursive:true,filter:entry=>entry!==localUpdater});flattenFixtureReferences(root);fs.mkdirSync(`${root}/prebuilds`);const artifacts={};for(const tuple of ['darwin-arm64','darwin-x64','linux-arm64-gnu','linux-x64-gnu']){fs.mkdirSync(`${root}/prebuilds/${tuple}`);fs.writeFileSync(`${root}/prebuilds/${tuple}/arc_safe_fs.node`,'native fixture');artifacts[tuple]={napi:8};}fs.writeFileSync(`${root}/prebuilds/index.json`,JSON.stringify({artifacts}));refresh(root);return root;}
function refresh(root){const r=spawnSync(process.execPath,[`${source}/scripts/update-manifest.mjs`,'--root',root],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);}
function verify(root){return api.verifyPayload({packageRoot:root,safeFs});}
test('descriptor-verifies bytes and mutable model inputs',t=>{const root=fixture(t);assert.equal(typeof api.verifyPayload,'function');const p=verify(root);assert.ok(p.files instanceof Map);assert.deepEqual(p.modelInputs.codex.models,fs.readFileSync(`${root}/codex/skill/models.toml`));assert.equal(p.modelInputs.claude.profiles.size,5);});
for(const [label,change] of [
 ['escape',r=>fs.appendFileSync(`${r}/MANIFEST.sha256`,`${'0'.repeat(64)}  ../outside\n`)],
 ['duplicate',r=>fs.appendFileSync(`${r}/MANIFEST.sha256`,fs.readFileSync(`${r}/MANIFEST.sha256`,'utf8').split('\n')[0]+'\n')],
 ['missing',r=>fs.writeFileSync(`${r}/MANIFEST.sha256`,fs.readFileSync(`${r}/MANIFEST.sha256`,'utf8').split('\n').filter(l=>!l.endsWith('  README.md')).join('\n'))],
 ['extra',r=>{fs.writeFileSync(`${r}/extra.txt`,'extra');fs.appendFileSync(`${r}/MANIFEST.sha256`,`${'0'.repeat(64)}  extra.txt\n`);}],
 ['unlisted payload',r=>fs.writeFileSync(`${r}/codex/skill/unlisted.txt`,'unlisted')],
 ['hash',r=>fs.appendFileSync(`${r}/README.md`,'changed')],
 ['symlink',r=>{fs.unlinkSync(`${r}/README.md`);fs.symlinkSync('/etc/passwd',`${r}/README.md`);}],
 ['mutable model listed',r=>fs.appendFileSync(`${r}/MANIFEST.sha256`,`${'0'.repeat(64)}  codex/skill/models.toml\n`)],
 ['invalid mutable model',r=>fs.writeFileSync(`${r}/claude/skill/models.toml`,'version = 99')],
 ['unsafe mutable exception',r=>fs.writeFileSync(`${r}/MANIFEST.sha256`,fs.readFileSync(`${r}/MANIFEST.sha256`,'utf8').split('\n').filter(l=>!l.endsWith('  codex/skill/scripts/model_config.py')).join('\n'))],
 ['missing runtime asset',r=>{fs.unlinkSync(`${r}/bin/arc.mjs`);refresh(r);}],
 ['missing installer module',r=>{fs.unlinkSync(`${r}/lib/installer/plan.mjs`);refresh(r);} ],
 ['special payload file',r=>{fs.unlinkSync(`${r}/README.md`);assert.equal(spawnSync('mkfifo',[`${r}/README.md`]).status,0);}],
 ['DS_Store directory',r=>{fs.rmSync(`${r}/codex/skill/.DS_Store`,{force:true});fs.mkdirSync(`${r}/codex/skill/.DS_Store`);}],
])test(`payload rejects ${label}`,t=>{const root=fixture(t);change(root);assert.throws(()=>verify(root),{code:'ARC_PAYLOAD_VALIDATION'});});
test('mutable models may change only within their validated schemas',t=>{const root=fixture(t);const file=`${root}/codex/skill/models.toml`;fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('gpt-6-luna','custom/model'));assert.match(verify(root).modelInputs.codex.models.toString(),/custom\/model/);});
test('manifest reference coverage rejects missing entries and changed hashes',t=>{const root=fixture(t);const manifest=`${root}/MANIFEST.sha256`,originalManifest=fs.readFileSync(manifest);for(const name of fs.readdirSync(`${root}/codex/skill/references`).filter(n=>n.endsWith('.md'))){const relative=`codex/skill/references/${name}`,file=`${root}/${relative}`,original=fs.readFileSync(file);fs.writeFileSync(manifest,originalManifest.toString().split('\n').filter(line=>!line.endsWith('  '+relative)).join('\n'));assert.throws(()=>verify(root),{code:'ARC_PAYLOAD_VALIDATION'});fs.writeFileSync(manifest,originalManifest);fs.appendFileSync(file,'changed');assert.throws(()=>verify(root),{code:'ARC_PAYLOAD_VALIDATION'});fs.writeFileSync(file,original);}});
test('payload leaf replacement cannot read an outside regular-file sentinel',t=>{const root=fixture(t),outside=`${root}-outside`;fs.writeFileSync(outside,'private sentinel');t.after(()=>fs.rmSync(outside,{force:true}));const identity=fs.statSync(outside,{bigint:true});let swapped=false,readOutside=false;
 function wrap(handle){return new Proxy(handle,{get(target,key){if(key==='openDir')return name=>wrap(target.openDir(name));if(key==='openFile')return(name,options)=>{if(name==='README.md'&&!swapped){swapped=true;fs.unlinkSync(`${root}/README.md`);fs.linkSync(outside,`${root}/README.md`);}return wrap(target.openFile(name,options));};if(key==='readAll')return()=>{const current=target.stat();if(current.dev===identity.dev&&current.ino===identity.ino)readOutside=true;return target.readAll();};const member=target[key];return typeof member==='function'?member.bind(target):member;}});}
 assert.throws(()=>api.verifyPayload({packageRoot:root,safeFs:{openRoot:p=>wrap(safeFs.openRoot(p))}}),{code:'ARC_PAYLOAD_VALIDATION'});assert.equal(swapped,true);assert.equal(readOutside,false);
});
test('current payload rejects legacy installer entries and every missing protected runtime file',t=>{const root=fixture(t),manifest=`${root}/MANIFEST.sha256`,original=fs.readFileSync(manifest);assert.ok(verify(root).files instanceof Map);fs.appendFileSync(manifest,`${'0'.repeat(64)}  install.py\n`);assert.throws(()=>verify(root),{code:'ARC_PAYLOAD_VALIDATION'});fs.writeFileSync(manifest,original);for(const line of original.toString().trim().split('\n')){const name=line.slice(66),file=`${root}/${name}`,bytes=fs.readFileSync(file);fs.unlinkSync(file);assert.throws(()=>verify(root),{code:'ARC_PAYLOAD_VALIDATION'},name);fs.writeFileSync(file,bytes);}});
for(const name of ['codex/skill/references/limits.md','claude/skill/references/limits.md','lib/limits.mjs','lib/installer/limits.mjs','lib/installer/runtime-config.mjs'])test(`payload requires ${name} even with a regenerated manifest`,t=>{
 const root=fixture(t);fs.unlinkSync(`${root}/${name}`);refresh(root);
 assert.throws(()=>verify(root),{code:'ARC_PAYLOAD_VALIDATION'});
});
import {refreshPackageReferences} from '../../lib/installer/package-references.mjs';import {referenceFixture} from './fixtures/fake-git.mjs';
test('static refresh protects every imported file while adjacent ARC policy stays protected',async t=>{const root=fixture(t);await refreshPackageReferences({packageRoot:root,safeFs,acquisition:async()=>({references:referenceFixture('B')})});const result=verify(root);assert.equal(result.referenceTrees.codex.provenance.revision,'b'.repeat(40));for(const platform of ['codex','claude'])for(const[,name]of referencePaths){const key=platform+'/skill/references/'+name;assert.ok(result.files.has(key),key);assert.match(fs.readFileSync(root+'/MANIFEST.sha256','utf8'),new RegExp('  '+key+'\\n'));}fs.appendFileSync(root+'/codex/skill/references/planning.md','changed');assert.throws(()=>verify(root),{code:'ARC_PAYLOAD_VALIDATION'});});
for(const[label,change]of [
 ['unlisted static file',root=>fs.writeFileSync(root+'/codex/skill/references/unlisted','bad')],
 ['changed imported bytes',root=>fs.appendFileSync(root+'/codex/skill/references/brainstorming.md','bad')],
 ['missing license',root=>fs.unlinkSync(root+'/codex/skill/references/superpowers-LICENSE')],
 ['malformed provenance',root=>fs.writeFileSync(root+'/codex/skill/references/superpowers-provenance.json','{}')],
 ['escaping reference link',root=>fs.symlinkSync('/etc/passwd',root+'/codex/skill/references/escape')],
])test(`static payload rejects ${label}`,t=>{const root=fixture(t);change(root);assert.throws(()=>verify(root),{code:'ARC_PAYLOAD_VALIDATION'});});
for(const platform of ['codex','claude'])for(const[,name]of referencePaths)test(`static payload requires ${platform}/${name} after manifest regeneration`,t=>{const root=fixture(t);fs.unlinkSync(root+'/'+platform+'/skill/references/'+name);refresh(root);assert.throws(()=>verify(root),{code:'ARC_PAYLOAD_VALIDATION'});});
test('platform parity rejects separately valid but different imported bytes',t=>{const root=fixture(t),base=root+'/claude/skill/references',bytes=Buffer.from('independent upstream bytes');fs.writeFileSync(base+'/brainstorming.md',bytes);const file=base+'/superpowers-provenance.json',p=JSON.parse(fs.readFileSync(file));p.files['brainstorming/SKILL.md']=createHash('sha256').update(bytes).digest('hex');fs.writeFileSync(file,JSON.stringify(p));refresh(root);assert.throws(()=>verify(root),/parity|platform|identical/i);});
const localUpdater='scripts/update-superpowers-local.sh';
function wrapper(root){fs.writeFileSync(root+'/'+localUpdater,'#!/bin/sh\nexit 99\n');refresh(root);}
test('package rules reject a local wrapper without valid source evidence',t=>{const root=fixture(t);wrapper(root);assert.throws(()=>verify(root),/local updater|wrapper/i);});
for(const marker of ['directory','worktree'])test(`auto source mode excludes the exact regular wrapper with ${marker} marker`,t=>{const root=fixture(t);if(marker==='directory')fs.mkdirSync(root+'/.git');else fs.writeFileSync(root+'/.git','gitdir: /unused/worktree/metadata\n');wrapper(root);const payload=verify(root);assert.equal(payload.files.has(localUpdater),false);assert.equal(fs.readFileSync(root+'/'+localUpdater,'utf8'),'#!/bin/sh\nexit 99\n');assert.throws(()=>api.verifyPayload({packageRoot:root,safeFs,payloadMode:'package'}),/local updater|wrapper/i);});
test('explicit source validation excludes only the exact regular wrapper',t=>{const root=fixture(t);wrapper(root);fs.writeFileSync(root+'/scripts/unrelated.sh','protected');refresh(root);const result=api.verifyPayload({packageRoot:root,safeFs,payloadMode:'source'});assert.equal(result.files.has(localUpdater),false);assert.equal(result.files.get('scripts/unrelated.sh').toString(),'protected');fs.appendFileSync(root+'/scripts/unrelated.sh','changed');assert.throws(()=>api.verifyPayload({packageRoot:root,safeFs,payloadMode:'source'}),{code:'ARC_PAYLOAD_VALIDATION'});});
for(const[label,change]of [['malformed',r=>fs.writeFileSync(r+'/.git','not a git marker')],['symlink',r=>fs.symlinkSync('/unused/private/git',r+'/.git')],['lock mismatch',r=>{fs.mkdirSync(r+'/.git');const file=r+'/package-lock.json',lock=JSON.parse(fs.readFileSync(file));lock.packages[''].version='99.0.0';fs.writeFileSync(file,JSON.stringify(lock));}],['lifecycle hook',r=>{fs.mkdirSync(r+'/.git');const file=r+'/package.json',pkg=JSON.parse(fs.readFileSync(file));pkg.scripts.prepare='exit 99';fs.writeFileSync(file,JSON.stringify(pkg));refresh(r);}]] )test(`auto source mode rejects ${label} evidence`,t=>{const root=fixture(t);wrapper(root);change(root);assert.throws(()=>verify(root),{code:'ARC_PAYLOAD_VALIDATION'});});
test('source wrapper exception never allows a symlink',t=>{const root=fixture(t);fs.symlinkSync('/unused/private/shell',root+'/'+localUpdater);assert.throws(()=>api.verifyPayload({packageRoot:root,safeFs,payloadMode:'source'}),{code:'ARC_PAYLOAD_VALIDATION'});});
for(const name of ['lib/policy/role-policy.json','lib/policy/render.mjs','scripts/update-role-policy.mjs'])test(`payload rejects missing policy asset even with refreshed manifest: ${name}`,t=>{const root=fixture(t);fs.unlinkSync(`${root}/${name}`);refresh(root);assert.throws(()=>verify(root),error=>error.code==='ARC_PAYLOAD_VALIDATION' && error.message.includes(`Required runtime asset is missing: ${name}`));});
test('payload rejects invalid shared policy after refreshed manifest',t=>{const root=fixture(t);fs.writeFileSync(`${root}/lib/policy/role-policy.json`,'{}');refresh(root);assert.throws(()=>verify(root),error=>error.code==='ARC_PAYLOAD_VALIDATION' && /Role policy:/.test(error.message));});
test('payload rejects stale generated policy even when hashes match',t=>{const root=fixture(t);const name=`${root}/codex/agents/arc-implementer.toml`;fs.writeFileSync(name,fs.readFileSync(name,'utf8').replace('Generated from lib/policy/role-policy.json','Stale source'));refresh(root);assert.throws(()=>verify(root),error=>error.code==='ARC_PAYLOAD_VALIDATION' && /Stale role policy output/.test(error.message));});

test('payload rejects stale role policy output even after manifest refresh',t=>{const root=fixture(t),name=root+'/lib/policy/role-policy.json';const changed=JSON.parse(fs.readFileSync(name));changed.platforms.claude.notice+=' Changed notice.';fs.writeFileSync(name,JSON.stringify(changed));refresh(root);assert.throws(()=>verify(root),error=>error.code==='ARC_PAYLOAD_VALIDATION' && /Stale role policy output/.test(error.message));});
for(const platform of ['codex','claude']){
 const name=`${platform}/skill/references/coordination.md`;
 test(`payload requires ${name} after manifest refresh`,t=>{
  const root=fixture(t);assert.ok(verify(root).files.has(name));fs.unlinkSync(path.join(root,name));refresh(root);
  assert.throws(()=>verify(root),error=>error.code==='ARC_PAYLOAD_VALIDATION'&&error.message.includes(`missing target ${name}`));
 });
 test(`payload rejects stale ${name} after manifest refresh`,t=>{
  const root=fixture(t),file=path.join(root,name);fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('- [git.specialists-deny]','- [stale.rule]'));refresh(root);
  assert.throws(()=>verify(root),error=>error.code==='ARC_PAYLOAD_VALIDATION'&&error.message.includes(`Stale role policy output: ${name}`));
 });
}

const requiredRuntimePaths = [
 'lib/runtime/acceptance.mjs','lib/runtime/adapters/claude.mjs','lib/runtime/adapters/codex.mjs',
 'lib/runtime/assignment.mjs','lib/runtime/bootstrap.mjs','lib/runtime/capabilities.mjs','lib/runtime/cli.mjs','lib/runtime/command.mjs',
 'lib/runtime/cooperative-schema.mjs','lib/runtime/cooperative.mjs','lib/runtime/evaluate.mjs',
 'lib/runtime/external.mjs','lib/runtime/gate.mjs','lib/runtime/git-evidence.mjs',
 'lib/runtime/git-query.mjs','lib/runtime/identity.mjs','lib/runtime/operations.mjs',
 'lib/runtime/schema.mjs','lib/runtime/scope.mjs','lib/runtime/store.mjs','lib/runtime/verification.mjs'
];
test('regenerating the manifest cannot hide any required canonical or installed runtime asset',t=>{
 const root=fixture(t);const required=['scripts/probe-runtime-hooks.mjs','codex/skill/runtime/role-policy.json','claude/skill/runtime/role-policy.json',...requiredRuntimePaths,...['codex','claude'].flatMap(platform=>requiredRuntimePaths.map(name=>platform+'/skill/runtime/'+name.slice('lib/runtime/'.length))),'lib/installer/runtime-assets.mjs'];
 for(const name of required){const file=path.join(root,name);assert.ok(fs.existsSync(file),name);const bytes=fs.readFileSync(file);fs.unlinkSync(file);refresh(root);assert.throws(()=>verify(root),error=>error.code==='ARC_PAYLOAD_VALIDATION'&&error.message.includes('Required runtime asset is missing: '+name),name);fs.writeFileSync(file,bytes);}
 refresh(root);assert.ok(verify(root).files instanceof Map);
});
